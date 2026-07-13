-- Anonymous trial: let a visitor send a few messages before creating an account.
--
-- Deliberately NO changes to chat_sessions, ai_usage, or subscriptions.
-- Supabase anonymous users are real auth.users rows carrying role=authenticated
-- and a real auth.uid(), so every RLS policy from 0003 and every grant from 0004
-- already covers them. Conversion to a permanent account keeps the SAME user id,
-- which is what makes the conversation and the free-message counter survive
-- signup with no code at all. Please don't "fix" this by adding policies.
--
-- What we do need is a way to bound the cost of a free, unauthenticated LLM
-- call. Anonymous identities are free to mint, so the limit has to be per-IP and
-- has to count messages, not identities.

-- Rolling-window rate limiter, keyed by a salted hash of the client IP.
-- Server-only: /api/chat today, /api/subscribe later.
-- Raw IPs are never stored (a leaked table is then useless).
create table if not exists public.rate_limit (
  bucket       text        primary key,   -- '<scope>:<sha256(ip + salt)>'
  window_start timestamptz not null default now(),
  count        int         not null default 0,
  updated_at   timestamptz not null default now()
);

create index if not exists rate_limit_window_idx on public.rate_limit (window_start);

alter table public.rate_limit enable row level security;
-- No policies and no grants to anon/authenticated: the service role (which
-- bypasses RLS) is the only reader or writer.
grant select, insert, update, delete on public.rate_limit to service_role;

-- Atomic check-and-increment. Returns the caller's new count within the window,
-- or -1 when the cap was already reached. A blocked caller is NOT counted, so
-- hammering the endpoint can't extend its own window.
--
-- SELECT ... FOR UPDATE serializes concurrent calls for the same bucket, so two
-- simultaneous requests can't both read "count = max - 1" and both be allowed.
create or replace function public.bump_rate_limit(
  p_bucket text,
  p_window_seconds int,
  p_max int
) returns int language plpgsql as $$
declare
  v_count int;
  v_start timestamptz;
begin
  insert into public.rate_limit (bucket, window_start, count)
  values (p_bucket, now(), 0)
  on conflict (bucket) do nothing;

  select window_start, count into v_start, v_count
  from public.rate_limit
  where bucket = p_bucket
  for update;

  -- Window expired: start a fresh one.
  if v_start < now() - make_interval(secs => p_window_seconds) then
    v_start := now();
    v_count := 0;
  end if;

  if v_count >= p_max then
    update public.rate_limit
       set window_start = v_start, updated_at = now()
     where bucket = p_bucket;
    return -1;
  end if;

  v_count := v_count + 1;
  update public.rate_limit
     set window_start = v_start, count = v_count, updated_at = now()
   where bucket = p_bucket;
  return v_count;
end $$;

-- Postgres grants EXECUTE to PUBLIC on new functions by default; without this
-- revoke, any signed-in user could inflate other callers' rate-limit buckets.
revoke execute on function public.bump_rate_limit(text, int, int)
  from public, anon, authenticated;
grant execute on function public.bump_rate_limit(text, int, int) to service_role;
