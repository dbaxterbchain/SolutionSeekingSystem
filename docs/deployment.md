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
- `https://solutionseeking.com/**` (wildcard — **required** for the branded white-label auth at
  `/wl/signin`: Google, password-reset, and email-confirmation links all round-trip back there,
  and without a matching entry they bounce back blocked). This one wildcard covers every custom
  domain, since all white-label auth happens on this one host.

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
| `rls_enabled_no_policy` | `rate_limit`, `team_enquiries`, `email_subscribers`, `testimonials`, `organizations`, `org_members`, `documents`, `assistants`, `assistant_documents`, `white_label_pages`, and the twelve course tables: `course_enrollments`, `course_enrollment_events`, `course_progress`, `course_check_attempts`, `course_stream_tokens`, `course_source_packs`, `course_assessment_attempts`, `course_assessment_responses`, `course_grading_jobs`, `course_grades`, `course_certificates`, `course_review_requests` | Deliberate deny-all: server-write-only tables; only the service role (which bypasses RLS) touches them (`0010`, `0012`, `0021` to `0023`, `0030`, `0031`). The hosted advisors run of 2026-09-11, after `0030` and `0031` were applied, reported exactly the twelve course rows and nothing else new. |
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
| `STRIPE_SECRET_KEY` | Stripe dashboard → prefer a **restricted key** (`rk_...`) with: Checkout Sessions (write), Billing Portal (write), Customers (write), Subscriptions (**write** — the org seat editor updates the subscription item quantity) |
| `STRIPE_WEBHOOK_SECRET` | The webhook endpoint's signing secret (below); locally, the `whsec_` printed by `stripe listen` |
| `STRIPE_PRICE_ID` | The $8/month recurring price (below). Annual ($80/year): `STRIPE_PRICE_ID_ANNUAL`. Teams per-seat ($8/seat/month): `STRIPE_PRICE_ID_TEAM` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API keys → secret key. Bypasses RLS — server only |

### Database

Apply `supabase/migrations/0003_ai_phase3.sql` **and** `0004_grant_ai_phase3.sql` (SQL
editor or `supabase db push`). They add `subscriptions` + `ai_usage` (client read-only;
written only by the server) and `chat_sessions` (user-owned conversations, full CRUD
under RLS), plus the `increment_free_messages` function (service-role only — 0003
revokes the default PUBLIC execute grant).

### Stripe setup (test mode first, then repeat in live mode)

1. **Product/price:** Product catalog → Add product — "Solution Seeking AI Assistants",
   recurring **$8.00/month USD** → copy the `price_...` id → `STRIPE_PRICE_ID`.
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
then an $8/month subscription (status `active`/`trialing`/`past_due` in `subscriptions`)
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

## Teams: how organizations come into existence

**Self-serve is the default path** (since migration `0027`). A buyer on `/pricing` names
their organization, picks a seat count (5 minimum), and pays through Stripe Checkout
(`/api/team-checkout`, per-seat price `STRIPE_PRICE_ID_TEAM`, quantity = seats). The Stripe
webhook then creates the `organizations` row (`billing = 'stripe'`) and seats the buyer as
its **first manager**, bound immediately. They land on `/dashboard?org_checkout=success`,
which polls until the workspace appears and switches into it. No operator action at all.

From there, **managers run the org themselves** from the dashboard's "Organization
settings" panel (`/api/org`): rename it, add and remove members by email, promote and
demote managers, change the seat count (which updates the Stripe subscription quantity
with proration), and open the org's own Stripe billing portal.

Rules the server (and database) enforce for self-serve managers:
- **Last manager**: the only manager cannot be removed or demoted. `/admin` is exempt so
  any weird state stays repairable.
- **Seat floor**: seats can never drop below the current member count (friendly 409 in the
  UI, trigger `enforce_seat_floor` as the backstop). Remove members first.
- **Seat cap**: a member cannot be added beyond the seat count. Increase seats first.
- An unconfirmed email address can never claim a seat.
- Seat changes only work for `billing = 'stripe'` orgs whose subscription item is the team
  price; anything else gets "contact us" (per-seat quantity math against a custom
  subscription would corrupt real invoices).

### The manual path (custom deals) still exists

The enquiry form stays on `/pricing` behind "Prefer to talk first". Fulfilment is the same
ten-minute `/admin` job as before:

1. The enquiry arrives by email (also in `/admin` → Enquiries).
2. Reply, agree seats and price ("From $8/person/month, 5 seat minimum" is the listed rate;
   white-label pages are included, which is the incentive to name in the reply).
3. Bill them by hand: a Stripe subscription you create in the dashboard, or an invoice. If
   Stripe, paste the `stripe_customer_id` onto the org row so the webhook keeps status in
   step. If invoice, the status you set by hand is the truth.
