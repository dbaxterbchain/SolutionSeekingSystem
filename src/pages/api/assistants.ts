import type { APIRoute } from 'astro';
import { json } from '../../lib/server/auth';
import { requireSubscriber } from '../../lib/server/subscriberAuth';
import { getOrgMembership } from '../../lib/server/orgMembership';
import { supabaseAdmin } from '../../lib/server/supabaseAdmin';
import { AGENT_IDS, type AgentId } from '../../lib/server/agents';
import { getContextMeta } from '../../lib/contexts';
import { MAX_ASSISTANT_DOCS, MAX_SETUP_CHARS } from '../../lib/server/assistants';

export const prerender = false;

const MAX_ASSISTANTS_PER_USER = 20;
const ROW_COLUMNS =
  'id, owner_user_id, org_id, name, base_agent, context, instructions, created_at, updated_at';

interface DocView {
  id: string;
  name: string;
  char_count: number;
}
interface AssistantRowRaw {
  id: string;
  owner_user_id: string;
  org_id: string | null;
  name: string;
  base_agent: AgentId;
  context: string | null;
  instructions: string;
  created_at: string;
  updated_at: string;
}

// ── GET: the user's assistants, those shared to their org, and their membership ─
export const GET: APIRoute = async ({ request }) => {
  const auth = await requireSubscriber(request);
  if ('error' in auth) return json({ error: auth.error }, auth.status);
  const { user } = auth;

  const membership = await getOrgMembership(user.id);

  const { data: mineRows, error: mineErr } = await supabaseAdmin
    .from('assistants')
    .select(ROW_COLUMNS)
    .eq('owner_user_id', user.id)
    .order('updated_at', { ascending: false });
  if (mineErr) {
    console.error('assistants list failed', mineErr);
    return json({ error: 'server_error' }, 500);
  }

  let sharedRows: AssistantRowRaw[] = [];
  if (membership) {
    const { data } = await supabaseAdmin
      .from('assistants')
      .select(ROW_COLUMNS)
      .eq('org_id', membership.orgId)
      .neq('owner_user_id', user.id)
      .order('updated_at', { ascending: false });
    sharedRows = (data ?? []) as AssistantRowRaw[];
  }

  const mine = (mineRows ?? []) as AssistantRowRaw[];
  const docs = await loadDocViews([...mine, ...sharedRows].map((a) => a.id));

  return json({
    mine: mine.map((r) => shape(r, docs)),
    shared: sharedRows.map((r) => shape(r, docs)),
    membership: membership ? { orgName: membership.orgName, role: membership.role } : null,
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
      return createAssistant(auth.user.id, body);
    case 'update':
      return updateAssistant(auth.user.id, body);
    case 'delete':
      return deleteAssistant(auth.user.id, body);
    case 'share':
      return shareAssistant(auth.user.id, body);
    case 'unshare':
      return unshareAssistant(auth.user.id, body);
    default:
      return json({ error: 'bad_request' }, 400);
  }
};

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const idList = (v: unknown): string[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((x): x is string => typeof x === 'string'))].slice(0, MAX_ASSISTANT_DOCS)
    : [];

/** Confirm the docs are the user's own and (with the instructions) fit the budget. */
async function checkDocsBudget(
  userId: string,
  documentIds: string[],
  instructions: string
): Promise<Response | null> {
  if (documentIds.length === 0) return null;
  const { data } = await supabaseAdmin
    .from('documents')
    .select('id, char_count')
    .eq('user_id', userId)
    .in('id', documentIds);
  const found = data ?? [];
  if (found.length !== documentIds.length) {
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

async function createAssistant(userId: string, body: Record<string, unknown>): Promise<Response> {
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

  const budgetErr = await checkDocsBudget(userId, documentIds, instructions);
  if (budgetErr) return budgetErr;

  const { data: created, error } = await supabaseAdmin
    .from('assistants')
    .insert({ owner_user_id: userId, name, base_agent: baseAgent, context, instructions })
    .select('id')
    .single();
  if (error || !created) {
    console.error('assistant create failed', error);
    return json({ error: 'server_error' }, 500);
  }
  await attachDocs(created.id, documentIds);
  return json({ id: created.id });
}

/** Load an assistant the user owns, or is a manager of the org it's shared to. */
async function loadOwnedOrManaged(
  userId: string,
  id: string
): Promise<{ row: { id: string; owner_user_id: string; org_id: string | null; base_agent: AgentId } } | { response: Response }> {
  const { data: row } = await supabaseAdmin
    .from('assistants')
    .select('id, owner_user_id, org_id, base_agent')
    .eq('id', id)
    .maybeSingle();
  if (!row) return { response: json({ error: 'not_found' }, 404) };
  if (row.owner_user_id === userId) return { row };
  if (row.org_id) {
    const m = await getOrgMembership(userId);
    if (m && m.orgId === row.org_id && m.role === 'manager') return { row };
  }
  // 404, not 403: an id the caller can't manage is not confirmed to exist.
  return { response: json({ error: 'not_found' }, 404) };
}

async function updateAssistant(userId: string, body: Record<string, unknown>): Promise<Response> {
  const id = str(body.id);
  if (!id) return json({ error: 'bad_request' }, 400);
  const access = await loadOwnedOrManaged(userId, id);
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

  const budgetErr = await checkDocsBudget(userId, documentIds, instructions);
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

async function deleteAssistant(userId: string, body: Record<string, unknown>): Promise<Response> {
  const id = str(body.id);
  if (!id) return json({ error: 'bad_request' }, 400);
  const access = await loadOwnedOrManaged(userId, id);
  if ('response' in access) return access.response;
  // Phase D adds a white-label page_attached pre-check here.
  const { error } = await supabaseAdmin.from('assistants').delete().eq('id', id);
  if (error) {
    console.error('assistant delete failed', error);
    return json({ error: 'server_error' }, 500);
  }
  return json({ ok: true });
}

async function shareAssistant(userId: string, body: Record<string, unknown>): Promise<Response> {
  const id = str(body.id);
  if (!id) return json({ error: 'bad_request' }, 400);
  // Only the OWNER shares (and only a manager can). A manager can unshare/manage
  // an already-shared assistant, but sharing your own into the org is the owner's act.
  const { data: row } = await supabaseAdmin
    .from('assistants')
    .select('owner_user_id')
    .eq('id', id)
    .maybeSingle();
  if (!row || row.owner_user_id !== userId) return json({ error: 'not_found' }, 404);
  const m = await getOrgMembership(userId);
  if (!m || m.role !== 'manager') return json({ error: 'manager_required' }, 403);
  const { error } = await supabaseAdmin.from('assistants').update({ org_id: m.orgId }).eq('id', id);
  if (error) {
    console.error('assistant share failed', error);
    return json({ error: 'server_error' }, 500);
  }
  return json({ ok: true, orgName: m.orgName });
}

async function unshareAssistant(userId: string, body: Record<string, unknown>): Promise<Response> {
  const id = str(body.id);
  if (!id) return json({ error: 'bad_request' }, 400);
  const access = await loadOwnedOrManaged(userId, id);
  if ('response' in access) return access.response;
  const { error } = await supabaseAdmin.from('assistants').update({ org_id: null }).eq('id', id);
  if (error) {
    console.error('assistant unshare failed', error);
    return json({ error: 'server_error' }, 500);
  }
  return json({ ok: true });
}
