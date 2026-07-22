-- Org-context (workspace) scoping for the dashboard.
--
-- Testing surfaced a confidentiality gap: switching the active org still showed the
-- assistants you made under another org, and every document you had ever uploaded.
-- An assistant, a document, and a saved chat now each belong to the WORKSPACE that was
-- active when it was created: Personal (org_id null) or a specific organization.
--
-- assistants.org_id already existed but conflated two ideas: "belongs to org X" and
-- "shared with org X". We split them: org_id becomes the workspace it lives in, and a new
-- `shared` boolean says whether other members of that org can see it. Managers still do the
-- sharing; a private draft (shared = false) in an org workspace stays owner-only.

-- Split "belongs to org" (org_id) from "is shared with that org" (shared).
alter table public.assistants add column if not exists shared boolean not null default false;

-- Backfill preserves today's behaviour exactly: an org_id-set assistant was, until now,
-- shared by definition. Personal assistants (org_id null) stay unshared.
update public.assistants set shared = true where org_id is not null;

-- Documents gain a workspace. Null = Personal. On org deletion the doc reverts to Personal
-- (the owner keeps it), mirroring assistants.org_id (on delete set null).
alter table public.documents
  add column if not exists org_id uuid references public.organizations (id) on delete set null;

-- Cover the new FK (per the 0018/0020 advisor work).
create index if not exists documents_org_idx
  on public.documents (org_id) where org_id is not null;

-- Chat history gains a workspace tag so Recent conversations follows the active workspace.
-- chat_sessions stays client-CRUD: org_id is a UI grouping tag on the user's OWN rows, the
-- same trust model as assistant_id (see 0022) - a forged value only affects the user's own
-- view, never another user's or another org's data. Revert to Personal on org deletion.
alter table public.chat_sessions
  add column if not exists org_id uuid references public.organizations (id) on delete set null;

-- Cover the new FK.
create index if not exists chat_sessions_org_idx
  on public.chat_sessions (org_id) where org_id is not null;
