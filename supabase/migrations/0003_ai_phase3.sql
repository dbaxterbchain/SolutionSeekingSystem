-- Phase 3: in-site AI assistants (Guide & Mentor) + $5/month subscription.
-- Three tables:
--   subscriptions  — entitlement state, written ONLY by the server (service
--                    role, from Stripe webhooks). Clients can read their own row.
--   ai_usage       — lifetime free-message counter, server-incremented.
--   chat_sessions  — user-owned AI conversations, full client CRUD under RLS.
-- Run in the Supabase SQL editor (or `supabase db push`), then apply 0004 for
-- the explicit Data API grants.

-- ── subscriptions ────────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id     text not null,
  stripe_subscription_id text,
  status                 text not null default 'none',
  price_id               text,
  cancel_at_period_end   boolean not null default false,
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create unique index if not exists subscriptions_customer_idx
  on public.subscriptions (stripe_customer_id);

alter table public.subscriptions enable row level security;

drop policy if exists "own row: select" on public.subscriptions;
create policy "own row: select" on public.subscriptions
  for select using (auth.uid() = user_id);
-- Deliberately NO insert/update/delete policies: only the service role (which
-- bypasses RLS) writes entitlement state, so users can't self-grant.

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ── ai_usage ─────────────────────────────────────────────────────────────────
create table if not exists public.ai_usage (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  free_messages_used int not null default 0,
  updated_at         timestamptz not null default now()
);

alter table public.ai_usage enable row level security;

drop policy if exists "own row: select" on public.ai_usage;
create policy "own row: select" on public.ai_usage
  for select using (auth.uid() = user_id);

drop trigger if exists ai_usage_set_updated_at on public.ai_usage;
create trigger ai_usage_set_updated_at
  before update on public.ai_usage
  for each row execute function public.set_updated_at();

-- Atomic increment used by /api/chat for non-subscribers.
create or replace function public.increment_free_messages(uid uuid)
returns int language sql as $$
  insert into public.ai_usage (user_id, free_messages_used)
  values (uid, 1)
  on conflict (user_id)
  do update set free_messages_used = public.ai_usage.free_messages_used + 1
  returning free_messages_used;
$$;

-- Postgres grants EXECUTE to PUBLIC on new functions by default; without this
-- revoke, any signed-in user could burn other users' free messages via RPC.
revoke execute on function public.increment_free_messages(uuid)
  from public, anon, authenticated;

-- ── chat_sessions ────────────────────────────────────────────────────────────
create table if not exists public.chat_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  agent      text not null check (agent in ('guide', 'mentor')),
  title      text not null default 'Untitled',
  messages   jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_sessions_user_agent_idx
  on public.chat_sessions (user_id, agent, updated_at desc);

alter table public.chat_sessions enable row level security;

drop policy if exists "own rows: select" on public.chat_sessions;
create policy "own rows: select" on public.chat_sessions
  for select using (auth.uid() = user_id);

drop policy if exists "own rows: insert" on public.chat_sessions;
create policy "own rows: insert" on public.chat_sessions
  for insert with check (auth.uid() = user_id);

drop policy if exists "own rows: update" on public.chat_sessions;
create policy "own rows: update" on public.chat_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows: delete" on public.chat_sessions;
create policy "own rows: delete" on public.chat_sessions
  for delete using (auth.uid() = user_id);

drop trigger if exists chat_sessions_set_updated_at on public.chat_sessions;
create trigger chat_sessions_set_updated_at
  before update on public.chat_sessions
  for each row execute function public.set_updated_at();
