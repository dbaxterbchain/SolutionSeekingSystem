-- Team plan enquiries from /pricing.
--
-- Self-serve seats (organizations, invites, seat-proration, an org-scoped rewrite
-- of entitlement) are deliberately NOT built: that is weeks of work on the most
-- security-sensitive path in the app, for zero validated demand. This table is
-- the cheap way to find out whether the demand exists at all.
--
-- Server-write-only, like every other table that must never be forgeable from a
-- browser: RLS on, no policies, no grants to anon/authenticated. Everything goes
-- through /api/team-enquiry with the service role.

create table if not exists public.team_enquiries (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  team_size  text,
  note       text,
  -- Null for a signed-out enquirer; set when we know who asked.
  user_id    uuid references auth.users (id) on delete set null,
  -- Salted hash only, never a raw IP (see src/lib/server/rateLimit.ts).
  ip_hash    text,
  handled    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists team_enquiries_created_idx
  on public.team_enquiries (created_at desc);

alter table public.team_enquiries enable row level security;
-- Deliberately no policies: the service role (which bypasses RLS) is the only
-- reader or writer. Nobody should be able to read other people's enquiries.
grant select, insert, update on public.team_enquiries to service_role;
