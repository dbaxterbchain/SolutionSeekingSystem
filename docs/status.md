# Project Status

_Last updated: 2026-07-12_

## At a glance

| | |
|---|---|
| **Current phase** | Phase 4 shipped (demo library + context seeding + conversation Modes); marketing/conversion work ongoing |
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
- [ ] Verify in Google Search Console + Bing Webmaster (DNS TXT) and submit `/sitemap-index.xml`.

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
- [ ] **P2 — Anonymous trial**: let visitors send 3 messages with no account (Supabase anon
      sign-in keeps the same user id on conversion, so the conversation and counter survive
      signup for free), then convert. IP rate limit + kill switch for API cost.
- [ ] **P3 — Pricing**: single source of truth (price is currently hardcoded in ~8 files),
      annual plan, team enquiry tier, `/pricing` page.
- [ ] **P4 — Email capture**: no list exists today, and the PDF guide is given away with zero
      capture. Resend + a `/guide` landing page.
- [ ] **P5 — Polish**: social proof (there is none), a real testimonial collector, Search
      Console + Bing verification.
- [ ] Then: SEO/community/AEO channels, and only after that a small (~$300-500) paid test
      aimed at email capture rather than direct subscriptions.

## Open questions / decisions

- Brand fonts — buy licensed faces or keep the free stand-ins?
- Whether to add a print stylesheet for the guide.
- ~~Where (if anywhere) to store AI conversation data in Phase 3.~~ → Decided: Supabase
  `chat_sessions` table, user-owned with Row-Level Security; users can delete
  conversations from the account page.
