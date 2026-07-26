# Wisdom Principle illustrations

One custom illustration per Wisdom Principle (12 total), added 2026-07-26. Sources live in
`src/assets/principles/<slug>.webp` and are referenced from each principle's YAML via the
optional `illustration` / `illustrationAlt` fields, rendered with `astro:assets` `<Image>`.

Screenshots below are from the local dev server.

- **principle-detail-critical-thinking.png** — a principle detail page
  (`/principles/critical-thinking`) at desktop width. The illustration sits in the hero as a
  responsive right-hand column beside the title and tagline. Confirms the mapping (the
  evidence / perspectives / reasoned-judgment compass belongs to Critical Thinking).
- **principles-index-grid.png** — the full `/principles` index. All 12 cards carry their
  illustration as a full-bleed 4:3 thumbnail; every image maps to the correct principle.
- **home-featured-principles.png** — the home page. The "12 Wisdom Principles" section
  (featured six) now shows illustrations too, since it reuses `PrincipleCard`.
- **principle-detail-mobile-humility.png** — a detail page at mobile width
  (`/principles/humility`), showing the hero stacking to a single column (text, then the
  full-width illustration). Confirms the Humility mapping (open bridge vs. walled tower).
