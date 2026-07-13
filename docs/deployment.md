# Deployment

Hosted on **Netlify** under the **Beanchain** team.

| | |
|---|---|
| Site name | `solution-seeking-system` |
| Live URL | https://solution-seeking-system.netlify.app |
| Admin | https://app.netlify.com/projects/solution-seeking-system |
| Repo | https://github.com/dbaxterbchain/SolutionSeekingSystem |
| Build settings | `netlify.toml` (command `npm run build`, publish `dist`, Node 22 — required by `@supabase/supabase-js`) |
| IndexNow | Key file in `public/` + local build plugin (`netlify/plugins/indexnow`) auto-submits all sitemap URLs to api.indexnow.org after each successful production deploy |

The first production deploy was done with the Netlify CLI. For ongoing work, connect the
GitHub repo so every push deploys automatically.

## Set up continuous deployment (recommended)

In the Netlify dashboard → the `solution-seeking-system` site → **Site configuration →
Build & deploy → Continuous deployment → Link repository**:

1. Choose **GitHub** and authorize the Netlify GitHub App (one-time).
2. Pick `dbaxterbchain/SolutionSeekingSystem`, branch `main`.
3. Build command and publish dir are read from `netlify.toml` — leave them as detected.
4. Save. From then on:
   - Push to `main` → production deploy.
   - Open a PR → automatic **deploy preview**.

> Prefer a different existing Netlify project? Link that one to the repo instead — the
> `netlify.toml` makes any Netlify site build correctly. The CLI-created site above can be
> deleted from the dashboard if you don't want it.

## Manual deploy (CLI)

Useful for one-off deploys without going through git.

```bash
netlify deploy --prod     # builds (per netlify.toml) and deploys to production
netlify deploy            # deploys a draft preview URL
netlify status            # show the linked site
netlify open              # open the admin dashboard
```

The local folder is linked via `.netlify/state.json` (gitignored). If a fresh clone needs
linking: `netlify link --name solution-seeking-system`.

## Custom domain — solutionseeking.com ✅ _(connected)_

The site is live at **https://solutionseeking.com** — the apex is the primary domain;
`www.solutionseeking.com` and `solution-seeking-system.netlify.app` both 301 to it.
The apex URL is also the canonical identity in code (`site` in `astro.config.mjs`,
which feeds canonicals, the sitemap, OG tags, llms.txt, and the IndexNow plugin) —
if the primary domain ever changes, change `astro.config.mjs` and
`netlify/plugins/indexnow/index.js` to match, and update the Stripe webhook URL
(Stripe does not follow redirects).

## Supabase (accounts & saved data)

Accounts and saved introspections/plans/solutions are powered by **Supabase**. The client
runs entirely in the browser (React islands), so the site stays static — Supabase is not
part of the Netlify build, it's a separate hosted service the browser talks to directly.

| | |
|---|---|
| Project ref | `soetrtogqcpmonoumcjf` |
| Project URL | https://soetrtogqcpmonoumcjf.supabase.co |
| Dashboard | https://supabase.com/dashboard/project/soetrtogqcpmonoumcjf |
| Client key | the project's **publishable** `sb_publishable_…` key (safe to ship to the browser) |

