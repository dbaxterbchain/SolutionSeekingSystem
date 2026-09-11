/**
 * Stable course ids. Lesson ids are the video ids from the course plan (v01..v40),
 * module ids are m01..m09, worksheet ids are w-m01..w-m09. Content files are
 * named by these ids, so they double as URLs and as the keys of every
 * progress row; they never change once published.
 */

export const LESSON_ID_RE = /^v(0[1-9]|[1-3][0-9]|40)$/;
export const MODULE_ID_RE = /^m0[1-9]$/;
export const WORKSHEET_ID_RE = /^w-m0[1-9]$/;
/** A Cloudflare Stream video uid: 32 lowercase hex characters. */
export const STREAM_UID_RE = /^[0-9a-f]{32}$/;
/** An approval stamp in a lesson file: "YYYY-MM-DD INITIALS". */
export const APPROVAL_RE = /^\d{4}-\d{2}-\d{2} [A-Z]{2,3}$/;

export const MAX_LESSON = 40;
export const MAX_MODULE = 9;

export function lessonNumber(id: string): number {
  if (!LESSON_ID_RE.test(id)) throw new Error(`Not a lesson id: "${id}"`);
  return Number(id.slice(1));
}

export function lessonId(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > MAX_LESSON) {
    throw new Error(`Lesson number out of range: ${n}`);
  }
  return `v${String(n).padStart(2, '0')}`;
}

export function moduleNumber(id: string): number {
  if (!MODULE_ID_RE.test(id)) throw new Error(`Not a module id: "${id}"`);
  return Number(id.slice(1));
}

export function moduleId(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > MAX_MODULE) {
    throw new Error(`Module number out of range: ${n}`);
  }
  return `m0${n}`;
}

export const worksheetIdFor = (moduleIdValue: string): string => `w-${moduleIdValue}`;

/** The id a module check is recorded under: `m03-c2` is the second check of module 3. */
export const checkId = (moduleIdValue: string, n: number): string => `${moduleIdValue}-c${n}`;

/**
 * The house copy rule (CLAUDE.md): no em dashes, no en dashes, and no template
 * token left unrendered. Checked on every string and body in the course content.
 */
const BANNED_DASHES_RE = /[—–]/;

export const hasBannedCopy = (s: string): boolean => BANNED_DASHES_RE.test(s) || s.includes('{{');
