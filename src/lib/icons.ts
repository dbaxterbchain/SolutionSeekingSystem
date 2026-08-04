/**
 * Custom concept line-icons. Each name has a matching source file at
 * `src/assets/icons/<name>.svg`, rendered inline by `src/components/Icon.astro`
 * so it inherits the surrounding text color via `currentColor`.
 *
 * The names live here (not in Icon.astro) so plain `.ts` modules such as
 * `src/data/concepts.ts` can reference them without importing an .astro file.
 */
export const ICON_NAMES = [
  // The three parts of the system
  'protocol',
  'principles',
  'tools',
  // The three Communication Protocol steps
  'introspection',
  'mutual-understanding',
  'solution-spark',
  // The four Leadership Tools
  'one-on-one',
  'feedback',
  'targeted',
  'sessions',
  // The 12 Wisdom Principles, in principle order
  'understanding',
  'good-faith',
  'forgiveness',
  'humility-pride',
  'compassion',
  'bravery',
  'vulnerability',
  'patience',
  'fairness',
  'integrity',
  'flexibility',
  'critical-thinking',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/**
 * Leadership Tool slug (content collection id) to icon name. Keeping this next
 * to the names means the tools index and a tool's detail page always agree.
 */
export const TOOL_ICONS = {
  'one-on-ones': 'one-on-one',
  feedback: 'feedback',
  'targeted-conversations': 'targeted',
  'solution-seeking-sessions': 'sessions',
} as const satisfies Record<string, IconName>;

/** Icon for a Leadership Tool slug, or undefined for a tool without art yet. */
export function toolIcon(slug: string): IconName | undefined {
  return (TOOL_ICONS as Record<string, IconName>)[slug];
}

/**
 * Wisdom Principle slug (content collection id) to icon name. Two names differ
 * from their slug because the artwork is named for what it draws, not for the
 * principle's full title: `humility` is a crown set down, `compassion-empathy`
 * is a heart.
 *
 * Every principle has art, so `principleIcon` returns a required IconName and
 * a new principle without an icon fails the build here rather than rendering a
 * hole in the grid.
 */
export const PRINCIPLE_ICONS = {
  understanding: 'understanding',
  'good-faith': 'good-faith',
  forgiveness: 'forgiveness',
  humility: 'humility-pride',
  'compassion-empathy': 'compassion',
  bravery: 'bravery',
  vulnerability: 'vulnerability',
  patience: 'patience',
  fairness: 'fairness',
  integrity: 'integrity',
  flexibility: 'flexibility',
  'critical-thinking': 'critical-thinking',
} as const satisfies Record<string, IconName>;

export type PrincipleSlug = keyof typeof PRINCIPLE_ICONS;

/** Icon for a Wisdom Principle slug. */
export function principleIcon(slug: string): IconName {
  const name = (PRINCIPLE_ICONS as Record<string, IconName>)[slug];
  if (!name) throw new Error(`No icon registered for principle "${slug}" (src/lib/icons.ts)`);
  return name;
}
