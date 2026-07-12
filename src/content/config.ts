import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Wisdom Principles — the "source code" of the system. Every principle shares
 * the same 6-part documentation format, enforced here so the detail template
 * can render any principle uniformly.
 */
const principles = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/principles' }),
  schema: z.object({
    title: z.string(),
    order: z.number(),
    tagline: z.string(),
    icon: z.string(), // emoji used as a lightweight visual marker
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
  schema: z.object({
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
  }),
});

export const collections = { principles, protocol, tools, demos };
