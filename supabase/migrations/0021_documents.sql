-- Phase B: user documents for the dashboard.
--
-- A subscriber uploads a PDF / .docx / .txt / .md; the server extracts its text
-- once and stores it here, and that text is what later rides into a chat (as an
-- assistant's knowledge, Phase C, or a per-message attachment). The FILE lives
-- in Supabase Storage; this table is the registry plus the extracted text.
--
-- Server-write-only, like every table that must never be forgeable from a
-- browser (the 0012 pattern): RLS on, NO policies, no grants to
-- anon/authenticated. Every read and write goes through /api/documents with the
-- service role, which also lets us keep the extracted text out of reach: the
-- browser never selects this table, so a leaked publishable key exposes nothing.

create table if not exists public.documents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 200),
  -- The object key in the 'documents' bucket: '<user_id>/<uuid>.<ext>'. Unique
  -- so re-registering the same object can't create duplicate rows.
  storage_path   text not null unique,
  mime           text not null,
  size_bytes     integer not null check (size_bytes > 0),
  -- Extracted, normalized plain text and its length. `truncated` records that
  -- the source was longer than the per-document budget and was cut.
  char_count     integer not null default 0,
  extracted_text text not null default '',
  truncated      boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Leading user_id covers the FK to auth.users (account deletion cascade) and
-- serves the per-user list ordered newest-first.
create index if not exists documents_user_idx
  on public.documents (user_id, created_at desc);

alter table public.documents enable row level security;
-- Deliberately no policies and no anon/authenticated grants: service role only.
grant select, insert, update, delete on public.documents to service_role;

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- ── Storage ──────────────────────────────────────────────────────────────────
-- Private bucket with server-enforced size and type limits, so a client that
-- bypasses our UI still cannot upload a 2 GB file or an executable. If this
-- half fails on `db push` with "must be owner of table objects" (hosted owns
-- storage.* as supabase_storage_admin), run exactly this block once in the
-- dashboard SQL editor and keep the migration as the record. See
-- docs/deployment.md.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  ])
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public             = excluded.public;

-- Clients may ONLY upload, and only into a folder named by their own user id
-- ('<user_id>/<uuid>.<ext>'). No select/update/delete for clients: the server
-- (service role, bypasses storage RLS) does every download and deletion.
drop policy if exists "documents: upload own folder" on storage.objects;
create policy "documents: upload own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
