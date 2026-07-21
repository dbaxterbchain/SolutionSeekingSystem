-- Advisors pass, part 6 of 6: adopt the RLS auto-enable event trigger.
--
-- The hosted project carries a `public.rls_auto_enable()` function and an
-- `ensure_rls` event trigger that no migration ever created (added from the
-- dashboard at some point). It auto-enables row level security on any table
-- created in `public`, a useful third layer next to 0010's default-privilege
-- revoke. But it existed only on hosted, which is the same local/hosted drift
-- the 0010 header complains about, and its EXECUTE was never revoked, which
-- is what the advisors flag (`anon_security_definer_function_executable` and
-- the `authenticated` twin, both WARN).
--
-- The flag is cosmetic in practice: a function returning `event_trigger`
-- cannot actually be invoked through PostgREST or a plain SELECT. But the
-- house rule since 0003 is that no function keeps the default PUBLIC grant,
-- and drift is drift. So this migration makes the object official, verbatim
-- from `pg_get_functiondef()` on hosted (CREATE OR REPLACE is a no-op there),
-- and closes the grant.
--
-- SECURITY DEFINER is right for once: the trigger fires as whoever ran the
-- DDL, and enabling RLS requires owning the new table; migrations and
-- dashboard DDL both run as postgres, the function's owner, so DEFINER just
-- pins the privilege it already needs. search_path is pinned to pg_catalog.

create or replace function public.rls_auto_enable()
 returns event_trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- Close the advisor finding. Event-trigger firing does not check EXECUTE, so
-- the safety net keeps working; this only removes the pointless RPC grant.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- CREATE EVENT TRIGGER has no IF NOT EXISTS, and hosted already has this one,
-- so guard it. Tag filter mirrors hosted exactly (pg_event_trigger.evttags).
do $$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    create event trigger ensure_rls on ddl_command_end
      when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      execute function public.rls_auto_enable();
  end if;
end $$;
