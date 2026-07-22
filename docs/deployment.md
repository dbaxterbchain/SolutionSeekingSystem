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

### Database advisors & accepted findings

Supabase lints the database for security and performance issues. Re-check after any
schema change (Dashboard equivalent: **Advisors** in the left nav):

```bash
npx supabase db advisors --linked --type all --level info
```

A finding either gets fixed in a migration or added to the accepted table below with its
reason — never silently ignored.

The 2026-07-20 hardening pass (migrations `0015`–`0020`) cleared: `auth_rls_initplan`
(policies now evaluate `(select auth.uid())` once per query, not per row),
`function_search_path_mutable` (every function pins `search_path`), `extension_in_public`
(**`citext` now lives in the `extensions` schema** — PostgREST resolves its operators via
its extra search path, which includes `extensions` on hosted and in `config.toml`
locally), both `*_security_definer_function_executable` findings (below),
`unindexed_foreign_keys` (covering indexes, `0018`), and the unbounded `rate_limit`
growth hiding behind an unused-index finding (opportunistic purge in `0019`).

**`rls_auto_enable` / `ensure_rls`:** the hosted project carried an event trigger that
auto-enables RLS on every table created in `public` — added from the dashboard, present
in no migration, so local stacks silently lacked it. Migration `0020` formalizes the
hosted definition verbatim and revokes the default PUBLIC execute grant the advisors
flagged. It stays: it is a third safety layer next to `0010`'s default-privilege revoke.

**Accepted findings** (intentional — do not "fix"):

| Finding | Where | Why it stays |
|---|---|---|
| `auth_allow_anonymous_sign_ins` | `chat_sessions`, `saved_sessions`, `subscriptions`, `ai_usage` | The anonymous trial depends on it: anonymous users are real `auth.users` rows carrying `role=authenticated` (see `0006`). `to authenticated` is as narrow as these policies can get. |
| `rls_enabled_no_policy` | `rate_limit`, `team_enquiries`, `email_subscribers`, `testimonials`, `organizations`, `org_members`, `documents`, `assistants`, `assistant_documents`, `white_label_pages` | Deliberate deny-all: server-write-only tables; only the service role (which bypasses RLS) touches them (`0010`, `0012`, `0021`–`0023`). |
| `unused_index` | `subscriptions_click_idx`, `email_subscribers_token_idx`, the four `0018` FK indexes | Young or event-driven indexes: attribution just shipped, token lookups seq-scan while the table is tiny, and the FK indexes only fire on deletions. |

**Manual dashboard settings** (cannot be migrations — both set 2026-07-20; re-apply if
the project is ever restored or recreated):

- **Leaked password protection** (`auth_leaked_password_protection`): Dashboard →
  Authentication → password settings → HaveIBeenPwned check **enabled**. Pro plan feature.
- **Auth connection allocation** (`auth_db_connections_absolute`): switched from a fixed
  10 connections to **percentage strategy at 10%** (6 of the instance's 60 at peak; Auth
  holds connections only briefly, and the percentage scales automatically with any future
  instance upgrade).

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

## Email (Resend)

Used for two things: the **guide delivery email** (which doubles as the double opt-in
confirmation) and **team enquiry alerts**. [`src/lib/server/email.ts`](../src/lib/server/email.ts)
holds the client and the templates.

### Setup

1. **Resend → Domains** → add `solutionseeking.com`, then add the SPF, DKIM, and DMARC
   records at your registrar. **Start this first: DNS can take hours, and every send 403s
   until the domain is verified.** The domain in `EMAIL_FROM` must match a verified domain
   exactly.
2. **Netlify env**: `RESEND_API_KEY` (secret), `EMAIL_FROM`
   (e.g. `Solution Seeking System <hello@solutionseeking.com>`), and **`ALERTS_TO`**
   (a real inbox you read). `ALERTS_TO` receives team enquiries *and* written chat feedback;
   it falls back to `TEAM_ENQUIRY_TO`, then `EMAIL_FROM`, so an alert always lands somewhere.
   Check the value is not still the `you@example.com` placeholder from `.env.example`.
