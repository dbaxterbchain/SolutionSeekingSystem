-- Per-member assistant sharing, plus the role vocabulary for org "clients".
--
-- The use case: an organization serves its own customers (tenants, clients,
-- students) a dedicated assistant each. That needs two things the schema
-- couldn't say: a seat that must NOT see org-wide resources, and a share that
-- targets one person instead of the whole org.
--
-- 1. org_members.role learns 'client'. A client seat uses only what is shared
--    with it directly: no org documents, no org-wide shared assistants, no
--    authoring. Enforcement lives in the API (the 0012 pattern: these tables
--    have no client grants, so TypeScript is the only reader). Nothing writes
--    'client' until the role's API/UI ships; widening the check first keeps
--    that deploy a pure code change.
-- 2. assistant_shares: share an assistant with SPECIFIC seats, additive with
--    the org-wide assistants.shared flag (org-wide reaches members and
--    managers; a specific share is the only way to reach a client). Keyed to
--    org_members.id, not auth.users: a share can target an invited-but-
--    unclaimed seat and starts working the moment claim_org_seats binds the
--    user, and it dies with the seat (remove the member, the share goes too).
--    Org scoping (the seat belongs to the assistant's org) is enforced by the
--    API; a mismatched row would be inert anyway, because readers only ever
--    test the caller's own seat in the assistant's org.

alter table public.org_members drop constraint if exists org_members_role_check;
alter table public.org_members
  add constraint org_members_role_check
  check (role in ('member', 'manager', 'client'));

create table if not exists public.assistant_shares (
  assistant_id uuid not null references public.assistants (id) on delete cascade,
  member_id    uuid not null references public.org_members (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (assistant_id, member_id)
);

-- Cover the member -> shares FK direction (the 0018/0020 advisor rule); also
-- the "what is shared with my seat" lookup.
create index if not exists assistant_shares_member_idx
  on public.assistant_shares (member_id);

-- Server-only table (the 0012 pattern): RLS on, deliberately no policies and
-- no anon/authenticated grants. The browser reaches shares only through
-- /api/assistants (service role).
alter table public.assistant_shares enable row level security;

grant select, insert, update, delete on public.assistant_shares to service_role;
