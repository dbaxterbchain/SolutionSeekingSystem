-- Let the server move a trial user's work onto the account they sign in to.
--
-- The gap this closes: a visitor chats anonymously, then signs in to an account
-- they ALREADY had. Registering keeps the same user id (so the conversation
-- follows them for free), but signing in is a different user, and their trial
-- conversation stayed behind with the anonymous user: not deleted, just
-- unreachable. /api/claim-trial-work re-parents it, with the service role.
--
-- These grants are EXPLICIT on purpose. The hosted project already had them, by
-- way of Supabase's default privileges, while the local stack did not: reading
-- chat_sessions as the service role failed locally and succeeded in production.
-- That divergence is exactly the trap that hid the grant hole behind migrations
-- 0006 to 0009 (local matched the comment, production did not), and the fix is
-- the same one: say it out loud, in a migration, so both databases agree and
-- neither can quietly disagree with the code again.
--
-- SELECT and UPDATE only. The server never needs to create or delete a user's
-- conversations; those belong to the browser, which already has its own
-- row-scoped policies (migrations 0001/0003).

grant select, update on public.chat_sessions  to service_role;
grant select, update on public.saved_sessions to service_role;

-- Deliberately unchanged: `ai_usage` is NOT part of a claim. Free-message counts
-- must never be merged across users. A person who tried the product anonymously
-- and then signed in to an old account would otherwise have their trial usage
-- added to whatever the account had already spent, and be punished for trying it
-- twice. The conversation is theirs to keep; the allowance is not transferable.