3. Apply migration `0008_email_subscribers.sql`.

### How the list works

- `/guide` is the lead-magnet landing page. The PDF used to be handed out with **zero**
  email capture, so every downloader was lost.
- **Double opt-in, but the confirmation click IS the download click**: submitting the form
  emails a "Download the guide" button pointing at `/api/confirm?token=…`, which marks the
  address confirmed and 302s to the PDF. Only a real address gets the guide, and there is
  no second step that feels like one.
- **Soft gate:** the raw PDF URL keeps working, and is still listed in `llms.txt`. It is
  indexed, AI agents are not leads, and 404ing it would be an own goal. Almost nobody hunts
  for the direct link.
- `email_subscribers` is **server-write-only** (RLS on, no policies, service role only).
  Verified: the browser gets `permission denied` on read and cannot forge a row.
- The `source` column records **first touch** and is deliberately not overwritten when
  someone re-submits from a different form, so you can tell which capture point works.
- One-click unsubscribe is at `/api/unsubscribe?token=…` and accepts POST as well as GET,
  because some clients (and Gmail's List-Unsubscribe) POST.

Useful queries:

```sql
-- The list.
select created_at, email, source, status from public.email_subscribers
where status = 'confirmed' order by created_at desc;

-- Which capture point actually converts.
select source, count(*) filter (where status = 'confirmed') as confirmed, count(*) as total
from public.email_subscribers group by source;
```

**Testing:** send to `delivered@resend.dev` (simulates delivery), `bounced@resend.dev`, or
`complained@resend.dev`. **Never test with a fake address at a real provider** like
`test@gmail.com` — it bounces and damages sender reputation.

## Feedback & testimonials

The site has no social proof. The plan is to earn some, never to invent it.

**Where the ask happens.** ChatView shows "Did this help?" **once**, and only when the
assistant has produced a prep summary, i.e. the conversation actually reached the end of
the protocol. Asking earlier would measure our nagging rather than our quality.

**Two different things get stored** (`testimonials`, migration `0009`):

- `helpful` — the quality signal, saved for **everyone who answers**. It posts the instant
  they click, before any form appears: recording only on submit would throw away the
  opinion of everyone who cannot be bothered to write prose, and that is most people.
- `quote` / `note` — words, when they write them. A "Not yet" is followed by "what was
  missing?", and that sentence is the most actionable thing this site can produce. It is
  stored in `note`, never in `quote`, so a complaint can never be mistaken for praise.

**Publishing a testimonial takes two independent yeses**: the person ticks the consent box,
*and* you approve the row by hand. The table's check constraint enforces it, so a UI bug
cannot put words in a real person's mouth:

```sql
-- Read what came in.
select created_at, helpful, agent, display_name, role_title, quote, note, consent_publish
from public.testimonials order by created_at desc;

-- The hit rate, which is the number that actually matters.
select helpful, count(*) from public.testimonials group by helpful;

-- Approve one for publication. Fails (23514) unless it has consent AND a quote.
update public.testimonials set status = 'approved' where id = '<uuid>';
```

Written feedback (praise **and** criticism) emails `ALERTS_TO` so it is never sitting unread
in a table. A bare rating does not email: it is a number, not news.

**Nothing is published automatically.** There is no surface on the site that renders
approved testimonials yet, because there are none. Build it when there is something real to
put in it.

## The admin area (/admin)

Feedback and testimonials, organizations, the email list, and team enquiries, in one place.

**Access** is an env allowlist: `ADMIN_EMAILS` (comma-separated, server-only, never
`PUBLIC_`). **Unset means nobody**, deliberately: the admin area fails closed. The address
must belong to a real, non-anonymous account with a **confirmed** email.

**Where the security actually lives.** The `/admin` page is public HTML containing no data.
Auth in this codebase is a Bearer token in localStorage, so no page can be gated before it
renders, and pretending otherwise would put the boundary in the wrong place. Every
`/api/admin/*` route calls `requireAdmin()` before it does anything. A stranger who finds
the URL gets an empty shell and a 403.

The page is `noindex`, excluded from the sitemap, and disallowed in `robots.txt`. It is a
deliberate orphan: **do not link it from the nav or the footer.**

### Publishing a testimonial

Approved testimonials are read from the database **when the site builds**, so there are two
steps, and the second one is not optional:

1. **Approve** it in `/admin`. Nothing on the live site changes yet.
2. **Press "Publish to site"**, which fires a Netlify build hook (`NETLIFY_BUILD_HOOK_URL`).
   About two minutes later the quote is live on the home page and `/pricing`.

That split is a feature. Approving is a private, reversible editorial act; publishing is the
moment a named person's words go up in public. It also keeps the home page a static file
with no runtime database dependency, which is why a Supabase outage cannot take the
marketing site down.

**The corollary, which matters more than the feature: un-approving also needs a Publish.**
If someone withdraws consent, reject the row, press Publish, and check it is gone. Practise
that drill once before you need it.

A row can only be approved if the person ticked the consent box and actually wrote
something. The database enforces it, so the Approve button does not appear otherwise.

## Teams: how to onboard an organization

Self-serve seats are **not** built, on purpose (see `PLANS.team.selfServe = false`). The
enquiry form on `/pricing` is the front door, and fulfilment is a ten-minute job in `/admin`.

1. **The enquiry arrives by email** (from `/api/team-enquiry`). It is also in `/admin` under
   Enquiries.
2. **Reply and agree seats and price.** The listed rate is "From $4/person/month, 5 seat
   minimum".
3. **Bill them.** Either a Stripe subscription you create by hand in the dashboard, or an
   invoice outside Stripe. If you use Stripe, **paste the `stripe_customer_id` onto the
   organization row**: the webhook uses it to keep the status in step, so a lapsed
   organization actually loses access instead of keeping it forever. If you bill by invoice
   there are no webhooks, and the status you set by hand is the truth.
4. **`/admin` → Organizations → New organization.** Name and seat count.
5. **Add their members' email addresses.**
6. **Tell them which address to use.** This is the step people forget. Access is granted by
   signing in with a listed address; somebody who signs up with a different one gets nothing.
   They do not need an invite link, and there is no code to enter: they just sign in.
7. Members get unlimited access immediately. The seat is claimed on their first message, and
   the admin list then shows them as "signed in".

**Renewals.** If billed through Stripe, the webhook updates the status automatically. If
billed by invoice, update `current_period_end` by hand; the admin panel highlights a renewal
inside 14 days. Setting an organization to `canceled` drops every member back to the free
tier on their next message.

**Rules the database enforces**, so you cannot get them wrong quietly:
- A member cannot be added beyond the seat count. Raise the seats first.
- One person holds one seat: the same address cannot be on two organizations.
- An unconfirmed email address can never claim a seat.

**Managers.** In `/admin → Organizations`, each member has a role select (member / manager).
A manager can share assistants org-wide and manage white-label pages from their own
dashboard. Set at least one manager per organization that wants those features.

**One person, several orgs.** As of migration `0024`, an email can be a member of more than
one organization (roles are per-org, so someone can manage org A and just belong to org B). In
the dashboard they pick the active org from a switcher; it drives which shared assistants show
and which org they share to or manage white-label pages for. Adding the same email to a second
org is fine; only a duplicate within the *same* org is refused. Seats claim on the member's
first dashboard/org-feature use, even if they also hold a personal subscription.

## White-label pages & custom domains

A **manager** builds white-label pages from their dashboard (the "White-label pages" panel):
a branded chat page at `solutionseeking.com/a/<org-id>/<slug>` for a shared assistant or a
standard Guide/Mentor. That path works immediately, with sign-in required and each member's
history kept private. The custom-domain step below is optional and concierge-only.

**Putting a page on a customer's own subdomain** (e.g. `managers-assistant.theirco.com`):

1. **Prerequisite:** the page exists and works at its `/a/<org-id>/<slug>` path.
2. **Customer adds DNS:** a `CNAME` record, their subdomain → `solutionseeking.netlify.app`
   (the panel's "Custom domain" note shows them this). They then contact us to activate.
3. **We add the Netlify domain alias:** Netlify → Domain management → add the subdomain as an
   alias of the site; wait for the automatic Let's Encrypt certificate.
4. **We add a root-only rewrite** to `netlify.toml` and deploy. The host goes in `from` as a
   full URL — that is how Netlify matches a domain. **Do not use `conditions = { Host = ... }`**:
   Host is not a supported redirect condition (only Country/Language/Role/Cookie are), so it is
   silently ignored and the rule never fires. Root-only (`/`, no `/*` splat) on purpose — a
   splat would swallow `/_astro/*` and `/api/*` on the alias host and break assets, chat, and
   auth:
   ```toml
   [[redirects]]
     from = "https://managers-assistant.theirco.com/"
     to = "/a/<org-id>/<slug>"
     status = 200
     force = true
   ```
5. **We allow the host for auth:** Supabase → Authentication → URL Configuration → add
   `https://managers-assistant.theirco.com/**` to the redirect allowlist; and add the hostname
   to the Cloudflare Turnstile widget's allowed hostnames (captcha-enforced auth fails on the
   alias otherwise).
6. **We record it:** set `white_label_pages.custom_domain` (bookkeeping only; routing lives in
   `netlify.toml`).
7. **Verify on the alias:** the page renders with CSS, password sign-in works, chat streams,
   and the page's `<link rel="canonical">` still points at solutionseeking.com. Note for the
   customer: sessions are per-domain, so members sign in once on their domain.

Rehearse the whole flow on a throwaway test subdomain before the first real customer.

## Search Console & Bing verification

**Still outstanding, and it is the cheapest win left.** This has been open since before the
7 demos and 8 mode pages shipped, which means Google may not yet know ~48 indexable pages
exist. Everything about the site is built for organic search; nobody ever told the search
engines.

1. **Google Search Console** → add a property for `solutionseeking.com`.
   - Easiest: **DNS TXT** record (verifies the whole domain, survives redesigns).
   - Or: set `PUBLIC_GOOGLE_SITE_VERIFICATION` in Netlify to the token from the "HTML tag"
     method and redeploy. BaseLayout renders the meta tag on every page.
2. **Submit the sitemap**: `https://solutionseeking.com/sitemap-index.xml`.
3. **Bing Webmaster Tools** → import from Search Console (one click), or verify with
   `PUBLIC_BING_SITE_VERIFICATION`.
4. **Link GA4 ↔ Search Console** (GA4 → Admin → Product links → Search Console links, then
   publish the "Search Console" report collection in the Library). **Do not skip this.** It
   is what makes "which query led to a subscription" answerable at all; without it you have
   queries in one tool and conversions in another and no way to join them.

IndexNow already pings on every Netlify deploy (see `netlify.toml`), but that only tells
engines a URL *changed*, which is worthless until the property is verified.

## Pricing & plans

**One source of truth: [`src/data/pricing.ts`](../src/data/pricing.ts).** Prices, free
allowances, and the shared copy lines all live there and are imported everywhere else
(page copy, chat UI, JSON-LD offers, llms.txt). Never retype a price: they used to be
hardcoded in ten places, which meant changing the Stripe price would silently leave most
of the site lying to customers and to Google.

**Stripe setup for the annual plan** (one time):
1. Stripe dashboard → the existing product → **Add another price** → recurring, **$50 /
   year**. Copy the `price_...` id.
2. Netlify → environment variables → `STRIPE_PRICE_ID_ANNUAL` → redeploy.

If the amounts in Stripe ever change, update the labels in `src/data/pricing.ts` to match.
Nothing reads the price back from Stripe, so these are the two places that must agree.

**Security:** the client sends a plan id (`monthly` | `annual`), never a Stripe price id.
[`src/lib/server/plans.ts`](../src/lib/server/plans.ts) maps it to an env-var price. A
client-supplied price id is never trusted, or someone could point checkout at a $0.01
price created in the dashboard.

**Team enquiries** (`/pricing` → the Teams card) are stored in `team_enquiries`
(migration `0007`, server-write-only, honeypot + IP rate limit). Self-serve seats are
deliberately not built: that is weeks of work on the entitlement path for zero validated
demand, and this form tells you whether the demand exists. **There is no notification
email yet** — read the table until the email phase lands:

```sql
select created_at, name, email, team_size, note from public.team_enquiries
where not handled order by created_at desc;
```

## Anonymous trial (chat before signing up)

A visitor can send **3 messages with no account** ([`src/data/pricing.ts`](../src/data/pricing.ts)),
then they're asked to register (which grants the remaining 7 of the 10 free messages).

**Why it works with no data migration:** Supabase anonymous sign-in creates a real
`auth.users` row carrying `role: authenticated`, so every RLS policy and grant already
covers it. Converting to a permanent account (`updateUser` or `linkIdentity`) **keeps the
same user id**, so the conversation (`chat_sessions`) and the used-message counter
(`ai_usage`) survive signup untouched. Verified against a live database, not assumed.
Never call `signOut()` during conversion, and never mint a second anonymous user.

### One-time setup

1. **Supabase dashboard** (hosted project — `config.toml` only covers local):
   - Authentication → Sign In / Providers → **enable Anonymous sign-ins**.
   - Authentication → **enable Manual Linking** (required for `linkIdentity`, which is
     how the one-click Google upgrade keeps the conversation).
   - Authentication → Rate Limits → anonymous sign-ins **10/hour/IP**.
2. **Apply migration `0006_anon_trial.sql`** before deploying (adds the `rate_limit` table
   and the `bump_rate_limit` RPC, both service-role only).
3. **Netlify env**: `IP_HASH_SALT` (any long random string, mark secret) and
   `ANON_TRIAL_ENABLED=true`.
4. **Anthropic console**: set a monthly spend limit and an email alert. This is the real
   backstop.

### Captcha (Cloudflare Turnstile)

Captcha is **enforced on the Supabase project**, so auth calls without a token are
rejected. Every affected call site passes one via
[`src/lib/turnstile.ts`](../src/lib/turnstile.ts): anonymous sign-in, sign-up, sign-in,
password reset, and confirmation resend. (Converting an anonymous user runs through
`updateUser`, which is not captcha-protected.)

- **`PUBLIC_TURNSTILE_SITE_KEY`** must be set in Netlify, or **all auth breaks in
  production**. The site key is public by design; the secret lives in the Supabase
  dashboard.
- The widget is **invisible** (`execution: 'execute'`, `appearance: 'interaction-only'`):
  a visitor sees nothing unless Cloudflare actually wants a challenge. This matters
  because the whole point of the anonymous trial is that you can just start typing.
- A token is **solved in advance** on chat mount and cached (they last ~300s and are
  single-use), so the ~1.5s challenge never lands on the critical path. Measured: click
  Send → anonymous sign-in fires in ~10ms, `/api/chat` in ~130ms.
- **Cloudflare dashboard → your Turnstile widget → Hostname Management**: add every
  domain that must work. `solutionseeking.com` at minimum, plus `localhost` and/or
  `*.netlify.app` if you want local development and deploy previews to authenticate. A
  missing hostname fails with error **110200** ("domain not allowed").
- **Locally, leave `PUBLIC_TURNSTILE_SITE_KEY` unset**: the local Supabase stack has
  captcha disabled, and an unset key makes the client skip the token entirely. To test the
  captcha path locally, use Cloudflare's always-passing test key
  `1x00000000000000000000AA`.

### Cost control

Anonymous identities are free to mint, so a per-user allowance bounds nothing on its own.
Three layers:

- **3 messages** per anonymous user (not 10).
- **25 anonymous messages per IP per day**, enforced in `/api/chat` via
  [`rateLimit.ts`](../src/lib/server/rateLimit.ts). IPs are stored only as a salted hash.
  It **fails open**: if the IP is unknown or the database errors, the request is allowed,
  because blocking paying users during an infrastructure hiccup is worse than the abuse.
- **`ANON_TRIAL_ENABLED=false`** kills the feature entirely (anonymous callers are asked
  to register; the UI falls back to the old sign-in wall). One env var plus a redeploy.

Budget roughly **$0.06 for a visitor's first message** (cold prompt cache) and ~$0.012
after, so ~$0.09 for a visitor who uses the whole allowance.

Anonymous users are blocked from `/api/checkout` and `/api/billing-portal`: they have no
email address, so Stripe would attach a subscription to an account they could never sign
back into.

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

> **Two different lists, do not mix them up.**
> **Event names** (`cta_clicked`, `demo_viewed`, `checkout_success_viewed`, …) are what
> *fire* the tag. They belong only in the trigger regex in step 3, and GTM supplies them
> via `{{Event}}`. They are **not** variables. If you reference one as `{{event_name}}`
> anywhere, GTM warns "Unknown variable … found in a tag" on publish.
> **Parameters** (`agent`, `tier`, `cta_location`, `demo_id`, `value`, …) are the data
> carried *with* an event. Only these get Data Layer Variables and rows in the Event
> Parameters table.

1. **Tag → Google Tag**, Measurement ID = your `G-...`, trigger **All Pages**.
2. **Variables → New → Data Layer Variable**, one per event parameter. The "Data Layer
   Variable Name" must match the key we push exactly:
   `cta_location`, `cta_label`, `destination`, `agent`, `tier`, `plan`, `mode_id`,
   `demo_id`, `method`, `from_anon`, `message_index`, `value`, `currency`,
   `source`, `helpful`, `consented`.
3. **Trigger → Custom Event**, event name (regex enabled). **This must list EVERY event in
   the union in [`src/lib/analytics.ts`](../src/lib/analytics.ts).** An event missing from
   this regex is pushed to the dataLayer and then dies there: it never reaches GA4, and
   nothing anywhere reports an error.

   > This is not hypothetical. The regex used to omit `email_captured`, `anon_chat_started`,
   > `team_enquiry_submitted`, `feedback_given` and `testimonial_submitted`, which meant the
   > **lead-magnet conversion was invisible in GA4** while the code fired it perfectly. If
   > you add an event to the union, add it here in the same breath.

   ```
   ^(cta_clicked|demo_viewed|mode_viewed|signup_started|signup_completed|anon_chat_started|first_message_sent|message_sent|free_limit_reached|checkout_started|checkout_abandoned|checkout_success_viewed|team_enquiry_submitted|email_captured|feedback_given|testimonial_submitted)$
   ```

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
  `checkout_started`, `free_limit_reached`, `first_message_sent`, `email_captured`.
- **Admin → Custom definitions → Create custom dimension** (event-scoped) for
  `cta_location`, `tier`, `plan`, `agent`, `mode_id`, `demo_id`, `source`. Without this, the
  parameters are collected but **cannot be reported on**.
- **Admin → Product links → Search Console** — link it, or "which query led to a
  subscription" stays unanswerable.
- **Admin → Data Streams → your stream → Configure tag settings → List unwanted referrals:
  add `checkout.stripe.com`.** Without it, the return trip from Stripe starts a **new
  session attributed to "referral / stripe"**, which severs every purchase from the campaign
  that paid for it. One field, and it silently ruins paid reporting if you skip it.

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

## Google Ads

A small Search test, run to **buy data, not customers**. At $5/month the CAC maths does not
close, and roughly zero to two subscriptions from a $300 budget is the *expected* outcome.
Judge the test on **cost per started conversation**, never on subscriptions.

### Ad attribution: how a click becomes a row in the database

`?gclid=...` lands on the page → [`src/lib/attribution.ts`](../src/lib/attribution.ts)
stores it **first-touch** in localStorage (30-day TTL) → it survives the anonymous chat and
the **Google OAuth redirect that destroys the query string** → the checkout request carries it
→ Stripe Checkout metadata → the subscription's metadata → the webhook writes it onto the
`subscriptions` row (migration `0014`).

The paid-test report is then one query:

```sql
select utm_term, landing_path, count(*) as subscriptions
from public.subscriptions
where click_id is not null
group by 1, 2 order by 3 desc;
```

Two things that will bite, both already handled, both worth knowing:

- **A gclid is routinely longer than 120 characters.** `checkout.ts` used to slice every
  metadata value at 120, which would have stored a plausible-looking, useless click id and
  failed a conversion import months later. Click ids get 500 (Stripe's hard limit). Do not
  "tidy" that back into a single constant.
- **Our own guide-delivery email links back with `?utm_source=email`.** First-touch-wins would
  have let our own email claim credit for a conversion an ad bought. A real paid click always
  beats a stored non-paid touch. That clause is the only thing preventing it.

### One-time setup

1. **Google Ads → Account settings → Auto-tagging: ON.** No auto-tagging, no gclid, no test.
2. **Ads → Tools → Data manager → link the GA4 property.**
3. **Ads → Goals → Conversions → New → Import → GA4.** Import exactly four:

   | Event | Setting |
   |---|---|
   | `first_message_sent` | **Primary**, Count = **One** |
   | `signup_completed` | Secondary |
   | `subscription_completed` | Secondary (yes, even though it is the money: at ~150 clicks it fires 0-1 times, and as a Primary it would make CPA meaningless) |
   | `email_captured` | Secondary |

   **Count = One, not Every.** `first_message_sent` fires whenever a conversation has one user
   message, and "New conversation" resets that, so one enthusiastic visitor would otherwise
   look like three conversions.

   Do **not** import `checkout_started`, `message_sent`, `mode_viewed` or `cta_clicked`.

### The campaign

- **Search only. Search partners OFF, Display OFF** (both default ON, both eat the budget).
- **Locations: United States, "Presence: people in your targeted locations"** (the default,
  "presence or interest", bills you for clicks from anywhere on earth).
- **Bidding: Maximize Clicks with a max CPC cap (~$2.50).** NOT Target CPA: Smart Bidding needs
  roughly 15-30 conversions a month to learn, and you will have far fewer. With manual bidding
  the conversion actions above are measurement only, which is exactly what is wanted.
- **Budget: ~$15/day for 21 days.** Put the end date in a calendar.
- **Two ad groups, each pointing at its matching mode page** (this is what the mode pages are
  for): manager → `/practice/modes/manager`, co-worker → `/practice/modes/coworker`. Never the
  homepage.
- **Negatives, day one:** free, pdf, template, script, letter, jobs, salary, hiring, fire,
  termination, "write up", lawsuit, attorney, hr complaint, reddit, meme, chatgpt. (`letter`,
  `write up` and `termination` are HR-paperwork intent, not conversation-prep intent.)
- **No Performance Max.** "Asset groups" are a PMax concept: it sprays a small budget across
  YouTube, Display and Gmail, cannot be debugged, and needs a conversion diet we cannot feed.

### Decide the outcome BEFORE spending

- **Spend more if** cost per started conversation is under ~$12 **and** at least 10% of starters
  give an email or create an account.
- **Stop if** cost per start is over $25, or under 5% of clicks start a conversation. That means
  the keyword-to-page match is wrong, and no bid tuning fixes it.

### Not built, on purpose

Consent Mode v2 and a cookie banner (US-only targeting, so not required; adding them costs
conversions and buys nothing) · the Google Ads API for offline conversion upload (a developer
token and an approval process, to move 0-3 rows that **Ads → Goals → Conversions → Import →
Upload CSV** moves in ten minutes) · Enhanced Conversions · server-side GTM.
