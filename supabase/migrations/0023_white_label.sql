-- Phase D: white-label pages.
--
-- A per-organization branded chat page at /a/<org-id>/<slug> for any assistant
-- (a shared specialized one, or a standard Guide/Mentor + mode). It carries a
-- title, description, displayed instructions, and an uploaded logo. Any org
-- member can sign in and use it, each with their own private history (that
-- comes free from chat_sessions RLS). The org id is in the URL so slugs never
-- collide across organizations.
--
-- Server-only table (the 0012 pattern): RLS on, no client policies or grants.
-- The page itself is rendered server-side with the service role; the browser
-- never reads this table.

create table if not exists public.white_label_pages (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations (id) on delete cascade,
  slug                 text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'),
  -- Exactly one of: a specialized assistant, or a standard agent (+ optional mode).
  assistant_id         uuid references public.assistants (id) on delete cascade,
  agent                text check (agent in ('guide', 'mentor')),
  context              text,
  title                text not null check (char_length(title) between 1 and 120),
  description          text not null default '' check (char_length(description) <= 600),
  display_instructions text not null default '' check (char_length(display_instructions) <= 4000),
  logo_path            text,
  status               text not null default 'active' check (status in ('active', 'inactive')),
  -- Concierge record only; the actual host routing lives in netlify.toml.
  custom_domain        text,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- A page points at an assistant XOR a standard agent, never both or neither.
  constraint white_label_target check ((assistant_id is null) <> (agent is null)),
  -- Slugs are unique within an organization (this constraint is the lookup index).
  constraint white_label_pages_org_slug_key unique (org_id, slug)
);

create index if not exists white_label_pages_assistant_idx
  on public.white_label_pages (assistant_id) where assistant_id is not null;
create index if not exists white_label_pages_created_by_idx
  on public.white_label_pages (created_by) where created_by is not null;

alter table public.white_label_pages enable row level security;
grant select, insert, update, delete on public.white_label_pages to service_role;

drop trigger if exists white_label_pages_set_updated_at on public.white_label_pages;
create trigger white_label_pages_set_updated_at
  before update on public.white_label_pages
  for each row execute function public.set_updated_at();

-- Public logo bucket. Written ONLY by the server (service role bypasses storage
-- RLS, so with no policies at all there are no client writes); public read is
-- the bucket flag, which is exactly what a page logo needs. No SVG: it can carry
-- script and this bucket is served to everyone.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 1048576,
  array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public             = excluded.public;
