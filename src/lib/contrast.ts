/**
 * WCAG contrast ratios, so /design can state its own accessibility numbers
 * instead of asserting them.
 *
 * A brand page that hand-writes "8.66:1" is one token change away from lying, in
 * public, to the people it was handed to. These run at build time against the
 * same `tailwind.config.mjs` the site is built from, so the numbers cannot drift
 * from the colours beside them.
 *
 * Pure functions, no dependencies: safe to import from an Astro page, a React
 * island, or a script.
 */

/** #RGB or #RRGGBB to [r, g, b], each 0-255. */
function toRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/** Relative luminance, per WCAG 2.1. */
function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two hex colours, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** "8.66:1", rounded the way a spec sheet would print it. */
export const ratio = (a: string, b: string): string => `${contrast(a, b).toFixed(2)}:1`;

/**
 * What a colour pair is actually cleared for, at normal body size.
 *
 * The thresholds are WCAG AA: 4.5:1 for body text, 3:1 for large text and for
 * meaningful non-text like icons and control borders. Anything below 3 is
 * decoration, and saying so plainly is the point of showing this at all.
 */
export type ContrastVerdict = 'text' | 'large' | 'decorative';

export function verdict(a: string, b: string): ContrastVerdict {
  const r = contrast(a, b);
  if (r >= 4.5) return 'text';
  if (r >= 3) return 'large';
  return 'decorative';
}

export const VERDICT_LABEL: Record<ContrastVerdict, string> = {
  text: 'Body text',
  large: 'Large text and UI',
  decorative: 'Decorative only',
};
