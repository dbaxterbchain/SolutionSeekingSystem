-- Named-context seeds: which registry context (if any) a conversation was
-- started with (see src/lib/contexts.ts). Nullable; values come from the
-- code-side registry, so no FK or CHECK against a table. The row-scoped RLS
-- policies from 0003 and the table-level grants from 0004 already cover new
-- columns, so no policy or grant changes are needed.
alter table public.chat_sessions
  add column if not exists context text;
