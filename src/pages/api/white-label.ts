import type { APIRoute } from 'astro';
import { json } from '../../lib/server/auth';
import { requireSubscriber } from '../../lib/server/subscriberAuth';
import { getOrgMembership, type OrgMembership } from '../../lib/server/orgMembership';
import { supabaseAdmin } from '../../lib/server/supabaseAdmin';
import { AGENT_IDS, type AgentId } from '../../lib/server/agents';
import { getContextMeta } from '../../lib/contexts';
import { isValidSlug, logoUrl, pagePath } from '../../lib/server/whiteLabel';

export const prerender = false;

const MAX_PAGES_PER_ORG = 10;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Every white-label operation is manager-only. */
async function requireManager(
  request: Request
): Promise<{ userId: string; org: OrgMembership } | { response: Response }> {
  const auth = await requireSubscriber(request);
  if ('error' in auth) return { response: json({ error: auth.error }, auth.status) };
  const org = await getOrgMembership(auth.user.id);
  if (!org || org.role !== 'manager') return { response: json({ error: 'manager_required' }, 403) };
  return { userId: auth.user.id, org };
}

export const GET: APIRoute = async ({ request }) => {
  const gate = await requireManager(request);
  if ('response' in gate) return gate.response;
  const { data, error } = await supabaseAdmin
    .from('white_label_pages')
    .select(
      'id, org_id, slug, assistant_id, agent, context, title, description, display_instructions, logo_path, status, custom_domain, created_at'
    )
    .eq('org_id', gate.org.orgId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('white-label list failed', error);
    return json({ error: 'server_error' }, 500);
  }
  const rows = (data ?? []).map((p) => ({
    ...p,
    logo_url: logoUrl(p.logo_path),
    path: pagePath(p),
  }));
  return json({ rows, orgName: gate.org.orgName });
};

export const POST: APIRoute = async ({ request }) => {
  const gate = await requireManager(request);
  if ('response' in gate) return gate.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: 'bad_request' }, 400);
  switch (str(body.action)) {
    case 'create':
      return createPage(gate.org, gate.userId, body);
    case 'update':
      return updatePage(gate.org, body);
    case 'set_status':
      return setStatus(gate.org, body);
    case 'delete':
      return deletePage(gate.org, body);
    default:
      return json({ error: 'bad_request' }, 400);
  }
};

/** Resolve and validate the page target: an org-shared assistant, or a standard agent + mode. */
async function resolveTarget(
  org: OrgMembership,
  body: Record<string, unknown>
): Promise<
  { assistant_id: string | null; agent: AgentId | null; context: string | null } | { error: Response }
> {
  const assistantId = str(body.assistant_id);
  const agent = str(body.agent);
  if (assistantId && agent) return { error: json({ error: 'bad_request', field: 'target' }, 400) };

  if (assistantId) {
    // Must be shared to THIS org, or members couldn't use the page's assistant.
    const { data: a } = await supabaseAdmin
      .from('assistants')
      .select('org_id')
      .eq('id', assistantId)
      .maybeSingle();
    if (!a || a.org_id !== org.orgId) {
      return { error: json({ error: 'bad_request', field: 'assistant' }, 400) };
    }
    return { assistant_id: assistantId, agent: null, context: null };
  }

  if (AGENT_IDS.includes(agent as AgentId)) {
    const context = str(body.context) || null;
    if (context) {
      const meta = getContextMeta(context, agent as AgentId);
      if (!meta || meta.kind !== 'mode') return { error: json({ error: 'bad_request', field: 'context' }, 400) };
    }
    return { assistant_id: null, agent: agent as AgentId, context };
  }

  return { error: json({ error: 'bad_request', field: 'target' }, 400) };
}

