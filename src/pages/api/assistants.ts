import type { APIRoute } from 'astro';
import type { User } from '@supabase/supabase-js';
import { json } from '../../lib/server/auth';
import { requireSubscriber } from '../../lib/server/subscriberAuth';
import { getOrgMemberships, isManagerOf, isMemberOf } from '../../lib/server/orgMembership';
import { supabaseAdmin } from '../../lib/server/supabaseAdmin';
import { AGENT_IDS, type AgentId } from '../../lib/server/agents';
import { getContextMeta } from '../../lib/contexts';
import { MAX_ASSISTANT_DOCS, MAX_SETUP_CHARS } from '../../lib/server/assistants';

export const prerender = false;

const MAX_ASSISTANTS_PER_USER = 20;
const ROW_COLUMNS =
  'id, owner_user_id, org_id, shared, name, base_agent, context, instructions, created_at, updated_at';

interface DocView {
  id: string;
  name: string;
  char_count: number;
}
interface AssistantRowRaw {
  id: string;
  owner_user_id: string;
  org_id: string | null;
  shared: boolean;
  name: string;
  base_agent: AgentId;
  context: string | null;
  instructions: string;
  created_at: string;
  updated_at: string;
}

// ── GET: the active workspace's assistants, plus the user's full membership list ─
// The active workspace comes from ?org_id= (absent/empty = the Personal workspace).
// Everything is scoped to that one workspace so switching orgs never leaks another
// org's (or Personal's) assistants. `memberships` is always the full list (it drives
// the workspace switcher).
export const GET: APIRoute = async ({ request }) => {
  const auth = await requireSubscriber(request);
  if ('error' in auth) return json({ error: auth.error }, auth.status);
  const { user } = auth;

  const memberships = await getOrgMemberships(user);

  // Resolve the workspace: a real org only if the caller belongs to it, else Personal.
  const requested = new URL(request.url).searchParams.get('org_id')?.trim() || '';
  const workspace = requested && isMemberOf(memberships, requested) ? requested : null;

  // mine: the caller's own assistants in this workspace.
  let mineQuery = supabaseAdmin
    .from('assistants')
    .select(ROW_COLUMNS)
    .eq('owner_user_id', user.id)
    .order('updated_at', { ascending: false });
  mineQuery = workspace ? mineQuery.eq('org_id', workspace) : mineQuery.is('org_id', null);
  const { data: mineRows, error: mineErr } = await mineQuery;
  if (mineErr) {
    console.error('assistants list failed', mineErr);
    return json({ error: 'server_error' }, 500);
  }

  // shared: other members' assistants shared into this org workspace (none for Personal).
  let sharedRows: AssistantRowRaw[] = [];
  if (workspace) {
    const { data } = await supabaseAdmin
      .from('assistants')
      .select(ROW_COLUMNS)
      .eq('org_id', workspace)
      .eq('shared', true)
      .neq('owner_user_id', user.id)
      .order('updated_at', { ascending: false });
    sharedRows = (data ?? []) as AssistantRowRaw[];
  }

  const mine = (mineRows ?? []) as AssistantRowRaw[];
  const docs = await loadDocViews([...mine, ...sharedRows].map((a) => a.id));

  return json({
    mine: mine.map((r) => shape(r, docs)),
    shared: sharedRows.map((r) => shape(r, docs)),
    memberships: memberships.map((m) => ({ orgId: m.orgId, orgName: m.orgName, role: m.role })),
  });
};

async function loadDocViews(assistantIds: string[]): Promise<Map<string, DocView[]>> {
  const map = new Map<string, DocView[]>();
  if (assistantIds.length === 0) return map;
  const { data } = await supabaseAdmin
    .from('assistant_documents')
    .select('assistant_id, position, document_id, documents ( id, name, char_count )')
    .in('assistant_id', assistantIds)
    .order('position', { ascending: true })
    .order('document_id', { ascending: true });
  for (const j of data ?? []) {
    const d = j.documents as unknown as DocView | null;
    if (!d) continue;
    const list = map.get(j.assistant_id) ?? [];
    list.push({ id: d.id, name: d.name, char_count: d.char_count });
    map.set(j.assistant_id, list);
  }
  return map;
}

