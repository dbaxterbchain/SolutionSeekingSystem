# Project Status

_Last updated: 2026-07-13_

## At a glance

| | |
|---|---|
| **Current phase** | Growth plan P1-P5 shipped (measurement, anonymous trial, pricing, email capture, social proof + testimonial collector). Next: SEO/community channels, then a small paid test. |
| **Live URL** | https://solutionseeking.com (apex is primary; www and the netlify.app subdomain 301 to it) |
| **Build health** | `npm run build` ✅ · `npm run check` ✅ (0 errors) |
| **Hosting** | Netlify (Beanchain team), site `solution-seeking-system` |

## Done — Phase 1 (Teaching Hub + Showcase)

- ✅ Astro + Tailwind + MDX + React + Netlify scaffold
- ✅ Brand design system from logo/typography (tokens, fonts, components)
- ✅ Zod-typed content collections (principles, protocol, tools)
- ✅ All content authored from the source guide:
  - System overview + Purpose/Vision + Philosophical Foundations + glossary
  - Communication Protocol — 3 step pages with the worked example
  - 12 Wisdom Principles (uniform 6-part format)
  - 4 Leadership Tools + "build your own" guidance
- ✅ Pages: Home, System, Protocol (+3), Principles (+12), Tools (+4), Practice, About, 404
- ✅ Responsive header/nav, footer, SEO meta, accessibility skip-link
- ✅ Deployed to Netlify (28 pages prerendered)
- ✅ Project documentation (`docs/`)

## Next up

