# Custom concept icons

Ten custom line-icons replacing the emoji markers on the system's structural concepts,
added 2026-07-26. Sources are `src/assets/icons/<name>.svg`, rendered by
`src/components/Icon.astro` (Astro's SVG-as-component import, so each icon inlines and
inherits its Tailwind text color through `currentColor`).

Screenshots below are from the local dev server. The sticky site header was hidden for a
couple of captures so the cards read clearly.

- **home-three-parts.png** — the home page "One system, three parts" section. The three
  cards now carry the `protocol` (three chevrons), `principles` (hexagon of dots), and
  `tools` (control panel) icons in place of the 🔄 / 📖 / 🧰 emoji.
- **home-protocol-diagram.png** — the `ProtocolDiagram` on the home page. Each step pairs
  its number badge with its icon: `introspection` (figure with an inward eye),
  `mutual-understanding` (two overlapping circles), `solution-spark` (four-point star).
  Confirms the semantic mapping is right for all three steps.
- **tools-index-cards.png** — the `/tools` index. These cards previously showed only a
  numeral; each now leads with its icon in a brand-tinted rounded square beside the "0N"
  label. Mapping: two figures = One-on-Ones, cycle arrows = Feedback, concentric target =
  Targeted Conversations, ascending steps = Solution Seeking Sessions.
- **tool-detail-hero.png** — a tool detail page (`/tools/one-on-ones`), where the same icon
  sits next to the "Leadership Tool 01" eyebrow so the index and detail views agree.
- **protocol-diagram-mobile.png** — the protocol diagram at mobile width (390px), showing
  the icons holding their size and crispness as the cards stack.

Verified beyond the screenshots: the icons inherit hover state (the protocol card's SVG
computes to brand-500 at rest and brand-600 on hover), render with no `width`/`height`
attributes so sizing stays class-driven, and carry `aria-hidden="true"` since every one
sits beside a visible text label.
