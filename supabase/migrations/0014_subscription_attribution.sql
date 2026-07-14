-- Where a paying customer actually came from.
--
-- The chain is: ad click lands with ?gclid= -> captured first-touch in
-- localStorage (src/lib/attribution.ts) -> sent with the checkout request ->
-- Stripe Checkout metadata -> subscription metadata -> here, via the webhook.
--
-- Why store it at all, when GA4 already attributes the conversion? Because GA4's
-- answer depends on the browser keeping its `_ga` cookie, and an ad blocker or a
-- cleared cookie turns a real paid conversion into "direct" with no way to tell.
-- These columns are the ground truth, and they are what answers the only question
-- that matters after a paid test: WHICH KEYWORD bought a subscription. They are
-- also exactly what a Google Ads offline conversion import needs (a CSV of click
-- ids), so we never need the Ads API to close the loop.
--
-- No new RLS policy and no new grant: new columns on an existing table inherit
-- the row-scoped "own row: select" policy from 0003 and the table grants from
-- 0004/0011. `subscriptions` stays server-write-only, so the browser can read its
-- own click id (harmless) and write nothing.

alter table public.subscriptions
  add column if not exists click_id       text,
  -- 'gclid' | 'gbraid' | 'wbraid'. An offline import needs to know the column.
  add column if not exists click_source   text,
  add column if not exists utm_source     text,
  add column if not exists utm_medium     text,
  add column if not exists utm_campaign   text,
  -- The keyword. The single most valuable field here.
  add column if not exists utm_term       text,
  add column if not exists utm_content    text,
  -- Which landing page the ad actually bought, e.g. /practice/modes/manager.
  add column if not exists landing_path   text,
  -- When they first arrived, so we can see how long a decision takes.
  add column if not exists first_touch_at timestamptz;

-- The paid-test report, in one query:
--
--   select utm_term, landing_path, count(*), sum(1) filter (where status = 'active')
--   from public.subscriptions where click_id is not null group by 1, 2;
create index if not exists subscriptions_click_idx
  on public.subscriptions (click_id) where click_id is not null;
