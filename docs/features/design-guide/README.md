# Design guide (/design)

One public URL to hand anyone working with us: logo files and variants, colour,
typography, clearspace and minimum sizes, a misuse grid, a live UI kit,
permissions, and a zip of every asset. Linked from the footer.

Colour and type are **imported from `tailwind.config.mjs`** and rendered from it,
so the guide cannot drift from what the site actually builds with. Verified in
the browser: the swatches render `#5271FF`, `#3D9BF0`, `#16276B`, `#A3B2FF` and
`#EEF1FF`, matching the config exactly, and all three brand faces load rather
than falling back.

Assets in `public/brand/` are generated from the original artwork by
[`scripts/build-brand-assets.mjs`](../../../scripts/build-brand-assets.mjs), run
by hand. Nothing is redrawn: the wordmark is extracted from the master as vector,
and the flat marks use the master's own chevron geometry.

All 15 download links on the page were checked and return 200.

## Screenshots

- `hero-lockup.png` — the page opening, and the lockup formula it leads with:
  **Solution** in Poppins, **SEEKING** in Anton, then a qualifier. Only the third
  line changes, which is what makes a new name obviously ours. Set live in the
  brand faces, so the specimen and the rule are the same thing.
- `logo-variants.png` — the five logo files, each with SVG and PNG downloads and
  a note saying what it is *for*. The reversed mark sits on an ink panel because
  a white asset on a white card is unreviewable.
- `colour.png` — core tokens with hex and intended use, over the full brand ramp.
- `typography.png` — Anton, Poppins and Inter with their roles, Tailwind class
  names, and a specimen in the actual face.
- `permissions.png` — what may be done without asking, and what needs a
  conversation. The footer already asserts the trademark, so a page inviting
  outside use has to say what is actually permitted.
- `mobile.png` — 390x844. No page-level horizontal overflow; the jump nav and the
  colour ramp scroll inside their own containers.

## The mark, for anyone regenerating these

Two findings from taking the master apart, both of which shape every flat asset:

1. **The master's gradients are embedded raster masks**, not SVG gradients. The
   mark cannot be recoloured from that file and does not survive favicon size.
2. **The mark is two S shapes, offset**, each drawn from two chevron strokes.
   Confirmed by rendering the pairings: any other pairing gives two meaningless
   half-shapes.

So flat variants keep the two S's apart deliberately (a second tone, or a
knocked-out gap), because one flat colour fuses them into a blob that stops
reading as the logo. And where the two S's cross, each one's arm ran past the
other and left a knob on the outside of the bend; that arm is now shaved back
until it is buried inside its partner, so the outside of each bend matches the
curve on the inside. Rounding the knob instead was tried first and is not the
same thing: a rounded knob is still a knob.