4. `/admin` → Organizations → New organization; add member emails; tell them which address
   to sign in with (the address IS the credential; no invite link exists).

Manually created orgs default to `billing = 'manual'`: their managers can run members and
roles but the seat editor shows "billed by invoice, contact us". Only flip an org to
"self-serve" in `/admin` if its Stripe subscription really is the per-seat team price.

**Renewals.** Stripe-billed orgs (both kinds) update automatically via the webhook, which
also syncs seats from the subscription quantity for team-price subscriptions (clamped to
the member count, loudly logged if they conflict). Invoice-billed orgs are updated by
hand; the admin panel highlights a renewal inside 14 days. Setting an organization to
`canceled` drops every member back to the free tier on their next message.

**Stripe customer portal note.** In the Stripe dashboard's portal configuration, do NOT
enable plan/quantity updates for the team price: seat changes should go through the org
panel so the member-count floor applies first. The webhook clamps and logs if a portal
quantity edit happens anyway.

**Managers.** Set from the org panel by any existing manager, or in `/admin → Organizations`
(role select per member). A manager can share assistants org-wide, manage white-label pages,
and run the organization panel. Every self-serve org starts with its buyer as manager.

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
history kept private.

Putting a page on the customer's **own domain** (e.g. `assistant.theirco.com`) is **self-serve**
from the same panel's "Custom domain" wizard, with no operator action. It runs on **Cloudflare
for SaaS**: a router Worker serves the domain, a per-domain certificate is issued automatically,
and the domain is a **walled garden** (it serves only that one assistant, nothing else on the site).

### How it works

```
customer domain ──CNAME──▶ Cloudflare for SaaS (per-domain TLS)
                             │  Worker `white-label-router` + KV `WL_HOSTS` (host → {org, slug})
                             │    /                                          → proxy origin /a/<org>/<slug>
                             │    /_astro/* /api/* /wl-callback /favicon.svg /robots.txt → proxy origin
                             │    anything else                              → 302 to /
                             ▼
                         solutionseeking.com (Netlify) — unchanged SSR app
```

- **Routing is dynamic** (KV), so a new domain never needs a config change or a deploy. The DB
  column `white_label_pages.custom_domain` (unique) is the source of truth; provisioning writes KV.
- **Auth is centralized on `solutionseeking.com`** — the only host with Turnstile and the only
  Supabase redirect entry, forever. The custom domain never renders Turnstile and is never a
  Supabase redirect target. A branded sign-in at `/wl/signin` offers the full set of methods
  (Google, email+password, register, forgot-password/recovery) and, the moment any of them yields
  a session, hands it to the custom domain via a single-use, encrypted, domain-bound code
  (`wl_auth_codes`, ~60s TTL) → `/wl-callback` → `setSession`. Users sign out from the page itself
  (`WhiteLabelChat`, `signOut({ scope: 'local' })`). Code: `src/lib/server/wlAuth.ts`,
  `src/pages/api/wl-auth.ts`, `src/components/react/WlSignIn.tsx`.

### One-time operator setup (Cloudflare for SaaS)

Done once; nothing per-customer after this.

1. A **dedicated zone** as the SaaS target (we use `solutionseekinghosting.com`), so the apex
   `solutionseeking.com` DNS need not move to Cloudflare.
2. **Cloudflare for SaaS** enabled; **fallback origin** → the Netlify site. `CLOUDFLARE_SAAS_TARGET`
   is the proxied hostname customers CNAME to (we use `origin.solutionseekinghosting.com`).
3. A **KV namespace** (`WL_HOSTS`) and the Worker `cloudflare/worker/white-label-router.js`
   (`wrangler deploy`), bound to KV. Add a **`*/*` route in the dashboard** (Workers → Routes) —
   the documented way to run a Worker on ALL custom-hostname traffic. A per-hostname route, or a
   `routes` entry in `wrangler.toml`, does NOT fire for custom hostnames.
4. A scoped **API token**: **SSL and Certificates: Edit** + **Workers KV Storage: Edit**.
5. Secrets in Netlify + `.env` (placeholders in `.env.example`): `CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_ACCOUNT_ID`, `CF_KV_NAMESPACE_ID`, `CLOUDFLARE_SAAS_TARGET`,
   `WL_AUTH_ENC_KEY` (32 bytes base64), and optional `PUBLIC_CANONICAL_ORIGIN` (defaults to
   `https://solutionseeking.com`). Generate the key with `openssl rand -base64 32`, or on Windows
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

### Self-serve customer flow (the wizard)

No operator action. In the panel's "Custom domain" wizard, the manager:
1. enters their subdomain → the wizard shows one **CNAME** record (their host → `CLOUDFLARE_SAAS_TARGET`);
2. adds it at their registrar and clicks **Verify** — the app confirms the CNAME over DNS-over-HTTPS,
   then creates the Cloudflare custom hostname (**HTTP validation**, so the one CNAME is all they add)
   and writes the KV route;
