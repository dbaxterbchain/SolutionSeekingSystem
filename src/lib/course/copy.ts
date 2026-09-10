import { COURSE, COURSE_STATUS, COURSE_TOKENS, type CourseToken } from '../../data/course';
import { COURSE_PRICE } from '../../data/pricing';
import type { CourseStatus } from './status';

export type TokenValues = Record<CourseToken, string | null>;

export interface CopyContext {
  status?: CourseStatus;
  tokens?: TokenValues;
}

const TOKEN_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

/**
 * Render `{{token}}` placeholders from the course configuration. Throws, and
 * therefore fails the build, on an unknown token, a token with no value yet,
 * a malformed token left in the output, or a price rendered before the course
 * is open for sale. Placeholders in the brief are settings, not copy to ship.
 */
export function courseCopy(template: string, ctx: CopyContext = {}): string {
  const status = ctx.status ?? COURSE_STATUS;
  const tokens = ctx.tokens ?? COURSE_TOKENS;

  const out = template.replace(TOKEN_RE, (_match, name: string) => {
    if (!(name in tokens)) throw new Error(`Unknown course copy token {{${name}}}`);
    if (name === 'course_price' && status !== 'open') {
      throw new Error('{{course_price}} may only be rendered when PUBLIC_COURSE_STATUS is open');
    }
    const value = tokens[name as CourseToken];
    if (value === null || value === '') {
      throw new Error(
        `Course copy token {{${name}}} has no value yet. Set it in src/data/course.ts.`
      );
    }
    return value;
  });

  if (out.includes('{{') || out.includes('}}')) {
    throw new Error(`Unresolved template token in course copy: ${out}`);
  }
  return out;
}

export interface LaunchContext extends CopyContext {
  price?: typeof COURSE_PRICE;
  launchConfirmed?: string | null;
}

/**
 * The launch gate. A no-op unless the course is open; then every token, the
 * price, and David's confirmation date must be present or the build fails.
 * Called from the sales page frontmatter.
 */
export function assertLaunchSettings(ctx: LaunchContext = {}): void {
  const status = ctx.status ?? COURSE_STATUS;
  if (status !== 'open') return;

  const tokens = ctx.tokens ?? COURSE_TOKENS;
  const price = ctx.price === undefined ? COURSE_PRICE : ctx.price;
  const launchConfirmed =
    ctx.launchConfirmed === undefined ? COURSE.launchConfirmed : ctx.launchConfirmed;

  const missing = (Object.keys(tokens) as CourseToken[]).filter((key) => !tokens[key]);
  if (!price && !missing.includes('course_price')) missing.push('course_price');
  if (missing.length > 0) {
    throw new Error(
      `The course cannot open for sale: missing ${missing.join(', ')} ` +
        '(src/data/course.ts and src/data/pricing.ts)'
    );
  }
  if (!launchConfirmed) {
    throw new Error(
      'The course cannot open for sale: COURSE.launchConfirmed is not set. ' +
        'David confirms every launch token, then records the date in src/data/course.ts.'
    );
  }
}
