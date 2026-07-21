-- Advisors pass, part 1 of 6: RLS policy performance + role narrowing.
--
-- Every policy from 0001/0003 compares `auth.uid() = user_id` with a BARE
-- auth.uid(). Postgres treats the bare call as a per-row function call, so a
-- 50-row `select * from chat_sessions` evaluates auth.uid() 50 times. Wrapped
-- as `(select auth.uid())` it becomes an InitPlan: evaluated once per query,
-- then compared as a constant. This is Supabase advisor `auth_rls_initplan`
-- (WARN, ten policies) and the officially documented fix.
--
-- While touching every policy anyway, narrow the role list from the implicit
-- `to public` to `to authenticated`. `anon` holds zero grants on these tables
-- (0002/0004 grant only to authenticated), so this changes nothing reachable;
-- it just stops the policies from even being evaluated for anon and states the
-- audience out loud. Anonymous-trial users are NOT excluded by this: Supabase
-- anonymous sign-ins mint real auth.users rows carrying role=authenticated
-- (see 0006's header), so the trial keeps working unchanged.
--
-- ALTER POLICY rather than drop/create: there is no window where a table
-- briefly has no policy. The service role bypasses RLS and is unaffected.

-- saved_sessions (policies from 0001)
alter policy "own rows: select" on public.saved_sessions
  to authenticated
  using ((select auth.uid()) = user_id);

alter policy "own rows: insert" on public.saved_sessions
  to authenticated
  with check ((select auth.uid()) = user_id);

alter policy "own rows: update" on public.saved_sessions
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "own rows: delete" on public.saved_sessions
  to authenticated
  using ((select auth.uid()) = user_id);

-- chat_sessions (policies from 0003)
alter policy "own rows: select" on public.chat_sessions
  to authenticated
  using ((select auth.uid()) = user_id);

alter policy "own rows: insert" on public.chat_sessions
  to authenticated
  with check ((select auth.uid()) = user_id);

alter policy "own rows: update" on public.chat_sessions
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "own rows: delete" on public.chat_sessions
  to authenticated
  using ((select auth.uid()) = user_id);

-- subscriptions / ai_usage (select-only policies from 0003; writes stay
-- service-role-only, see 0003 and 0011)
alter policy "own row: select" on public.subscriptions
  to authenticated
  using ((select auth.uid()) = user_id);

alter policy "own row: select" on public.ai_usage
  to authenticated
  using ((select auth.uid()) = user_id);
