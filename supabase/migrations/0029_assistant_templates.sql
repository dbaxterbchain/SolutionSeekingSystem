-- Assistant templates with live-base semantics.
--
-- A template is an assistant whose instructions and documents other assistants
-- can be BUILT ON: a child keeps a template_id link and, at chat time, the
-- server layers the template's setup under the child's own. Editing the
-- template updates every child (and intentionally rolls their prompt-cache
-- entries), the same way the Guide/Mentor base personas already behave. The
-- use case: one "Tenant Assistant" template with the building rules, and one
-- small child per tenant carrying just that tenant's lease.
--
-- Shape rules (trigger-enforced as the backstop; the API pre-checks and
-- answers friendly 409s):
--   * no chains: a template cannot itself be built on a template;
--   * template_id must reference a real template;
--   * a template in use cannot stop being a template (or be deleted: the
--     RESTRICT FK below), so children never silently lose their base.
--
-- Moving a child between workspaces is refused by the API outright. The one
-- path the API cannot see is org deletion, where the org_id FK reverts rows
-- to Personal: the detach trigger below drops the template link then, so an
-- ex-org child never keeps pulling the org's template content.

alter table public.assistants
  add column if not exists is_template boolean not null default false;

alter table public.assistants
  add column if not exists template_id uuid references public.assistants (id) on delete restrict;

-- Cover the child -> template FK (the 0018/0020 advisor rule); also the
-- "which assistants are built on this template" lookup.
create index if not exists assistants_template_idx
  on public.assistants (template_id) where template_id is not null;

create or replace function public.enforce_template_shape() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  base record;
  kids integer;
begin
  if new.template_id is not null then
    if new.is_template then
      raise exception 'a template cannot be built on a template' using errcode = '23514';
    end if;
    select is_template, template_id into base
      from public.assistants where id = new.template_id;
    if not found or not base.is_template or base.template_id is not null then
      raise exception 'template_id must reference a template' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.is_template and not new.is_template then
    select count(*) into kids from public.assistants where template_id = new.id;
    if kids > 0 then
      raise exception 'template % is used by % assistants', new.id, kids using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists assistants_template_shape on public.assistants;
create trigger assistants_template_shape
  before insert or update of is_template, template_id on public.assistants
  for each row execute function public.enforce_template_shape();

create or replace function public.detach_template_on_workspace_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.org_id is distinct from old.org_id and new.template_id is not null then
    new.template_id := null;
  end if;
  return new;
end $$;

drop trigger if exists assistants_detach_template on public.assistants;
create trigger assistants_detach_template
  before update of org_id on public.assistants
  for each row execute function public.detach_template_on_workspace_change();

-- Trigger functions are never called directly; keep them server-side anyway
-- (the 0016 hardening rule).
revoke execute on function public.enforce_template_shape() from public, anon, authenticated;
revoke execute on function public.detach_template_on_workspace_change() from public, anon, authenticated;
