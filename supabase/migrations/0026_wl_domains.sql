-- White-label custom-domain routing + self-serve provisioning + auth hand-off.
--
-- Until now white_label_pages.custom_domain (added in 0023) was concierge bookkeeping
-- that nothing routed on; routing lived in a hand-edited netlify.toml rule. We are
-- making the domain a first-class, self-served thing: a Cloudflare Worker resolves
-- host -> page from KV, but the app database is the source of truth. One domain maps
-- to exactly one page, and the provisioning wizard tracks a lifecycle.
--
-- Also adds a short-lived one-time-code table for the white-label SSO hand-off: the
-- customer signs in on the canonical host (the only Turnstile / Supabase-redirect
-- host), and the session is handed to their custom domain via a single-use code.

-- One custom domain -> one page. Partial (non-null) so pages without a domain never
-- collide on NULL, and it doubles as the host -> page lookup index. Domains are stored
-- lowercased by the app.
create unique index if not exists white_label_pages_custom_domain_key
  on public.white_label_pages (custom_domain) where custom_domain is not null;

-- Provisioning lifecycle, driven by the wizard: none (no domain) -> pending (entered)
-- -> verifying (DNS ok, cert issuing) -> active (live) | error.
alter table public.white_label_pages
  add column if not exists domain_status text not null default 'none'
  check (domain_status in ('none', 'pending', 'verifying', 'active', 'error'));

-- One-time codes for the white-label auth hand-off. A code is minted on the canonical
-- host right after sign-in; it carries the user's session encrypted with WL_AUTH_ENC_KEY
-- (never stored in the clear), is bound to one custom domain, expires in ~60s, and is
-- single-use. Server-only (service role), like every table that must not be forgeable
-- from a browser (the 0012 pattern).
create table if not exists public.wl_auth_codes (
  code        text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  enc_session text not null,
  domain      text not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- Cover the FK (per the 0018/0020 advisor work).
create index if not exists wl_auth_codes_user_idx on public.wl_auth_codes (user_id);
-- The issue endpoint opportunistically sweeps expired rows; keep that cheap.
create index if not exists wl_auth_codes_expires_idx on public.wl_auth_codes (expires_at);

alter table public.wl_auth_codes enable row level security;
-- Server-only: deliberately no policies and no anon/authenticated grants.
grant select, insert, update, delete on public.wl_auth_codes to service_role;
