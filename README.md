# Solution Seeking System — Website

The teaching & showcase website for the **Solution Seeking System (SSS)**, a Beanchain
Coffee framework for democratic problem solving, leadership, and communication.

**Live:** [solutionseeking.com](https://solutionseeking.com)

📚 Full documentation lives in **[`docs/`](docs/README.md)** — start with [docs/status.md](docs/status.md).

## Stack

- **[Astro](https://astro.build)** (TypeScript) — content-first static site
- **Tailwind CSS** — design system built from the brand tokens
- **React islands** — reserved for interactive practice tools (Phase 2)
- **MDX / Content Collections** — Zod-typed teaching content in `src/content/`
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
- **Phase 2:** Interactive practice tools (guided Introspection worksheet, conversation
  planner, solution builder) as React islands.
- **Phase 3:** In-site AI Guide & Mentor agents via Astro server endpoints
  (Netlify Functions) calling the Anthropic API — set `prerender = false` on those
  routes and add the API key as a Netlify env var.

## Source content

Authored from `Source/Solution Seeking Complete.pdf`. © Beanchain Coffee LLC.
