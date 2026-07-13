-- Make the grants on the server-write-only tables match their stated intent.
--
-- Migrations 0006 through 0009 each say "no grants to anon/authenticated" and
-- enable RLS with no policies. On the HOSTED project that comment was wrong.
-- Supabase ships default privileges that grant ALL on every new table in
-- `public` to anon and authenticated, so `rate_limit`, `team_enquiries`,
-- `email_subscribers` and `testimonials` were all reachable by any browser
-- holding the publishable key, and RLS-with-no-policies was the ONLY thing
-- standing between the email list and the internet. (The local stack does not
-- do this, which is exactly why it went unnoticed: local matched the comment,
-- production did not.)
--
-- RLS was in fact holding: verified against production that reads return zero
-- rows and inserts raise 42501. This is not a breach. It is a missing second
-- layer, and the layer matters: with the grant in place, ONE careless
-- `create policy ... using (true)` or one disabled-RLS toggle publishes the
-- whole list. Without it, publishing takes two independent mistakes.
--
-- Deliberately NOT revoked: chat_sessions, ai_usage, subscriptions. The browser
-- legitimately reads its own rows there, under row-scoped policies.

revoke all on public.rate_limit        from anon, authenticated;
revoke all on public.team_enquiries    from anon, authenticated;
revoke all on public.email_subscribers from anon, authenticated;
revoke all on public.testimonials      from anon, authenticated;

-- And stop the default privileges from silently re-granting the next table
-- somebody adds. From here on, a new table in `public` reaches the browser only
-- when a migration says so out loud, which is what docs/change-checklist.md has
-- claimed all along.
--
-- Migrations run as `postgres`, as do tables created from the dashboard's table
-- editor, so this covers both. A future table that SHOULD be client-readable now
-- needs an explicit `grant select on <table> to authenticated;` alongside its RLS
-- policies. That is the intended trade: silence fails closed, not open.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
