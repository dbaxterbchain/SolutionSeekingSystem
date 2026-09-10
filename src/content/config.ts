import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { APPROVAL_RE, MODULE_ID_RE, STREAM_UID_RE, WORKSHEET_ID_RE, hasBannedCopy } from '../lib/course/ids';
import { LESSON_KINDS, LESSON_STATUSES } from '../lib/course/types';

/**
 * Wisdom Principles — the "source code" of the system. Every principle shares
 * the same 6-part documentation format, enforced here so the detail template
 * can render any principle uniformly.
 */
const principles = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/principles' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      order: z.number(),
      tagline: z.string(),
      // No icon field: the line icon comes from PRINCIPLE_ICONS in
      // src/lib/icons.ts, keyed by this file's id, the same way the Leadership
      // Tools work. Art belongs next to the art registry, not in the content.
      // Hero/card illustration, path relative to the YAML file
      // (e.g. ../../assets/principles/understanding.webp). Optional so a new
      // principle still builds before its art exists.
      illustration: image().optional(),
      illustrationAlt: z.string().optional(), // descriptive alt for the illustration
      // 1. Description
      whatItIs: z.string(),
      howUsed: z.string(),
      // 2. Best Practices
      bestPractices: z.array(z.string()),
      // 3. Goals
      goals: z.array(z.string()),
      // 4. Antigoals
      antigoals: z.array(z.string()),
      // 5. Practice Patterns / Education
      practices: z.array(z.object({ title: z.string(), body: z.string() })),
      // 6. FAQ / Common Issues
      faq: z.array(z.object({ q: z.string(), a: z.string() })),
      // Worked example
      example: z.string(),
    }),
});

/** The 3-step Communication Protocol. Narrative content authored in Markdown. */
const protocol = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/protocol' }),
  schema: z.object({
    title: z.string(),
    step: z.number(),
    summary: z.string(),
    oneLine: z.string(),
    requires: z.array(
      z.object({
        name: z.string(),
        why: z.string(),
        // Optional link target: the id of the Wisdom Principle this refers to.
        slug: z.string().optional(),
      })
    ),
  }),
});

/** Leadership Tools — real practices that apply the protocol. Markdown bodies. */
const tools = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/tools' }),
  schema: z.object({
    title: z.string(),
    order: z.number(),
    summary: z.string(),
    outcomes: z.array(z.string()),
    triggers: z.array(z.string()),
  }),
});

/**
 * Demo library — hand-crafted, fictional, annotated Guide/Mentor conversations
 * showing the before/after transformation. The MDX body is the transcript
 * (rendered with the components in src/components/demo/); the `spec` block
 * doubles as a QA behavior spec for the assistant that a future regression
 * pass can replay against the live model.
 */
const demos = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/demos' }),
  schema: z
    .object({
      title: z.string(),
      order: z.number(),
      agent: z.enum(['guide', 'mentor']),
      // Named context id (src/lib/contexts.ts) the "use this yourself" CTA links
      // to; cross-checked against the registry at build time in the demo pages.
      context: z.string(),
      scenario: z.string(), // one-line setup for cards, meta descriptions, OG
      before: z.string(), // the user's raw starting state, quoted on the card
      after: z.array(z.string()).min(3), // concrete outcome bullets
      spec: z.object({
        expected: z.array(z.string()),
        unacceptable: z.array(z.string()),
      }),
      /**
       * Exactly one demo is `featured` and carries an `excerpt`: the short
       * exchange lifted onto the home page as proof the system does something.
       *
       * The turns must appear VERBATIM in the transcript below. That is checked
       * at build time (src/lib/demoExcerpt.ts) and the build fails otherwise, so
       * the home page cannot drift into saying something the Guide never said.
       * Our only social proof is that these conversations are real; an excerpt
       * that quietly diverges from its source would spend exactly that.
       */
      featured: z.boolean().default(false),
      excerpt: z
        .object({
          turns: z
            .array(
              z.object({
                role: z.enum(['user', 'assistant']),
                text: z.string(),
              })
            )
            .min(2),
          // What a reader should notice in the exchange.
          caption: z.string(),
        })
        .optional(),
    })
    .refine((d) => !d.featured || d.excerpt !== undefined, {
      message: 'A featured demo must have an `excerpt` (the home page renders it).',
      path: ['excerpt'],
    }),
});

/* ---------------------------------------------------------------------------
 * The paid video course. Three collections under src/content/course/, read
 * ONLY through getCourseCatalog() (src/lib/course/catalog.ts), which checks
 * every cross-file rule (the lesson chain, module contiguity, check counts,
 * status gates) and fails the build on a violation. Per-entry rules live here.
 *
 * Authoring format: docs/content-guide.md, "Course content".
 * ------------------------------------------------------------------------- */

/** The house copy rule, enforced on every string a learner might read. */
const cleanCopy = (label: string) =>
  z.string().refine((s) => !hasBannedCopy(s), {
    message: `${label}: no em dashes, en dashes, or {{tokens}} (see CLAUDE.md)`,
  });

const courseModules = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/course/modules' }),
  schema: z.object({
    title: cleanCopy('title'),
    summary: cleanCopy('summary'),
    worksheet: z.string().regex(WORKSHEET_ID_RE),
    // Two authored checks for modules 1 to 8, none for module 9 (the catalog
    // validator counts them). `answer` is a developer field: the check API
    // sends question and choices only, and grades the learner's pick.
    checks: z
      .array(
        z.object({
          question: cleanCopy('question'),
          choices: z.tuple([cleanCopy('choice'), cleanCopy('choice')]),
          answer: z.union([z.literal(1), z.literal(2)]),
          explanation: cleanCopy('explanation'),
        })
      )
      .default([]),
  }),
});

const courseLessons = defineCollection({
  // [^_] keeps _template.md (the copy-me starter) out of the collection.
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/course/lessons' }),
  schema: z.object({
    title: cleanCopy('title'),
    module: z.string().regex(MODULE_ID_RE),
    kind: z.enum(LESSON_KINDS).default('standard'),
    // The next lesson in the suggested order; omitted only on v40. The
    // validator proves the chain visits all 40 lessons in id order.
    next: z.string().optional(),
    worksheet: z.string().regex(WORKSHEET_ID_RE),
    // Cloudflare Stream video uid; captions live on the video in Stream.
    streamUid: z.string().regex(STREAM_UID_RE).nullable().default(null),
    // Planned minutes until the edited master exists, then the real length.
    durationMin: z.number().int().min(0).default(0),
    status: z.enum(LESSON_STATUSES).default('draft'),
    // Bump when copy or the master changes after publish. Never resets progress.
    contentVersion: z.number().int().min(1).default(1),
    preview: z.boolean().default(false),
    videoPlaceholder: z.boolean().default(false),
    approvals: z
      .object({
        copy: z.string().regex(APPROVAL_RE).optional(),
        edit: z.string().regex(APPROVAL_RE).optional(),
        captions: z.string().regex(APPROVAL_RE).optional(),
      })
      .default({}),
  }),
});

const courseWorksheets = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/course/worksheets' }),
  schema: z.object({
    title: cleanCopy('title'),
    module: z.string().regex(MODULE_ID_RE),
  }),
});

export const collections = {
  principles,
  protocol,
  tools,
  demos,
  courseModules,
  courseLessons,
  courseWorksheets,
};
