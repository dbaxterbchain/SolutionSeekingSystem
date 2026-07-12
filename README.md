# Solution Seeking System — Website

The teaching & showcase website for the **Solution Seeking System (SSS)**, a Beanchain
Coffee framework for democratic problem solving, leadership, and communication.

**Live:** [solutionseeking.com](https://solutionseeking.com)

📚 Full documentation lives in **[`docs/`](docs/README.md)** — start with [docs/status.md](docs/status.md).

## Stack

- **[Astro](https://astro.build)** (TypeScript) — content-first, static by default
- **Tailwind CSS** — design system built from the brand tokens
- **React islands** — interactive practice tools + the AI chat (`ChatView`)
- **MDX / Content Collections** — Zod-typed teaching content + demos in `src/content/`
- **Supabase** — auth + saved work + chat persistence (Row-Level Security)
- **Stripe + Anthropic API** — $5/month AI Guide & Mentor via Astro server endpoints
- **Netlify** — hosting + deploy previews (`@astrojs/netlify` adapter)

## Develop

```bash
npm install      # install dependencies
npm run dev      # local dev server → http://localhost:4321
npm run build    # production build → dist/
npm run check    # astro check (type-check .astro + content)
```

## Project structure

```
src/
  content/
    config.ts            # Zod schemas for the collections
    principles/*.yaml     # 12 Wisdom Principles (uniform 6-part format)
    protocol/*.md         # 3 Communication Protocol steps
    tools/*.md            # 4 Leadership Tools
  data/
    concepts.ts          # glossary, pillars, protocol step metadata
    nav.ts               # primary navigation
  components/            # Header, Footer, PrincipleCard, ProtocolDiagram, …
  layouts/BaseLayout.astro
  pages/                 # routes (Home, System, Protocol, Principles, Tools, …)
  styles/global.css      # Tailwind layers + brand component classes
public/
  brand/                 # logo + wordmark
  favicon.svg
  solution-seeking-complete-guide.pdf
```

## Design tokens

Defined in `tailwind.config.mjs`, derived from the logo + typography:

- **brand** `#5271FF` — royal/periwinkle (primary)
- **sky** `#3D9BF0` — bright accent
- **ink** `#16276B` — deep navy (headings)
- Fonts: **Anton** (display), **Poppins** (headings), **Inter** (body)

## Roadmap

- **Phase 1 (done):** Full teaching hub + showcase — all content, navigation, brand.
- **Phase 2 (done):** Interactive practice tools (Introspection worksheet, Conversation
  Planner, Solution Builder) as React islands, plus free Supabase accounts with saving.
- **Phase 3 (done):** In-site AI Guide & Mentor (Claude, streaming) behind a $5/month
  Stripe subscription with 10 free messages.
- **Phase 4 (shipped, ongoing):** Demonstrating value — annotated demo conversations at
  `/practice/demos` and context-seeded chats (`?context=<id>`), the foundation for future
  specialized assistant variants.

Details in [docs/roadmap.md](docs/roadmap.md). Before shipping changes, walk
[docs/change-checklist.md](docs/change-checklist.md).

## Source content

Authored from `Source/Solution Seeking Complete.pdf`. © Beanchain Coffee LLC.
