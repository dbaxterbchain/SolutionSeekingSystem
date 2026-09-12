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
- **No counted-pair headings.** "One system, three parts", "Three lines, one of them a
  slot", "Two blues and a navy", "Three faces, all free". This reads as AI even when the
  count is accurate, and the same rhythm arrives without numbers: "Give it room, and a
  floor". Say what the section actually contains instead: "What the system is made of",
  "How every name is built", "What each colour is for", "How much space it needs".

  The tell is the **paired cadence**, not the number. A plain count that carries
  information is fine ("Three steps to a real solution"), and so is naming a real thing
  ("12 Wisdom Principles"). Watch for the same shape in body copy, where it hides as a
  trailing flourish: "the SEEKING word, and little else".
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

There is deliberately **no `icon` field**. Each principle's line icon is registered in
`PRINCIPLE_ICONS` (`src/lib/icons.ts`), keyed by the filename, the same way the Leadership
Tools work. A new principle needs an entry there and an SVG in `src/assets/icons/`, or the
build fails: art is wired next to the art registry, not authored in the content.

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

## Course content (`src/content/course/`)

The paid video course is four collections in one directory:

```
src/content/course/
  modules/m01.yaml, m02.yaml, …        one per module: title, summary, worksheet, checks
  lessons/v01.md, v02.md, …            one per lesson: frontmatter + six fixed sections
  lessons/_template.md                 copy this to start a lesson (the _ keeps it out of the collection)
  worksheets/w-m01.md, w-m02.md, …     one printable worksheet per module
  assessment-forms/*.json              PRIVATE: the assessment forms
```

The ids are the spine. Lessons are `v01` upward, modules `m01` upward, and a module's worksheet
is always `w-` plus its module id. How many of each there should be lives in `COURSE.plan`
([`src/data/course.ts`](../src/data/course.ts)), so a missing file is a build error rather than a
gap nobody notices. Ids never change once a lesson is published: they are the URL and they are
the key on every progress row.

Nothing reads these collections directly. `getCourseCatalog()`
([`src/lib/course/catalog.ts`](../src/lib/course/catalog.ts)) reads all three public ones, runs
every cross-file rule, and throws with a list of every problem it found, naming the file for
each. So when the build stops, read the whole message before editing anything.

### A lesson file

```markdown
---
title: "Lesson title"
module: m01
kind: standard              # standard | orientation (the assessment orientation) | plan (the closing lesson)
next: v02                   # the next lesson in the suggested order; omitted on the last lesson only
worksheet: w-m01            # must be its module's worksheet
streamUid: null             # the 32-hex Cloudflare Stream uid, once the master is uploaded
durationMin: 0              # planned minutes until the master is edited, then the real length
status: draft               # the production ladder, below
contentVersion: 1
preview: false              # true on exactly one lesson, the free one
videoPlaceholder: false     # true while the stand-in clip is playing instead of a recording
approvals: {}               # copy / edit / captions, each "YYYY-MM-DD INITIALS"
---

## Outcome
## Key points
## Exercise
## Model response
## Self-review
## Transcript
```

**The body is exactly those six `##` headings, in that order, and nothing before the first
one.** The body is never rendered whole: the API hands the island one section at a time, which
is how lesson prose stays out of public HTML while one renderer serves the enrolled lesson and
the free preview page. Getting a heading wrong, renaming one, or adding a seventh fails the
build with the list it expected and the list it found.

**The chain, not an `order` field.** The suggested order is a chain of `next` starting at `v01`.
It has to visit every lesson exactly once, in id order, and end at the last one, so a broken
`next` is caught rather than silently reordering the course. Along that chain, modules ascend
and each module's lessons are contiguous: a lesson cannot belong to an earlier module than the
lesson before it, and a module cannot appear, stop, and start again.

**The status ladder** is `draft`, `approved`, `filmed`, `edited`, `captioned`, `staged`,
`published`. It is monotone: every rung keeps everything the rungs below it required.

