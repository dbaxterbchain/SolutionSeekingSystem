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
