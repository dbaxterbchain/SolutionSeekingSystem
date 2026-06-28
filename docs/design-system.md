# Design System

Derived from the Solution Seeking logo and typography examples in `images/`.

## Color tokens

Defined in `tailwind.config.mjs` (and mirrored as CSS vars in `src/styles/global.css`).

| Token | Hex | Use |
|-------|-----|-----|
| `brand` (500) | `#5271FF` | Primary — logo mark, "Solution" wordmark, buttons, links |
| `sky` (500) | `#3D9BF0` | Bright accent — the "SEEKING" word |
| `ink` (800) | `#16276B` | Deep navy — headings, high-emphasis text |
| white / slate | — | Backgrounds and body text |

`brand` and `ink` ship full 50–900 scales for hover/border/subtle-background use.

## Typography

Loaded from Google Fonts in `BaseLayout.astro`. These are **close free stand-ins** for the
logo type — confirm/replace with the real licensed faces when ready (tracked in
[status.md](status.md)).

| Family | Role | Tailwind class |
|--------|------|----------------|
| **Anton** | Display / impact numbers | `font-display` |
| **Poppins** | Headings, wordmark | `font-heading` |
| **Inter** | Body text | `font-sans` (default) |

## Reusable classes

In `src/styles/global.css` under `@layer components`:

- `.container-page` — centered max-width page gutter
- `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost` — buttons
- `.eyebrow` — small uppercase section label
- `.prose-sss` — long-form Markdown styling (used by protocol + tool bodies)
- `.shadow-card` / `.shadow-card-hover` — the standard card elevation

## Components (`src/components/`)

| Component | Purpose |
|-----------|---------|
| `Logo.astro` | Inline SVG mark + wordmark; `variant="light"` for dark backgrounds |
| `Header.astro` | Sticky nav with active states + mobile menu |
| `Footer.astro` | Links, resources, copyright/trademark |
| `PageHero.astro` | Standard inner-page header (eyebrow + title + intro) |
| `PrincipleCard.astro` | Card for the principle grids |
| `ProtocolDiagram.astro` | The 3-step protocol visual |
| `StepNav.astro` | Prev/next navigation for sequential content |

## Brand assets

In `public/brand/`: `logo.svg`, `logo.png`, `wordmark.png`. The favicon (`public/favicon.svg`)
is a simplified brand mark. Originals are kept in `images/` at the repo root.
