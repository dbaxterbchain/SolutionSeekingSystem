# Architecture

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **Astro** (TypeScript) | Content-first, ships zero JS by default, great for a teaching site. |
| Styling | **Tailwind CSS** (`@astrojs/tailwind`) | Fast, consistent, design tokens in `tailwind.config.mjs`. |
| Content | **Content Collections** + **MDX** | Markdown/YAML content with **Zod-typed** schemas. |
| Interactivity | **React islands** (`@astrojs/react`) | Hydrate only the interactive widgets (Phase 2). |
| Hosting | **Netlify** (`@astrojs/netlify`) | Already in use; adapter enables server endpoints for Phase 3. |

### Why Astro over Next.js

The trajectory is content-heavy now, interactive later, with our own AI agents
eventually. Astro is the best-in-class content-first framework, pairs natively with
Netlify, and its server endpoints (as Netlify Functions) cover the future AI work — so we
get the lightest stack now without a rewrite later. Next.js was the runner-up (better for
a heavily app-driven product, heavier for a mostly-content site).

## Rendering model

- **Static by default.** Every page is prerendered at build time (28 pages today) — fast
  and SEO-friendly.
- The **Netlify adapter is already wired in** (`astro.config.mjs`). Phase 3 AI routes opt
  into on-demand rendering with `export const prerender = false`; everything else stays
  static. No reconfiguration needed.

## Project structure

```
src/
  content/
    config.ts             # Zod schemas for all collections
    principles/*.yaml      # 12 Wisdom Principles (uniform 6-part format)
    protocol/*.md          # 3 Communication Protocol steps (Markdown body)
    tools/*.md             # 4 Leadership Tools (Markdown body)
  data/
    concepts.ts           # glossary, four pillars, protocol step metadata
    nav.ts                # primary navigation links
  components/             # Header, Footer, Logo, PageHero, PrincipleCard,
                          # ProtocolDiagram, StepNav
    react/               # interactive React islands (Phase 2 practice tools)
  layouts/
    BaseLayout.astro      # <head>, fonts, header/footer, skip-link
  pages/                  # file-based routes (see below)
  styles/global.css       # Tailwind layers + brand component classes (.btn, .prose-sss)
public/
  brand/                 # logo.svg, logo.png, wordmark.png
  favicon.svg
  solution-seeking-complete-guide.pdf
astro.config.mjs · tailwind.config.mjs · tsconfig.json · netlify.toml
```

### Routes

| Route | File | Notes |
|-------|------|-------|
| `/` | `pages/index.astro` | Showcase home |
| `/system` | `pages/system.astro` | Overview + pillars + glossary |
| `/protocol` | `pages/protocol/index.astro` | Protocol overview |
| `/protocol/:step` | `pages/protocol/[step].astro` | One per protocol step |
| `/principles` | `pages/principles/index.astro` | Grid of all 12 |
| `/principles/:slug` | `pages/principles/[slug].astro` | Renders the 6-part format |
| `/tools` | `pages/tools/index.astro` | Tools overview + "build your own" |
| `/tools/:tool` | `pages/tools/[tool].astro` | One per leadership tool |
| `/practice` | `pages/practice.astro` | Assistants + interactive tools index |
| `/practice/introspection` | `pages/practice/introspection.astro` | Introspection worksheet (React island) |
| `/practice/conversation-planner` | `pages/practice/conversation-planner.astro` | Conversation planner (React island) |
| `/practice/solution-builder` | `pages/practice/solution-builder.astro` | Solution builder (React island) |
| `/about` | `pages/about.astro` | Story + resources |
| `404` | `pages/404.astro` | Not-found |

Dynamic pages use `getStaticPaths()` to prerender one page per content entry, with
prev/next navigation derived from the collection order.

## Content model

The 12 principles share an identical schema (`principles` collection), so the detail
template renders any principle uniformly — add a new YAML file and a new page appears,
guaranteed to have every section. See [content-guide.md](content-guide.md).
