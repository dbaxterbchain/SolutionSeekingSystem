# Design System

**The design guide is a page on the site: [/design](https://solutionseeking.com/design)**
([src/pages/design.astro](../src/pages/design.astro)). It is public and meant to be handed
to anyone: colour, typography, logo files and variants, usage rules, permissions, and a
download of every asset. Send people there rather than here.

This file covers only what a public page should not: where things live in the repo.

## Where the tokens actually live

| What | File | Notes |
|---|---|---|
| Colour, fonts, shadows | [`tailwind.config.mjs`](../tailwind.config.mjs) | `/design` **imports this** and renders the swatches from it, so the page cannot drift from the build. Change a token here and the guide updates itself. |
| Component classes | [`src/styles/global.css`](../src/styles/global.css) | `.container-page`, `.btn*`, `.eyebrow`, `.prose-sss` |
| Fonts | [`BaseLayout.astro`](../src/layouts/BaseLayout.astro) | Anton, Poppins, Inter from Google Fonts |
| Concept icon names | [`src/lib/icons.ts`](../src/lib/icons.ts) | artwork in `src/assets/icons/`, rendered by `Icon.astro` |

**Typefaces are settled.** Anton (display), Poppins (headings, wordmark) and Inter (body)
are the brand faces, not placeholders. All three are open-licensed, so an outside
collaborator needs no licence. The logo ships as outlines and never depends on a font
being installed.

## Brand assets

Originals, committed and never edited:

- [`images/Logo/SolutionSeekingLogo.svg`](../images/Logo/) — the master
- [`images/ExamplesOfTypography/`](../images/ExamplesOfTypography/) — the typographic lockups

Everything in `public/brand/` is **generated** from those by
[`scripts/build-brand-assets.mjs`](../scripts/build-brand-assets.mjs). Run it by hand and
commit the output; it is deliberately not part of `npm run build`:

```bash
node scripts/build-brand-assets.mjs
```

Two things worth knowing before touching it:

- **The master's gradients are embedded raster masks, not SVG gradients.** The mark
  cannot be recoloured from that file and does not survive being shrunk to a favicon.
  Its wordmark, though, is clean outlined vector, and the script extracts it exactly.
- **The mark is two S shapes, offset**, each drawn as two chevron strokes whose real
  geometry lives in the master's clip paths. Flat variants have to keep the two apart
  (a second tone, or a knocked-out gap) or they fuse into one shape that stops reading
  as the logo. The script also rounds the chevron corners, because flattening exposes
  arm terminals that the master's gradients fade away.

`public/favicon.svg` and `public/apple-touch-icon.png` are generated too. Both were
previously wrong: the favicon drew a different, approximated mark, and the touch icon was
the whole logo shrunk until the wordmark was a smudge.

## Components (`src/components/`)

| Component | Purpose |
|---|---|
| `Logo.astro` | The compact horizontal lockup used in the header and footer. `variant="light"` for dark backgrounds. Note this is **not** the master lockup; both are approved, and `/design` explains when to use which. |
| `Header.astro` / `Footer.astro` | Sticky nav with active states; footer links, resources, trademark |
| `PageHero.astro` | Standard inner-page header (eyebrow + title + intro) |
| `Icon.astro` | Inline concept icons, coloured by `currentColor` |
| `PrincipleCard.astro` | Card for the principle grids |
| `ProtocolDiagram.astro` | The 3-step protocol visual |
| `StepNav.astro` | Prev/next navigation for sequential content |
| `TryItBand.astro` | The "how it works" CTA closing principle and protocol pages |
| `ProvenanceBand.astro` | Trust signals under the assistants |
| `Testimonials.astro` / `DemoExcerpt.astro` | Social proof, and demo pull-quotes |
| `JsonLd.astro` | Renders schema objects from `src/lib/schema.ts` |
