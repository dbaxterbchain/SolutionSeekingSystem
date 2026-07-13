import type { CollectionEntry } from 'astro:content';

/**
 * The featured demo excerpt, verified against its own transcript at build time.
 *
 * Why this exists: the home page's proof section quotes a Guide conversation.
 * The excerpt is authored by hand in frontmatter (the MDX body is a component
 * tree, not something to slice programmatically), and hand-copied text drifts.
 * A quote that has drifted from its source is a fabricated testimonial wearing
 * the clothes of a real one, and real conversations are the ONLY social proof
 * this site has. So the drift is made impossible rather than discouraged: if a
 * turn is not present verbatim in the transcript, the build fails.
 *
 * Comparison is whitespace- and typography-insensitive (curly vs straight
 * quotes) but otherwise exact. That checks what was *said*, not how the author
 * happened to paste it.
 */

const normalize = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

export type FeaturedDemo = CollectionEntry<'demos'> & {
  data: CollectionEntry<'demos'>['data'] & {
    excerpt: NonNullable<CollectionEntry<'demos'>['data']['excerpt']>;
  };
};

/**
 * Pick the featured demo and prove its excerpt is real. Throws at build time,
 * which is the point: a broken excerpt must never reach a reader.
 */
export function getFeaturedDemo(demos: CollectionEntry<'demos'>[]): FeaturedDemo {
  const featured = demos.filter((d) => d.data.featured);
  if (featured.length !== 1) {
    throw new Error(
      `Expected exactly 1 demo with \`featured: true\` (the home page renders it), found ${featured.length}.`
    );
  }

  const demo = featured[0] as FeaturedDemo;
  const body = normalize(demo.body ?? '');
  if (!body) {
    throw new Error(`Demo "${demo.id}" has no readable body to verify its excerpt against.`);
  }

  for (const turn of demo.data.excerpt.turns) {
    if (!body.includes(normalize(turn.text))) {
      throw new Error(
        `Demo "${demo.id}": excerpt ${turn.role} turn is not verbatim in the transcript.\n` +
          `The home page must quote the real conversation. Fix the excerpt to match, or\n` +
          `change the transcript deliberately.\n\n` +
          `Not found: ${turn.text.slice(0, 120)}…`
      );
    }
  }

  return demo;
}