function shape(r: AssistantRowRaw, docs: Map<string, DocView[]>) {
  return {
    id: r.id,
    name: r.name,
    base_agent: r.base_agent,
    context: r.context,
    instructions: r.instructions,
    org_id: r.org_id,
    shared: r.shared,
    documents: docs.get(r.id) ?? [],
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

// ── POST: action discriminator ──────────────────────────────────────────────
export const POST: APIRoute = async ({ request }) => {
  const auth = await requireSubscriber(request);
  if ('error' in auth) return json({ error: auth.error }, auth.status);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof body?.action === 'string' ? body.action : '';
  if (!body) return json({ error: 'bad_request' }, 400);

  switch (action) {
    case 'create':
      return createAssistant(auth.user, body);
    case 'update':
      return updateAssistant(auth.user, body);
    case 'duplicate':
      return duplicateAssistant(auth.user, body);
    case 'delete':
      return deleteAssistant(auth.user, body);
    case 'share':
      return shareAssistant(auth.user, body);
    case 'unshare':
      return unshareAssistant(auth.user, body);
    case 'move':
      return moveAssistant(auth.user, body);
    default:
      return json({ error: 'bad_request' }, 400);
  }
};

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const idList = (v: unknown): string[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((x): x is string => typeof x === 'string'))].slice(0, MAX_ASSISTANT_DOCS)
    : [];

/**
 * Confirm the docs are usable by this caller and (with the instructions) fit the
 * budget. A document qualifies when the acting user owns it, or (on update, via
 * `allowLinkedTo`) when it is already linked to that assistant: inherited links
 * must survive edits by people who did not upload the file, e.g. a manager
 * editing a shared assistant, or the owner of a duplicate.
 */
async function checkDocsBudget(
  userId: string,
  documentIds: string[],
  instructions: string,
  allowLinkedTo?: string
): Promise<Response | null> {
  if (documentIds.length === 0) return null;
  let linkedIds = new Set<string>();
  if (allowLinkedTo) {
    const { data: linked } = await supabaseAdmin
      .from('assistant_documents')
      .select('document_id')
      .eq('assistant_id', allowLinkedTo);
    linkedIds = new Set((linked ?? []).map((l) => l.document_id));
  }
  const { data } = await supabaseAdmin
    .from('documents')
    .select('id, char_count, user_id')
    .in('id', documentIds);
  const found = data ?? [];
  if (
    found.length !== documentIds.length ||
    found.some((d) => d.user_id !== userId && !linkedIds.has(d.id))
  ) {
    return json({ error: 'bad_request', field: 'documents' }, 400);
  }
  const total = instructions.length + found.reduce((s, d) => s + (d.char_count ?? 0), 0);
  if (total > MAX_SETUP_CHARS) {
    return json(
      {
        error: 'setup_too_large',
        message: 'Those instructions and documents are too long together. Use fewer or shorter documents.',
      },
      409
    );
  }
  return null;
}

async function attachDocs(assistantId: string, documentIds: string[]): Promise<void> {
  if (documentIds.length === 0) return;
  const rows = documentIds.map((document_id, i) => ({
    assistant_id: assistantId,
    document_id,
    position: i,
  }));
  const { error } = await supabaseAdmin.from('assistant_documents').insert(rows);
  if (error) console.error('attach docs failed', error);
}

/** The global per-owner cap; applies to created and duplicated assistants alike. */
async function checkAssistantQuota(userId: string): Promise<Response | null> {
  const { count } = await supabaseAdmin
    .from('assistants')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', userId);
  if ((count ?? 0) >= MAX_ASSISTANTS_PER_USER) {
    return json(
      { error: 'too_many_assistants', message: `You can have up to ${MAX_ASSISTANTS_PER_USER} assistants.` },
      409
    );
  }
  return null;
}

async function createAssistant(user: User, body: Record<string, unknown>): Promise<Response> {
  const quotaErr = await checkAssistantQuota(user.id);
  if (quotaErr) return quotaErr;

  const name = str(body.name).trim();
  if (name.length < 1 || name.length > 80) return json({ error: 'bad_request', field: 'name' }, 400);
  const baseAgent = str(body.base_agent) as AgentId;
  if (!AGENT_IDS.includes(baseAgent)) return json({ error: 'bad_request', field: 'agent' }, 400);
  const context = str(body.context) || null;
  if (context) {
    const meta = getContextMeta(context, baseAgent);
    if (!meta || meta.kind !== 'mode') return json({ error: 'bad_request', field: 'context' }, 400);
  }
  const instructions = str(body.instructions).slice(0, 8000);
  const documentIds = idList(body.document_ids);

  // The workspace the assistant is created in: an org the caller belongs to, else Personal.
  // New assistants are never auto-shared (a manager shares afterwards).
  const orgId = str(body.org_id).trim() || null;
  if (orgId) {
    const memberships = await getOrgMemberships(user);
    if (!isMemberOf(memberships, orgId)) return json({ error: 'bad_request', field: 'org_id' }, 400);
  }

  const budgetErr = await checkDocsBudget(user.id, documentIds, instructions);
  if (budgetErr) return budgetErr;

  const { data: created, error } = await supabaseAdmin
    .from('assistants')
    .insert({ owner_user_id: user.id, org_id: orgId, name, base_agent: baseAgent, context, instructions })
    .select('id')
    .single();
  if (error || !created) {
    console.error('assistant create failed', error);
    return json({ error: 'server_error' }, 500);
  }
  await attachDocs(created.id, documentIds);
  return json({ id: created.id });
}

/**
 * Load an assistant the user owns, or is a manager of the org it's SHARED to. A private
 * draft (org_id set but shared = false) that merely lives in an org workspace stays
 * owner-only; managers gain co-management only once it is shared.
 */
async function loadOwnedOrManaged(
  user: User,
  id: string
): Promise<
  | {
      row: {
        id: string;
        owner_user_id: string;
        org_id: string | null;
        shared: boolean;
        base_agent: AgentId;
        name: string;
        context: string | null;
        instructions: string;
      };
    }
  | { response: Response }
> {
  const { data: row } = await supabaseAdmin
    .from('assistants')
    .select('id, owner_user_id, org_id, shared, base_agent, name, context, instructions')
    .eq('id', id)
    .maybeSingle();
  if (!row) return { response: json({ error: 'not_found' }, 404) };
  if (row.owner_user_id === user.id) return { row };
  if (row.org_id && row.shared) {
    const memberships = await getOrgMemberships(user);
    if (isManagerOf(memberships, row.org_id)) return { row };
  }
  // 404, not 403: an id the caller can't manage is not confirmed to exist.
  return { response: json({ error: 'not_found' }, 404) };
}

async function updateAssistant(user: User, body: Record<string, unknown>): Promise<Response> {
  const id = str(body.id);
  if (!id) return json({ error: 'bad_request' }, 400);
  const access = await loadOwnedOrManaged(user, id);
  if ('response' in access) return access.response;

  const name = str(body.name).trim();
  if (name.length < 1 || name.length > 80) return json({ error: 'bad_request', field: 'name' }, 400);
  // base_agent is immutable after create; validate the mode against the stored agent.
  const context = str(body.context) || null;
  if (context) {
    const meta = getContextMeta(context, access.row.base_agent);
    if (!meta || meta.kind !== 'mode') return json({ error: 'bad_request', field: 'context' }, 400);
  }
  const instructions = str(body.instructions).slice(0, 8000);
  const documentIds = idList(body.document_ids);

  const budgetErr = await checkDocsBudget(user.id, documentIds, instructions, id);
  if (budgetErr) return budgetErr;

  const { error } = await supabaseAdmin
    .from('assistants')
    .update({ name, context, instructions })
    .eq('id', id);
  if (error) {
    console.error('assistant update failed', error);
    return json({ error: 'server_error' }, 500);
  }
  // Replace the document links wholesale (positions come from the new order).
  await supabaseAdmin.from('assistant_documents').delete().eq('assistant_id', id);
  await attachDocs(id, documentIds);
  return json({ ok: true });
}

/**
 * Copy an assistant the caller can manage into a row they own: same workspace,
 * same config, same document LINKS (the files themselves are not copied; the
 * update-path budget check accepts inherited links). Sharing state never
 * carries over: the copy starts as a private draft.
 */
async function duplicateAssistant(user: User, body: Record<string, unknown>): Promise<Response> {
  const id = str(body.id);
  if (!id) return json({ error: 'bad_request' }, 400);
  const access = await loadOwnedOrManaged(user, id);
  if ('response' in access) return access.response;
  const quotaErr = await checkAssistantQuota(user.id);
  if (quotaErr) return quotaErr;

  const source = access.row;
  const { data: created, error } = await supabaseAdmin
    .from('assistants')
    .insert({
      owner_user_id: user.id,
      org_id: source.org_id,
      name: `${source.name} (copy)`.slice(0, 80),
      base_agent: source.base_agent,
      context: source.context,
      instructions: source.instructions,
    })
    .select('id')
    .single();
  if (error || !created) {
    console.error('assistant duplicate failed', error);
    return json({ error: 'server_error' }, 500);
  }

  const { data: joins } = await supabaseAdmin
    .from('assistant_documents')
    .select('document_id, position')
    .eq('assistant_id', id);
  if (joins && joins.length > 0) {
    const rows = joins.map((j) => ({
      assistant_id: created.id,
      document_id: j.document_id,
      position: j.position,
    }));
    const { error: linkErr } = await supabaseAdmin.from('assistant_documents').insert(rows);
    if (linkErr) console.error('duplicate doc links failed', linkErr);
  }
  return json({ id: created.id });
}

async function deleteAssistant(user: User, body: Record<string, unknown>): Promise<Response> {
  const id = str(body.id);
  if (!id) return json({ error: 'bad_request' }, 400);
  const access = await loadOwnedOrManaged(user, id);
  if ('response' in access) return access.response;
  // A white-label page cascades away with its assistant (FK on delete cascade),
  // so warn before that happens unless the caller confirms.
  if (body.confirm !== true) {
    const { data: pages } = await supabaseAdmin
      .from('white_label_pages')
      .select('slug')
      .eq('assistant_id', id);
    if (pages && pages.length > 0) {
      return json({ error: 'page_attached', slugs: pages.map((p) => p.slug) }, 409);
    }
  }
  const { error } = await supabaseAdmin.from('assistants').delete().eq('id', id);
  if (error) {
    console.error('assistant delete failed', error);
    return json({ error: 'server_error' }, 500);
  }
  return json({ ok: true });
}

// Share flips the `shared` flag on an assistant that already lives in an org workspace
// (its org_id was set at create or via `move`). Only the OWNER shares, and only when they
// MANAGE that org.
async function shareAssistant(user: User, body: Record<string, unknown>): Promise<Response> {
  const id = str(body.id);
  if (!id) return json({ error: 'bad_request' }, 400);
  const { data: row } = await supabaseAdmin
    .from('assistants')
    .select('owner_user_id, org_id')
    .eq('id', id)
    .maybeSingle();
  if (!row || row.owner_user_id !== user.id) return json({ error: 'not_found' }, 404);
  if (!row.org_id) return json({ error: 'bad_request', field: 'org_id' }, 400); // Personal can't share
  const memberships = await getOrgMemberships(user);
  if (!isManagerOf(memberships, row.org_id)) return json({ error: 'manager_required' }, 403);
  const { error } = await supabaseAdmin.from('assistants').update({ shared: true }).eq('id', id);
  if (error) {
    console.error('assistant share failed', error);
    return json({ error: 'server_error' }, 500);
  }
  return json({ ok: true, orgName: memberships.find((m) => m.orgId === row.org_id)?.orgName });
}

async function unshareAssistant(user: User, body: Record<string, unknown>): Promise<Response> {
  const id = str(body.id);
  if (!id) return json({ error: 'bad_request' }, 400);
  const access = await loadOwnedOrManaged(user, id);
  if ('response' in access) return access.response;
  const { error } = await supabaseAdmin.from('assistants').update({ shared: false }).eq('id', id);
  if (error) {
    console.error('assistant unshare failed', error);
    return json({ error: 'server_error' }, 500);
  }
  return json({ ok: true });
}

// Move an assistant to another workspace (Personal or an org the owner belongs to). Moving
// only ever produces a PRIVATE draft (shared reset to false), so membership - not manager -
// is enough; SHARING it afterwards is the manager-gated step. This also means an assistant
// is never silently shared into an org it was moved to.
async function moveAssistant(user: User, body: Record<string, unknown>): Promise<Response> {
  const id = str(body.id);
  if (!id) return json({ error: 'bad_request' }, 400);
  const target = str(body.org_id).trim() || null; // null = Personal
  const { data: row } = await supabaseAdmin
    .from('assistants')
    .select('owner_user_id')
    .eq('id', id)
    .maybeSingle();
  if (!row || row.owner_user_id !== user.id) return json({ error: 'not_found' }, 404);
  if (target) {
    const memberships = await getOrgMemberships(user);
    if (!isMemberOf(memberships, target)) return json({ error: 'bad_request', field: 'org_id' }, 400);
  }
  const { error } = await supabaseAdmin
    .from('assistants')
    .update({ org_id: target, shared: false })
    .eq('id', id);
  if (error) {
    console.error('assistant move failed', error);
    return json({ error: 'server_error' }, 500);
  }
  return json({ ok: true });
}
