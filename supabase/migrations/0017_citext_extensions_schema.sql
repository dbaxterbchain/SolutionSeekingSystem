-- Advisors pass, part 3 of 6: move citext out of the public schema.
--
-- 0008 ran a bare `create extension if not exists citext`, which installed the
-- extension's type and ~50 support functions/operators into `public`. Supabase
-- advisor `extension_in_public` (WARN) flags that: public is the exposed API
-- schema, and extension internals do not belong in the API surface. The
-- conventional home is the `extensions` schema every Supabase stack ships.
--
-- Why this is safe to relocate (citext is a relocatable extension):
--   * The citext COLUMNS (email_subscribers.email, org_members.email) and
--     their unique indexes reference the type and operator class by OID, which
--     a schema move does not change.
--   * PostgREST resolves operators through its extra search path, which is
--     `public, extensions` on hosted projects and in config.toml locally, so
--     .eq('email', ...) filters keep working.
--   * claim_org_seat's citext comparison is covered by its 0016 pin, which
--     lists `extensions` for exactly this moment.
--   * Migrations keep resolving unqualified `citext`: the postgres role's
--     search_path on hosted is `"$user", public, extensions`.
--
-- 0008 itself stays untouched: a fresh `db reset` replays 0008 (citext into
-- public) then this file (relocate), deterministically.

-- Present on hosted and on the standard local image; guard for anything else.
create schema if not exists extensions;

alter extension citext set schema extensions;