| Rung | What it additionally requires |
|---|---|
| `draft` | Nothing beyond the schema. Write freely. |
| `approved` | Outcome and Key points written; Exercise too, except on the orientation lesson; Model response and Self-review on a standard lesson; `approvals.copy` stamped. |
| `filmed` | Nothing of its own. It is the marker that the recording exists and the edit has not been delivered. |
| `edited` | `streamUid` set, `durationMin` at least 1, and `approvals.edit` stamped. A lesson carrying `videoPlaceholder: true` is exempt from the uid and the stamp, because it has no video of its own yet. |
| `captioned` | Transcript written and `approvals.captions` stamped. Also skipped while `videoPlaceholder` is true. |
| `staged` | Visible to an admin for a final look. A placeholder lesson cannot reach this rung while the course is `open`. |
| `published` | Live for every enrolled learner. |

Two other rules worth knowing before you hit them:

- `kind` is `standard` everywhere except the two lessons named in `COURSE`
  (`orientationLessonId` and `planLessonId`), which have their own kinds and their own
  completion rules.
- Every module but the last carries exactly two checks; the last carries none, because it ends
  in the assessment instead.

**`contentVersion`** starts at 1 and is bumped when copy or the master changes *after* the
lesson is published. It is stamped on the progress row so we can tell which version somebody
learned from. Bumping it never resets anybody's progress, and it is not a substitute for a new
lesson: a change big enough to invalidate what a learner already did is a new lesson id.

**`preview: true`** marks the one free lesson, and the validator insists there is exactly one
and that it is the lesson named in `COURSE.previewLessonId`. Once the course is `open` that
lesson must be `published` and must not be on the placeholder clip, because it is the thing a
stranger watches before deciding.

**`videoPlaceholder: true`** means "the recording does not exist yet, play the stand-in". The
clip is rendered by `scripts/render-placeholder-video.mjs`, uploaded to Stream once, and its uid
set in `COURSE.placeholderStreamUid`, so every placeholder lesson shares one upload and no
lesson file carries a fake uid. Swapping in the real recording is an ordinary content edit: set
`streamUid`, delete `videoPlaceholder`, stamp the approvals. See
[course-production.md](course-production.md) for the upload steps.

### A module file

```yaml
title: Start with the whole system
summary: >-
  One or two sentences, used on the syllabus and the learner dashboard.
worksheet: w-m01
checks:
  - question: >-
      A question with exactly two answers.
    choices:
      - The wrong one.
      - The right one.
    answer: 2                 # 1-based index into choices. DEVELOPER FIELD, see below.
    explanation: >-
      Why the right answer is right. Shown after the learner picks.
```

**`answer` never reaches the browser.** It is a developer field: a check is served as its
question and two choices, the learner's pick is graded on the server, and the explanation comes
back with the verdict. So do not render a check from a page or an island, and never put `answer`
in an API response. `GET /api/course/check?module_id=` serves a module's checks without the
key, `POST /api/course/check` grades one pick and returns the explanation with the verdict, and
`src/lib/server/course/content.ts` is the only place the key is read. The explanations are
currently interim wording from the course brief, and David replaces each one with the matching
expected-answer text from that module's workbook.

### Where the checks appear

Each module with checks has a page at `/course/learn/modules/<id>` (`m01` to `m08`; module 9
has no checks and no page) listing its lessons, its worksheet and the two questions. The
dashboard card, the lesson drawer and the last step of every lesson in the module link there.
Every answer is recorded, a wrong answer shows the explanation and allows another try, and the
module counts as complete once every published lesson is done and both questions have a correct
answer. Nothing in the module's shell carries a question; the island fetches them.

### Moving a lesson up

Three tools help the ladder along, all built on the same catalog the build validates:

