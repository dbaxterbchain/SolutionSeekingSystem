# Project Status

_Last updated: 2026-07-24 (org self-service)_

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
- [x] **Google Search Console + Bing: verified by DNS TXT** (2026-07-13). DNS rather than the
      meta tag, which is the better of the two: it verifies the whole domain and survives a
      redesign. `PUBLIC_GOOGLE_SITE_VERIFICATION` / `PUBLIC_BING_SITE_VERIFICATION` therefore
      stay **unset**, and BaseLayout simply omits the tags. They remain as the fallback for
      anyone who cannot touch DNS.
- [ ] **Still to do in Search Console: submit `/sitemap-index.xml`, and link GA4 ↔ Search
      Console.** Verification only proves ownership; it does not tell Google what exists, and it
      does not join queries to conversions. The sitemap is live and healthy (50 URLs: all 8 mode
      pages, all 7 demos, `/guide` and `/pricing`; `/admin` and `/account` correctly excluded).
      The GA4 link is what makes "which query led to a subscription" answerable at all.

### Dashboard, documents & specialized assistants (in progress, 4 phases)
A subscriber-only **/dashboard** that makes the whole toolset more productive, then three
new capabilities on top. Planned in four shippable phases: **A** dashboard shell (Guide +
Mentor, in-place mode switching, cross-agent history), **B** document uploads (PDF/docx/
txt/md, extracted server-side, attachable to chats), **C** Specialized Assistants (base
agent + mode + custom instructions + knowledge docs, shareable org-wide by a new `manager`
role), **D** white-label pages at `/a/<org-id>/<slug>` (org-branded, per-user private
history, optional customer CNAME by concierge). Full plan in the approved design.

- [x] **Phase A — dashboard shell** (built, not yet deployed). The public `ChatView`'s
      reusable core was extracted into shared modules (`src/lib/chatStream.ts`, and
      `src/components/react/chat/{Markdown,MessageBubble,Composer}.tsx`) with public pages
      behaving identically; `/dashboard` (`DashboardView` + `dashboard/Sidebar`) reuses them
      for a launcher + chat surface with **in-place** mode switching (no page navigation,
      unlike the public mode pages) and history across both agents. Subscribers only:
      non-subscribers get an upsell (reusing the checkout flow), and a `DashboardNavLink`
      island shows the nav link only to subscribers (fails closed). Gated the usual three
      ways (noindex, sitemap filter, robots disallow) plus an OG card. No DB/API changes.
- [x] **Phase B — document uploads** (built, hosted migration applied). Subscribers upload
      PDF / Word (.docx) / .txt / .md; the server extracts the text once (`unpdf` for PDF,
      `mammoth` for docx) and stores it in a new server-only `documents` table (RLS on, no
      client grants), with the file in a private `documents` Storage bucket (10 MB cap,
      folder-scoped upload policy so a client can only write its own `<user_id>/` folder).
      Up to three documents attach to any chat message: `/api/chat` resolves the referenced
      documents (own rows only), injects their text into that user turn, and gates the whole
      feature to subscribers. Message assembly moved into one place
      ([chatMessages.ts](../src/lib/server/chatMessages.ts)) that also holds the cache
      breakpoints for Phase C. Migration `0021`; advisors clean (the `documents` findings are
      the accepted server-only-table pattern). Verified in a browser: uploaded a policy file
      and the assistant answered a question whose answer is only in that file.
