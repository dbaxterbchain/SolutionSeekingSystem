/**
 * White-label custom-domain router — a Cloudflare Worker.
 *
 * Runs in front of every customer custom domain (via Cloudflare for SaaS custom
 * hostnames). It turns a bare domain into a walled garden that serves ONLY that
 * org's assistant page, and it does the host -> page resolution dynamically from
 * KV, so adding a customer never touches app config.
 *
 *   GET /                       -> proxy origin /a/<org>/<slug>   (clean URL, the page)
 *   /_astro/* /api/* /wl-callback /favicon.svg /robots.txt        -> proxy origin, same path
 *   anything else               -> 302 back to /                  (walled garden)
 *   unknown host (not in KV)     -> proxy origin unchanged         (don't hijack it)
 *
 * The origin is the Netlify site. We strip the incoming Host so the origin serves
 * solutionseeking.com normally, and forward the real customer host as
 * X-Forwarded-Host (the SSO sign-in link uses it). The browser URL never changes.
 *
 * KV: binding WL_HOSTS, key = lowercase host, value = JSON {"org":"<uuid>","slug":"<slug>"}.
 * The provisioning API writes/removes these entries (src/lib/server/cloudflare.ts).
 */

const ORIGIN = 'https://solutionseeking.com';

/** Paths a white-label page legitimately needs beyond its root. */
function isPassThrough(pathname) {
  return (
    pathname.startsWith('/_astro/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/wl-callback') ||
    pathname === '/favicon.svg' ||
    pathname === '/robots.txt' ||
    pathname.startsWith('/fonts/')
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = (request.headers.get('host') || url.hostname).toLowerCase();

    const raw = await env.WL_HOSTS.get(host);
    if (!raw) {
      // Not one of our custom domains: pass straight through, don't hijack it.
      return proxy(ORIGIN + url.pathname + url.search, request);
    }
    let page;
    try {
      page = JSON.parse(raw);
    } catch {
      return proxy(ORIGIN + url.pathname + url.search, request);
    }
    if (!page || !page.org || !page.slug) {
      return proxy(ORIGIN + url.pathname + url.search, request);
    }

    const p = url.pathname;
    if (p === '/') {
      // The clean root serves the assistant page; the browser URL stays the custom domain.
      return proxy(`${ORIGIN}/a/${page.org}/${page.slug}`, request);
    }
    if (isPassThrough(p)) {
      return proxy(ORIGIN + p + url.search, request);
    }
    // Walled garden: nothing else on this domain is reachable.
    return Response.redirect(`https://${host}/`, 302);
  },
};

/**
 * Proxy to the Netlify origin. Host is dropped so the origin sees solutionseeking.com
 * (Netlify serves its own domain); the real customer host rides along as X-Forwarded-Host.
 * Method, body, and streaming responses are preserved.
 */
function proxy(target, request) {
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.set('x-forwarded-host', new URL(request.url).host);
  const init = { method: request.method, headers, redirect: 'manual' };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }
  return fetch(target, init);
}
