-- Advisors pass, part 5 of 6: stop rate_limit from growing forever.
--
-- Every distinct '<scope>:<ip-hash>' bucket leaves a row behind, and nothing
-- has ever deleted one. The table is append-mostly garbage after each window
-- expires, and the `rate_limit_window_idx` from 0006 shows up in the advisors'
-- `unused_index` list precisely because the purge it was built for was never
-- written. This migration writes it.
--
-- Chosen shape: an opportunistic purge INSIDE bump_rate_limit, not a pg_cron
-- job. A scheduled job would exist only on hosted, and hosted-only moving
-- parts that local dev silently lacks are exactly what the 0010 episode was
-- about. In-function, the behavior ships everywhere the function ships.
--
-- Mechanics, on roughly 1 call in 50 (random() < 0.02):
--   * delete at most 200 rows whose window_start is older than 48 hours;
--   * 48h = 2x the longest window in use (24h, `anon_chat` in
--     src/lib/server/rateLimit.ts). A row that stale is an expired window, so
--     removing it can never change a limiting decision. If a window longer
--     than 24 hours is ever introduced, raise this constant with it.
--   * `for update skip locked` means the purge never waits on, or deadlocks
--     with, a concurrent bump holding its own-row lock; contested rows are
--     simply left for a later pass.
--   * the purge runs BEFORE this caller takes its own-row lock, so it never
--     extends how long that lock is held.
-- Worst case a purge pass is one indexed scan + 200 deletes; isRateLimited()
-- fails open on any error by design, so a slow pass degrades, not breaks.
--
-- The SELECT ... FOR UPDATE check-and-increment core is byte-for-byte 0006.
-- The header re-states `set search_path = ''` because CREATE OR REPLACE drops
-- the pin 0016 added via ALTER (see 0016's note); the body already qualifies
-- public.rate_limit everywhere, and now()/make_interval/random are pg_catalog.

create or replace function public.bump_rate_limit(
  p_bucket text,
  p_window_seconds int,
  p_max int
) returns int language plpgsql
set search_path = ''
as $$
declare
  v_count int;
  v_start timestamptz;
begin
  -- Opportunistic purge of long-expired buckets (see header).
  if random() < 0.02 then
    delete from public.rate_limit
     where bucket in (
       select bucket
         from public.rate_limit
        where window_start < now() - interval '48 hours'
        order by window_start
        limit 200
          for update skip locked);
  end if;

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

-- Privileges survive CREATE OR REPLACE (same OID), but say it out loud anyway,
-- matching 0006: service role only.
revoke execute on function public.bump_rate_limit(text, int, int)
  from public, anon, authenticated;
grant execute on function public.bump_rate_limit(text, int, int) to service_role;
