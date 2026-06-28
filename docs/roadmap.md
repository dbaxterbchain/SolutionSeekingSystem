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

## Phase 3 — In-site AI agents

Bring the **Guide** and **Mentor** into the site as native chat experiences (the goal is
our own agents, not necessarily tied to ChatGPT).

- Astro **server endpoints** (`src/pages/api/*.ts`) deploy as **Netlify Functions** and
  call the **Anthropic API** (Claude) with the API key kept server-side only.
- Set `export const prerender = false` on those routes (everything else stays static).
- Stream responses; ground them in the site's content collections so answers stay
  faithful to the system.
- Add `ANTHROPIC_API_KEY` as a Netlify environment variable.

See [architecture.md](architecture.md) for how the current setup already supports this.
