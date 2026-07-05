# Project Status

_Last updated: 2026-07-05_

## At a glance

| | |
|---|---|
| **Current phase** | Phase 3 complete (in-site AI Guide & Mentor + $5/mo subscription) — pending one-time Stripe/Supabase/Netlify config |
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

## Open questions / decisions

- Brand fonts — buy licensed faces or keep the free stand-ins?
- Whether to add a print stylesheet for the guide.
- ~~Where (if anywhere) to store AI conversation data in Phase 3.~~ → Decided: Supabase
  `chat_sessions` table, user-owned with Row-Level Security; users can delete
  conversations from the account page.
