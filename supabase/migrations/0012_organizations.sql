-- Concierge organizations.
--
-- An organization buys N seats, an operator onboards it from /admin, and every
-- member gets unlimited assistant access. Billing is done BY HAND (a Stripe
-- subscription or an invoice), because there is no validated demand for
-- self-serve seats yet: /pricing keeps the enquiry form as the front door and
-- PLANS.team.selfServe stays false. This is the cheap way to fulfil an enquiry
-- in minutes instead of weeks, with a data model that self-serve can be layered
-- onto the day a real organization pays.
--
-- Server-write-only, like every table that must never be forgeable from a
-- browser: RLS on, NO policies, no grants to anon/authenticated. Since 0010
-- revoked the default privileges, a new table reaches nobody at all until a
-- grant says otherwise, so the grants at the bottom are the whole access story.
--
-- The browser must never read org membership. If it could, entitlement would
-- have a second source in front of the unfiltered `.maybeSingle()` reads in
-- ChatView/AccountView/PricingPlans, and CLAUDE.md's "entitlements are
-- server-written only" would stop being true. The client learns whether it is
-- entitled by asking the server (/api/entitlement), never by reading a table.

create table if not exists public.organizations (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  seats                  integer not null check (seats > 0),
  -- The same vocabulary as subscriptions.status on purpose, so ENTITLED_STATUSES
  -- in src/lib/server/entitlement.ts stays the ONE definition of "entitled".
  status                 text not null default 'active'
                         check (status in ('trialing', 'active', 'past_due', 'canceled', 'paused')),
  -- Null until they are billed through Stripe. Load-bearing when set: the
  -- webhook uses it to keep `status` in step, so a lapsed org actually loses
  -- access instead of keeping it forever.
  stripe_customer_id     text unique,
  stripe_subscription_id text,
  current_period_end     timestamptz,
  note                   text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table if not exists public.org_members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  -- citext (extension from 0008): nobody gets two seats for Dana@ and dana@.
  --
  -- Unique GLOBALLY, not just per organization. One person belongs to one org,
  -- which makes seat resolution total: the entitlement lookup can never find two
  -- candidate orgs and have to guess which one pays for them. The admin API turns
  -- the resulting 23505 into "that email is already on another organization".
  email      citext not null unique,
  -- Bound on the member's first successful match ("claiming the seat"). Once set,
  -- access survives them changing their email address.
  user_id    uuid references auth.users (id) on delete set null,
  joined_at  timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

-- One claimed seat per user, enforced by the database rather than by hope.
create unique index if not exists org_members_user_idx
  on public.org_members (user_id) where user_id is not null;
create index if not exists org_members_org_idx on public.org_members (org_id);

/*
 * Seats are enforced at WRITE time, never at read time.
 *
 * Checking the cap during entitlement would mean a count() on every single chat
 * message, and worse, it would silently pick losers: shrink a 10-seat org to 5
 * and five people would be cut off in whatever order the query happened to sort.
 * Overselling is an admin mistake, so it fails in the admin's face, where it can
 * be fixed. AFTER INSERT because a BEFORE trigger's count excludes the new row.
 */
create or replace function public.enforce_org_seats() returns trigger
language plpgsql as $$
declare
  used int;
  cap  int;
begin
  select count(*) into used from public.org_members where org_id = new.org_id;
  select seats   into cap  from public.organizations where id = new.org_id;
  if used > cap then
    raise exception 'organization % has % seats and % members', new.org_id, cap, used
      using errcode = '23514';
  end if;
  return null;
end $$;

drop trigger if exists org_members_seat_cap on public.org_members;
create trigger org_members_seat_cap
  after insert or update of org_id on public.org_members
  for each row execute function public.enforce_org_seats();

/*
 * Resolve (and claim) a member's org seat. Called ONLY by the service role, from
 * src/lib/server/entitlement.ts.
 *
 * SECURITY INVOKER, deliberately (it is the default; spelled out here because
 * the temptation to "fix" a permission error with SECURITY DEFINER is real).
 * The service role bypasses RLS and holds the grants; `authenticated` holds
 * none, so even if the execute revoke below were ever undone by accident, the
 * function body still could not read the tables. A SECURITY DEFINER version of
 * this function would let any browser that can call RPC claim ANY seat simply by
 * passing somebody else's email address.
 *
 * Status is deliberately not filtered here. ENTITLED_STATUSES lives in
 * TypeScript and there must be exactly one copy of it.
 */
create or replace function public.claim_org_seat(p_user_id uuid, p_email citext)
returns table (org_id uuid, org_name text, org_status text)
language plpgsql as $$
declare
  m record;
begin
  if p_user_id is null then
    return;
  end if;

  -- Match an already-claimed seat first, then an unclaimed one by email. An
  -- anonymous user has no email, so `p_email is null` keeps them out a second
  -- time (the caller already skips this entirely for them).
  select om.id, om.org_id, om.user_id, o.name as org_name, o.status as org_status
    into m
    from public.org_members om
    join public.organizations o on o.id = om.org_id
   where om.user_id = p_user_id
      or (om.user_id is null and p_email is not null and om.email = p_email)
   order by (om.user_id = p_user_id) desc nulls last, om.created_at asc
   limit 1;

  if not found then
    return;
  end if;

  -- Claim it. The `user_id is null` guard makes a concurrent double-claim a
  -- harmless no-op rather than a unique-violation.
  if m.user_id is null then
    update public.org_members
       set user_id = p_user_id, joined_at = now()
     where id = m.id and user_id is null;
  end if;

  org_id     := m.org_id;
  org_name   := m.org_name;
  org_status := m.org_status;
  return next;
end $$;

-- Postgres grants EXECUTE to PUBLIC on every new function, and anon/authenticated
-- inherit from PUBLIC. Migration 0003 had to revoke exactly this on
-- increment_free_messages; the same hole here would be "claim any seat".
revoke execute on function public.claim_org_seat(uuid, citext) from public, anon, authenticated;
grant  execute on function public.claim_org_seat(uuid, citext) to service_role;

revoke execute on function public.enforce_org_seats() from public, anon, authenticated;

alter table public.organizations enable row level security;
alter table public.org_members   enable row level security;

-- Deliberately no policies, and deliberately no grants to anon/authenticated.
grant select, insert, update, delete on public.organizations to service_role;
grant select, insert, update, delete on public.org_members   to service_role;

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();
