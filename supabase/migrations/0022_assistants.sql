-- Phase C: specialized assistants + org sharing + the manager role.
--
-- An assistant is a saved (base agent + optional mode + custom instructions +
-- knowledge documents) that a subscriber chats with. Personal by default; a
-- manager can share one with their whole organization by stamping org_id.
--
-- Server-only tables (the 0012 pattern): RLS on, no client policies or grants.
-- The browser reaches them only through /api/assistants (service role), because
-- "shared with my organization" cannot be expressed in client RLS: org
-- membership is deliberately unreadable from a browser (migration 0012).

create table if not exists public.assistants (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  -- Set = shared with that organization. If the org is deleted the assistant
  -- reverts to personal (the owner keeps it) rather than vanishing.
  org_id        uuid references public.organizations (id) on delete set null,
  name          text not null check (char_length(name) between 1 and 80),
  base_agent    text not null check (base_agent in ('guide', 'mentor')),
  -- A registry mode id (src/lib/contexts.ts) or null. Validated in the API
  -- against the code-side registry, so no FK (like chat_sessions.context).
  context       text,
  instructions  text not null default '' check (char_length(instructions) <= 8000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists assistants_owner_idx
  on public.assistants (owner_user_id, updated_at desc);
create index if not exists assistants_org_idx
  on public.assistants (org_id) where org_id is not null;

-- The knowledge documents attached to an assistant (max 5, enforced in the API).
-- `position` keeps the setup string byte-deterministic for the prompt cache.
create table if not exists public.assistant_documents (
  assistant_id uuid not null references public.assistants (id) on delete cascade,
  document_id  uuid not null references public.documents (id) on delete cascade,
  position     integer not null default 0,
  primary key (assistant_id, document_id)
);

-- Covering index for the document -> join FK direction, so deleting a document
-- doesn't sequentially scan this table (the 0018 pattern).
create index if not exists assistant_documents_document_idx
  on public.assistant_documents (document_id);

alter table public.assistants          enable row level security;
alter table public.assistant_documents enable row level security;
grant select, insert, update, delete on public.assistants          to service_role;
grant select, insert, update, delete on public.assistant_documents to service_role;

drop trigger if exists assistants_set_updated_at on public.assistants;
create trigger assistants_set_updated_at
  before update on public.assistants
  for each row execute function public.set_updated_at();

-- Conversations remember which assistant drove them. Nullable + SET NULL: a chat
-- survives its assistant being deleted (it just becomes a plain transcript).
-- chat_sessions stays client-CRUD; a forged assistant_id here buys nothing,
-- because /api/chat re-checks assistant access on every send.
alter table public.chat_sessions
  add column if not exists assistant_id uuid references public.assistants (id) on delete set null;

create index if not exists chat_sessions_assistant_idx
  on public.chat_sessions (assistant_id) where assistant_id is not null;

-- The manager role: may share assistants org-wide and (Phase D) manage
-- white-label pages. Everyone else is a plain member. Set from /admin.
alter table public.org_members
  add column if not exists role text not null default 'member'
  check (role in ('member', 'manager'));
