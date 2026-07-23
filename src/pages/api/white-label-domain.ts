import type { APIRoute } from 'astro';
import type { User } from '@supabase/supabase-js';
import { json } from '../../lib/server/auth';
import { requireSubscriber } from '../../lib/server/subscriberAuth';
import { getOrgMemberships } from '../../lib/server/orgMembership';
import { supabaseAdmin } from '../../lib/server/supabaseAdmin';
import { isUuid } from '../../lib/server/whiteLabel';
import { normalizeDomain } from '../../lib/server/wlAuth';
import { cnamePointsTo } from '../../lib/server/dnsVerify';
import {
  saasTarget,
  createCustomHostname,
  findCustomHostname,
  deleteCustomHostname,
  kvPutHost,
  kvDeleteHost,
} from '../../lib/server/cloudflare';
import { isRateLimited, clientIp } from '../../lib/server/rateLimit';

// Self-serve custom-domain provisioning for a white-label page. Manager-gated.
// The wizard walks a page through: none -> pending (domain entered) -> verifying
// (DNS points at us, cert issuing) -> active (live) | error. Every action is
// idempotent so the wizard can poll and retry freely.

export const prerender = false;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

// A customer must not be able to "claim" a host inside our own infrastructure.
const BLOCKED_SUFFIXES = [
  'solutionseeking.com',
  'solutionseekinghosting.com',
  'netlify.app',
  'workers.dev',
  'localhost',
];
const HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** A valid customer domain is a real subdomain (CNAME-able) outside our own zones. */
function isValidCustomDomain(host: string): boolean {
  if (!HOST_RE.test(host)) return false;
  if (host.split('.').length < 3) return false; // subdomain, not a bare apex (can't CNAME an apex)
  return !BLOCKED_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

/** Manager-only, scoped to a specific organization the caller manages. */
async function requireManager(
  request: Request,
  orgId: string
): Promise<{ user: User } | { response: Response }> {
  const auth = await requireSubscriber(request);
  if ('error' in auth) return { response: json({ error: auth.error }, auth.status) };
  if (!isUuid(orgId)) return { response: json({ error: 'bad_request' }, 400) };
  const memberships = await getOrgMemberships(auth.user);
  const org = memberships.find((m) => m.orgId === orgId && m.role === 'manager');
  if (!org) return { response: json({ error: 'manager_required' }, 403) };
  return { user: auth.user };
}

interface DomainPage {
  id: string;
  org_id: string;
  slug: string;
  custom_domain: string | null;
  domain_status: string;
}

async function loadPage(orgId: string, id: string): Promise<DomainPage | null> {
  if (!isUuid(id)) return null;
  const { data } = await supabaseAdmin
    .from('white_label_pages')
    .select('id, org_id, slug, custom_domain, domain_status')
    .eq('id', id)
    .maybeSingle();
  if (!data || data.org_id !== orgId) return null;
  return data as DomainPage;
}

async function setDomainStatus(id: string, status: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('white_label_pages')
    .update({ domain_status: status })
    .eq('id', id);
  if (error) console.error('wl-domain status update failed', error);
}

/** Shared response shape so the client always knows the target + current state. */
function state(
  page: DomainPage,
  status: string,
  extra: Record<string, unknown> = {}
): Response {
  return json({ status, domain: page.custom_domain, cname_target: saasTarget() || null, ...extra });
}

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: 'bad_request' }, 400);
  const orgId = str(body.org_id);
  const gate = await requireManager(request, orgId);
  if ('response' in gate) return gate.response;

  // Provisioning calls reach the Cloudflare API and a public resolver; keep them bounded.
  if (await isRateLimited('wl_domain', clientIp(request), 60, 300)) {
    return json({ error: 'rate_limited' }, 429);
  }

  const page = await loadPage(orgId, str(body.page_id));
  if (!page) return json({ error: 'not_found' }, 404);

  switch (str(body.action)) {
    case 'set_domain':
      return setDomain(page, body);
    case 'verify':
      return verify(page);
    case 'status':
      return status(page);
    case 'remove':
      return remove(page);
    default:
      return json({ error: 'bad_request' }, 400);
  }
};

