-- Saved practice sessions: each row is one saved introspection, conversation
-- plan, or solution check belonging to a signed-in user. Run this in the
-- Supabase SQL editor (or via the Supabase CLI) for the project.

create table if not exists public.saved_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  tool       text not null check (tool in ('introspection', 'planner', 'solution')),
  title      text not null default 'Untitled',
  data       jsonb not null default '{}'::jsonb,
  summary    text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_sessions_user_tool_idx
  on public.saved_sessions (user_id, tool, created_at desc);

-- Row-Level Security: users can only see and mutate their own rows.
alter table public.saved_sessions enable row level security;

drop policy if exists "own rows: select" on public.saved_sessions;
create policy "own rows: select" on public.saved_sessions
  for select using (auth.uid() = user_id);

drop policy if exists "own rows: insert" on public.saved_sessions;
create policy "own rows: insert" on public.saved_sessions
  for insert with check (auth.uid() = user_id);

drop policy if exists "own rows: update" on public.saved_sessions;
create policy "own rows: update" on public.saved_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows: delete" on public.saved_sessions;
create policy "own rows: delete" on public.saved_sessions
  for delete using (auth.uid() = user_id);

-- Keep updated_at fresh on every update.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists saved_sessions_set_updated_at on public.saved_sessions;
create trigger saved_sessions_set_updated_at
  before update on public.saved_sessions
  for each row execute function public.set_updated_at();
