# Wisdom Principle icons

Twelve custom line icons, one per Wisdom Principle, added to the concept icon set
and applied everywhere a principle appears. The set goes from 10 icons to 22, and
the last emoji leaves the system's own vocabulary.

This **reverses a deliberate earlier decision.** The first icon pass (2026-07-26)
kept emoji on the principles and the Four Pillars on the reasoning that "crisp
line-icons for the system's structure, warm emoji for its human values" read as
intentional. It doesn't, once the principle cards carry full-colour illustrations:
an emoji sitting above one is a third visual language on a card that already has
two. Monochrome line art beside the illustration is quieter, and the two now read
as artwork and label rather than as competing pictures.

## Where they show up

| Surface | Size |
|---|---|
| `PrincipleCard` (principles index + home page's featured six) | 36px, `brand-500`, brightening to `brand-600` on card hover |
| Principle detail hero | 48px, beside the eyebrow and title |
| The Four Pillars (home page and `/system`) | 32px / 24px |
| `/design` icon gallery | 36px, split into two groups |

The Four Pillars were converted in the same pass, not as scope creep: all four
pillars (Patience, Vulnerability, Bravery, Compassion) are themselves Wisdom
Principles, and the home page shows the pillars and the principle cards on one
screen. Leaving the pillars as emoji would have put both styles a scroll apart.

## How it is wired

`PRINCIPLE_ICONS` in [`src/lib/icons.ts`](../../../src/lib/icons.ts) maps a
principle's collection id to an icon name, exactly the way `TOOL_ICONS` already
maps Leadership Tools. Two names differ from their slug because the artwork is
named for what it draws: `humility` uses `humility-pride` (a crown set down), and
`compassion-empathy` uses `compassion` (a heart).

`principleIcon()` **throws** rather than returning `undefined` like `toolIcon()`
does. All 12 principles have art, so a missing entry is a bug, and a hole in that
grid should stop the build rather than ship.

The `icon` field is **gone from the principles schema and all 12 YAML files.** It
held an emoji that nothing renders now. Art is registered next to the art, not
authored in the content, so adding a principle without an icon fails
`npm run check` instead of rendering an empty box.

## Screenshots

- `icon-set-contact-sheet.png` — all 22 icons at 96px on ink, then 40 / 36 / 24.
  The review harness for the set: it is how the legibility floor and the weight
  match against the original ten were checked, and it is in gold on navy because
  an icon that only works in brand blue on white is not finished.
- `principles-index.png` — the twelve cards. The icon sits opposite the numeral,
  where the emoji used to.
- `card-closeup-humility.png` — one card at 1:1. Humility is a crown set down,
  which is the whole principle in one shape.
- `principle-detail-hero.png` — 48px beside the title.
- `home-four-pillars.png` — the pillars and the principle cards on one screen,
  which is the reason the pillars were converted too.
- `system-pillars-sidebar.png` — the same four at 24px, the smallest real use.
- `design-guide-icon-set.png` — the public gallery, now in two groups. Both
  groups are **derived from the registry** (`ICON_NAMES` minus the principle
  icons, and `PRINCIPLE_ICONS` in taught order), so a new icon files itself.

## One thing to know before adding more

Three icons share vocabulary on purpose: `understanding` is two speech bubbles,
`bravery` is a bubble with a heart in it, and `compassion` is a heart. Bravery is
literally the intersection, which is right for "the willingness to speak
honestly" but means the three should not be placed adjacent at small sizes. They
are not adjacent on any current surface except the `/design` gallery, where the
labels carry it.
