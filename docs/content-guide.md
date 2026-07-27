# Content Guide

All teaching content lives in `src/content/` and is validated by Zod schemas in
`src/content/config.ts`. If a file is missing a required field, `npm run check` (and the
build) will fail with a clear message — so the content can't silently drift out of shape.

After editing content, run `npm run dev` to preview or `npm run check` to validate.

---

## Voice & punctuation — no AI tells

Readers increasingly read certain patterns as "an AI wrote this," and react badly. These
rules apply to ALL user-facing copy: pages, content collections, demo transcripts, mode
landing copy, chip labels, error messages, llms.txt strings, and the assistants' own
prompts (the personas instruct the live Guide/Mentor to follow the same punctuation
rules, so demos and real output stay consistent).

- **No em dashes (`—`).** This is the biggest tell. Rewrite instead: split into two
  sentences, use a comma for a light aside, a colon before an explanation, or
  parentheses (sparingly). Never substitute a spaced hyphen (` - `) or `--`.
- **No en dashes (`–`) between words.** Use a plain hyphen: `parent-child dynamic`,
  `15-20 minutes`.
- Fine to keep: curly quotes/apostrophes, `·` middots in labels, `→` arrows in link text,
  ellipses.
- Watch for other tells while writing: "delve", "It's not just X, it's Y" constructions,
  "Moreover/Furthermore", starting every list item the same way, and relentless
  triplets. Prefer plain, specific sentences.

Internal docs and code comments are developer-facing and exempt (though the habit is
worth keeping everywhere).

---

## Wisdom Principles — `src/content/principles/*.yaml`

One YAML file per principle. The filename (kebab-case) becomes the URL slug
(`good-faith.yaml` → `/principles/good-faith`). Every principle must include all of these
fields:

```yaml
title: Good Faith                 # display name
order: 2                          # position in the list (1–12)
icon: "🌱"                        # emoji marker
illustration: ../../assets/principles/good-faith.webp  # hero + card image (optional)
illustrationAlt: "..."            # descriptive alt for the illustration (no dashes)
tagline: >-                       # one-line summary (card + hero)
  Approaching others with the genuine assumption that they too act with integrity.
whatItIs: >-                      # 1. Description — what it is
  ...
howUsed: >-                       # 1. Description — how it's used in the system
  ...
bestPractices:                    # 2. list of strings
  - ...
goals:                            # 3. list of strings
  - ...
antigoals:                        # 4. list of strings
  - ...
practices:                        # 5. Practice Patterns — title + body
  - title: Intent Check
    body: 'Before speaking, ask: "Am I saying this to help or to hurt?"'
faq:                              # 6. FAQ — question + answer
  - q: ...
    a: ...
example: >-                       # "Solution Seeking in action" worked example
  ...
```

**YAML tip:** use the folded block scalar `>-` for any value containing a colon-space
(`: `), quotes, or apostrophes. It avoids all escaping headaches. The existing files are
good templates to copy.

The `illustration` field is an optional image path, relative to the YAML file, pointing into
`src/assets/principles/<slug>.webp` (Astro optimizes it via `astro:assets`; put source art
there, not in `public/`). It renders as the hero on the detail page and the card thumbnail on
the index and home grids. `illustrationAlt` is its descriptive alt text.

To add a 13th principle: drop in a new YAML file with `order: 13`. The grid, detail page,
and prev/next navigation update automatically. Add an `illustration` (and `illustrationAlt`)
to match the others; it is optional, so the build will not break if art is not ready yet.

---

## Communication Protocol — `src/content/protocol/*.md`

One Markdown file per step. Frontmatter carries the structured bits; the Markdown body is
the narrative (rendered with the `.prose-sss` styles).

```markdown
---
title: Introspection
step: 1                           # ordering + the number shown in the badge
oneLine: Understand yourself first — your feelings, needs, and goals.
summary: >-                       # used on the overview page + meta description
  ...
requires:                         # the "what this step requires" sidebar
  - name: Critical Thinking
    why: Examining your thoughts objectively.
---

Markdown body goes here — headings, lists, **bold**, > blockquotes, etc.
```

---

## Leadership Tools — `src/content/tools/*.md`

Same idea as protocol steps. Frontmatter drives the sidebar; the body is the walkthrough.

```markdown
---
title: One-on-Ones
order: 1
summary: >-
  ...
outcomes:                         # green "desired outcomes" sidebar list
  - ...
triggers:                         # "when to use it" sidebar list
  - ...
---

Markdown body...
```

---

## Demo conversations — `src/content/demos/*.mdx`

One MDX file per demo — a fictional, annotated transcript of a Guide or Mentor session,
shown at `/practice/demos/<slug>`. Frontmatter drives the gallery card, the Before/After
panel, and the "What to expect" spec; the MDX body is the transcript.

```mdx
---
title: "The employee who kept arriving late"
order: 1
agent: guide                      # guide | mentor
context: workplace-lateness      # named-context id — see coupling note below
scenario: >-                      # one-liner for cards, meta description, OG
  ...
before: >-                        # the user's raw starting state, quoted on the card
  ...
after:                            # 3+ concrete outcome bullets ("where it ends")
  - ...
spec:                             # honest behavior spec; shown in "What to expect"
  expected:                       # and reusable later as a QA regression spec
    - ...
  unacceptable:
    - ...
---

<Stage label="Greeting & context" />
<Stage step={1} label="Introspection" />   {/* free-form labels OK, e.g. "Turning point" */}

<User>
A user turn — plain prose.
</User>

<Assistant>
An assistant turn. Markdown allowed: paragraphs, **bold**, ## headings, lists,
> blockquotes — keep to the subset the real ChatView renders, nothing fancier.
</Assistant>

<Note>
Annotation commentary — rendered as a "What's happening here" callout.
</Note>
```

