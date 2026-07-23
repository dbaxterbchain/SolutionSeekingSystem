# Cloudflare for SaaS — white-label custom domains

This directory holds the edge router that fronts customer custom domains. It is deployed
to Cloudflare, **not** part of the Astro/Netlify build. Netlify stays the app origin;
Cloudflare handles per-domain TLS (via Cloudflare for SaaS) and runs the walled-garden
router ([`worker/white-label-router.js`](worker/white-label-router.js)).

```
customer domain ──CNAME──▶ Cloudflare for SaaS ──Worker (this)──▶ Netlify origin (solutionseeking.com)
```

## Phase 0 setup (one-time)

Do these once; they unblock Phases 1 and 3.

1. **Cloudflare account + a zone.** Use a *dedicated* zone as the SaaS target so you don't
   have to move `solutionseeking.com`'s DNS — e.g. add a domain like `sssaas.com` (or a
   delegated subdomain) to Cloudflare. This zone's hostname is what customers CNAME to.
2. **Enable Cloudflare for SaaS** (SSL/TLS → Custom Hostnames). Set the **Fallback Origin**
   to `solutionseeking.com` (the Netlify site). Note the **custom-hostname CNAME target**
   Cloudflare gives you — that becomes `CLOUDFLARE_SAAS_TARGET`, the record customers add.
3. **KV namespace:** `npx wrangler kv namespace create WL_HOSTS` → paste the id into
   [`wrangler.toml`](wrangler.toml). Value format per key: `{"org":"<uuid>","slug":"<slug>"}`.
4. **Deploy the Worker:** `cd cloudflare && npx wrangler deploy`, then attach it to the SaaS
   zone's routes so it runs for custom-hostname traffic (Workers → Routes).
5. **API token** (My Profile → API Tokens) scoped to: *SSL and Certificates: Edit* (custom
   hostnames), *Workers KV Storage: Edit*, on the SaaS zone/account.

## Secrets to add (Netlify env + `.env`) and hand to the build

The provisioning API and the SSO hand-off read these via `serverEnv()`:

| Var | From |
|---|---|
| `CLOUDFLARE_API_TOKEN` | step 5 |
| `CLOUDFLARE_ZONE_ID` | the SaaS zone's Overview page |
| `CLOUDFLARE_ACCOUNT_ID` | any zone's Overview page |
| `CF_KV_NAMESPACE_ID` | step 3 |
| `CLOUDFLARE_SAAS_TARGET` | step 2 (the CNAME target customers add) |
| `WL_AUTH_ENC_KEY` | generate a 32-byte base64 key: `openssl rand -base64 32` |

## How routing works at runtime

- The Worker resolves the request Host against KV. Unknown hosts pass straight through
  (nothing breaks if a domain is half-configured).
- A known host serves only its assistant: `/` proxies to the origin's `/a/<org>/<slug>`;
  assets, `/api/*`, and `/wl-callback` pass through; everything else 302s back to `/`.
- The provisioning wizard (Phase 3) writes/removes KV entries via the Cloudflare API, so
  going live or tearing down a domain never needs a deploy or an operator.
