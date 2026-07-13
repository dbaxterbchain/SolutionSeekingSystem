-- Email list.
--
-- The complete-guide PDF was being given away with zero email capture, so every
-- visitor who downloaded it was lost forever. This table is the list; the list
-- lives here rather than in an ESP so subscribers can be joined to accounts, to
-- ai_usage, and to subscriptions, which is the analysis that tells us whether the
-- lead magnet actually converts.
--
-- Server-write-only, like every other table that must not be forgeable from a
-- browser: RLS on, no policies, no grants to anon/authenticated. Reads and writes
-- go through /api/subscribe, /api/confirm and /api/unsubscribe with the service
-- role. The browser must never be able to enumerate the list.

create extension if not exists citext;

create table if not exists public.email_subscribers (
  id            uuid primary key default gen_random_uuid(),
  -- citext: nobody should end up on the list twice for Dana@ and dana@.
  email         citext not null unique,
  -- 'pdf_guide' | 'footer' | 'pricing' | ...
  source        text not null,
  status        text not null default 'pending'
                check (status in ('pending', 'confirmed', 'unsubscribed', 'bounced')),
  -- Doubles as the unsubscribe token: knowing it proves control of the address.
  token         text not null,
  confirmed_at  timestamptz,
  -- Set when a signed-in user subscribes, so the list can be joined to accounts.
  user_id       uuid references auth.users (id) on delete set null,
  -- Salted hash only, never a raw IP.
  ip_hash       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists email_subscribers_token_idx on public.email_subscribers (token);
create index if not exists email_subscribers_status_idx on public.email_subscribers (status);

alter table public.email_subscribers enable row level security;
-- Deliberately no policies: the service role (which bypasses RLS) is the only
-- reader or writer. A browser must never be able to read this table.
grant select, insert, update on public.email_subscribers to service_role;

drop trigger if exists email_subscribers_set_updated_at on public.email_subscribers;
create trigger email_subscribers_set_updated_at
  before update on public.email_subscribers
  for each row execute function public.set_updated_at();