- [x] **Phase C — specialized assistants** (built, hosted migration applied). Subscribers
      save an assistant (base agent + optional mode + custom instructions + up to 5 knowledge
      documents); a new `manager` role on `org_members` (set from /admin) can share one
      org-wide, and every member with a seat can use it with private per-user history. The
      setup (instructions + document text) is injected as one deterministic, `cache_control`'d
      block by `buildAssistantSetup`, so the prompt cache hits after the first message and the
      same shared assistant yields the same cached prefix for every user (verified: a 21.5k
      prefix was written once then read from cache on every later send, including a second
      user's). Server-only tables `assistants` + `assistant_documents` (migration `0022`);
      access via `/api/assistants` and the `assistant_id` path in `/api/chat` (owner or org
      member → else 404). **Caught in browser testing and fixed:** the base personas at first
      refused the injected setup as an "injection attempt," so a byte-stable "Specialized
      setup" clause was added to `SHARED_CONDUCT` telling them to adopt a trusted
      `<assistant_setup>` block; after that the assistant answers from its documents. Advisors
      clean; publishable key denied on both new tables.
- [x] **Phase D — white-label pages** (built, hosted migration applied). A manager can
      publish a branded chat page at `/a/<org-id>/<slug>` for a shared assistant or a standard
      Guide/Mentor: title, description, displayed instructions, and an uploaded logo (public
      `branding` bucket). The page renders server-side ([a/[org]/[slug].astro](../src/pages/a/[org]/[slug].astro),
      `prerender=false`, 404 for malformed/unknown/inactive) in a bare
      [WhiteLabelLayout](../src/layouts/WhiteLabelLayout.astro) (noindex, no site header,
      canonical to solutionseeking.com); chatting requires sign-in (no anonymous trial), and
      for specialized-assistant pages `/api/chat`'s org-membership check gates access. Managers
      build and manage pages from a dashboard panel with a copyable link, logo upload, status
      toggle, and CNAME instructions for putting a page on the customer's own subdomain
      (concierge-activated, runbook in [deployment.md](deployment.md#white-label-pages--custom-domains)).
      Migration `0023`; advisors clean; publishable key denied. Verified in a browser: a manager
      created a page, a signed-out visitor saw the branded sign-in gate, and an org member
      signed in and chatted with the assistant, all in the white-label chrome.

**The dashboard initiative (Phases A-D) is complete.** Remaining: the custom-domain concierge
step per customer (manual), and any tuning from real subscriber use.

- [x] **Prod feedback: seat-claim bug, multi-org, and UX polish** (2026-07-21). Fixed a real
      bug found in prod: a member who **also** had a personal subscription never claimed their
      org seat, because `checkEntitlement` returned `subscriber via stripe` before it reached
      the claim (so they showed "hasn't signed in", saw no shared assistants, and no manager/
      white-label tools). Seat-claiming moved into `getOrgMemberships`
      ([src/lib/server/orgMembership.ts](../src/lib/server/orgMembership.ts)) and runs
      regardless of how the user is entitled, claiming **all** matching seats. On top of that,
      **multi-org** (migration `0024`): a person can belong to several organizations and pick
      the active one from a sidebar switcher that drives the shared-assistant list, sharing,
      and the white-label panel; org-scoped endpoints now take an `org_id` and check membership
      per org. Dropped the global-unique-email invariant (kept the per-org unique). Plus UX:
      upload docs from the assistant editor, removed the redundant "New chat", renamed to
      "Create assistant", a proper **mobile drawer** (overlay + scrim, not a push-down panel),
      bounded mobile chat height so the composer pins, touch-visible sidebar controls, and modal
      /popover fixes. Verified in a browser incl. the exact bug repro; screenshots in
      [docs/features/multi-org-dashboard/](features/multi-org-dashboard/).
- [x] **Prod feedback round 2: org-context workspaces, one-click share, header fix** (2026-07-22).
      More prod testing surfaced a confidentiality gap: switching the active org still showed the
      assistants you made under another org, and the document manager showed every document you
      had ever uploaded. Now assistants, documents, **and** conversation history each belong to
      the **workspace** active when they were created (Personal or a specific org), and switching
      the workspace scopes all three. `assistants.org_id` became the workspace (null = Personal)
      and a new `shared` boolean split "belongs to org" from "visible to members"; `documents` and
      `chat_sessions` gained a nullable `org_id` (migration `0025`, FK covering indexes, no new
      functions/RLS-exposed tables → advisor-safe). Owners can **move** an assistant between
      workspaces (moving resets sharing, so nothing is silently shared). **Sharing is now
      one-click** from the assistant's sidebar row (managers), not buried in the editor; the editor
      gained a Workspace selector + a Share-with-members toggle. Also fixed the **white-label chat
      header** smooshing at small widths (name truncates on its own line; the buttons drop below,
      no mid-word wrap, no overflow). Verified end to end in a headless browser with one subscriber
      in Personal + two orgs (manager of one, member of the other): scoping, one-click share,
      manager-tool visibility, document scoping, and the mobile header all confirmed; screenshots in
      [docs/features/org-workspaces/](features/org-workspaces/). Migrations `0025` + `0026` applied to
      hosted (confirmed via `npx supabase migration list`).
- [x] **White-label custom domains: walled garden + branded SSO + self-serve wizard** (2026-07-23,
      shipped + `assistant.bchain.coffee` cut over). Setting up the first real custom domain
      exposed that the old model could not scale: the domain was a Netlify alias of the whole
      site (so `/practice`, `/dashboard`, other orgs' pages all resolved on it), sign-in bounced
      through the main site chrome, every domain needed a hand-edited `netlify.toml` rule plus
      per-host entries in Turnstile (a ~10-host cap) and Supabase's redirect allowlist, and setup
      was 100% concierge. Re-architected onto **Cloudflare for SaaS**: a router **Worker** reads
      `Host` from **KV** (`host -> {org, slug}`) and proxies only `/` to the page (walled garden;
      everything else 302s to `/`), so routing is dynamic with no per-domain config. Auth is
      centralized on the canonical host (the only Turnstile / Supabase-redirect host, forever):
      a branded sign-in on `solutionseeking.com/wl/signin` hands the session to the custom domain
      via a single-use, AES-256-GCM-encrypted, domain-bound code (`wl_auth_codes`, ~60s TTL) →
      `/wl-callback` → `setSession`, so the customer never sees the main site and no domain needs
      an allowlist entry. A **self-serve wizard** in the dashboard (`/api/white-label-domain` +
      `WhiteLabelPanel`) provisions everything with no operator action: enter a subdomain → add one
      CNAME → **Verify** (DoH CNAME check) → Cloudflare custom hostname (HTTP DCV) + KV write →
      cert polling → **live**, with Remove for teardown. Lifecycle on
      `white_label_pages.domain_status` (`none→pending→verifying→active|error`); migration `0026`
      also makes `custom_domain` unique. Verified locally end to end: the SSO hand-off (two
      origins), and the wizard driven in a real browser with provisioning hitting the **live
      Cloudflare account** (all of create/find/delete custom hostname + KV put/delete exercised
      with the real token, then torn down); screenshots in
      [docs/features/white-label-self-serve/](features/white-label-self-serve/). **Shipped:** merged
      to main + deployed; `0026` applied to hosted; `assistant.bchain.coffee` cut over to Cloudflare
      for SaaS (TXT-DCV, zero downtime) and its walled garden + branded SSO verified in production;
      runbook + architecture doc rewritten. **Follow-ups:** remove the now-inert `netlify.toml`
      white-label rewrite once public DNS fully converges, and rotate the Cloudflare API token.
- [x] **White-label branded auth: full methods + sign-out** (2026-07-23). The branded `/wl/signin`
      only did email+password, so anyone who used Google, forgot their password, or had no account
      got bounced to the main site. It now offers the same methods as `/account` (Google,
      email+password, register, forgot-password/recovery), minus the anonymous-trial machinery, with
      one unifying rule: the instant a session exists on the branded page (from any method, a
      returning OAuth/reset redirect, or an already-signed-in canonical session), it is handed to the
      custom domain. Every redirect stays on `solutionseeking.com/wl/signin?page=…`, so it is still
      one centralized auth host (a single `https://solutionseeking.com/**` redirect-allowlist entry
      covers every custom domain). Added a **Sign out** control to the white-label chat
      (`signOut({ scope: 'local' })`). Verified end to end in a headless browser (two origins):
      methods render, register reaches "check inbox", forgot sends, password sign-in hands off, and
      sign-out clears the session; screenshots in [docs/features/white-label-auth/](features/white-label-auth/).
- [x] **Nav CTA, account/saved split, and a For Business page** (2026-07-23). Three touch-ups:
      (1) the primary nav button now reads **Dashboard** for subscribers and stays "Talk to the Guide"
      for everyone else, via a new `NavCta` island (`useEntitlement`); the old subscriber-only
      `DashboardNavLink` was absorbed and removed, so there is one Dashboard entry, not two.
      (2) **/account** is now account-only: a new Profile section (editable display name in
      `user_metadata`, read-only email) plus the existing password and subscription/billing. The
      redundant AI chat history was removed (it lives in the dashboard), and saved practice-tool work
      moved to a new **/saved** page (`SavedWorkView`, reusing `savedSessions` + `useLoadSaved`),
      reachable from the user-icon menu; `/saved` is `noindex` + sitemap-excluded like `/account`.
      (3) A single **/for-business** marketing page (team dashboard, specialized agents, white-label)
      with freshly captured screenshots, JSON-LD + OG card + llms.txt, linked from the footer; the
      pricing team section gained an `id="team"` anchor for the page's CTAs. Verified end to end in a
      browser (subscriber sees Dashboard, signed-out sees Talk to the Guide, account/saved split,
      all marketing images load) and `npm run build`; screenshots in
      [docs/features/for-business/](features/for-business/).
- [x] **SEO / GEO / AEO gap-closing pass** (2026-07-23). The site was already well-instrumented
      (broad JSON-LD, llms.txt + llms-full.txt, per-page `.md` variants, an AI-friendly robots
      route, per-page OG cards); this closed the remaining gaps. **Structured data**: `author`
      (David & Shannon Baxter) on every `learningArticle`, new reusable `collectionPage`
      (`CollectionPage` + `ItemList`) applied to the principles/tools/practice/demos/modes hub
      pages, and a generic `howTo` marking the "adapt the protocol" steps on `/tools`. **GEO**: new
      `.md` variants for `/system`, `/protocol`, and each demo (serializers in `src/lib/llms.ts`),
      wired via `markdownAlt` and pointed to from llms.txt. **AEO**: a new **/faq** answer hub with
      `FAQPage` JSON-LD, its questions/prices sourced from `src/data/faq.ts` + `pricing.ts` so they
      cannot drift (footer + llms.txt + OG card). **Perf**: for-business marketing images moved to
      `src/assets/` and rendered with `astro:assets` `<Image>` (responsive srcset, AVIF/WebP, no
      CLS; the repo's first `astro:assets` use), home hero marked `fetchpriority="high"`. Small
      fixes: `robots.txt` disallows `/saved`; `twitter:title`/`twitter:description` added. Deferred:
      font self-hosting, `Course`/`Review` schema. Screenshots in [docs/features/faq/](features/faq/).

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
- [x] **Trial work follows the user, whatever they do next** (done 2026-07-13). Two bugs, both
      caused by the anonymous trial meeting an account that already existed.
      **Google sign-in was broken for anyone who chatted first.** `google()` called
      `linkIdentity()` whenever the user was anonymous, regardless of whether they pressed Sign
      in or Register, so a returning user (who now carries an anonymous session the moment they
      send a message) had their Google identity attached to a throwaway trial user. Supabase
      refused, correctly, and bounced them back with `email_exists` in the URL, which nothing
      read: an empty login form, no message, no console error. Linking is now used only when a
      trial user is REGISTERING; signing in uses `signInWithOAuth`. `readOAuthRedirectError()`
      surfaces provider failures instead of swallowing them.
      **A trial conversation was stranded when the person already had an account.** Registering
      keeps the same user id, so the conversation follows for free; signing in is a different
      user, and the work stayed behind, unreachable. `/api/claim-trial-work` (migration `0013`)
      re-parents `chat_sessions` and `saved_sessions`, and the caller must prove they hold
      **both** JWTs: possession of the trial's token is what proves the trial was theirs, and
      without it the endpoint would be "hand me any stranger's conversation". `ai_usage` is
      deliberately never merged: a free-message allowance is not transferable, and merging would
      punish someone for trying the product twice. Verified end to end in a browser (chat
      anonymously, sign in, the conversation is in History and the account keeps its own 10 free
      messages) and against a forged token, a non-anonymous token, and an anonymous caller.
      Migration `0013` also makes the `service_role` grants on `chat_sessions`/`saved_sessions`
      **explicit**: the hosted project had them via default privileges and the local stack did
      not, which is the same local-vs-production divergence that hid the grant hole behind
      migrations 0006-0009.
- [x] **Google Ads: made measurable** (done 2026-07-13). The code side of a small US-only Search
      test. **The test buys data, not customers**: expect 0-2 subscriptions from $300-500, and
      judge it on **cost per started conversation** instead.
      **The bug that would have wrecked it:** `email_captured` fired into the dataLayer and
      **never reached GA4**, because the GTM trigger regex omitted it (along with four other
      events). The lead-magnet conversion was invisible while the code looked perfectly healthy.
      Fixed in the docs; it is a GTM UI change.
      **First-touch attribution** ([`src/lib/attribution.ts`](../src/lib/attribution.ts)):
      `gclid`/`gbraid`/`wbraid` plus the UTMs and the landing page, kept in localStorage for 30
      days so they survive the Google OAuth redirect that destroys the query string. Two rules
      that matter: an organic pageview never overwrites a stored ad click, and a real paid click
      always beats a stored non-paid touch (**our own guide email links back with
      `?utm_source=email`** and would otherwise have claimed credit for conversions the ads
      bought). It rides the existing checkout metadata pipe onto the `subscriptions` row
      (migration `0014`), so "which keyword bought a subscription" is one SQL query.
      **The sharpest trap, now closed:** `checkout.ts` sliced every Stripe metadata value at 120
      characters, and **a real gclid is routinely longer than that**. It would have stored a
      plausible, useless click id and failed a conversion import months later. Click ids now get
      Stripe's full 500. Verified with a 195-character id: it arrives character for character.
      **Landing pages**: on a 390px phone the hero ate 639px and the chat sat 1.3 screens down.
      The situations card moved below the chat, the hero was trimmed to 471px, and a
      "Start the conversation" button jumps to a `#chat` anchor that clears the sticky header.
      Trust signals (shared `ProvenanceBand`, and testimonials when they exist) sit **below** the
      chat, because anything above it pushes the composer off the screen.
      **Email capture at the wall**: `UpgradeAnonCard` now offers the guide by email as a
      collapsed, subordinate option, so a paid visitor who will not make an account is no longer
      worth nothing. Source `chat_wall`, added to **both** source lists.
      **Deliberately not built:** Performance Max ("asset groups"), Smart Bidding, Consent Mode
      v2 and a cookie banner (US-only), the Ads API for offline import (a CSV moves 0-3 rows in
      ten minutes).
      **Before spending a cent**, walk the funnel on a real phone: the production funnel has
      never carried real traffic, and a total Google sign-in blocker survived in it until it was
      found by hand. Runbook: [deployment.md](deployment.md#google-ads).
- [x] **Database hardening pass from the Supabase advisors** (2026-07-20). Ran the security and
      performance advisors against the hosted project (35 findings) and fixed everything fixable
      in six migrations (`0015`–`0020`): every RLS policy now evaluates `(select auth.uid())`
      once per query instead of once per row and names its audience (`to authenticated` — the
      anonymous trial is unaffected, anonymous users carry that role); all five functions pin
      `search_path`; `citext` moved out of the API schema into `extensions`; the four
      `on delete set null` foreign keys got covering indexes so deleting a user or a chat does
      not seq-scan the child tables; `bump_rate_limit` now opportunistically purges buckets
      older than 48h (the `rate_limit` table had **no cleanup at all** and grew forever — that
      missing purge was also why its `window_start` index sat "unused"); and the hosted-only
      `rls_auto_enable`/`ensure_rls` event trigger (dashboard-added, in no migration) is
      formalized verbatim with its default PUBLIC execute grant revoked — the same
      local-vs-hosted drift class as the 0010 episode, caught by an advisor this time. The
      remaining findings are intentional and documented in
      [deployment.md](deployment.md#database-advisors--accepted-findings). The two
      dashboard-only items (leaked password protection, Auth connections switched to the
      percentage strategy at 10%) were toggled the same day; the advisors now report only the
      documented acceptances.
- [x] **Google Ads: fixed the zero-impression launch + added a B2B campaign** (2026-07-24). The
      Search test was live ~30 days and got **2 impressions, 0 clicks, $0 spent** (0 in the final
      week). Diagnosed from the account export as **bid/ad-rank starvation, not keywords**: every
      keyword was Enabled with broad match live, but Auction Insights showed eligibility in only ~11
      auctions all month at **0% top-of-page rate** against premium-vertical competitors (BetterHelp,
      FranklinCovey, Insperity). The **$2.50 CPC cap was below the auction reserve**, and later
      switching to **Maximize Conversions with zero conversions in the account** made Smart Bidding
      bid near-nothing (a death spiral). Corrected the build sheet
      ([ads-campaign.md](ads-campaign.md)): **Maximize Clicks with a ~$10/$14 CPC cap, never Smart
      Bidding until 15-30 conversions, Auto-apply OFF**, dropped the self-defeating `free` negative,
      and added a zero-impression diagnostic runbook. Restructured into **Campaign 1 (consumer:
      manager/co-worker/partner/parent → mode pages)** and a new **Campaign 2 (B2B → /for-business:
      team training, workplace conflict, AI-for-teams, white-label)**, plus For-business + FAQ
      sitelinks. The account-side fixes are the owner's to apply in the Ads UI; the repo change is
      the corrected sheet.
- [x] **Organization self-service: members, roles, details, automatic billing** (2026-07-24).
      Orgs move into their own hands. **Self-serve creation**: a buyer on /pricing names the org,
      picks seats (min 5, $4/seat/month via the new `STRIPE_PRICE_ID_TEAM`), pays through
      `/api/team-checkout`, and the Stripe webhook creates the org (`billing='stripe'`) with the
      buyer bound as first manager; the dashboard polls on `?org_checkout=success` and switches
      into the new workspace. **Manager self-management**: a new "Organization settings" panel
      (`OrgPanel` + `/api/org`, gated by the shared `requireManager` in `src/lib/server/orgAuth.ts`)
      handles rename, add/remove members, promote/demote (with last-manager protection), a seat
      stepper that updates the Stripe subscription quantity with proration (floor = member count,
      three layers: UI, API 409, `enforce_seat_floor` trigger), and the org's own Stripe billing
      portal. **Migration 0027**: `organizations.billing` ('manual'|'stripe'), `created_by`, the
      seat-floor trigger, and a widened status CHECK (fixes a latent webhook 500-retry loop on
      Stripe's `unpaid`/`incomplete*` statuses). **Webhook**: org creation on
      `checkout.session.completed` (idempotent by unique `stripe_customer_id`; team metadata
      carries `creator_user_id`, never `user_id`, so org events can never contaminate the personal
      `subscriptions` table), and seat sync from quantity changes (clamped + logged on conflict).
      **Admin**: /admin org tools retained, plus billing-mode pill/toggle, Stripe customer link,
      and a friendly seats-below-members 409. Manually billed orgs keep working unchanged
      (`billing='manual'`, seat editor disabled with an invoice notice). Enquiry form stays for
      custom deals, collapsed behind the new self-serve `TeamCheckout` on /pricing.
- [x] **Google Ads: direct API tooling + Editor CSV bridge** (2026-07-25). Claude Code can now
      set up, edit, and analyze the ad campaigns directly instead of driving the web UI by hand.
      Three layers: (1) **`ads/editor-import/`**: Google Ads Editor CSVs of the corrected
      two-campaign build (validated against character limits), importable today with zero API
      credentials; both campaigns import Paused with a post-import checklist. (2) **`.mcp.json`**
      attaches Google's official read-only Google Ads MCP server (GAQL analysis in any session).
      (3) **`ads/` toolkit** on the official google-ads Python library via uv: `report.py` (GAQL
      presets), `build.py` (declarative reconcile against `ads/campaigns.json`, the executable
      mirror of the build sheet), `manage.py` (pause/enable, budget, CPC cap, negatives). Safety
      contract: dry-run by default, `--apply` to execute, created entities start PAUSED, and a
      **scope guard refuses to mutate campaigns not named `SSS ...`** (the Beanchain shop
      campaigns share the account). Credentials (MCC + developer token + OAuth + refresh token)
      are a one-time owner setup per [docs/ads-api-setup.md](ads-api-setup.md); nothing enters
      git. New tokens often auto-upgrade to Explorer access (production campaign management,
      2,880 ops/day, no application), with Basic as the fallback path.
      **Update (2026-07-25, owner-requested Beanchain pass):** the toolkit gained `assets.py`
      (PMax asset-group image prep/upload/link/unlink, campaign callouts and structured
      snippets) and the scope guard now exposes the two Beanchain shop campaigns as a named
      allowlist behind `--beanchain` (explicit owner request only; everything else still
      refused). Used it to refresh both PMax asset groups (10 stale 2020-era images replaced
      with fresh 2023-24 photos), add 7 verified callouts + a menu snippet, raise budgets
      (PMax $32 to $40/day, Smart $5.80 to $10/day), and fix account conversion hygiene
      (`fix_conversion_goals.py`: GA4 traffic events like page_view/session_start and
      checkout_abandoned demoted to secondary; signup_completed promoted to primary, which
      cleans the SSS campaigns' Conversions column).
- [x] **Ads tooling extracted to `adkit`** (2026-07-25). The `ads/` toolkit graduated into a
      standalone multi-client CLI in the private repo **dbaxterbchain/adkit** (installed
      globally via `uv tool install -e .`; usable from any directory). Clients are per-config
      (`clients/<name>/client.toml`) with structural write scopes; this site is `--client sss`
      (prefix scope) and the coffee shop is `--client beanchain` (allowlist scope), with a
      registry lint refusing overlapping scopes on the shared ad account. New in the
      extraction: `adkit digest --client X` produces a client-facing markdown performance
      report (spend, results by type, search terms with a PMax fallback, change log). The
      `ads/` scripts were removed from this repo (clean cutover); `ads/editor-import/` stays
      as a historical zero-credential fallback, docs/ads-api-setup.md is now a pointer stub,
      and `GOOGLE_ADS_*` left `.env` (credentials live in `~/.google-ads.yaml` only).
- [x] **Consumer price: $5 to $8 per month, annual $50 to $80** (2026-07-25). Same reasoning
      and mechanics as the team raise below: comparable AI coaching tools run $10-30/month, and
      "unlimited" conversations carry real per-message API cost. Annual keeps its two-months-free
      structure (8 x 10 = 80). Existing subscribers are grandfathered automatically (old Stripe
      price ids keep billing at $5/$50). Hardcoded stragglers were converted to derive from
      `PLANS` while sweeping (DashboardView subscribe card, the mode pages' JSON-LD offer, the
      pricing OG description), so the next change is pricing.ts plus docs only. The AI grounding
      prompts carry no prices, so the prompt cache is untouched. Requires new live $8/month and
      $80/year prices in `STRIPE_PRICE_ID` / `STRIPE_PRICE_ID_ANNUAL` on Netlify BEFORE deploy.
- [x] **Teams price: $4 to $8 per seat** (2026-07-25). The team seat was priced below an
      individual subscription ($4 < $5) while including strictly more (shared dashboard,
      document-grounded assistants, white-label pages on the org's own domain). Raised to
      **$8/seat/month** (still roughly half of comparable per-seat communication tools);
      **white-label stays included** as the differentiator and is now named on the Teams card.
      Consumer stays $5/month as a deliberate mission/positioning choice. Existing team
      subscriptions are grandfathered automatically (they keep their old Stripe price; only new
      checkouts see the new one). All copy derives from `PLANS.team` in `src/data/pricing.ts`
      (FAQ, checkout stepper, pricing card, JSON-LD), so the change is one constant plus the
      deployment runbook line. Requires the live $8 price in `STRIPE_PRICE_ID_TEAM` on Netlify
      BEFORE this deploys (otherwise the UI shows $8 while Stripe bills $4).
- [ ] Then: SEO/community/AEO channels. The paid test is now live and corrected (see above);
      re-evaluate at day 7 / day 21 against the decision rules in the build sheet.

## Open questions / decisions

- Brand fonts — buy licensed faces or keep the free stand-ins?
- Whether to add a print stylesheet for the guide.
- ~~Where (if anywhere) to store AI conversation data in Phase 3.~~ → Decided: Supabase
  `chat_sessions` table, user-owned with Row-Level Security; users can delete
  conversations from the account page.