> **Hosted vs. local.** Everything below targets the **hosted** project (what the app's
> `.env` points at). `supabase start` is a *separate* local Docker stack on `localhost` with
> its own database — you don't need it to deploy or to test against the hosted project. See
> [Local Supabase stack](#local-supabase-stack-optional) if you specifically want one.

### 1. Environment variables

Set these in a local `.env` (gitignored — see `.env.example`) **and** in Netlify under
**Site configuration → Environment variables**:

| Var | Value |
|-----|-------|
| `PUBLIC_SUPABASE_URL` | `https://soetrtogqcpmonoumcjf.supabase.co` |
| `PUBLIC_SUPABASE_ANON_KEY` | the project's `sb_publishable_…` key (Dashboard → **Project Settings → API keys**) |

The `PUBLIC_` prefix intentionally exposes these to the browser. The publishable key is
safe to ship — **Row-Level Security** (below) is what actually protects user data.

### 2. Apply the database schema (migrations)

The schema lives in [`supabase/migrations/`](../supabase/migrations/) — `0001`
(saved sessions), `0002`, `0003`/`0004` (AI phase: subscriptions, usage, chat sessions +
grants), `0005` (chat context column). A migration file does nothing until it's applied
to the hosted project. Two ways:

- **SQL Editor (simplest, no tooling):** Dashboard → **SQL Editor** → paste the migration
  file's contents → **Run**.
- **CLI (no Docker needed — `db push` targets the remote directly):**
  ```bash
  supabase link --project-ref soetrtogqcpmonoumcjf
  supabase db push
  ```

> **Gotcha — `PGRST205` (table not found):** if a save fails with `Could not find the table
> 'public.saved_sessions' in the schema cache`, the migration hasn't been applied to this
> project yet (or PostgREST hasn't reloaded). Apply it, then wait a few seconds or force
> **Project Settings → API → Reload schema cache**.

> **Gotcha — `403` permission denied on `/rest/v1/saved_sessions`:** current Supabase does
> **not** auto-expose new `public` tables to the Data API roles, so the table needs an
> explicit `GRANT` to `authenticated` (the migration includes this). If you applied an
> earlier copy of `0001_saved_sessions.sql` **before** that grant was added, re-run the
> migration (or just `grant select, insert, update, delete on public.saved_sessions to
> authenticated;`) on the hosted project, or reads/saves will 403 even though the table
> exists. RLS still restricts every row to its owner.

When you add a new migration, name it `000N_description.sql` and apply it the same way.

> **Gotcha — pg-delta "failed to cache migrations catalog" warning:** `supabase db push`
> may print a scary edge-runtime error about a missing `pgdelta-target-ca.crt` *after*
> "Applying migration…". It's a warning from a non-essential local caching step — the
> migration still applied. Verify with `npx supabase migration list` (and, if needed,
> `npx supabase db query --linked "<sql>"`). Deleting `supabase/.temp/` usually clears it.

### 3. Auth providers

Dashboard → **Authentication → Providers**:

- **Email** — enabled, with **Confirm email ON** (users must click the emailed link before
  their first sign-in) and **minimum password length 8**, matching `config.toml` and
  `MIN_PASSWORD_LENGTH` in `src/lib/authErrors.ts`. Confirmation/reset emails are sent via
  **custom SMTP through Resend** (Authentication → Emails → SMTP Settings: host
  `smtp.resend.com`, port 465, user `resend`, password = a Resend API key, sender
  `no-reply@solutionseeking.com`) — Supabase's built-in mailer is rate-limited to a few
  emails per hour and not production-grade. Email templates (Confirm signup / Reset
  password) can be branded under **Authentication → Emails**.
- **Google** — create an OAuth client in the [Google Cloud Console](https://console.cloud.google.com/)
  (APIs & Services → Credentials → OAuth client ID → Web application). Set the authorized
  redirect URI to `https://soetrtogqcpmonoumcjf.supabase.co/auth/v1/callback`, then paste
  the client ID + secret into Supabase's Google provider.

### 4. Redirect URLs

Dashboard → **Authentication → URL Configuration**. Set **Site URL** to the production
origin and add every origin the app signs in from under **Redirect URLs** (the app passes
`redirectTo: <origin>/account`):

- `http://localhost:4321` (local dev)
- `https://solution-seeking-system.netlify.app` (and any deploy-preview pattern you use)
- `https://solutionseeking.com` (the live domain — required for sign-in/OAuth on production)

Missing entries here are the usual cause of a sign-in that bounces back signed-out.

### Local Supabase stack (optional)

A full local stack (Postgres + Auth + Studio) in Docker, for developing against a
throwaway database instead of the hosted project. Already set up in this repo — `supabase/config.toml`
is committed. The CLI is available via `npx supabase` (no global install needed).

```bash
npx supabase start      # boots the stack; auto-applies supabase/migrations/ to the local DB
npx supabase status      # prints the local API URL + keys again
npx supabase db reset    # wipe + re-apply all migrations (use after editing a migration)
npx supabase stop        # shut the stack down
```

**Ports (this machine):** the default `5432x` ports fall inside a WinNAT/Hyper-V reserved
range on this Windows host, so `config.toml` shifts the whole cluster to the **`553xx`**
band (api `55321`, db `55322`, studio `55323`, mailpit `55324`, etc.). That's why the local
URL is `http://127.0.0.1:55321`.

**Point the app at local:** `.env` carries both sets of Supabase vars with one pair
commented out — swap the active pair to switch between the local stack and the hosted
project, then restart `npm run dev` (Astro reads `.env` at startup):

```
PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
PUBLIC_SUPABASE_ANON_KEY=<local publishable key from `npx supabase status`>
```

Local auth mirrors production: **email confirmation is ON** (`config.toml` →
`[auth.email] enable_confirmations`) and the minimum password length is 8. Confirmation
and reset emails are captured in Mailpit at `http://127.0.0.1:55324` (nothing is actually
sent) — open it to click the links during local testing. The local keys are shared,
well-known dev defaults — never use them anywhere real.

> **Windows port gotcha (why the ports are remapped):** on the stock `5432x` ports,
> `supabase start` fails with *"ports are not available … bind: An attempt was made to
> access a socket in a way forbidden by its access permissions"* — those ports sit inside a
> WinNAT/Hyper-V reserved range (list them with `netsh interface ipv4 show
> excludedportrange protocol=tcp`). Two fixes: the one used here is remapping to a free band
> in `config.toml`; alternatively, quit Docker Desktop and run `net stop winnat` /
> `net start winnat` in an **admin** PowerShell to release the reservation, then restart
> Docker.

## Phase 3 — AI assistants + subscription

The Guide/Mentor chat runs on four Astro server endpoints (`src/pages/api/{chat,
checkout, billing-portal, stripe-webhook}.ts`, `prerender = false`) that deploy as
Netlify Functions automatically — no config changes; the adapter handles bundling and
the endpoints support streaming responses.

**Five server-only env vars** (set in `.env` locally and in Netlify → Site configuration
→ Environment variables; no `PUBLIC_` prefix — they must never reach the browser):

| Var | Where it comes from |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API keys |
| `STRIPE_SECRET_KEY` | Stripe dashboard → prefer a **restricted key** (`rk_...`) with: Checkout Sessions (write), Billing Portal (write), Customers (write), Subscriptions (read) |
| `STRIPE_WEBHOOK_SECRET` | The webhook endpoint's signing secret (below); locally, the `whsec_` printed by `stripe listen` |
| `STRIPE_PRICE_ID` | The $5/month recurring price (below) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API keys → secret key. Bypasses RLS — server only |

### Database

Apply `supabase/migrations/0003_ai_phase3.sql` **and** `0004_grant_ai_phase3.sql` (SQL
editor or `supabase db push`). They add `subscriptions` + `ai_usage` (client read-only;
written only by the server) and `chat_sessions` (user-owned conversations, full CRUD
under RLS), plus the `increment_free_messages` function (service-role only — 0003
revokes the default PUBLIC execute grant).

### Stripe setup (test mode first, then repeat in live mode)

1. **Product/price:** Product catalog → Add product — "Solution Seeking AI Assistants",
   recurring **$5.00/month USD** → copy the `price_...` id → `STRIPE_PRICE_ID`.
2. **Restricted key:** Developers → API keys → Create restricted key (permissions above)
   → `STRIPE_SECRET_KEY`.
3. **Webhook:** Developers → Webhooks → Add endpoint
   `https://solutionseeking.com/api/stripe-webhook` (apex — the primary domain; Stripe
   does not follow the www→apex redirect), events:
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted` → copy the signing
   secret → `STRIPE_WEBHOOK_SECRET`.
4. **Customer portal:** Settings → Billing → Customer portal → allow customers to cancel
   subscriptions (cancel at period end). The account page's "Manage subscription" button
   opens this portal.
5. **Local testing:** `stripe listen --forward-to localhost:4321/api/stripe-webhook`
   (use the CLI-printed `whsec_` as the local `STRIPE_WEBHOOK_SECRET`), then subscribe
   with test card `4242 4242 4242 4242`. `stripe trigger checkout.session.completed`
   exercises the webhook directly.

### How gating works

Signed-in users get **10 lifetime free messages** (`ai_usage`, incremented server-side),
then a $5/month subscription (status `active`/`trialing`/`past_due` in `subscriptions`)
is required. The Stripe webhook is the only writer of subscription state. A portal
cancel sets `cancel_at_period_end` while access continues until the period ends.

## Analytics & conversion tracking (GA4 + GTM)

Google Tag Manager (`GTM-M987NM67`) is hardcoded in
[`BaseLayout.astro`](../src/layouts/BaseLayout.astro). GTM alone only gives you page
views. The funnel events live in [`src/lib/analytics.ts`](../src/lib/analytics.ts) —
one typed `track()` call per meaningful action, pushed to `window.dataLayer`.

**The conversion of record is server-side.** `subscription_completed` is sent from the
Stripe webhook via the GA4 Measurement Protocol
([`src/lib/server/ga4.ts`](../src/lib/server/ga4.ts)), not from the browser landing on
`/account?checkout=success`. A browser event misses closed tabs, ad blockers, and the
iOS hand-off — and misses them *unevenly by device*, which would bias any ad bidding
built on the number. To attribute those server-side conversions back to the session that
caused them, the GA client/session ids are read from the `_ga` cookies, passed to
`/api/checkout`, stored in Stripe Checkout `metadata`, and read back in the webhook.

### 1. Create the GA4 property

Analytics → Admin → **Create property** → add a **Web** data stream for
`solutionseeking.com`. Then:
- Copy the **Measurement ID** (`G-XXXXXXXXXX`).
- Data stream → **Measurement Protocol API secrets** → create one, copy the value.

### 2. Environment variables (Netlify + local `.env`)

```
PUBLIC_GA4_MEASUREMENT_ID=G-XXXXXXXXXX   # public: the client needs it to read the GA cookie
GA4_API_SECRET=...                       # secret: mark as a secret value in Netlify
```

Netlify env changes only reach Functions after a **redeploy**.

### 3. GTM container setup (one time, in the GTM UI)

1. **Tag → Google Tag**, Measurement ID = your `G-...`, trigger **All Pages**.
2. **Variables → New → Data Layer Variable**, one per event parameter. The "Data Layer
   Variable Name" must match the key we push exactly:
   `cta_location`, `cta_label`, `destination`, `agent`, `tier`, `plan`, `mode_id`,
   `demo_id`, `method`, `from_anon`, `message_index`, `value`, `currency`.
3. **Trigger → Custom Event**, event name (regex enabled):
   `^(cta_clicked|demo_viewed|mode_viewed|signup_started|signup_completed|first_message_sent|message_sent|free_limit_reached|checkout_started|checkout_abandoned|checkout_success_viewed)$`
   One trigger for everything is far easier to maintain than one per event.
4. **Tag → Google Analytics: GA4 Event**, Event Name = `{{Event}}`, fire on the trigger
   from step 3. Under **Event Parameters**, add one row per parameter. Only the *value*
   is a variable:

   | Event Parameter (literal text) | Value (the variable from step 2) |
   |---|---|
   | `agent` | `{{agent}}` |
   | `tier` | `{{tier}}` |
   | `cta_location` | `{{cta_location}}` |
   | … and so on for each parameter in step 2 | |

   The left column is **typed as plain text**, never `{{agent}}` — GTM would resolve that
   and send a parameter named after its value (e.g. a parameter literally called `guide`).
   The name in the left column is the string GA4 receives, and it is what you type into
   the "Event parameter" field when registering the custom dimension in step 4 below.

   If a variable is undefined for a given event, GTM **omits that parameter**, which is
   why one passthrough tag safely covers all eleven events (a `demo_viewed` event simply
   won't carry `plan` or `tier`).
5. **Publish** the container.

### 4. GA4 UI setup

- **Admin → Events → Mark as key event**: `subscription_completed`, `signup_completed`,
  `checkout_started`, `free_limit_reached`, `first_message_sent`.
- **Admin → Custom definitions → Create custom dimension** (event-scoped) for
  `cta_location`, `tier`, `plan`, `agent`, `mode_id`, `demo_id`. Without this, the
  parameters are collected but **cannot be reported on**.
- **Admin → Product links → Search Console** — link it, or "which query led to a
  subscription" stays unanswerable.

### 5. Verify

Use **GTM Preview** alongside **GA4 → Admin → DebugView**:
1. Walk home → `/practice` → `/practice/guide`, send a message, exhaust the free
   messages, click subscribe. Each event should appear in both, with its parameters.
2. Complete a **Stripe test-mode** checkout. In DebugView, confirm
   `subscription_completed` arrives **from the server** with `value`, a
   `transaction_id` of `cs_test_...`, and **the same `client_id` as your browser
   session**. This is the check that proves attribution works end to end.
3. Cancel a checkout: you should land back on the page you started from, with the
   "no charge was made" banner and a `checkout_abandoned` event.

> **Note:** ad blockers strip GTM for a meaningful share of visitors, so top-of-funnel
> counts will always undercount. Compare *ratios* over time, not absolutes. Revenue is
> never undercounted, because it comes from the webhook.