// Store the desired host and enter `pending`. The page must not already have a
// domain (changing one is Remove-then-Add, so a stale Cloudflare hostname/KV entry
// is never orphaned).
async function setDomain(page: DomainPage, body: Record<string, unknown>): Promise<Response> {
  if (!saasTarget()) return json({ error: 'not_configured' }, 503);
  if (page.custom_domain) {
    return json({ error: 'domain_exists', message: 'Remove the current domain before adding a new one.' }, 409);
  }
  const domain = normalizeDomain(str(body.domain));
  if (!isValidCustomDomain(domain)) {
    return json(
      { error: 'bad_domain', message: 'Enter a subdomain you control, for example assistant.yourcompany.com.' },
      400
    );
  }
  const { data: clash } = await supabaseAdmin
    .from('white_label_pages')
    .select('id')
    .eq('custom_domain', domain)
    .maybeSingle();
  if (clash && clash.id !== page.id) {
    return json({ error: 'domain_taken', message: 'That domain is already connected to another page.' }, 409);
  }
  const { error } = await supabaseAdmin
    .from('white_label_pages')
    .update({ custom_domain: domain, domain_status: 'pending' })
    .eq('id', page.id);
  if (error) {
    console.error('wl-domain set_domain failed', error);
    return json({ error: 'server_error' }, 500);
  }
  // No dns_ok here on purpose: the "not detected yet" hint should appear only
  // after the manager has actually clicked Verify, not the instant they connect.
  return state({ ...page, custom_domain: domain }, 'pending');
}

// Check DNS; once the CNAME points at us, provision the Cloudflare custom hostname
// (cert) and write the KV route the Worker reads. Idempotent: an existing hostname
// is reused, and KV is a plain put.
async function verify(page: DomainPage): Promise<Response> {
  if (!saasTarget()) return json({ error: 'not_configured' }, 503);
  if (!page.custom_domain) return json({ error: 'no_domain' }, 400);
  const host = page.custom_domain;

  const dns = await cnamePointsTo(host, saasTarget());
  if (!dns.ok) {
    // Not pointing at us yet: stay pending (DNS can take minutes to propagate).
    return state(page, 'pending', { dns_ok: false, observed: dns.observed });
  }

  const existing = await findCustomHostname(host);
  const ch = existing ?? (await createCustomHostname(host));
  if (!ch) {
    await setDomainStatus(page.id, 'error');
    return state(page, 'error', { dns_ok: true, reason: 'provision_failed' });
  }
  if (!(await kvPutHost(host, { org: page.org_id, slug: page.slug }))) {
    await setDomainStatus(page.id, 'error');
    return state(page, 'error', { dns_ok: true, reason: 'route_failed' });
  }

  const live = ch.sslStatus === 'active' && ch.status === 'active';
  const next = live ? 'active' : 'verifying';
  if (page.domain_status !== next) await setDomainStatus(page.id, next);
  return state(page, next, { dns_ok: true, ssl_status: ch.sslStatus });
}

// Poll: reflect the Cloudflare cert state and promote to `active` once it's issued.
async function status(page: DomainPage): Promise<Response> {
  if (!page.custom_domain) return state(page, 'none');
  if (!saasTarget()) return state(page, page.domain_status);
  const ch = await findCustomHostname(page.custom_domain);
  if (!ch) return state(page, page.domain_status);

  const live = ch.sslStatus === 'active' && ch.status === 'active';
  const next = live ? 'active' : page.domain_status === 'pending' ? 'verifying' : page.domain_status;
  if (next !== page.domain_status) await setDomainStatus(page.id, next);
  return state(page, next, { ssl_status: ch.sslStatus });
}

// Tear down: delete the Cloudflare custom hostname + KV route, clear the columns.
async function remove(page: DomainPage): Promise<Response> {
  const host = page.custom_domain;
  if (host && saasTarget()) {
    const ch = await findCustomHostname(host);
    if (ch) await deleteCustomHostname(ch.id);
    await kvDeleteHost(host);
  }
  const { error } = await supabaseAdmin
    .from('white_label_pages')
    .update({ custom_domain: null, domain_status: 'none' })
    .eq('id', page.id);
  if (error) {
    console.error('wl-domain remove failed', error);
    return json({ error: 'server_error' }, 500);
  }
  return json({ status: 'none', domain: null, cname_target: saasTarget() || null });
}