### Immediate
- [x] Link the GitHub repo to Netlify for continuous deploys (see [deployment.md](deployment.md)).
- [x] Point the custom domain at the Netlify site — live at **solutionseeking.com** (apex primary).
- [ ] Confirm real brand fonts (currently using close free stand-ins: Anton/Poppins/Inter).
- [ ] **Verify in Google Search Console + Bing Webmaster, submit `/sitemap-index.xml`, and link
      GA4 ↔ Search Console.** Open since before the demos and modes shipped, which means Google
      may not yet know those ~48 pages exist. The code side is done (set
      `PUBLIC_GOOGLE_SITE_VERIFICATION` / `PUBLIC_BING_SITE_VERIFICATION`, or use DNS TXT); the
      account side is a 20-minute job that nothing else can substitute for. The GA4 link is what
      makes "which query led to a subscription" answerable at all. See
      [deployment.md](deployment.md#search-console--bing-verification).

### Phase 2 — Interactive practice tools ✅ _(done)_
- [x] Guided Introspection worksheet — `/practice/introspection` (7-step stepper, localStorage, copyable prep summary)
- [x] Conversation Planner — `/practice/conversation-planner` (stage checklist, goals, question bank, listening reminders)
- [x] Solution Builder — `/practice/solution-builder` (live scoring vs. Actionable/Testable/Effective/Time-bound + equity check)

All three are React islands (`src/components/react/*.tsx`) hydrated with `client:load`; state persists in `localStorage` for everyone (nothing leaves the browser unless signed in and saved).

### Accounts (Supabase) ✅ _(done)_
- [x] Email/password + Google sign-in (`/account`) via `@supabase/supabase-js`, entirely client-side — the site stays static (no SSR/Functions). See [`src/lib/supabase.ts`](../src/lib/supabase.ts), [`AuthMenu.tsx`](../src/components/react/AuthMenu.tsx), [`AccountView.tsx`](../src/components/react/AccountView.tsx).
- [x] **Nothing is gated** — the whole site and all three tools remain fully usable while logged out. Accounts exist so Phase 3 AI tools can go behind a paywall later.
- [x] Signed-in users can **Save** an introspection/plan/solution and review them from the account library. Backed by a `saved_sessions` table with Row-Level Security ([`supabase/migrations/0001_saved_sessions.sql`](../supabase/migrations/0001_saved_sessions.sql)). Tools reopen a saved item via `?load=<id>`.
- Env vars: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` (publishable key — safe in the client; RLS protects data). Set locally in `.env` and in Netlify.
- **Supabase setup + deployment process** (apply migrations, auth providers, redirect URLs, local-stack notes) is documented in [deployment.md](deployment.md#supabase-accounts--saved-data). Remaining one-time config: apply the migration, enable Email + Google providers, and add the redirect URLs.

### Tool touch-ups ✅ _(done)_
- [x] Solution Builder now shows a text output panel (like the other two), copy is no longer gated behind completion.
- [x] Every tool has a **Start over** reset control.

### SEO + LLM discoverability ✅ _(done 2026-07-04)_
- [x] `@astrojs/sitemap` → `/sitemap-index.xml` (excludes `/account`, `/404`); `robots.txt` endpoint welcomes all crawlers incl. AI bots, disallows `/account`.
- [x] **llms.txt layer** ([llmstxt.org](https://llmstxt.org)): `/llms.txt` (curated index), `/llms-full.txt` (entire methodology as one markdown doc, ~15k tokens), plus per-page markdown variants (`/principles/<slug>.md`, `/protocol/<step>.md`, `/tools/<tool>.md`). All generated at build time from the content collections via [`src/lib/llms.ts`](../src/lib/llms.ts) — single source of truth, reusable as Phase 3 agent grounding context.
- [x] **JSON-LD structured data** via [`src/lib/schema.ts`](../src/lib/schema.ts) + `<JsonLd>`: WebSite/Organization (home), HowTo (protocol), Article/LearningResource + FAQPage + breadcrumbs (principles), Article + breadcrumbs (protocol steps, tools), DefinedTermSet glossary (system), WebApplication (practice tools), AboutPage + PDF DigitalDocument (about).
- [x] **Per-page OG images**: `astro-og-canvas` generates a branded 1200×630 card per page (`/og/<path>.png`); BaseLayout derives the URL by convention and adds `og:site_name`, locale, image dims, theme-color, apple-touch-icon.
- [x] Canonical definition string (`systemDefinition` in [`src/data/concepts.ts`](../src/data/concepts.ts)) quoted on home + llms.txt + schema; protocol `requires` sidebars now link to their principle pages; `/account` + `/404` are `noindex`; immutable caching for `/_astro/*` in `netlify.toml`.
- Post-domain-connect: verify in Google Search Console + Bing Webmaster (DNS TXT) and submit `/sitemap-index.xml`.

### Phase 3 — In-site AI agents ✅ _(done 2026-07-04)_
- [x] Guide (`/practice/guide`) & Mentor (`/practice/mentor`) as native streaming chat via Astro server endpoints (Netlify Functions → Anthropic API, `claude-sonnet-5`), replacing the external ChatGPT links.
- [x] Responses grounded in the content collections (same serializers as `/llms-full.txt`, via [`src/lib/server/agents.ts`](../src/lib/server/agents.ts)) with Anthropic prompt caching on the ~15k-token grounding block.
- [x] **$5/month paywall**: Stripe Checkout + Customer Portal + webhook (`/api/checkout`, `/api/billing-portal`, `/api/stripe-webhook`). Signed-in users get **10 lifetime free messages** first. Entitlements (`subscriptions`, `ai_usage`) are server-written only (service role); browser has read-only RLS access — see migrations 0003/0004.
- [x] Conversations saved to the user-owned `chat_sessions` table (RLS), resumable via `?chat=<id>`; account page shows subscription status + chat history.
- Env vars (server-only): `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `SUPABASE_SERVICE_ROLE_KEY` — setup steps in [deployment.md](deployment.md#phase-3--ai-assistants--subscription).
- ✅ One-time config done (2026-07-05): migrations 0003/0004 applied to the hosted project (and local stack), Stripe product/price/webhook/portal configured, all five env vars set in Netlify (the three sensitive ones flagged as secret values).

### Phase 4 — Demo library + context seeding ✅ _(done 2026-07-12)_
- [x] **Named context registry**: `/practice/guide?context=<id>` (or mentor) starts a new conversation pre-oriented to a scenario. Public metadata (chip label/description) in [`src/lib/contexts.ts`](../src/lib/contexts.ts); model-facing seed text server-only in [`src/lib/server/contexts.ts`](../src/lib/server/contexts.ts), injected as a **third system block** after grounding+persona so the shared prompt-cache prefix stays intact. Unknown/mismatched ids silently degrade to a plain chat. The `persona` override field on a seed is the hook for future specialized variants (boss, teacher, parent, couples).
- [x] Context persists on `chat_sessions.context` (migration [`0005_chat_context.sql`](../supabase/migrations/0005_chat_context.sql), **applied to hosted project 2026-07-12**) so resumed conversations keep their orientation; ChatView shows a scenario chip and sends the id on every request (survives the 30-message trim).
- [x] **Demo library** at `/practice/demos`: 7 hand-crafted, fictional, annotated transcripts (4 Guide, 2 Mentor, 1 safety-boundaries) as a `demos` MDX content collection, rendered with static chat-bubble components (`src/components/demo/`). Each has a Before/After transformation panel, an expected/unacceptable behavior `spec` in frontmatter (doubles as a future QA harness), and a persistent **"Use this process with my situation"** CTA into the matching seeded chat. A build-time cross-check fails the build if a demo references an unregistered context.
- [x] Surfacing: "See it in action" section on `/practice`, links on guide/mentor pages, homepage hero link, footer link; OG cards, sitemap, and `/llms.txt` all include the demos.

### Phase 4b — Conversation Modes ✅ _(done 2026-07-12)_
- [x] **8 modes** — Parent, Teacher, Partner, Family, Friend, Manager, Co-worker, Organizer — as registry entries with `kind: 'mode'` ([`src/lib/contexts.ts`](../src/lib/contexts.ts)); each is a ~200-word seed adapting the shared persona to the relationship dynamic (vocabulary, power structure, solution shape, safety posture). No server/API/DB changes needed — the context pipeline from Phase 4 carries them.
- [x] **Safety-aware seeds**: Partner mode routes to DV-specific resources when fear/control appears (mirrors the possible-harassment posture); Parent/Teacher modes handle minors (age first, adult owns the solution, escalate to counselors/reporting protocols on abuse/self-harm signs).
- [x] **SEO landing pages** at `/practice/modes/<id>` (hero targeting situation intent + "when this helps" + embedded seeded ChatView + Mentor CTA + related demos), generated from [`src/data/modes.ts`](../src/data/modes.ts) with build-time registry cross-checks; hub at `/practice/modes`. Mentor gets Parent/Teacher/Manager/Organizer via `?context=`.
- [x] Picker sections on `/practice/guide`, `/practice/mentor`, `/practice`; OG cards, sitemap, `/llms.txt` include modes; ChatView "New conversation" on a mode page now re-seeds the page's mode instead of dropping it.

### Phase 5 — Growth: measurement + conversion 🚧 _(in progress)_

Goal: get people signed up. Paid ads are deferred: at $5/month the CAC math doesn't
close (realistic Google Ads numbers imply a ~$2,000 cost per paying customer against a
~$60 LTV), and until the funnel is measured, ad spend buys clicks we can't attribute.
Lead audience: **workplace leaders**. Full plan (5 phases + channel strategy) was agreed
2026-07-12.

- [x] **P1 — Measurement layer** (done 2026-07-12). [`src/lib/analytics.ts`](../src/lib/analytics.ts):
      one typed `track()` (a discriminated union = the taxonomy), a delegated
      `[data-track-cta]` listener so static pages need no island, and `getGaIds()` (handles
      both the current GS2 and legacy GS1 GA cookie formats). Events: cta_clicked,
      demo_viewed, mode_viewed, signup_started/completed, first_message_sent, message_sent,
      free_limit_reached, checkout_started/abandoned/success_viewed.
      **`subscription_completed` is sent server-side** from the Stripe webhook via the GA4
      Measurement Protocol ([`src/lib/server/ga4.ts`](../src/lib/server/ga4.ts)) — a browser
      event would miss closed tabs and ad blockers unevenly by device and bias ad bidding.
      GA client/session ids are stitched through Stripe metadata so those server conversions
      are attributable. Abandoned checkouts now return to the page they left from and show a
      recovery banner. **Requires GA4 + GTM setup** — see [deployment.md](deployment.md#analytics--conversion-tracking-ga4--gtm).
- [x] **P2 — Anonymous trial** (done 2026-07-13). A visitor can send **3 messages with no
      account**; running out prompts registration (worth the remaining 7 of 10 free messages)
      rather than a payment. Supabase anonymous sign-in keeps the **same user id** on
      conversion, so the conversation and the message counter survive signup with no data
      migration — verified against a live database, including that existing RLS already
      covers anonymous users. One-click Google upgrade uses `linkIdentity` so the
      conversation never leaves the screen. Cost control: 3-message allowance, 25 anonymous
      messages/IP/day (`rate_limit` table + `bump_rate_limit` RPC, migration `0006`, IPs
      stored only as salted hashes, fails open), and an `ANON_TRIAL_ENABLED` kill switch.
      Anonymous users are blocked from checkout and the billing portal (no email = an
      unrecoverable subscription). **Requires Supabase dashboard setup** — see
      [deployment.md](deployment.md#anonymous-trial-chat-before-signing-up).
- [x] **P3 — Pricing** (done 2026-07-13). [`src/data/pricing.ts`](../src/data/pricing.ts) is now
      the only place a price or free-message count exists; the ~10 hardcoded copies (including
      three JSON-LD `offer.price` values and three separate `FREE_LIMIT = 10` constants) are
      gone, so a price change can no longer make the site lie. Adds an **annual plan ($50/yr,
      two months free)** and a **`/pricing` page** (free-forever card, plan cards, FAQ with
      `FAQPage` schema, `Product`/`AggregateOffer` schema, OG card, nav + footer + llms.txt).
      Checkout takes a `plan` id resolved server-side against an allowlist
      ([`src/lib/server/plans.ts`](../src/lib/server/plans.ts)) — **a client-supplied Stripe
      price id is never trusted**, or anyone could subscribe for a cent. Team tier is an
      enquiry form (migration `0007`, server-write-only, honeypot + IP rate limit); self-serve
      seats are deliberately not built until there's demand. **Requires a $50/yr Stripe price
      and `STRIPE_PRICE_ID_ANNUAL` in Netlify**, plus migration `0007`.
      ⚠ Team enquiries currently land in the `team_enquiries` table with **no notification
      email** — read them from the table until P4 adds the alert.
- [x] **P4 — Email capture** (done 2026-07-13). There was no list at all, and the complete-guide
      PDF was handed out with **zero** capture, so every downloader was lost. Now `/guide` is a
      real lead-magnet landing page, and **double opt-in is done as one click**: the "Download
      the guide" button in the delivery email *is* the confirmation link
      (`/api/confirm?token=…` → marks confirmed → 302 to the PDF). Only a real address gets the
      guide, with no step that feels like a step. **Soft gate:** the raw PDF URL still works and
      stays in llms.txt (it's indexed, and AI agents aren't leads).
      `email_subscribers` (migration `0008`) is server-write-only; verified the browser gets
      `permission denied` and cannot forge a row. `source` records **first touch** and isn't
      overwritten on re-submit, so you can tell which capture point converts. One-click
      unsubscribe accepts GET and POST. Team enquiries now **email you** (closing the P4 gap
      from P3). Sends go through Resend ([`src/lib/server/email.ts`](../src/lib/server/email.ts))
      with idempotency keys so a retry can't email twice.
      **Requires** `RESEND_API_KEY`, `EMAIL_FROM`, `TEAM_ENQUIRY_TO` in Netlify, a verified
      domain in Resend, and migration `0008`.
      ⚠ No drip sequence, deliberately: ship the one email, read the click-through, and let
      that decide what email two should be.
- [x] **P5 — Conversion polish** (done 2026-07-13). The site had **no social proof anywhere**,
      and the honest fix is to earn some rather than invent it.
      **Home page proof section**: the turning point of the featured demo, rendered as the
      exchange it actually was, carrying the same "fictional demonstration" disclaimer as the
      demo pages. The excerpt lives in the demo's frontmatter and **the build fails if it is
      not verbatim in that demo's transcript** ([`src/lib/demoExcerpt.ts`](../src/lib/demoExcerpt.ts)) —
      a quote that has drifted from its source is a fabricated testimonial wearing the clothes
      of a real one, and real conversations are the only proof we have. Plus an honest
      provenance band (built at Beanchain to run a real company; the system is free; no
      invented praise).
      **Testimonial collector**: "Did this help?" appears once, when a conversation reaches a
      prep summary (so the protocol actually ran to the end). The rating posts **on click**,
      before any form, because recording only on submit would discard the opinion of everyone
      who will not write prose — which is most of them. "Not yet" asks what was missing, and
      that answer is worth more than a testimonial we never get. Publishing needs **both**
      explicit consent and hand approval, and the `testimonials` table's check constraint makes
      it impossible to approve a row without them (migration `0009`).
      **Search Console / Bing**: `PUBLIC_GOOGLE_SITE_VERIFICATION` and
      `PUBLIC_BING_SITE_VERIFICATION` render verification meta tags when set; DNS TXT works too.
      Still needs the one-time verification + sitemap submit + GA4 link (see below).
- [x] **Grant hardening** (2026-07-13, found while testing P5). Migrations 0006-0009 each claimed
      "no grants to anon/authenticated". **On the hosted project that was false**: Supabase's
      default privileges grant ALL on every new `public` table to `anon` and `authenticated`, so
      `rate_limit`, `team_enquiries`, `email_subscribers` and `testimonials` were reachable by any
      browser holding the publishable key, and RLS-with-no-policies was the *only* thing between
      the email list and the internet. RLS was holding (verified against production: reads return
      zero rows, writes raise 42501), so this was a missing second layer, not a breach — but one
      careless `using (true)` policy would have published the lot. Migration `0010` revokes those
      grants and stops the default privileges re-granting on the next table. Migration `0011`
      makes the entitlement tables **read-only from the browser at the grant level**, which is
      what CLAUDE.md's "entitlements are server-written only" has always claimed; before it, a
      single mistaken policy would have let any browser grant itself a subscription. Verified
      after: the browser can still read its own usage and subscription and manage its own
      conversations, and can no longer write either entitlement table.
- [x] **Admin area, testimonial display, and concierge organizations** (done 2026-07-13).
      **`/admin`** (client-gated, `noindex`, sitemap-excluded, robots-disallowed, deliberately
      unlinked) manages feedback and testimonials, organizations, the email list, and team
      enquiries. Access is an `ADMIN_EMAILS` allowlist that **fails closed when unset**. The
      page is public HTML carrying no data: auth is a Bearer token in localStorage, so no page
      can be gated before it renders, and the whole boundary lives in `requireAdmin()` on every
      `/api/admin/*` route. Admin reads never emit `email_subscribers.token` (a capability: it
      unsubscribes an address) or any `ip_hash`.
      **Testimonials** are read from the database at build time
      ([`src/lib/server/testimonials.ts`](../src/lib/server/testimonials.ts)) and appear on the
      home page and `/pricing`, or **not at all** when there are none. Approving does not
      publish: a "Publish to site" button fires a Netlify build hook, so approving stays a
      private editorial act while publishing is the deliberate one. The `demoExcerpt.ts` sibling
      *throws* on bad data; this one must **never** throw, because a database blip must not take
      the marketing site down. The "No invented praise" card was reworded so the page does not
      contradict itself once real quotes sit above it.
      **Concierge organizations** (migration `0012`): an operator creates an org, sets seats, and
      adds member emails; a member gets unlimited access by signing in with a listed address
      (`claim_org_seat`, SECURITY INVOKER with execute revoked from anon/authenticated). Billing
      is by hand; the Stripe webhook now syncs an org's status by `stripe_customer_id`, without
      which **a lapsed organization would keep access forever**. Self-serve seats stay unbuilt:
      still zero validated demand. Runbook in [deployment.md](deployment.md#teams-how-to-onboard-an-organization).
      **The bug this caught before it shipped:** `ChatView` decided the paywall from a browser
      read of `subscriptions`. An org member has no such row, so once their 10 free messages were
      gone the client would have **replaced the composer with a paywall**, locking them out of a
      product their employer pays for, with no request ever reaching the server to say otherwise.
      Entitlement is now asked of the server (`/api/entitlement`, the same `checkEntitlement()`
      `/api/chat` enforces), so the client cannot hold an opinion that differs from the server's.
      That also took the unfiltered `.maybeSingle()` reads of `subscriptions` from 4 call sites
      to 1. Verified against a live database: a user at 10/10 messages goes from `blocked` to
      `subscriber via org` the moment their email is added, seats are capped, one person holds
      one seat, a canceled org drops everyone, an unconfirmed address can never claim a seat, and
      the anonymous trial is untouched.
      **Requires** `ADMIN_EMAILS` and `NETLIFY_BUILD_HOOK_URL` in Netlify, migration `0012`, and
      `SUPABASE_SERVICE_ROLE_KEY` **scoped to Builds** (not only Functions), or the testimonials
      section silently vanishes from a green deploy.
- [ ] Then: SEO/community/AEO channels, and only after that a small (~$300-500) paid test
      aimed at email capture rather than direct subscriptions.

## Open questions / decisions

- Brand fonts — buy licensed faces or keep the free stand-ins?
- Whether to add a print stylesheet for the guide.
- ~~Where (if anywhere) to store AI conversation data in Phase 3.~~ → Decided: Supabase
  `chat_sessions` table, user-owned with Row-Level Security; users can delete
  conversations from the account page.
