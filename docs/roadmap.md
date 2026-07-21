# Roadmap

The site is built to grow in three phases without a rewrite. The architecture (Astro +
Netlify) was chosen specifically to carry all three.

## Phase 1 — Teaching Hub + Showcase ✅ _(complete)_

A clear, beautifully-structured, easy-to-navigate site that teaches the whole system and
shows it off.

- Full content from the source guide, organized for self-paced learning.
- Showcase-quality Home page and brand-accurate design system.
- Static, fast, SEO-friendly. Hosted on Netlify.

## Phase 2 — Interactive practice tools ✅ _(complete)_

Move from "read about it" to "do it." Built as **React islands** so only the interactive
widgets ship JavaScript; the rest of the site stays static. All state persists in
`localStorage` — nothing leaves the browser.

- **Guided Introspection worksheet** (`/practice/introspection`) — a 7-step stepper that
  walks a user through Introspection with prompts and an emotion picker, then compiles a
  copyable / downloadable "prep summary" for their conversation.
- **Conversation Planner** (`/practice/conversation-planner`) — a Mutual Understanding
  setup checklist, goals, opening lines, a selectable question bank, and listening
  reminders, assembled into a copyable plan.
- **Solution Builder** (`/practice/solution-builder`) — checks a drafted solution against
  the four marks (Actionable / Testable / Effective / Time-bound) with live scoring, plus
  an equity check.

They live under `/practice`, alongside links to the ChatGPT Guide/Mentor.

## Accounts ✅ _(complete)_

Free **email/password + Google** sign-in at `/account`, powered by **Supabase** entirely
client-side (the site stays static — no SSR). **Nothing is gated:** the full site and all
three practice tools work while logged out, exactly as before. Signed-in users can **save**
their introspections, plans, and solutions and revisit them from an account library
(`saved_sessions` table, Row-Level Security). This lays the groundwork for putting the
Phase 3 AI tools behind a paywall.

## Phase 3 — In-site AI agents ✅ _(complete)_

The **Guide** (`/practice/guide`) and **Mentor** (`/practice/mentor`) are native, in-site
chat experiences powered by **Claude** (`claude-sonnet-5`), replacing the external
ChatGPT links. Gated behind a **$5/month Stripe subscription**, with **10 free lifetime
messages** for signed-in users.

- Astro server endpoints (`src/pages/api/*.ts`, `prerender = false`) deploy as Netlify
  Functions: `chat` (streaming), `checkout`, `billing-portal`, `stripe-webhook`.
  Everything else stays static.
- Responses stream token-by-token and are grounded in the site's content collections via
  the same serializers that build `/llms-full.txt` (`src/lib/llms.ts` →
  `src/lib/server/agents.ts`), with Anthropic prompt caching on the ~15k-token grounding.
- Entitlements (`subscriptions`, `ai_usage`) are written only by the server (Stripe
  webhook + chat endpoint, service-role key); the browser has read-only RLS access.
- Conversations are saved to the user-owned `chat_sessions` table (RLS) and can be
  resumed from the account page.

See [deployment.md](deployment.md) for the Stripe / Anthropic / Supabase setup.

## Phase 4 — Demonstrating value ✅ _(shipped 2026-07-12, ongoing)_

Marketing and conversion work: make the value of the assistants **visible** before asking
anyone to sign up.

- **Demo library** (`/practice/demos`) — 7 fictional, annotated example conversations
  (a `demos` MDX collection) showing the before/after transformation of a session, with
  stage markers, commentary, and an honest safety-boundaries demo. Free, ungated, indexed.
- **Named context registry** — every demo ends with "Use this process with my situation,"
  which opens the real assistant seeded with that scenario (`?context=<id>`). The registry
  (`src/lib/contexts.ts` + `src/lib/server/contexts.ts`) is also the mechanism for
  specialized assistant variants.
- **Conversation Modes** _(shipped 2026-07-12)_ — the variants, v1: eight modes (Parent,
  Teacher, Partner, Family, Friend, Manager, Co-worker, Organizer) adapt the Guide (and
  for four of them the Mentor) to a relationship dynamic. Implemented as **seed
  adaptations** (a third system block layered on the shared persona); the registry's
  `persona` override field stays reserved for future full-persona variants. Each mode has
  an SEO landing page at `/practice/modes/<id>` with an embedded seeded chat, plus picker
  sections on the assistant pages.

Candidate next steps (from the marketing plan, not yet built): outcome-based free
experience ("complete one Conversation Plan free" instead of a raw message count),
worksheet → assistant handoffs, real anonymized Beanchain case studies, situation-specific
landing pages, post-conversation follow-up as a paid feature, and outcome metrics.

## Phase 5 — Subscriber dashboard & specialized assistants _(in progress)_

Turn the subscription from "unlimited messages" into a workspace. A subscriber-only
**/dashboard** brings the tools together and becomes the home for everything organizations
need. Delivered in four shippable phases:

- **A — Dashboard shell** _(built)_ — `/dashboard` with the Guide and Mentor side by side,
  in-place mode switching (no page hop, unlike the public mode pages), and history across
  both agents. The public `ChatView` core was extracted into shared modules so all chat
  surfaces stay in lock-step (see [architecture.md](architecture.md#shared-chat-modules)).
  Subscribers only, with a nav link that appears just for them.
- **B — Documents** — upload PDF/docx/txt/md; text is extracted server-side and can be
  attached to any chat. New `documents` table + a private Supabase Storage bucket.
- **C — Specialized Assistants** — save an assistant (base agent + mode + custom
  instructions + up to five knowledge documents); a new `manager` role on `org_members`
  can share one org-wide. Custom setup is injected as a cache-stable prompt prefix, never
  into the registry `system` blocks.
- **D — White-label pages** — org-branded pages at `/a/<org-id>/<slug>` for any assistant
  (title, description, instructions, logo), usable by every org member with private
  per-user history, optionally served on the customer's own subdomain via a concierge
  CNAME step.

Out of scope for now: OCR, spreadsheets, self-serve org billing, and wildcard subdomains
on our own domain.