- **The Content tab in `/admin`** lists every lesson in chain order with its status, its next
  rung and what that rung still needs, in the validator's own words. It runs the same gate
  function the build runs (`gatesMissing` in `src/lib/course/validate.ts`), so if the tab says a
  lesson is ready to move up, the build will agree.
- **An admin can read a staged lesson in place** by adding `?preview=1` to its URL. The lesson
  API opens staged lessons to admins only; the island shows a banner naming the status and
  records nothing, since the progress route refuses unpublished lessons by design. A learner on
  the same URL gets a 404.
- **The free lesson page** at `/course/preview` renders the one `preview: true` lesson at build
  time, and only when the course is public and that lesson is published. Until then it is a 404
  that writes nothing. A preview lesson still on the stand-in clip renders without a player,
  because the clip is signed and the free page embeds without a token, so the free lesson needs
  its own recording before the page is worth linking. The page has no line in `llms.txt` and no
  `.md` variant: the spec keeps lesson prose out of the machine-readable surfaces, and the free
  lesson is still lesson prose.

### A worksheet file

Frontmatter is `title` and `module`; the body is the worksheet, in Markdown. It renders on a
printable page, so write it as something a person fills in on paper: numbered prompts with room
under them, and a short worked example at the end. Today every enrolled learner can fetch every
worksheet from their first day, because a worksheet is a planning tool rather than an answer
key. If that ever needs gating behind a published lesson in the module, it is a decision for
David to make, not a bug to fix quietly.

### Assessment forms

`src/content/course/assessment-forms/*.json`. **This is the one content type an author cannot
preview in a page**, because rendering it anywhere would leak it, so the schema messages and
this section are the reference.
[`sample-p0.json`](../src/content/course/assessment-forms/sample-p0.json) is the worked example:
read it beside this list.

| Field | What it is |
|---|---|
| `form_id` | Lowercase letters, digits and hyphens. Stable forever: it is recorded on every attempt that used it. |
| `version` | Integer from 1. Bump it when you edit a live form. Attempts keep the version they were graded against. |
| `certification_version` | The `CERTIFICATION_VERSION` in [`src/data/certification.ts`](../src/data/certification.ts) this form assesses against. |
| `status` | `active`, `retired` or `sample`. See below. |
| `order` | Integer from 0. Lower numbers are handed out first, ties broken by `form_id`. |
| `private_marker` | The literal `SSS-PRIVATE-ASSESSMENT-FORM`. The dist scan looks for this string, so it is both a declaration and a tripwire. |
| `stages[]` | `id`, `part` (`A`, `B` or `C`), `title`, optional `intro`, optional `reveal`, `lock_on_advance`, and `prompts[]`. |
| `prompts[]` | `prompt_id` (a lowercase letter then lowercase letters and digits), `text`, `required`, `min_chars`, `max_chars`, `principle_ids[]`, `tool_ids[]`. |
| `reference_responses[]` | `prompt_id` and `text`: one sound answer, for the grader only. |
| `scoring_anchors[]` | `criterion_id` and `note`: how this form's scenario reads against that criterion. |
| `lesson_ids[]` | The lessons the grader may point a learner back to. Nothing outside this list can appear in a result. |
| `notes` | Optional guidance for the grader about this form. |

**The cross-field rules**, all in `checkForm`
([`src/lib/course/assessmentForm.ts`](../src/lib/course/assessmentForm.ts)), reported by
`npm run check` as a list:

- Stage ids are unique, and prompt ids are unique across the whole form, not just within a
  stage.
- A form has at least one stage, and every stage at least one prompt.
- **The first stage cannot have a `reveal`**, because there is nothing before it to reveal
  anything after.
- **A `reveal` requires the previous stage to have `lock_on_advance: true`.** A reveal is new
  information that changes the situation, and it is only fair if the learner's earlier answers
  are already locked. Otherwise they could go back and quietly rewrite history.
