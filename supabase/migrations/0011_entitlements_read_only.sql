-- Entitlements: read-only from the browser, at the GRANT level and not just in
-- a policy.
--
-- CLAUDE.md states the invariant plainly: "Entitlements are server-written only
-- (Stripe webhook + chat endpoint via service role); the browser gets read-only
-- RLS access." Until now that was enforced by exactly one thing: the absence of
-- an INSERT/UPDATE policy. The underlying GRANTs, handed out by the hosted
-- project's default privileges, said anon and authenticated could INSERT, UPDATE
-- and DELETE these rows.
--
-- Nothing was exploitable: RLS with no write policy denies the write. But the
-- consequence of one mistaken policy was "any browser can grant itself a
-- subscription and reset its own free-message counter", and that is too much to
-- hang on a single line of defence.
--
-- Verified before writing this: every browser-side reference to `subscriptions`
-- and `ai_usage` in src/ is a `.select()`. Every write goes through
-- supabaseAdmin (src/pages/api/stripe-webhook.ts, src/lib/server/entitlement.ts),
-- which uses the service role and bypasses RLS. So nothing legitimate loses a
-- privilege here.
--
-- chat_sessions keeps its full grants on purpose: saved conversations belong to
-- the user, who creates, renames and deletes them straight from the browser.

revoke insert, update, delete, truncate on public.subscriptions from anon, authenticated;
revoke insert, update, delete, truncate on public.ai_usage      from anon, authenticated;

-- SELECT stays: ChatView and AccountView read the user's own status and usage,
-- scoped by the row-level policies from migration 0003.
