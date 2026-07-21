-- Advisors pass, part 2 of 6: pin search_path on every function.
--
-- None of our five functions set a search_path, so they run with the CALLER's
-- search_path. That is Supabase advisor `function_search_path_mutable` (WARN,
-- all five): a caller who can point search_path at a schema they control can,
-- in principle, swap in look-alike objects. All five are SECURITY INVOKER and
-- four have EXECUTE revoked from anon/authenticated, so the practical exposure
-- was low; pinning removes the class of problem outright.
--
-- ALTER FUNCTION ... SET search_path is enough, no body changes: every body
-- already schema-qualifies its table references (public.ai_usage,
-- public.rate_limit, public.org_members, public.organizations), and everything
-- else they call (now, format, make_interval) lives in pg_catalog, which is
-- always searched first implicitly. So four of five get the strictest pin, ''.
--
-- claim_org_seat is the exception: its body compares citext values
-- (om.email = p_email, 0012 line 126), and OPERATORS are resolved via
-- search_path at plan time. The citext operators live wherever the extension
-- lives: public today, extensions after 0017 relocates it. Pinning
-- `public, extensions` covers both orders; pg_temp is appended EXPLICITLY so
-- it is searched last instead of its default position, first.
--
-- NOTE for future edits: CREATE OR REPLACE drops a SET clause added by ALTER.
-- Any migration that replaces one of these bodies must re-state the pin in the
-- function header (0019 does exactly that for bump_rate_limit).

alter function public.set_updated_at()                 set search_path = '';
alter function public.increment_free_messages(uuid)    set search_path = '';
alter function public.bump_rate_limit(text, int, int)  set search_path = '';
alter function public.enforce_org_seats()              set search_path = '';
alter function public.claim_org_seat(uuid, citext)     set search_path = public, extensions, pg_temp;