- Parts run `A`, then `B`, then `C`, and never back up.
- `0 <= min_chars <= max_chars <= 8000` on every prompt. The ceiling matches the check
  constraint on the responses table.
- **Every one of the Wisdom Principles and every Leadership Tool is named by at least one
  prompt's `principle_ids` / `tool_ids`.** That mapping is the coverage map the grader is given,
  so a form that does not exercise the whole system cannot certify anybody against it.
- Every `required` prompt has a reference response, and every reference response names a real
  prompt.
- One scoring anchor per criterion at most, and the criterion has to be one of the real ones.
- `lesson_ids` is non-empty, unique, and every entry is a well-formed lesson id. The check is
  the shape of the id, not whether a lesson stands behind it: an id with no lesson is shown to
  the learner as the bare id in the revision list on their result, so write ids that name real
  lessons and check them against the catalog yourself.
- No em dashes, no en dashes and no unrendered `{{token}}` in any string a learner or the grader
  reads.

**What the statuses mean.** `active` forms are the ones handed out. `retired` forms are kept
because attempts reference them, and are never handed out again. `sample` is the pilot form: it
is assignable under `astro dev` and wherever `COURSE_SAMPLE_FORMS` is exactly `true` (the
`course-beta` context), and nowhere else. A learner is given the lowest-`order` assignable form
they have not seen; one exposure per form per learner, so a learner who has seen every
assignable form is told so honestly rather than handed the same scenario twice.

**Adding Form A and Form B.** Copy `sample-p0.json`, give each a real `form_id`, `order: 1` and
`order: 2`, `status: 'active'`, and write a new scenario for each: a different relationship and a
different kind of conflict, since two forms that feel like the same story do not give a retake
any meaning. Keep the stage shape (a locking Part A, a reveal in Part B) because the reveal is
how the assessment tests revision rather than recall. Then leave the sample in place as
`status: 'sample'`: it is what local development and the beta context use, and deleting it takes
the dev path with it.

**The privacy rules, which are enforced rather than trusted:**

- **Exactly two files may name the collection**: `src/content/config.ts`, which defines it, and
  `src/lib/server/course/forms.ts`, which reads it. `scripts/check-private-content.mjs` fails
  `npm run check` on any other reference to `assessmentForms`, and on any page or component
  reaching into the forms directory.
- **Never render a form field in a page or an island.** The learner sees only the stages they
  have reached, served from the snapshot frozen onto their attempt, and a later prompt is
  withheld along with its reveal (a prompt like "what will you change" gives away the shape of
  what is coming).
- `scripts/check-dist-leak.mjs` fails `npm run build` if the private marker, a reveal, a
  reference response, a scoring anchor, a note, or the intro or a prompt of any stage after the
  first turns up anywhere in `dist/`. It searches the plain text, the HTML-entity form and the
  backslash-escaped form, so an escaped quote cannot hide a leak.

If either guard fires, the fix is the import or the component, never the guard.

---

## Concept icons — `src/assets/icons/` + `Icon.astro`

Every named concept (the three parts of the system, the three protocol steps, the four
Leadership Tools, the 12 Wisdom Principles, the Four Pillars) uses a custom line-icon
rather than emoji. Sources are plain SVGs in `src/assets/icons/<name>.svg`;
`src/components/Icon.astro` renders one by name:

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
  like `src/data/concepts.ts` can reference them. Content collections map from their slug to
  an icon in the same file: `TOOL_ICONS`/`toolIcon()` for Leadership Tools, and
  `PRINCIPLE_ICONS`/`principleIcon()` for Wisdom Principles. `toolIcon` returns `undefined`
  for a tool whose art does not exist yet; `principleIcon` throws, because all 12 principles
  have art and a hole in that grid should stop the build.
- Icons are **monochrome by rule**. No icon carries its own colour, a second tone, or a fill
  that is not `currentColor`, so one icon can sit in brand blue on a card and in gold on an
  ink panel without a second file.
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
