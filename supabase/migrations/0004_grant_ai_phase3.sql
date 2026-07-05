-- Explicit Data API grants for the Phase 3 tables (same reasoning as 0002:
-- current Supabase does not auto-expose new public tables to the API roles).
--
-- subscriptions + ai_usage: clients may only READ their own row (RLS from
-- 0003); all writes happen through the service role. chat_sessions: full CRUD
-- for signed-in users, scoped to their own rows by RLS. `anon` gets nothing.
grant select on public.subscriptions to authenticated;
grant select on public.ai_usage to authenticated;
grant select, insert, update, delete on public.chat_sessions to authenticated;

grant select, insert, update, delete on public.subscriptions to service_role;
grant select, insert, update, delete on public.ai_usage to service_role;
grant execute on function public.increment_free_messages(uuid) to service_role;