3. watches it go **live** as the cert issues (the wizard polls). **Remove** tears it all down.

Endpoints/libs: `src/pages/api/white-label-domain.ts`, `src/lib/server/cloudflare.ts`,
`src/lib/server/dnsVerify.ts`. Screenshots: `docs/features/white-label-self-serve/`.

### Migrating an EXISTING live domain (manual cutover, zero downtime)

A domain already serving traffic (e.g. the old Netlify-alias model) needs care so it never goes
dark. HTTP validation can't finish until DNS points at Cloudflare, and a long TTL on the *old*
CNAME can leave the cert pending for up to that TTL — so use **TXT validation**, which issues the
cert BEFORE you move the CNAME. This is exactly how `assistant.bchain.coffee` was cut over:

1. Apply the migration to hosted (`npx supabase db push`; a `pg-delta ... .crt ENOENT` *warning*
   after "Applying migration" is cosmetic — confirm with `npx supabase migration list`).
2. Pre-provision on Cloudflare: create the custom hostname with **`ssl.method: 'txt'`** and write
   the KV entry `host → {org, slug}`. No live impact (DNS still on the old target).
3. Add the returned **`_acme-challenge.<host>` TXT record**; wait for the cert to go `active`
   (fast — a brand-new TXT record has no stale cache).
4. Set the DB row: `custom_domain = '<host>'`, `domain_status = 'active'`.
5. **Move the CNAME** to `CLOUDFLARE_SAAS_TARGET`. The cert is already active, so the switch is
   seamless; traffic on the old target keeps working until each resolver's cache expires.
6. Verify: `/` serves the assistant; `/practice` `/system` `/dashboard` `/a/<other>` all 302 → `/`;
   `/_astro/*` `/api/*` `/wl-callback` pass through; a real sign-in round-trips through the branded
   `/wl/signin` and lands back on the custom domain, signed in.
