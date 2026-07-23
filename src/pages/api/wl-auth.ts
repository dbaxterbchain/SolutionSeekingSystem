import type { APIRoute } from 'astro';
import { json } from '../../lib/server/auth';
import { supabaseAdmin } from '../../lib/server/supabaseAdmin';
import { issueWlAuthCode, exchangeWlAuthCode } from '../../lib/server/wlAuth';
import { isRateLimited, clientIp } from '../../lib/server/rateLimit';

export const prerender = false;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Host from an Origin header (browser-set, so more trustworthy than a body field). */
function originHost(request: Request): string {
  try {
    const o = request.headers.get('origin');
    return o ? new URL(o).host : '';
  } catch {
    return '';
  }
}

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: 'bad_request' }, 400);
  switch (str(body.action)) {
    case 'issue':
      return issue(request, body);
    case 'exchange':
      return exchange(request, body);
    default:
      return json({ error: 'bad_request' }, 400);
  }
};

// Called on the canonical host right after the user signs in. Verifies the fresh
// session and mints a single-use code bound to the target custom domain.
async function issue(request: Request, body: Record<string, unknown>): Promise<Response> {
  if (await isRateLimited('wl_auth_issue', clientIp(request), 30, 300)) {
    return json({ error: 'rate_limited' }, 429);
  }
  const accessToken = str(body.access_token);
  const refreshToken = str(body.refresh_token);
  const domain = str(body.domain);
  if (!accessToken || !refreshToken || !domain) return json({ error: 'bad_request' }, 400);

  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) return json({ error: 'unauthorized' }, 401);

  const code = await issueWlAuthCode(
    data.user.id,
    { access_token: accessToken, refresh_token: refreshToken },
    domain
  );
  // Null = the domain isn't a live white-label custom domain: never hand a session
  // to an arbitrary host.
  if (!code) return json({ error: 'domain_not_eligible' }, 400);
  return json({ code });
}

// Called on the custom domain's /wl-callback. Redeems the code once, for the domain
// the browser is actually on (the Origin header, forwarded intact by the Worker).
async function exchange(request: Request, body: Record<string, unknown>): Promise<Response> {
  if (await isRateLimited('wl_auth_exchange', clientIp(request), 30, 300)) {
    return json({ error: 'rate_limited' }, 429);
  }
  const code = str(body.code);
  const domain = originHost(request) || str(body.domain);
  if (!code || !domain) return json({ error: 'bad_request' }, 400);

  const result = await exchangeWlAuthCode(code, domain);
  if (!result.ok) return json({ error: result.reason }, result.reason === 'not_found' ? 404 : 400);
  return json({ access_token: result.session.access_token, refresh_token: result.session.refresh_token });
}
