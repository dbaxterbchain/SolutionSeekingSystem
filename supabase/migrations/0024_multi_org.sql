-- Multi-org membership: a person can belong to more than one organization.
--
-- Migration 0012 deliberately made org_members.email GLOBALLY unique ("one person
-- belongs to one org, which makes seat resolution total"). That is what we are
-- relaxing: a person may now hold a seat in several orgs and switch between them.
-- Seat resolution stops being "the one org" and becomes "all their orgs"; the
-- entitlement decision is simply "is ANY of their orgs paying".
--
-- This also fixes the bug where a member who ALSO has a personal subscription
-- never claimed their seat: checkEntitlement returned early on the Stripe sub and
-- never called the claim. Seat-claiming now happens in getOrgMemberships (server),
-- independent of how the user is entitled, and claims ALL matching seats.

-- One person = one org, dropped. Keep the per-org unique so nobody gets two seats
-- in the SAME org.
alter table public.org_members drop constraint if exists org_members_email_key;

-- The old index enforced one CLAIMED seat per user (unique on user_id). With
-- multi-org a user claims one seat per org, so user_id repeats: relax to a plain
-- index (still covers the FK and the by-user lookup).
drop index if exists public.org_members_user_idx;
create index if not exists org_members_user_idx
  on public.org_members (user_id) where user_id is not null;

-- Claim EVERY unclaimed seat that matches this user's confirmed email, across all
-- orgs. Idempotent: once claimed (user_id set) a row no longer matches, so
-- re-running is a cheap no-op. Replaces the single-seat claim_org_seat.
--
-- SECURITY INVOKER (the service role holds the grants and bypasses RLS); the
-- search_path is pinned WITH extensions because the `email = p_email` comparison
-- resolves the citext operator, which lives in the extensions schema (see 0016).
--
-- citext is schema-qualified (extensions.citext) because 0017 moved the type out
-- of public, so an unqualified `citext` no longer resolves during migration.
create or replace function public.claim_org_seats(p_user_id uuid, p_email extensions.citext)
returns void
language plpgsql
set search_path = public, extensions, pg_temp
as $$
begin
  if p_user_id is null or p_email is null then
    return;
  end if;
  update public.org_members
     set user_id = p_user_id, joined_at = now()
   where email = p_email and user_id is null;
end $$;

-- Postgres grants EXECUTE to PUBLIC by default; only the service role should call this.
revoke execute on function public.claim_org_seats(uuid, extensions.citext) from public, anon, authenticated;
grant  execute on function public.claim_org_seats(uuid, extensions.citext) to service_role;

-- The single-seat resolver is no longer used (entitlement now reads the list).
drop function if exists public.claim_org_seat(uuid, extensions.citext);
