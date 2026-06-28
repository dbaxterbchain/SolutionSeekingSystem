# Roadmap

The site is built to grow in three phases without a rewrite. The architecture (Astro +
Netlify) was chosen specifically to carry all three.

## Phase 1 — Teaching Hub + Showcase ✅ _(complete)_

A clear, beautifully-structured, easy-to-navigate site that teaches the whole system and
shows it off.

- Full content from the source guide, organized for self-paced learning.
- Showcase-quality Home page and brand-accurate design system.
- Static, fast, SEO-friendly. Hosted on Netlify.

## Phase 2 — Interactive practice tools _(next)_

Move from "read about it" to "do it." Built as **React islands** so only the interactive
widgets ship JavaScript; the rest of the site stays static.

- **Guided Introspection worksheet** — walks a user through the 7-step introspection
  process with prompts, saves answers in-browser (localStorage), and produces a "prep
  summary" they can bring to a conversation.
- **Conversation planner** — a Mutual Understanding checklist plus a question bank for
  preparing a difficult conversation.
- **Solution builder** — checks a drafted solution against the four marks of a good
  solution (Actionable / Testable / Effective / Time-bound).
- Light interactivity site-wide (progress, cross-links, expandable examples).

These live under `/practice`, which currently links out to the ChatGPT Guide/Mentor as
an interim.

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