async function createPage(
  org: OrgMembership,
  userId: string,
  body: Record<string, unknown>
): Promise<Response> {
  const slug = str(body.slug).toLowerCase();
  if (!isValidSlug(slug)) {
    return json(
      { error: 'bad_request', field: 'slug', message: 'Use 3-48 lowercase letters, numbers, and hyphens.' },
      400
    );
  }
  const title = str(body.title).trim();
  if (title.length < 1 || title.length > 120) return json({ error: 'bad_request', field: 'title' }, 400);

  const { count } = await supabaseAdmin
    .from('white_label_pages')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', org.orgId);
  if ((count ?? 0) >= MAX_PAGES_PER_ORG) {
    return json({ error: 'too_many_pages', message: `You can have up to ${MAX_PAGES_PER_ORG} pages.` }, 409);
  }

  const target = await resolveTarget(org, body);
  if ('error' in target) return target.error;

  const { data, error } = await supabaseAdmin
    .from('white_label_pages')
    .insert({
      org_id: org.orgId,
      slug,
      ...target,
      title,
      description: str(body.description).slice(0, 600),
      display_instructions: str(body.display_instructions).slice(0, 4000),
      created_by: userId,
    })
    .select('id')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return json({ error: 'slug_taken', message: 'That address is already used in your organization.' }, 409);
    }
    console.error('white-label create failed', error);
    return json({ error: 'server_error' }, 500);
  }
  return json({ id: data.id, path: pagePath({ org_id: org.orgId, slug }) });
}

async function loadOrgPage(
  org: OrgMembership,
  id: string
): Promise<{ logo_path: string | null } | { response: Response }> {
  const { data } = await supabaseAdmin
    .from('white_label_pages')
    .select('org_id, logo_path')
    .eq('id', id)
    .maybeSingle();
  if (!data || data.org_id !== org.orgId) return { response: json({ error: 'not_found' }, 404) };
  return { logo_path: data.logo_path };
}

async function updatePage(org: OrgMembership, body: Record<string, unknown>): Promise<Response> {
  const id = str(body.id);
  if (!id) return json({ error: 'bad_request' }, 400);
  const found = await loadOrgPage(org, id);
  if ('response' in found) return found.response;
  const title = str(body.title).trim();
  if (title.length < 1 || title.length > 120) return json({ error: 'bad_request', field: 'title' }, 400);
  const target = await resolveTarget(org, body);
  if ('error' in target) return target.error;

  const { error } = await supabaseAdmin
    .from('white_label_pages')
    .update({
      title,
      description: str(body.description).slice(0, 600),
      display_instructions: str(body.display_instructions).slice(0, 4000),
      ...target,
    })
    .eq('id', id);
  if (error) {
    console.error('white-label update failed', error);
    return json({ error: 'server_error' }, 500);
  }
  return json({ ok: true });
}

async function setStatus(org: OrgMembership, body: Record<string, unknown>): Promise<Response> {
  const id = str(body.id);
  const status = str(body.status);
  if (!id || (status !== 'active' && status !== 'inactive')) return json({ error: 'bad_request' }, 400);
  const found = await loadOrgPage(org, id);
  if ('response' in found) return found.response;
  const { error } = await supabaseAdmin.from('white_label_pages').update({ status }).eq('id', id);
  if (error) {
    console.error('white-label set_status failed', error);
    return json({ error: 'server_error' }, 500);
  }
  return json({ ok: true });
}

async function deletePage(org: OrgMembership, body: Record<string, unknown>): Promise<Response> {
  const id = str(body.id);
  if (!id) return json({ error: 'bad_request' }, 400);
  const found = await loadOrgPage(org, id);
  if ('response' in found) return found.response;
  const { error } = await supabaseAdmin.from('white_label_pages').delete().eq('id', id);
  if (error) {
    console.error('white-label delete failed', error);
    return json({ error: 'server_error' }, 500);
  }
  if (found.logo_path) {
    await supabaseAdmin.storage.from('branding').remove([found.logo_path]).catch(() => {});
  }
  return json({ ok: true });
}