Rules that keep demos honest and working:

- **The `context` id must exist in the registry** for that agent
  (`src/lib/contexts.ts` + a seed in `src/lib/server/contexts.ts`) — the build fails
  otherwise. Adding a demo usually means adding a matching context first.
- Demos must read like the real assistant: ground the voice in the personas in
  `src/lib/server/agents.ts`. They double as behavior specs, so don't show the assistant
  doing something the prompt wouldn't.
- Keep them clearly fictional — the disclaimer components handle the labeling; never
  present a demo as a real user conversation.
- New demos automatically appear in the gallery, the practice-page "See it in action"
  section (first 3 by `order`), `/llms.txt`, the sitemap, and get an OG card.

## Named contexts — `src/lib/contexts.ts` + `src/lib/server/contexts.ts`

The context registry seeds `?context=<id>` conversations (demo CTAs and conversation
Modes). Two halves that must stay in sync (TypeScript enforces it — `CONTEXT_SEEDS` is
`satisfies Record<ContextId, ContextSeed>`):

- `src/lib/contexts.ts` — the id list plus `kind` and the chip label/description shown in
  the chat UI. `kind: 'scenario'` (demo handoffs) labels read `Scenario: …`;
  `kind: 'mode'` labels read `{Role} mode` (e.g. `Parent mode`). The convention lives in
  the label strings — keep it consistent or chips will look broken.
- `src/lib/server/contexts.ts` — the model-facing seed text (server-only; never ships to
  the browser). Seeds must be **byte-stable compile-time constants** — never interpolate
  user data — because each one is an Anthropic prompt-cache entry appended after the
  shared grounding+persona blocks. Mode seeds ADAPT the shared persona (vocabulary, power
  dynamic, solution shape, safety posture); the `persona` override field stays reserved
  for future full variants.

Retire a context by removing its demo/links first; old saved conversations with a retired
id degrade gracefully to plain chats. Never reuse a retired id for a different meaning.

---

## Modes — `src/data/modes.ts`

Landing content for the conversation Modes (`/practice/modes/<id>`). Each entry pairs
with a `kind: 'mode'` registry entry; the landing page, hub card, picker cards, OG card,
and llms.txt line are all generated from it. Fields: `id` (registry id), `name`, `icon`,
`heroTitle` (targets situation intent, e.g. "Prepare for a hard conversation with your
child"), `heroIntro`, `metaDescription`, `pickerBlurb`, `exampleSituations[]`, `welcome`,
optional `relatedDemoIds[]` and `mentorCta`.

Build-time cross-checks in `src/pages/practice/modes/[mode].astro` fail the build if: the
registry entry is missing or not `kind: 'mode'`; the mode isn't Guide-applicable;
`mentorCta` is set on a Guide-only mode; or a `relatedDemoIds` entry doesn't exist.

**Adding a mode touches exactly three files** — `src/lib/contexts.ts` (id + meta),
`src/lib/server/contexts.ts` (seed), `src/data/modes.ts` (landing copy) — and the page
appears automatically.

**Authoring rule (load-bearing):** write the `welcome` line and the server seed
*together*. The welcome must not promise behavior the seed doesn't produce, and should
stay behavior-light ("in Parent mode… tell me what's going on"). For modes touching
minors or intimate relationships, the seed carries the safety posture — mirror the
existing `parent`/`partner` seeds.

---

## Concept icons — `src/assets/icons/` + `Icon.astro`

The structural concepts (the three parts of the system, the three protocol steps, the four
Leadership Tools) use custom line-icons rather than emoji. Sources are plain SVGs in
`src/assets/icons/<name>.svg`; `src/components/Icon.astro` renders one by name:

```astro
<Icon name="protocol" class="h-9 w-9 text-brand-500" />
```

Astro inlines imported SVGs, so the artwork inherits the surrounding text color via
`currentColor` — which is why size *and* color are passed as `class`, and why the icons work
inside hover states (`group-hover:text-brand-600`) with no extra markup.

Rules for adding one:

- Author the SVG with `viewBox="0 0 48 48"`, `stroke="currentColor"` (or
  `fill="currentColor"`), and **no `width`/`height` attributes** — a fixed size fights the
  utility classes.
- Add the name to `ICON_NAMES` in `src/lib/icons.ts`, then import and register it in the
  `ICONS` map in `Icon.astro`. The map is typed `Record<IconName, …>`, so a name without
  artwork (or a typo at a call site) fails `npm run check` rather than rendering nothing.
- Names live in `src/lib/icons.ts` (not in the `.astro` component) so plain `.ts` data files
  like `src/data/concepts.ts` can reference them. Leadership Tools map from their content
  slug via `TOOL_ICONS`/`toolIcon()` in the same file.
- Icons are **decorative**: every one sits beside a visible text label, so `Icon.astro` sets
  `aria-hidden="true"` and adds no title. If you ever use one with no adjacent label, give it
  an accessible name at the call site instead.

The Four Pillars and the 12 Wisdom Principles deliberately keep their emoji markers.

---

## Glossary, Pillars, Nav — `src/data/`

Small, structured data that isn't a collection:

- `concepts.ts` — `glossary` (Key Terminology), `pillars` (Four Pillars of Understanding),
  and `protocolSteps` (metadata for the home/overview diagrams). Edit the arrays directly.
- `nav.ts` — the primary navigation links.

> If you change a protocol step's slug or title, update `protocolSteps` in `concepts.ts`
> too — it's used by the home-page diagram and is intentionally lightweight/duplicated for
> that purpose.
