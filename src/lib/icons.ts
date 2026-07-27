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
