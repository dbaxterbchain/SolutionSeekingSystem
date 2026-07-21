-- Advisors pass, part 4 of 6: covering indexes for the SET NULL foreign keys.
--
-- Supabase advisor `unindexed_foreign_keys` (INFO, four constraints). These
-- four FKs all declare `on delete set null`, and Postgres enforces that by
-- scanning the CHILD table whenever a parent row is deleted. Without an index
-- that scan is sequential, inside the transaction doing the delete:
--   * deleting an auth.users row (the account-deletion promise on /pricing)
--     scans email_subscribers, team_enquiries and testimonials;
--   * deleting a chat_sessions row, which any user can do from the browser,
--     scans testimonials on every single delete.
--
-- Partial indexes, following the org_members_user_idx precedent from 0012: the
-- FK enforcement scan is always `col = <some non-null uuid>`, so rows where
-- the column is already null can be left out of the index entirely.
--
-- Expected side effect: these will sit in the advisors' `unused_index` list
-- until a deletion path actually fires. That is the deal on purpose; they
-- exist for correctness of the delete path, not for read traffic.

create index if not exists email_subscribers_user_idx
  on public.email_subscribers (user_id) where user_id is not null;

create index if not exists team_enquiries_user_idx
  on public.team_enquiries (user_id) where user_id is not null;

create index if not exists testimonials_user_idx
  on public.testimonials (user_id) where user_id is not null;

create index if not exists testimonials_chat_idx
  on public.testimonials (chat_id) where chat_id is not null;
