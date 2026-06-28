# Content Guide

All teaching content lives in `src/content/` and is validated by Zod schemas in
`src/content/config.ts`. If a file is missing a required field, `npm run check` (and the
build) will fail with a clear message — so the content can't silently drift out of shape.

After editing content, run `npm run dev` to preview or `npm run check` to validate.

---

## Wisdom Principles — `src/content/principles/*.yaml`

One YAML file per principle. The filename (kebab-case) becomes the URL slug
(`good-faith.yaml` → `/principles/good-faith`). Every principle must include all of these
fields:

```yaml
title: Good Faith                 # display name
order: 2                          # position in the list (1–12)
icon: "🌱"                        # emoji marker
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

To add a 13th principle: drop in a new YAML file with `order: 13`. The grid, detail page,
and prev/next navigation update automatically.

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

## Glossary, Pillars, Nav — `src/data/`

Small, structured data that isn't a collection:

- `concepts.ts` — `glossary` (Key Terminology), `pillars` (Four Pillars of Understanding),
  and `protocolSteps` (metadata for the home/overview diagrams). Edit the arrays directly.
- `nav.ts` — the primary navigation links.

> If you change a protocol step's slug or title, update `protocolSteps` in `concepts.ts`
> too — it's used by the home-page diagram and is intentionally lightweight/duplicated for
> that purpose.