7. After public DNS fully converges, **remove the old `netlify.toml` white-label rewrite** (while
   any resolver still points at Netlify, that rule is what serves the host's `/`).

### Gotchas (learned the hard way)

- **`*/*` Worker route via the dashboard** — not a `wrangler.toml` `routes` entry, not per-hostname.
- **Cut over a live domain with TXT DCV**, not HTTP DCV, to avoid a validation gap behind a long TTL.
- **`/wl-callback` gets a trailing-slash 301** (`→ /wl-callback/`); the Worker passes the
  trailing-slash form through and the `?t=` code survives. Keep both passing through.
- The self-serve wizard uses **HTTP DCV** (one CNAME) — right for customers; the manual live cutover
  uses TXT. Rehearse on a throwaway subdomain (we used `wltest.bchain.coffee`) before a real customer.

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
1. Stripe dashboard → the existing product → **Add another price** → recurring, **$80 /
   year**. Copy the `price_...` id.
2. Netlify → environment variables → `STRIPE_PRICE_ID_ANNUAL` → redeploy.

**Price changes** (like the 2026-07-25 move to $8/$80/$8-per-seat): create the NEW price in
Stripe (never edit the old one), swap the env var in Netlify, then deploy the matching
`pricing.ts` labels in the same window. Existing subscribers keep the price they signed up
at (their subscription references the old price id), so raises never touch current
customers. Note the org seat editor verifies the team price id, so orgs grandfathered on an
old team price get "contact us" instead of self-serve seat changes.

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

## Paid video course

A one-time purchase that unlocks the video course at `/course/learn/`. The learner area is
prerendered shells plus React islands talking to a Bearer-authed API, the videos live on
Cloudflare Stream, and the final assessment is graded by a background Netlify function.
Authoring formats are in [content-guide.md](content-guide.md); the recording and upload
steps Bradley follows are in [course-production.md](course-production.md).

### The launch flag

`PUBLIC_COURSE_STATUS` ([`src/lib/course/status.ts`](../src/lib/course/status.ts)) decides
how much of the course exists in a given build. Three values:

- **`hidden`**, the default, and what an unset variable means. No public course page is
  built: the nav and footer carry nothing, the home, practice, pricing and FAQ touchpoints
  render nothing, and `/course` is a 404. The learner area at `/course/learn/` still works
  by URL for an enrollment granted from `/admin`, so a pilot can run while the public site
  says nothing about it. Checkout refuses anyone who is not an admin.
- **`preview`**. The sales page, the certification page, their `.md` variants, the llms.txt
  sections, the nav entry and the home, practice, pricing and FAQ touchpoints all appear,
  with "Opens soon" where a price would be. Nothing can be bought.
- **`open`**. Purchase is enabled, and the build asserts the offer is real: every launch
  token in [`src/data/course.ts`](../src/data/course.ts), `COURSE_PRICE` in
  [`src/data/pricing.ts`](../src/data/pricing.ts) and `launchConfirmed` must all be set, and
  the catalog validator refuses a lesson still playing the stand-in clip or a free preview
  lesson that is not yet published.

Per deploy context: **production stays `hidden` through the pilots.** A `course-beta` branch
deploy carries `open` with Stripe test keys and a test-mode webhook endpoint, and that is
where an end-to-end purchase gets exercised. When you change anything on a public course
surface, run a `hidden` build and a `preview` build locally before pushing. They produce
different page sets, and only one of them is what production serves today.

### Environment variables

| Variable | Scope | Secret | What it does |
|---|---|---|---|
| `PUBLIC_COURSE_STATUS` | Builds | no | The launch flag above. Unset means `hidden`. |
| `STRIPE_PRICE_ID_COURSE` | Functions | no | The one-time price on the "Solution Seeking Course" product. Unset means `/api/course/checkout` answers 503 and nothing else breaks. |
| `CLOUDFLARE_STREAM_API_TOKEN` | Functions | **yes** | Mints the signed playback tokens. Scoped to Stream only, and deliberately a different token from `CLOUDFLARE_API_TOKEN`, so the white-label token never grows a video permission. |
| `CLOUDFLARE_ACCOUNT_ID` | Functions | no | Already set for the white-label work. The Stream API calls need it too. |
| `CLOUDFLARE_STREAM_CUSTOMER_CODE` | Functions | no | The `<code>` in `customer-<code>.cloudflarestream.com`. It appears in every embed URL, so it is not a secret. |
| `COURSE_WORKER_SECRET` | Functions | **yes** | Who may call the grading function. 32 random bytes base64url: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. The SSR function and the sweeper send it as `x-course-worker-secret`; the worker compares it with a constant-time compare. Unset means the worker refuses everything and jobs sit queued. |
| `COURSE_GRADER_MODE` | Functions | no | `worker`, `inline` or `off`. Unset means `worker` on Netlify and `inline` under `astro dev`. `off` leaves jobs queued, which is how the recovery path gets tested. |
| `COURSE_GRADER_MODEL` | Functions | no | The grading model. Defaults to `claude-opus-5`. |
| `COURSE_AWARDS_ENABLED` | Functions | no | Certificates are issued only when this is exactly `true`. It stays `false` until the grader passes its release gate; a pass recorded while it is false is kept and can be awarded later. |
| `COURSE_SAMPLE_FORMS` | Functions | no | Whether the sample assessment form may be assigned. `astro dev` always allows it; set `true` only on the `course-beta` context. |

The grading worker is a Netlify function of its own, so it reads its configuration from the
function environment and not from the site's build. Beside the course variables it needs these,
which the site already sets, all in **Functions** scope: `ANTHROPIC_API_KEY`,
`PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and then `RESEND_API_KEY`, `EMAIL_FROM`
and `ALERTS_TO`, because the worker sends its own failed-job alert rather than asking the
site to.

Netlify itself supplies `URL`, `DEPLOY_PRIME_URL` and `CONTEXT`. The trigger reads all three
so a deploy preview or a branch deploy calls the worker belonging to the deploy that is
running, never production's
([`workerTrigger.ts`](../src/lib/server/course/workerTrigger.ts)).

Keep the combined function environment under about 4 KB. It is a shared budget: every
variable in Functions scope counts against it, not only the course's.

### Stripe

The course is a **one-time** payment rather than a plan, so it sits outside `PLANS` and
`PlanId` on purpose. Set it up in test mode first, then repeat in live mode.

1. **Product and price:** Product catalog → Add product → "Solution Seeking Course", with a
   **one-time** price. Copy the `price_...` id into `STRIPE_PRICE_ID_COURSE`.
2. **Webhook events:** the existing endpoint (`https://solutionseeking.com/api/stripe-webhook`)
   must also subscribe to **`checkout.session.async_payment_succeeded`** and
   **`checkout.session.async_payment_failed`** beside the four events it already carries.
   Without them a bank-debit purchase takes the money and never enrolls anybody.
3. The webhook picks the course branch on `metadata.purchase_intent = course`, tested before
   the organization and personal-subscription paths, so a course purchase can never
   contaminate the `subscriptions` table.

What the enrollment path already survives, all verified: a re-delivered event, a second
purchase started from another tab, and a delivery that died after the charge but before its
ledger row was written. Each of those ends with one enrollment and one charge. A genuine
second payment against an account that is already enrolled is recorded and emails
`ALERTS_TO` a `duplicate_payment` alert, because that one is a refund somebody has to action.

**Refunds.** Money never moves from this site:

1. Refund the payment in the Stripe dashboard.
2. In `/admin` → **Enrollments**, press **Record refund** on that learner's row. Access ends
   immediately and the ledger records who did it.
3. **Reinstate** on the same row puts access back if the refund was a mistake.

One thing to expect in the Stripe dashboard: a learner who buys the course and later
subscribes, or who buys again after a refund, can end up with two Stripe customers, because
`/api/checkout` reuses only the subscription's customer. Search by email address, not by
customer id.

### Cloudflare Stream

One video per lesson. The media baseline and the upload clicks are Bradley's, in
[course-production.md](course-production.md); the operator's half is this:

- Every video has **"Require signed URLs" on**, with one exception: the free preview lesson,
  which has to be watchable without an account.
- The English captions are uploaded on the video itself, and the UID goes into the lesson
  file's `streamUid`.
- **The stand-in clip.** `node scripts/render-placeholder-video.mjs` renders a short "being
  filmed" clip with its own captions. Upload it once with signed URLs on, and put the
  returned UID in `COURSE.placeholderStreamUid`
  ([`src/data/course.ts`](../src/data/course.ts)). Every lesson carrying
  `videoPlaceholder: true` and no `streamUid` of its own plays it, so one upload covers all
  of them.
- **Playback tokens are shared, not per viewer.** One token per video, valid twelve hours,
  cached in `course_stream_tokens` and reused while more than an hour of its life remains, so
  the mint rate stays at a handful a day however many people are watching. Minting uses the
  Stream-scoped token. If a token is ever found shared beyond a learner, the upgrade path is
  per-viewer tokens signed locally with a Stream signing key, written up in
  [`streamUrls.ts`](../src/lib/course/streamUrls.ts).
- Once a UID and the three Stream variables exist, **verify playback on a deploy preview**
  rather than locally. A wrong customer code or an invalid token leaves the player empty,
  because the customer code is the host the embed itself is loaded from
  ([`streamUrls.ts`](../src/lib/course/streamUrls.ts)). Check the embed URL in the page source
  against the code in the Stream dashboard before looking anywhere else.
- **The customer code is also a constant**, `COURSE.streamCustomerCode` in
  [`src/data/course.ts`](../src/data/course.ts). The free lesson page always uses this constant,
  because it embeds the preview video at build time and Builds scope has no reason to carry the
  variable; only the enrolled-lesson server path prefers `CLOUDFLARE_STREAM_CUSTOMER_CODE` when
  that is set. If the code ever changes, change both.

### Course migrations and advisors

The course adds migrations [`0030_course.sql`](../supabase/migrations/0030_course.sql)
(enrollments, the enrollment ledger, progress, check attempts, Stream tokens),
[`0031_course_assessment.sql`](../supabase/migrations/0031_course_assessment.sql) (source
packs, attempts, responses, grading jobs, grades, certificates, review requests), and
[`0032_course_certificates.sql`](../supabase/migrations/0032_course_certificates.sql) (the
certificate email claim column, the audit columns, `issue_course_certificate`,
`revoke_course_certificate`). Apply them before the deploy that needs them, and apply `0032`
specifically before any deploy that carries the certificates work: the certificate reads select
its new columns, and fail against a database that does not have them yet.

```bash
npx supabase db push
npx supabase migration list     # all must show on remote
```

`migration list` only says the file ran. The course puts most of its rules in SQL functions,
and a function that was never created fails at the first grant or the first submit, in
production, with a PostgREST error nobody reads until a learner writes in. So prove the
functions exist and then prove one of them works:

```sql
select proname from pg_proc where proname like '%course%' order by proname;
```

These come back: `admin_change_course_access`, `create_course_attempt`,
`submit_course_attempt`, `claim_course_grading_job`, `finalize_course_grade`,
`fail_course_grading_job`, `retry_course_grading_job`, `issue_course_certificate` and
`revoke_course_certificate`, which the routes call, plus the `course_progress_monotone` trigger
function behind `course_progress`. A short list means a migration ran against a schema that
already had part of it, and the missing function is the one to run by hand from the migration
file.

Then, on the hosted stack, **grant access to one real account from `/admin` and revoke it
again.** That exercises `admin_change_course_access`, the ledger insert, the auth admin
lookup and the service-role grants in one click each, and `course_enrollment_events` shows two
rows with `actor = admin` afterwards. Grant it back if the account is meant to keep access.

Then run the advisors (Dashboard → **Advisors**, or
`npx supabase db advisors --linked`). Expect `rls_enabled_no_policy` on every one of the
twelve course tables. That is the accepted server-write-only pattern, the same one the email
list and the org tables use: RLS on, no policy, and only the service role touching them. Add
the tables to the accepted table in
[Database advisors & accepted findings](#database-advisors--accepted-findings) rather than
"fixing" the finding.

Two checks that prove the claim instead of asserting it:

- Probe every course table with the **publishable** key and confirm each answers 401 or 403.
  Local and hosted have had different default grants before, so a local pass proves nothing.
- The two identity sequences (behind `course_enrollment_events` and `course_check_attempts`)
  and the certificate serial sequence are revoked from `anon` and `authenticated` in the
  migrations. Supabase's hosted bootstrap grants ALL on sequences in `public`, so without
  those revokes the sequences would stay reachable even with their tables locked down.

### Grading, the sweeper and the admin queue

**The path.** A submit writes the attempt's responses and the grading job in one transaction,
then triggers the worker. The worker claims the job for a lease, recomputes the submission
hash (a mismatch is an integrity failure and is never retried), grades with structured
output, checks that every quote in the result is verbatim from the learner's own response,
applies the decision rule, and finalizes with the lock token it claimed under. A stale token
is refused, so a worker that outlived its lease cannot bank a second grade over the top of
the first.

**The time budgets nest**, shortest first: one model call gets 300 s and the SDK retries
nothing; one grade gets 720 s for every call it makes; the lease is 840 s; Netlify's
background limit is 900 s. The function is therefore never killed while it still holds a
lease ([`grader.ts`](../src/lib/server/course/grader.ts)).

**The sweeper.**
[`netlify/functions/course-grade-sweeper.mts`](../netlify/functions/course-grade-sweeper.mts)
runs every ten minutes and re-triggers any job that has sat queued for more than 90 seconds
(a lost hand-off) or has been running past its lease (a dead worker). Whether a job has any
budget left is the claim function's decision, never the sweeper's. **Scheduled functions run
only on published deploys**, so after the first production deploy check the deploy log to
confirm the schedule registered.

**The admin queue** (`/admin` → **Grading**): **Retry** re-queues a failed job with a fresh
budget. **Kick** re-triggers the worker for any job, which is what to press when a hand-off
was lost and you would rather not wait for the sweeper. A job that fails for good emails
`ALERTS_TO` with the job and attempt ids, and the learner gets a panel saying plainly that
this is not a failed attempt, pointing them at course support.

**The result email.** When a grade finalizes, the worker (and the dev server's inline run)
emails the learner "Your assessment result is ready" with a link to the assessment page and
nothing else: no outcome, no score, no quote. It is sent once per job and generation: the
worker first sets `result_email_sent_at` on the job row where it is null, and only the call
that set it sends, under the Resend idempotency key `course-result/<job>-<generation>`. A send
that fails after that claim is logged and not retried, because the result is already on the
page and the dashboard says it is ready. When a learner writes in that no email came, read the
job row: an empty `result_email_sent_at` means the grade never finalized (look at the queue), or
the function had no `RESEND_API_KEY` or `EMAIL_FROM`, which returns before the claim;
a set one means the send was attempted, so the next places to look are the Resend log and the
address on the account. Pressing Kick on a succeeded job sends nothing, since the claim answers
`unavailable` before any email code runs. `RESEND_API_KEY` and `EMAIL_FROM` already carry
Functions scope for the failure alert, so no new variable is involved.

**The certificate email.** A certificate earns "Your certificate is ready" with a link to the
certificate page, sent from every place a certificate can be issued: the worker after a pass
with awards on, the dev server's inline run, and the admin's Issue action. It is sent once per
certificate: whichever call reaches it first sets `email_sent_at` on the certificate row where
it is null, and only the call that set it sends, under the Resend idempotency key
`course-certificate/<id>`. When a learner writes in that no certificate email came, read the
certificate row: an empty `email_sent_at` means no send was ever attempted, and the admin area's
Certificates tab offers a Resend action for exactly that case; a set one means a send was
attempted, so the next places to look are the mail provider's log and the address on the
account. Resend is offered only while the column is empty. `RESEND_API_KEY` and `EMAIL_FROM`
already carry Functions scope, so no new variable is involved.

**Deploy-preview checks**, once the secret is set:

- POST to `/.netlify/functions/course-grade` **without** the secret. The job must be
  untouched and the log must say `course-grade: refused`. The caller sees 202 either way,
  because that is how a background function answers, so the log is the evidence and the
  status code is not.
- The same POST **with** the secret finalizes the job.
- A preview calls its own worker through `DEPLOY_PRIME_URL`, so neither check can reach
  production's function.

**Cost** is roughly thirty cents a grade with a warm prompt cache. The second grade of a run
should show `cache_read_input_tokens` above zero on the job row. If it does not, the cached
prefix has been broken and every grade is paying the cold price.

**What the rate limits guard is spend, not traffic.** `course_start` and `course_submit` are
the two limits that matter, because only those two paths can end in a model call.
`/api/course/progress` deliberately carries none: an autosave is one auth check, one
enrollment read, one row load and one upsert, so a learner hammering it costs database work
on a connection they already hold, never grading money. If that ever shows up in the Supabase
metrics, the answer is a limit tuned to the autosave interval, not a limit copied from the
assessment paths.

**During the pilot there is one sample form, and one exposure per form per learner.** A
learner who does not pass and starts again therefore gets the honest "every assessment form
has been used" message rather than a second run at the same scenario. Support should expect
that question until David's Form A and Form B exist.

### Course access from /admin

`/admin` → **Enrollments** lists every enrollment with its status and where it came from, and
carries four actions:

- **Grant by email.** The learner creates their account first; the grant finds it by address
  through the auth admin API. A grant on a revoked or refunded row reinstates that row rather
  than making a second one.
- **Revoke**, for access that should stop without a refund.
- **Record refund**, the second half of the Stripe refund above.
- **Reinstate**, which undoes either of those.

Every action writes a `course_enrollment_events` row with `actor = admin` and the admin's own
user id, so the ledger says who changed what and when. What the learner sees afterwards:
"Access to the course has ended for this account" on both the sales page and the dashboard,
and every course endpoint answering 403 with the reason.

### Certificates from /admin

`/admin` → **Certificates** searches by serial, email or version. Below the search box, before
the list of issued certificates, a pending list surfaces any pass with no certificate yet:
`finalize_course_grade` only issues one when awards are on, so a pass recorded while they were
off waits here until an operator acts on it.

- **Issue**, for a pass in the pending list. One that already has a certificate is reported,
  not refused.
- **Revoke** asks for a reason first. The verification link goes dark the moment it commits,
  and there is no undo in the admin area.
- **Rename** fixes a typo the learner reports after confirming their own name. The confirmation
  stands; only the printed name changes.
- **Resend** sends the certificate email again, for one that went missing the first time. It
  reuses the original claim on `email_sent_at`, so a second press is safe.

Revoke, Rename and Resend all apply only to an active certificate; a revoked row shows its
reason and none of the three. The **Emailed** column carries the same `email_sent_at` the
certificate email above reads for support, so an operator can see at a glance whether Resend
has anything to do.

The verify page at `/course/verify/<token>` needs no sign-in and is not gated by
`PUBLIC_COURSE_STATUS`. A certificate printed and shared months ago still has to resolve
whatever the sales page happens to be doing on the day someone opens the link.

`COURSE_AWARDS_ENABLED` stays `false` on every deploy, `course-beta` included, until 3d's grader
benchmark clears it. Nothing is lost while it is off: a pass just waits in the pending list
above until an operator presses Issue.

### Registering the course events

Course events follow the same four-place rule as every other event, and the mechanics are in
the GTM and GA4 sections below. What to add:

1. **The GTM custom-event trigger regex** gains
   `course_viewed|enrollment_ready|lesson_completed|module_completed|assessment_submitted|grade_ready|grading_error|certificate_issued`.
   An event missing from that regex reaches the dataLayer and dies there, with no error
   anywhere. `certificate_issued` carries no parameters, so it needs nothing added under GA4
   custom dimensions below.
2. **GA4 custom dimensions** (event-scoped): `course_id`, `sale_status`, `lesson_id`,
   `module_id`, `content_version`, `attempt_id`, `form_id`, `result`. See
   [4. GA4 UI setup](#4-ga4-ui-setup). Without them the parameters are collected and cannot
   be reported on.
3. **GA4 key events**: `course_enrolled`, which the Stripe webhook already sends server-side
   through the Measurement Protocol the same way `subscription_completed` goes, and
   `assessment_submitted`.
4. **Google Ads**: import `course_enrolled` as a **secondary** conversion until a course
   campaign exists. It is the money, but at pilot volume as a Primary it would make CPA
   meaningless.

### Ready to open checklist

Phase 4 of the course plan, and most of it cannot be done by whoever wrote the code:

- [ ] Every launch token and `launchConfirmed` set in `src/data/course.ts`, proved by running
      an `open` build (the assertion fails the build otherwise).
- [ ] `COURSE_PRICE` in `src/data/pricing.ts` agrees with the live Stripe price, and
      `STRIPE_PRICE_ID_COURSE` points at that price.
- [ ] The two async payment events on the live webhook endpoint.
- [ ] Every lesson video signed except the preview lesson, captions on all of them, and a
      Cloudflare spend alert set.
- [ ] Migrations applied to the hosted project, advisors clean apart from the documented
      acceptances.
- [ ] The voice audit done on everything the course added: walk the dash and AI-tell audit in
      [change-checklist.md](change-checklist.md), not just the new pages but the FAQ and pricing
      copy the course edited.
- [ ] The four-place analytics work done, and `course_enrolled` seen arriving in GA4
      DebugView with the same `client_id` as the browser session.
- [ ] One real live purchase by David, then a refund, with the revocation path watched end to
      end.
- [ ] Sitemap and `robots.txt` verified: the public course pages in, the learner area out.
- [ ] The OG cards for `/course` and `/course/certification` render.
- [ ] `llms.txt` carries its course section.
- [ ] `course` and `certification` removed from the B2B campaign's negative keywords (see
      [ads-campaign.md](ads-campaign.md#3-negative-keywords)); they were negatives only because
      there was nothing to sell those searchers.
- [ ] The support inbox staffed to the review target in `COURSE_TOKENS`.
- [ ] [status.md](status.md) and the screenshots in `docs/features/course/` brought up to
      date.

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
   `cta_location`, `cta_label`, `destination`, `agent`, `tier`, `plan`, `mode`, `mode_id`,
   `demo_id`, `method`, `from_anon`, `message_index`, `index`, `value`, `currency`,
   `source`, `helpful`, `consented`.

   > `mode` and `mode_id` are two different parameters and both are needed. `mode_id` is
   > carried by `mode_viewed`; `mode` is carried by `anon_chat_started`,
   > `first_message_sent` and `starter_clicked`. `mode` was missing from this list while
   > three events were already sending it, so mode-level attribution on the events that
   > matter most was unreportable.
3. **Trigger → Custom Event**, event name (regex enabled). **This must list EVERY event in
   the union in [`src/lib/analytics.ts`](../src/lib/analytics.ts).** An event missing from
   this regex is pushed to the dataLayer and then dies there: it never reaches GA4, and
   nothing anywhere reports an error.

   > This is not hypothetical. The regex used to omit `email_captured`, `anon_chat_started`,
   > `team_enquiry_submitted`, `feedback_given` and `testimonial_submitted`, which meant the
   > **lead-magnet conversion was invisible in GA4** while the code fired it perfectly. If
   > you add an event to the union, add it here in the same breath.

   ```
   ^(cta_clicked|demo_viewed|mode_viewed|signup_started|signup_completed|anon_chat_started|starter_clicked|first_message_sent|message_sent|free_limit_reached|checkout_started|checkout_abandoned|checkout_success_viewed|team_enquiry_started|team_enquiry_submitted|email_captured|feedback_given|testimonial_submitted)$
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
  `checkout_started`, `free_limit_reached`, `first_message_sent`, `email_captured`,
  `team_enquiry_submitted`.

  > `team_enquiry_submitted` was missing here, and it is the **only** conversion the Business
  > campaign can produce: that campaign sells seats through a conversation, not a checkout, so
  > with this unmarked it had nothing to convert on and nothing to bid toward. Import it to
  > Google Ads as a conversion action too, or the campaign optimises against silence.

- **Admin → Custom definitions → Create custom dimension** (event-scoped) for
  `cta_location`, `tier`, `plan`, `agent`, `mode`, `mode_id`, `demo_id`, `source`, `index`.
  Without this, the parameters are collected but **cannot be reported on**.

  > `mode` is not `mode_id`. `mode_id` rides `mode_viewed` (which mode page was seen); `mode`
  > rides `anon_chat_started`, `first_message_sent` and `starter_clicked` (which mode someone
  > actually started talking in). `mode` was never registered, so "which mode converts" has
  > been unanswerable for every event that matters.
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

A small Search test, run to **buy data, not customers**. At $8/month the CAC maths does not
close, and roughly zero to two subscriptions from a $300 budget is the *expected* outcome.
Judge the consumer test on **cost per started conversation**, never on subscriptions. A separate
**B2B campaign** points at `/for-business` and is judged on `team_enquiry_submitted` (a seated team
is worth chasing as a lead). The full asset list, and the zero-impression post-mortem, live in
[ads-campaign.md](ads-campaign.md).

> **If impressions are ~0, it is almost always the bid strategy, not the keywords.** The first live
> run got 2 impressions in 30 days because the CPC cap ($2.50) was below the ad-rank reserve for
> these premium verticals, and then switching to **Maximize Conversions with zero conversions** in
> the account made Smart Bidding bid near-nothing. Fix: **Maximize Clicks with a real CPC cap
> (~$10), never Smart Bidding until 15-30 conversions exist,** and Auto-apply OFF.

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
- **Bidding: Maximize Clicks with a max CPC cap (~$10 consumer, ~$14 B2B).** NOT Maximize
  Conversions / Target CPA: Smart Bidding needs roughly 15-30 conversions to learn, and the account
  has 0. Maximize Clicks needs no conversion history. The $2.50 cap the first run used was below the
  auction reserve, which is why it never served.
- **Budget: ~$15/day (consumer), ~$20/day (B2B), 21 days.** Put the end date in a calendar.
- **Consumer ad groups point at their mode page** (manager → `/practice/modes/manager`, co-worker →
  `/practice/modes/coworker`, partner, parent); the **B2B campaign points at `/for-business`**. Never
  the homepage.
- **Negatives, day one (consumer):** pdf, template, script, letter, jobs, salary, hiring, fire,
  termination, "write up", lawsuit, attorney, hr complaint, reddit, meme, chatgpt. (NOT `free` — the
  funnel is free-to-try and the ads say so; blocking it suppressed volume.)
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
