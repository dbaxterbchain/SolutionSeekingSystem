# Course Phase 1a: Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the course's foundations in place: a test runner, the offer configuration and copy tokens, the three course content collections with build-time validation, the V04 lesson and all 39 stubs, learner lesson shells that make the build exercise the validator, and the core database migration.

**Architecture:** Course content lives in repo collections under `src/content/course/` and is read only through `getCourseCatalog()`, which validates every cross-file rule and throws at build time. Pure rule modules under `src/lib/course/` take plain inputs and are unit-tested with vitest; the one `astro:content` glue module is exercised by `npm run build`. Enrollment, progress and stream-token tables are server-write-only (RLS on, no policies, service role only).

**Tech Stack:** Astro 5 content collections (glob loader + Zod), TypeScript, vitest, Supabase migrations (Postgres), Netlify build.

**Spec:** `docs/superpowers/specs/2026-09-09-paid-video-course-design.md` (sections: Decisions, Content model and authoring format, Data model `0030_course.sql`, Offer configuration and launch flag, Testing strategy, Phase 1 tasks 1 to 4)

## Global Constraints

- No em dashes (`—`) or en dashes (`–`) in any user-facing copy, content body, error message or explanation; fix the sentence, never the character. Audit with `grep -rn "—" src/`.
- No counted-pair headings ("One system, three parts").
- Content frontmatter is camelCase (`streamUid`, `durationMin`); database columns and API JSON are snake_case.
- No Zod outside `src/content/config.ts`; API routes use hand-rolled checks (not touched in this plan).
- `npm run check`, `npm test` and `npm run build` must be green at the end of every task. `npm run build` needs a `.env` (present locally).
- Course collections may be read only through `getCourseCatalog()` in `src/lib/course/catalog.ts`. Islands may receive course data only as the `PublicCurriculum` shape.
- New tables: RLS enabled, no policies, grants to `service_role` only (migration `0010` revoked defaults, so nothing else can reach them). Functions pin `search_path` in the CREATE header and revoke EXECUTE from `public, anon, authenticated`.
- New env vars go in `.env.example` with a comment and in `src/env.d.ts`; secrets are never `PUBLIC_`.
- Commit messages: one imperative sentence, ending with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Work on branch `course`.
- `docs/status.md` is updated in the final Phase 1 sub-plan (docs and ship), not per task.

---

## File map

| File | Responsibility |
|---|---|
| `vitest.config.ts`, `package.json` scripts, `netlify.toml` | test runner wired into the Netlify build |
| `src/lib/course/ids.ts` | id regexes and number/id conversions; banned-copy check |
| `src/lib/course/types.ts` | `LESSON_STATUSES`, `LESSON_KINDS`, input types shared by validator and catalog |
| `src/lib/course/status.ts` | `parseCourseStatus()` for `PUBLIC_COURSE_STATUS` |
| `src/data/certification.ts` | public rubric: criteria, weights, anchors, pass rule, principle and tool ids |
| `src/data/course.ts` | course constants, launch tokens, `COURSE_STATUS` |
| `src/data/pricing.ts` | `COURSE_PRICE` (null until launch) |
| `src/lib/course/copy.ts` | `courseCopy()` token rendering and `assertLaunchSettings()` |
| `src/content/config.ts` | `courseModules`, `courseLessons`, `courseWorksheets` collections |
| `src/lib/course/lessonSections.ts` | splits a lesson body into its six sections |
| `src/lib/course/validate.ts` | `validateCatalog()`: every cross-file rule, builds the `Catalog` |
| `src/lib/course/curriculum.ts` | `publicCurriculum()`: the only course shape islands may receive |
| `src/lib/course/visibility.ts` | who may see a lesson in each status |
| `src/lib/course/catalog.ts` | Astro glue: reads the collections, calls the validator, memoises |
| `src/content/course/**` | modules, lessons (V04 authored, 39 stubs, template), worksheets |
| `scripts/scaffold-course-lessons.mjs` | writes missing lesson stubs from the video plan; never overwrites |
| `src/pages/course/learn/lessons/[id].astro` | prerendered lesson shells (title, outcome, prev/next); the island comes in Phase 1c |
| `astro.config.mjs`, `src/pages/robots.txt.ts`, `src/pages/og/[...route].ts` | keep learner shells out of the sitemap and index; OG cards for shells |
| `src/lib/server/env.ts` | `serverEnv()` safe when `import.meta.env` is undefined (Netlify function bundles) |
| `supabase/migrations/0030_course.sql` | enrollments, enrollment events, progress, check attempts, stream tokens |

---

### Task 1: Test runner, id helpers, and the spec commit

**Files:**
- Create: `vitest.config.ts`, `src/lib/course/ids.ts`, `src/lib/course/__tests__/ids.test.ts`
- Modify: `package.json` (scripts), `netlify.toml`
- Commit: `docs/superpowers/specs/2026-09-09-paid-video-course-design.md`

**Interfaces:**
- Produces: `LESSON_ID_RE`, `MODULE_ID_RE`, `WORKSHEET_ID_RE`, `STREAM_UID_RE`, `APPROVAL_RE`, `lessonNumber(id): number`, `lessonId(n): string`, `moduleNumber(id): number`, `moduleId(n): string`, `worksheetIdFor(moduleId): string`, `hasBannedCopy(s): boolean` from `src/lib/course/ids.ts`.

- [ ] **Step 1: Install vitest and add the scripts**

```bash
npm i -D vitest
npm pkg set scripts.test="vitest run" scripts.test:watch="vitest"
```

- [ ] **Step 2: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

// Pure course modules only. Nothing under test may import astro:content,
// Supabase, Stripe, Resend, or call fetch; those paths are verified by the
// build and by browser walkthroughs (CLAUDE.md, "Verifying features").
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/lib/course/__tests__/**/*.test.ts',
      'src/lib/server/course/__tests__/**/*.test.ts',
    ],
  },
});
```

- [ ] **Step 3: Write the failing test `src/lib/course/__tests__/ids.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  APPROVAL_RE,
  LESSON_ID_RE,
  MODULE_ID_RE,
  STREAM_UID_RE,
  WORKSHEET_ID_RE,
  hasBannedCopy,
  lessonId,
  lessonNumber,
  moduleId,
  moduleNumber,
  worksheetIdFor,
} from '../ids';

describe('course ids', () => {
  it('accepts v01..v40 and nothing else', () => {
    expect(LESSON_ID_RE.test('v01')).toBe(true);
    expect(LESSON_ID_RE.test('v40')).toBe(true);
    expect(LESSON_ID_RE.test('v00')).toBe(false);
    expect(LESSON_ID_RE.test('v41')).toBe(false);
    expect(LESSON_ID_RE.test('V04')).toBe(false);
  });

  it('converts between lesson ids and numbers', () => {
    expect(lessonNumber('v04')).toBe(4);
    expect(lessonId(4)).toBe('v04');
    expect(lessonId(40)).toBe('v40');
    expect(() => lessonNumber('x1')).toThrow();
    expect(() => lessonId(41)).toThrow();
  });

  it('converts between module ids and numbers, and derives worksheet ids', () => {
    expect(MODULE_ID_RE.test('m09')).toBe(true);
    expect(MODULE_ID_RE.test('m10')).toBe(false);
    expect(moduleNumber('m02')).toBe(2);
    expect(moduleId(2)).toBe('m02');
    expect(worksheetIdFor('m02')).toBe('w-m02');
    expect(WORKSHEET_ID_RE.test('w-m02')).toBe(true);
  });

  it('recognises stream uids and approval stamps', () => {
    expect(STREAM_UID_RE.test('5d5bc37ffcf54c9b82e996823bffbb81')).toBe(true);
    expect(STREAM_UID_RE.test('not-a-uid')).toBe(false);
    expect(APPROVAL_RE.test('2026-09-12 DB')).toBe(true);
    expect(APPROVAL_RE.test('12/09/2026 DB')).toBe(false);
  });

  it('flags em dashes, en dashes and unresolved tokens', () => {
    expect(hasBannedCopy('plain text')).toBe(false);
    expect(hasBannedCopy('a — b')).toBe(true);
    expect(hasBannedCopy('10–12 hours')).toBe(true);
    expect(hasBannedCopy('{{course_price}}')).toBe(true);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run src/lib/course/__tests__/ids.test.ts`
Expected: FAIL (cannot resolve `../ids`)

- [ ] **Step 5: Write `src/lib/course/ids.ts`**

```ts
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

/**
 * The house copy rule (CLAUDE.md): no em dashes, no en dashes, and no template
 * token left unrendered. Checked on every string and body in the course content.
 */
const BANNED_DASHES_RE = /[—–]/;

export const hasBannedCopy = (s: string): boolean => BANNED_DASHES_RE.test(s) || s.includes('{{');
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/lib/course/__tests__/ids.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 7: Wire the test run into the Netlify build**

Append to `netlify.toml` (after the `[build.environment]` block):

```toml
# Pure-module tests run before every deploy build; a validator regression
# cannot ship. Overrides the build command in the Netlify UI.
[build]
  command = "npm test && npm run build"
  publish = "dist"
```

- [ ] **Step 8: Verify the full gate**

Run: `npm test && npm run check`
Expected: vitest reports 1 file, 5 passed; `astro check` reports 0 errors.

- [ ] **Step 9: Commit the spec and the runner**

```bash
git add docs/superpowers/specs/2026-09-09-paid-video-course-design.md docs/superpowers/plans/2026-09-09-course-phase1a-foundations.md vitest.config.ts package.json package-lock.json netlify.toml src/lib/course/ids.ts src/lib/course/__tests__/ids.test.ts
git commit -m "Add the course design spec, a vitest runner for pure course modules, and the course id helpers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Offer configuration, launch flag, rubric data, and copy tokens

**Files:**
- Create: `src/lib/course/status.ts`, `src/data/certification.ts`, `src/data/course.ts`, `src/lib/course/copy.ts`, `src/lib/course/__tests__/status.test.ts`, `src/lib/course/__tests__/certification.test.ts`, `src/lib/course/__tests__/copy.test.ts`
- Modify: `src/data/pricing.ts` (append), `src/env.d.ts`, `.env.example`, `src/lib/server/env.ts`

**Interfaces:**
- Consumes: `hasBannedCopy` from Task 1.
- Produces: `parseCourseStatus(raw): CourseStatus` and `type CourseStatus = 'hidden' | 'preview' | 'open'` (`status.ts`); `COURSE`, `COURSE_STATUS`, `COURSE_TOKENS`, `type CourseToken` (`course.ts`); `COURSE_PRICE` (`pricing.ts`); `CERTIFICATION_VERSION`, `CRITERIA`, `CRITERION_IDS`, `SCORE_ANCHORS`, `PASS_TOTAL`, `PASS_MIN_CRITERION`, `PRINCIPLE_IDS`, `TOOL_IDS` (`certification.ts`); `courseCopy(template, ctx?)`, `assertLaunchSettings(ctx?)` (`copy.ts`).

- [ ] **Step 1: Write the failing status test `src/lib/course/__tests__/status.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { parseCourseStatus } from '../status';

describe('parseCourseStatus', () => {
  it('defaults to hidden', () => {
    expect(parseCourseStatus(undefined)).toBe('hidden');
    expect(parseCourseStatus('')).toBe('hidden');
    expect(parseCourseStatus('hidden')).toBe('hidden');
  });

  it('accepts preview and open', () => {
    expect(parseCourseStatus('preview')).toBe('preview');
    expect(parseCourseStatus('open')).toBe('open');
  });

  it('rejects anything else loudly', () => {
    expect(() => parseCourseStatus('live')).toThrow(/PUBLIC_COURSE_STATUS/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/course/__tests__/status.test.ts`
Expected: FAIL (cannot resolve `../status`)

- [ ] **Step 3: Write `src/lib/course/status.ts`**

```ts
/**
 * The launch flag. `hidden` (default): public course pages are not built, the
 * learner area works by URL for granted enrollments, checkout refuses
 * non-admins. `preview`: public pages are live with "coming soon" and no
 * purchase. `open`: purchase enabled and every launch token asserted at build.
 */
export type CourseStatus = 'hidden' | 'preview' | 'open';

export function parseCourseStatus(raw: string | undefined): CourseStatus {
  if (raw === undefined || raw === '' || raw === 'hidden') return 'hidden';
  if (raw === 'preview' || raw === 'open') return raw;
  throw new Error(`PUBLIC_COURSE_STATUS must be hidden, preview, or open (got "${raw}")`);
}
```

- [ ] **Step 4: Run the status test to verify it passes**

Run: `npx vitest run src/lib/course/__tests__/status.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing certification test `src/lib/course/__tests__/certification.test.ts`**

```ts
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CRITERIA,
  CRITERION_IDS,
  PASS_MIN_CRITERION,
  PASS_TOTAL,
  PRINCIPLE_IDS,
  SCORE_ANCHORS,
  TOOL_IDS,
} from '../../../data/certification';
import { PRINCIPLE_ICONS, TOOL_ICONS } from '../../icons';

const basenames = (dir: string, ext: string) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => f.slice(0, -ext.length))
    .sort();

describe('certification rubric data', () => {
  it('has six criteria whose weights sum to 100', () => {
    expect(CRITERIA).toHaveLength(6);
    expect(CRITERIA.reduce((sum, c) => sum + c.weight, 0)).toBe(100);
    expect(new Set(CRITERION_IDS).size).toBe(6);
  });

  it('publishes the five score anchors and the pass rule', () => {
    expect(Object.keys(SCORE_ANCHORS)).toEqual(['0', '1', '2', '3', '4']);
    expect(PASS_TOTAL).toBe(80);
    expect(PASS_MIN_CRITERION).toBe(3);
  });

  it('lists exactly the principles and tools that exist as content', () => {
    expect([...PRINCIPLE_IDS].sort()).toEqual(basenames('src/content/principles', '.yaml'));
    expect([...PRINCIPLE_IDS].sort()).toEqual(Object.keys(PRINCIPLE_ICONS).sort());
    expect([...TOOL_IDS].sort()).toEqual(basenames('src/content/tools', '.md'));
    expect([...TOOL_IDS].sort()).toEqual(Object.keys(TOOL_ICONS).sort());
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/lib/course/__tests__/certification.test.ts`
Expected: FAIL (cannot resolve `../../../data/certification`)

- [ ] **Step 7: Write `src/data/certification.ts`**

```ts
/**
 * The published certification rubric. Rendered on /course/certification and
 * used by the grader (src/lib/server/course/rubric.ts re-exports it), so the
 * page and the grader cannot disagree. Pure data, safe to import anywhere.
 *
 * Wording follows the course brief. Learner-facing, so the house copy rules
 * apply (no em dashes).
 */

/** Frozen before any certificate is awarded. A substantial change bumps it. */
export const CERTIFICATION_VERSION = '1';
export const CERTIFICATION_TITLE = 'Solution Seeking System Certification';
export const CERTIFICATION_METHOD = 'AI-assessed, unproctored';

export const CRITERIA = [
  {
    id: 'self_understanding',
    name: 'Self-understanding',
    weight: 15,
    demonstrates: 'Separates the account, feelings, assumptions, and useful questions.',
  },
  {
    id: 'mutual_understanding',
    name: 'Mutual Understanding',
    weight: 20,
    demonstrates:
      'Represents both accounts and asks each person to correct and confirm the summary.',
  },
  {
    id: 'wisdom_principles',
    name: 'Wisdom Principles',
    weight: 20,
    demonstrates: 'Applies all 12 principles in concrete choices, including their relevant limits.',
  },
  {
    id: 'solution_quality',
    name: 'Solution quality',
    weight: 20,
    demonstrates:
      'Offers fair actions, owners, evidence, timing, and a review. Keeps a proposal distinct from an agreement.',
  },
  {
    id: 'judgment_tools',
    name: 'Judgment and Leadership Tools',
    weight: 15,
    demonstrates:
      'Matches all four tools to their purposes. Chooses an appropriate main-case tool and respects participation limits.',
  },
  {
    id: 'learning_living_systems',
    name: 'Learning and Living Systems',
    weight: 10,
    demonstrates:
      'Uses implementation evidence and feedback to revise a solution and an ongoing practice.',
  },
] as const;

export type CriterionId = (typeof CRITERIA)[number]['id'];
export const CRITERION_IDS: readonly CriterionId[] = CRITERIA.map((c) => c.id);

/** What each score from 0 to 4 means. Substance is judged, never length. */
export const SCORE_ANCHORS = {
  0: 'Missing or contrary evidence.',
  1: 'A label or a major misconception.',
  2: 'Partial application with a material gap.',
  3: 'Independent, appropriate application.',
  4: 'Sound application with a clear correction, reason, or tradeoff.',
} as const;

/** Weighted total out of 100 needed to pass, and the floor for every criterion. */
export const PASS_TOTAL = 80;
export const PASS_MIN_CRITERION = 3;

/** Content collection ids of the 12 Wisdom Principles (src/content/principles). */
export const PRINCIPLE_IDS = [
  'understanding',
  'good-faith',
  'forgiveness',
  'humility',
  'compassion-empathy',
  'bravery',
  'vulnerability',
  'patience',
  'fairness',
  'integrity',
  'flexibility',
  'critical-thinking',
] as const;
export type PrincipleId = (typeof PRINCIPLE_IDS)[number];

/** Content collection ids of the four Leadership Tools (src/content/tools). */
export const TOOL_IDS = [
  'one-on-ones',
  'feedback',
  'targeted-conversations',
  'solution-seeking-sessions',
] as const;
export type ToolId = (typeof TOOL_IDS)[number];
```

- [ ] **Step 8: Run the certification test to verify it passes**

Run: `npx vitest run src/lib/course/__tests__/certification.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 9: Append `COURSE_PRICE` to `src/data/pricing.ts`**

Append at the end of the file:

```ts
/**
 * The video course: a one-time purchase, separate from the subscription, and
 * deliberately NOT a PlanId. resolvePlan() iterates PLANS and must keep
 * rejecting anything that is not a self-serve subscription; the course has
 * its own resolver (src/lib/server/course/offer.ts) and checkout endpoint.
 *
 * Null until the launch price exists in Stripe. While it is null the sales
 * page refuses to render a price (see courseCopy in src/lib/course/copy.ts),
 * so a provisional number can never leak into a build.
 */
export const COURSE_PRICE: { priceLabel: string; priceAmount: string; currency: 'USD' } | null =
  null;
```

- [ ] **Step 10: Write `src/data/course.ts`**

```ts
import { COURSE_PRICE } from './pricing';
import { CERTIFICATION_VERSION } from './certification';
import { parseCourseStatus, type CourseStatus } from '../lib/course/status';

/**
 * The single configuration record for the paid video course. Pure data, safe
 * to import from pages, islands, and API routes. Prices come from pricing.ts
 * (never retype one); the Stripe price id is server-held and lives in env.
 *
 * NOT for the Netlify worker function: this file reads import.meta.env at
 * module load, which is undefined outside Vite-built code.
 */

export const COURSE_STATUS: CourseStatus = parseCourseStatus(
  import.meta.env.PUBLIC_COURSE_STATUS
);

export const COURSE = {
  id: 'sss-course-v1',
  title: 'Complete Solution Seeking course',
  navLabel: 'Video course',
  presenter: 'David Baxter',
  learnerHours: '10-12',
  suggestedWeeks: 6,
  /** Asserted against the content collections at build time. */
  plan: { modules: 9, lessons: 40 },
  certificationVersion: CERTIFICATION_VERSION,
  /** The public "Watch a free lesson" lesson. */
  previewLessonId: 'v05',
  /** V39: the assessment orientation (studied + acknowledged completes it). */
  orientationLessonId: 'v39',
  /** V40: the continuing-practice plan (a written response completes it). */
  planLessonId: 'v40',
  /** ISO date David confirmed every launch token below. Required for an `open` build. */
  launchConfirmed: null as string | null,
} as const;

export type CourseToken =
  | 'course_price'
  | 'access_summary'
  | 'refund_summary'
  | 'support_contact'
  | 'review_target'
  | 'retakes_summary'
  | 'retention_summary';

/**
 * Copy tokens rendered into the sales page, checkout summary, FAQ, emails and
 * account screens via courseCopy(). A null value is a launch decision still to
 * be made; courseCopy() throws rather than render it. The support contact and
 * review target are needed from the first pilot, so they are set now.
 */
export const COURSE_TOKENS: Record<CourseToken, string | null> = {
  course_price: COURSE_PRICE?.priceLabel ?? null,
  access_summary: null,
  refund_summary: null,
  support_contact: 'hello@solutionseeking.com',
  review_target: 'five working days',
  retakes_summary: 'Retakes are included.',
  retention_summary: null,
};
```

- [ ] **Step 11: Write the failing copy test `src/lib/course/__tests__/copy.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { assertLaunchSettings, courseCopy } from '../copy';
import type { CourseToken } from '../../../data/course';

const full: Record<CourseToken, string> = {
  course_price: '$149',
  access_summary: 'Lifetime access, including updates.',
  refund_summary: 'Full refund within 14 days.',
  support_contact: 'hello@solutionseeking.com',
  review_target: 'five working days',
  retakes_summary: 'Retakes are included.',
  retention_summary: 'Responses are kept for 12 months.',
};

describe('courseCopy', () => {
  it('renders known tokens', () => {
    expect(courseCopy('Reach us at {{support_contact}}.', { status: 'hidden', tokens: full })).toBe(
      'Reach us at hello@solutionseeking.com.'
    );
  });

  it('throws on an unknown token, naming it', () => {
    expect(() => courseCopy('{{price}}', { status: 'open', tokens: full })).toThrow(/\{\{price\}\}/);
  });

  it('throws on a token that has no value yet', () => {
    const tokens = { ...full, access_summary: null };
    expect(() => courseCopy('{{access_summary}}', { status: 'open', tokens })).toThrow(
      /access_summary/
    );
  });

  it('throws on a malformed token left in the output', () => {
    expect(() => courseCopy('{{ Course_Price }}', { status: 'open', tokens: full })).toThrow(
      /unresolved/i
    );
  });

  it('refuses to render the price unless the course is open', () => {
    expect(() => courseCopy('{{course_price}}', { status: 'preview', tokens: full })).toThrow(
      /open/
    );
    expect(courseCopy('Get it for {{course_price}}', { status: 'open', tokens: full })).toBe(
      'Get it for $149'
    );
  });
});

describe('assertLaunchSettings', () => {
  const price = { priceLabel: '$149', priceAmount: '149.00', currency: 'USD' as const };

  it('is a no-op while the course is hidden or in preview', () => {
    expect(() =>
      assertLaunchSettings({ status: 'hidden', tokens: { ...full, refund_summary: null } })
    ).not.toThrow();
    expect(() =>
      assertLaunchSettings({ status: 'preview', tokens: { ...full, refund_summary: null } })
    ).not.toThrow();
  });

  it('lists every missing setting when the course is open', () => {
    expect(() =>
      assertLaunchSettings({
        status: 'open',
        tokens: { ...full, refund_summary: null, retention_summary: null },
        price: null,
        launchConfirmed: null,
      })
    ).toThrow(/refund_summary, retention_summary, course_price/);
  });

  it('requires the launch confirmation date', () => {
    expect(() =>
      assertLaunchSettings({ status: 'open', tokens: full, price, launchConfirmed: null })
    ).toThrow(/launchConfirmed/);
  });

  it('passes when everything is set', () => {
    expect(() =>
      assertLaunchSettings({ status: 'open', tokens: full, price, launchConfirmed: '2026-11-01' })
    ).not.toThrow();
  });
});
```

- [ ] **Step 12: Run it to verify it fails**

Run: `npx vitest run src/lib/course/__tests__/copy.test.ts`
Expected: FAIL (cannot resolve `../copy`)

- [ ] **Step 13: Write `src/lib/course/copy.ts`**

```ts
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
```

- [ ] **Step 14: Run the copy test to verify it passes**

Run: `npx vitest run src/lib/course/__tests__/copy.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 15: Type the new env var and document it**

In `src/env.d.ts`, add inside `ImportMetaEnv`:

```ts
  /** Course launch flag: hidden (default) | preview | open. See src/lib/course/status.ts. */
  readonly PUBLIC_COURSE_STATUS?: string;
```

Append to `.env.example`:

```bash

# Paid video course. The launch flag (src/lib/course/status.ts):
#   hidden  (default) public course pages are not built; the learner area works by
#           URL for enrollments granted from /admin; checkout refuses non-admins.
#   preview public pages are live with "coming soon" and no purchase.
#   open    purchase enabled; every launch token in src/data/course.ts is asserted
#           at build time. Production stays hidden through the pilots.
PUBLIC_COURSE_STATUS=hidden
```

- [ ] **Step 16: Make `serverEnv` safe outside Vite bundles**

Replace the body of `src/lib/server/env.ts` with:

```ts
/**
 * Runtime lookup for server-only env vars. Bracket access keeps Vite from
 * inlining values into the build output at build time (Netlify's secrets
 * scanner flags inlined secret values, and inlined keys go stale on
 * rotation); process.env covers the Netlify Functions runtime.
 *
 * `import.meta.env` is undefined in a plain Netlify function bundle (the
 * course grading worker), so it is read defensively.
 */
export function serverEnv(name: string): string {
  const meta = (import.meta as { env?: Record<string, string | undefined> }).env;
  return meta?.[name] ?? process.env[name] ?? '';
}
```

- [ ] **Step 17: Verify the full gate**

Run: `npm test && npm run check`
Expected: 4 test files, 20 tests passed; 0 check errors.

- [ ] **Step 18: Commit**

```bash
git add src/lib/course/status.ts src/data/certification.ts src/data/course.ts src/data/pricing.ts src/lib/course/copy.ts src/lib/course/__tests__ src/env.d.ts .env.example src/lib/server/env.ts
git commit -m "Add the course offer configuration, launch flag, published rubric data, and copy tokens

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Course collections and the lesson section parser

**Files:**
- Create: `src/lib/course/types.ts`, `src/lib/course/lessonSections.ts`, `src/lib/course/__tests__/lessonSections.test.ts`, `src/content/course/lessons/_template.md`
- Modify: `src/content/config.ts`

**Interfaces:**
- Consumes: `hasBannedCopy`, the id regexes (Task 1).
- Produces: `LESSON_STATUSES`, `type LessonStatus`, `LESSON_KINDS`, `type LessonKind`, `LessonInput`, `ModuleInput`, `ModuleCheck`, `WorksheetInput` (`types.ts`); `parseLessonSections(body): { ok: true; sections: LessonSections } | { ok: false; error: string }`, `LESSON_SECTION_HEADINGS`, `type LessonSections` (`lessonSections.ts`); collections `courseModules`, `courseLessons`, `courseWorksheets`.

- [ ] **Step 1: Write `src/lib/course/types.ts`**

```ts
/**
 * Shared shapes for the course content pipeline. Plain types only, so the
 * validator and its tests never touch astro:content.
 */

/** The production ladder. Monotone: each rung requires everything below it. */
export const LESSON_STATUSES = [
  'draft',
  'approved',
  'filmed',
  'edited',
  'captioned',
  'staged',
  'published',
] as const;
export type LessonStatus = (typeof LESSON_STATUSES)[number];

/** Drives the completion rule: standard lessons need practice and a model reveal. */
export const LESSON_KINDS = ['standard', 'orientation', 'plan'] as const;
export type LessonKind = (typeof LESSON_KINDS)[number];

export interface LessonApprovals {
  copy?: string;
  edit?: string;
  captions?: string;
}

export interface LessonInput {
  id: string;
  title: string;
  module: string;
  kind: LessonKind;
  next?: string;
  worksheet: string;
  streamUid: string | null;
  durationMin: number;
  status: LessonStatus;
  contentVersion: number;
  preview: boolean;
  /** The video is a temporary clip; relaxes the transcript and edit gates while the course is not open. */
  videoPlaceholder: boolean;
  approvals: LessonApprovals;
  body: string;
}

export interface ModuleCheck {
  question: string;
  choices: [string, string];
  /** 1-based index into `choices`. Server-only: never rendered before an answer. */
  answer: 1 | 2;
  explanation: string;
}

export interface ModuleInput {
  id: string;
  title: string;
  summary: string;
  worksheet: string;
  checks: ModuleCheck[];
}

export interface WorksheetInput {
  id: string;
  title: string;
  module: string;
  body: string;
}
```

- [ ] **Step 2: Write the failing section-parser test `src/lib/course/__tests__/lessonSections.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { LESSON_SECTION_HEADINGS, parseLessonSections } from '../lessonSections';

const body = [
  '## Outcome',
  'Tell one thing apart from another.',
  '',
  '## Key points',
  '- First point.',
  '- Second point.',
  '',
  '### A sub-heading is fine inside a section',
  '',
  '## Exercise',
  'Try it.',
  '',
  '## Model response',
  'Observation: something happened.',
  '',
  '## Self-review',
  '- I checked.',
  '',
  '## Transcript',
  'Welcome back.',
  '',
].join('\n');

describe('parseLessonSections', () => {
  it('names the six headings in order', () => {
    expect([...LESSON_SECTION_HEADINGS]).toEqual([
      'Outcome',
      'Key points',
      'Exercise',
      'Model response',
      'Self-review',
      'Transcript',
    ]);
  });

  it('splits a well-formed body into trimmed sections', () => {
    const result = parseLessonSections(body);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sections.outcome).toBe('Tell one thing apart from another.');
    expect(result.sections.keyPoints).toContain('### A sub-heading is fine inside a section');
    expect(result.sections.transcript).toBe('Welcome back.');
  });

  it('accepts empty sections (a stub lesson) and Windows line endings', () => {
    const stub = LESSON_SECTION_HEADINGS.map((h) => `## ${h}\r\n`).join('\r\n');
    const result = parseLessonSections(stub);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sections.outcome).toBe('');
    expect(result.sections.transcript).toBe('');
  });

  it('rejects a missing heading, naming what was found', () => {
    const result = parseLessonSections(body.replace('## Self-review\n', ''));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Self-review/);
    expect(result.error).toMatch(/Found:/);
  });

  it('rejects headings out of order', () => {
    const swapped = body
      .replace('## Exercise', '## TEMP')
      .replace('## Model response', '## Exercise')
      .replace('## TEMP', '## Model response');
    expect(parseLessonSections(swapped).ok).toBe(false);
  });

  it('rejects an extra top-level heading', () => {
    expect(parseLessonSections(body + '\n## Notes\nextra\n').ok).toBe(false);
  });

  it('rejects text before the first heading', () => {
    const result = parseLessonSections('Intro paragraph.\n\n' + body);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/before the first/);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/course/__tests__/lessonSections.test.ts`
Expected: FAIL (cannot resolve `../lessonSections`)

- [ ] **Step 4: Write `src/lib/course/lessonSections.ts`**

```ts
/**
 * A lesson body is six fixed "##" sections in a fixed order. The body is never
 * rendered whole: the enrolled lesson API returns these strings one by one,
 * and the public preview page renders the same component at build time. That
 * is how lesson prose stays out of public HTML while one renderer serves both.
 */
export const LESSON_SECTION_HEADINGS = [
  'Outcome',
  'Key points',
  'Exercise',
  'Model response',
  'Self-review',
  'Transcript',
] as const;

const SECTION_KEYS = [
  'outcome',
  'keyPoints',
  'exercise',
  'modelResponse',
  'selfReview',
  'transcript',
] as const;

export interface LessonSections {
  outcome: string;
  keyPoints: string;
  exercise: string;
  modelResponse: string;
  selfReview: string;
  transcript: string;
}

export type LessonSectionsResult =
  | { ok: true; sections: LessonSections }
  | { ok: false; error: string };

export function parseLessonSections(body: string): LessonSectionsResult {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const headings: { name: string; line: number }[] = [];
  lines.forEach((line, index) => {
    const match = /^## (.+?)\s*$/.exec(line);
    if (match) headings.push({ name: match[1], line: index });
  });

  const expected = [...LESSON_SECTION_HEADINGS];
  const found = headings.map((h) => h.name);
  const inOrder =
    found.length === expected.length && found.every((name, i) => name === expected[i]);
  if (!inOrder) {
    return {
      ok: false,
      error:
        `Expected exactly these "##" headings, in this order: ${expected.join(' | ')}. ` +
        `Found: ${found.join(' | ') || '(none)'}`,
    };
  }

  const preamble = lines.slice(0, headings[0].line).join('\n').trim();
  if (preamble) {
    return { ok: false, error: 'Text before the first "## Outcome" heading is not allowed' };
  }

  const sections = {} as Record<(typeof SECTION_KEYS)[number], string>;
  headings.forEach((heading, i) => {
    const end = i + 1 < headings.length ? headings[i + 1].line : lines.length;
    sections[SECTION_KEYS[i]] = lines.slice(heading.line + 1, end).join('\n').trim();
  });
  return { ok: true, sections };
}
```

- [ ] **Step 5: Run the parser test to verify it passes**

Run: `npx vitest run src/lib/course/__tests__/lessonSections.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Add the three collections to `src/content/config.ts`**

Add these imports at the top (after the existing two):

```ts
import { APPROVAL_RE, MODULE_ID_RE, STREAM_UID_RE, WORKSHEET_ID_RE, hasBannedCopy } from '../lib/course/ids';
import { LESSON_KINDS, LESSON_STATUSES } from '../lib/course/types';
```

Add before `export const collections`:

```ts
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
```

Change the export to:

```ts
export const collections = {
  principles,
  protocol,
  tools,
  demos,
  courseModules,
  courseLessons,
  courseWorksheets,
};
```

- [ ] **Step 7: Write the template `src/content/course/lessons/_template.md`**

```markdown
---
# Copy this file to <lessonId>.md (v01..v40). The underscore keeps this one out
# of the collection. Every field is explained in docs/content-guide.md.
title: "Lesson title"
module: m01
kind: standard              # standard | orientation (v39 only) | plan (v40 only)
next: v02                   # omit on v40
worksheet: w-m01
streamUid: null             # 32-hex Cloudflare Stream uid once the master is uploaded
durationMin: 0              # planned minutes until edited, then the real length
status: draft               # draft | approved | filmed | edited | captioned | staged | published
contentVersion: 1
preview: false              # true on exactly one lesson (v05)
videoPlaceholder: false     # true while a temporary clip stands in for the recording
approvals: {}               # copy: 2026-09-12 DB / edit: ... BC / captions: ... DB
---

## Outcome

## Key points

## Exercise

## Model response

## Self-review

## Transcript
```

- [ ] **Step 8: Verify the schemas compile**

Run: `npm run check`
Expected: 0 errors. (No content files exist yet; the glob loader warns about empty directories only at build time, and Task 5 fills them before the next build.)

- [ ] **Step 9: Commit**

```bash
git add src/lib/course/types.ts src/lib/course/lessonSections.ts src/lib/course/__tests__/lessonSections.test.ts src/content/config.ts src/content/course/lessons/_template.md
git commit -m "Define the course content collections and the lesson section parser

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Catalog validator, public curriculum, and visibility rules

**Files:**
- Create: `src/lib/course/validate.ts`, `src/lib/course/curriculum.ts`, `src/lib/course/visibility.ts`, `src/lib/course/__tests__/fixtures.ts`, `src/lib/course/__tests__/validate.test.ts`, `src/lib/course/__tests__/curriculum.test.ts`, `src/lib/course/__tests__/visibility.test.ts`

**Interfaces:**
- Consumes: Task 1 ids, Task 3 types and `parseLessonSections`, `CourseStatus` (Task 2).
- Produces: `validateCatalog(input: CatalogInput): Catalog` with `CatalogInput`, `Catalog`, `CatalogLesson` (adds `seq`, `order`, `moduleOrder`, `prevId`, `nextId`, `sections`), `CatalogModule` (adds `order`, `lessonIds`, `minutes`); `publicCurriculum(catalog): PublicCurriculum`; `isLearnerVisible(lesson)`, `hasShell(lesson)`, `isVisibleTo(lesson, adminPreview)`.

- [ ] **Step 1: Write the fixture builder `src/lib/course/__tests__/fixtures.ts`**

```ts
import { lessonId, moduleId, worksheetIdFor } from '../ids';
import type { CatalogInput } from '../validate';
import type { LessonInput, ModuleCheck, ModuleInput, WorksheetInput } from '../types';

/** Lessons per module, from the course plan (3+7+9+6+3+5+2+3+2 = 40). */
export const MODULE_SIZES = [3, 7, 9, 6, 3, 5, 2, 3, 2];

export const FULL_BODY = [
  '## Outcome',
  'Outcome text.',
  '',
  '## Key points',
  '- One point.',
  '',
  '## Exercise',
  'Try this.',
  '',
  '## Model response',
  'A model.',
  '',
  '## Self-review',
  '- Checked.',
  '',
  '## Transcript',
  'Spoken words.',
  '',
].join('\n');

export const EMPTY_BODY = [
  '## Outcome',
  '## Key points',
  '## Exercise',
  '## Model response',
  '## Self-review',
  '## Transcript',
  '',
].join('\n\n');

export const check = (): ModuleCheck => ({
  question: 'Which is it?',
  choices: ['This one.', 'That one.'],
  answer: 1,
  explanation: 'Because this one.',
});

export const PUBLISHED_FIELDS: Partial<LessonInput> = {
  status: 'published',
  streamUid: '5d5bc37ffcf54c9b82e996823bffbb81',
  durationMin: 8,
  approvals: { copy: '2026-09-12 DB', edit: '2026-09-20 BC', captions: '2026-09-22 DB' },
  body: FULL_BODY,
};

/** A valid 40-lesson, 9-module draft catalog. Tests mutate one thing at a time. */
export function buildInput(overrides: Partial<CatalogInput> = {}): CatalogInput {
  const lessons: LessonInput[] = [];
  const modules: ModuleInput[] = [];
  const worksheets: WorksheetInput[] = [];
  let n = 0;
  MODULE_SIZES.forEach((size, mi) => {
    const mid = moduleId(mi + 1);
    modules.push({
      id: mid,
      title: `Module ${mi + 1}`,
      summary: 'What this module covers.',
      worksheet: worksheetIdFor(mid),
      checks: mi === MODULE_SIZES.length - 1 ? [] : [check(), check()],
    });
    worksheets.push({
      id: worksheetIdFor(mid),
      title: `Worksheet ${mi + 1}`,
      module: mid,
      body: 'Fill this in.',
    });
    for (let j = 0; j < size; j++) {
      n += 1;
      const id = lessonId(n);
      lessons.push({
        id,
        title: `Lesson ${n}`,
        module: mid,
        kind: id === 'v39' ? 'orientation' : id === 'v40' ? 'plan' : 'standard',
        next: n < 40 ? lessonId(n + 1) : undefined,
        worksheet: worksheetIdFor(mid),
        streamUid: null,
        durationMin: 5,
        status: 'draft',
        contentVersion: 1,
        preview: id === 'v05',
        videoPlaceholder: false,
        approvals: {},
        body: EMPTY_BODY,
      });
    }
  });
  return {
    lessons,
    modules,
    worksheets,
    courseStatus: 'hidden',
    plan: { modules: 9, lessons: 40 },
    previewLessonId: 'v05',
    orientationLessonId: 'v39',
    planLessonId: 'v40',
    ...overrides,
  };
}

export function withLesson(
  input: CatalogInput,
  id: string,
  patch: Partial<LessonInput>
): CatalogInput {
  return { ...input, lessons: input.lessons.map((l) => (l.id === id ? { ...l, ...patch } : l)) };
}

export function withModule(
  input: CatalogInput,
  id: string,
  patch: Partial<ModuleInput>
): CatalogInput {
  return { ...input, modules: input.modules.map((m) => (m.id === id ? { ...m, ...patch } : m)) };
}
```

- [ ] **Step 2: Write the failing validator test `src/lib/course/__tests__/validate.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { validateCatalog } from '../validate';
import { PUBLISHED_FIELDS, buildInput, withLesson, withModule } from './fixtures';

describe('validateCatalog', () => {
  it('accepts a valid draft catalog and derives sequence, order and minutes', () => {
    const catalog = validateCatalog(buildInput());
    expect(catalog.lessons).toHaveLength(40);
    expect(catalog.modules).toHaveLength(9);
    expect(catalog.byId.v04).toMatchObject({
      seq: 4,
      order: 1,
      moduleOrder: 2,
      prevId: 'v03',
      nextId: 'v05',
    });
    expect(catalog.byId.v40.nextId).toBeNull();
    expect(catalog.modules[1].lessonIds).toEqual(['v04', 'v05', 'v06', 'v07', 'v08', 'v09', 'v10']);
    expect(catalog.modules[1].minutes).toBe(35);
    expect(catalog.summary).toBe(
      'course catalog: 40 lessons, 9 modules, 0 published, 0 staged, 0 minutes published'
    );
  });

  it('reports every failure at once, with the lesson id', () => {
    const input = withLesson(withLesson(buildInput(), 'v04', { next: 'v06' }), 'v10', {
      module: 'm01',
    });
    expect(() => validateCatalog(input)).toThrow(/v05/);
    expect(() => validateCatalog(input)).toThrow(/v10/);
  });

  it('rejects a broken next chain', () => {
    expect(() => validateCatalog(withLesson(buildInput(), 'v04', { next: 'v06' }))).toThrow(
      /v05 is not reachable/
    );
    expect(() => validateCatalog(withLesson(buildInput(), 'v39', { next: undefined }))).toThrow(
      /must end at v40/
    );
  });

  it('rejects a missing or extra lesson', () => {
    const input = buildInput();
    expect(() =>
      validateCatalog({ ...input, lessons: input.lessons.filter((l) => l.id !== 'v40') })
    ).toThrow(/Missing lesson file for v40/);
  });

  it('rejects modules with the wrong number of checks', () => {
    expect(() => validateCatalog(withModule(buildInput(), 'm01', { checks: [] }))).toThrow(
      /m01: expected 2 checks, found 0/
    );
  });

  it('requires modules to be contiguous and ascending along the chain', () => {
    expect(() => validateCatalog(withLesson(buildInput(), 'v04', { module: 'm03' }))).toThrow(
      /ascend|contiguous/
    );
  });

  it('requires exactly one preview lesson, and it must be v05', () => {
    expect(() => validateCatalog(withLesson(buildInput(), 'v06', { preview: true }))).toThrow(
      /Exactly one lesson must have preview: true/
    );
    const moved = withLesson(withLesson(buildInput(), 'v05', { preview: false }), 'v06', {
      preview: true,
    });
    expect(() => validateCatalog(moved)).toThrow(/preview lesson must be v05/);
  });

  it('pins kinds to v39 and v40', () => {
    expect(() => validateCatalog(withLesson(buildInput(), 'v39', { kind: 'standard' }))).toThrow(
      /v39: kind must be "orientation"/
    );
    expect(() => validateCatalog(withLesson(buildInput(), 'v04', { kind: 'plan' }))).toThrow(
      /v04: kind must be "standard"/
    );
  });

  it('gates approved on the prose sections and the copy approval', () => {
    const input = withLesson(buildInput(), 'v04', { status: 'approved' });
    expect(() => validateCatalog(input)).toThrow(/v04 \(approved\): Outcome is empty/);
    expect(() => validateCatalog(input)).toThrow(/approvals.copy is required/);
  });

  it('gates published on the video, transcript and approvals', () => {
    const noTranscript = withLesson(buildInput(), 'v04', {
      ...PUBLISHED_FIELDS,
      body: PUBLISHED_FIELDS.body!.replace('Spoken words.', ''),
    });
    expect(() => validateCatalog(noTranscript)).toThrow(/Transcript is empty/);
    expect(() =>
      validateCatalog(withLesson(buildInput(), 'v04', { ...PUBLISHED_FIELDS, streamUid: null }))
    ).toThrow(/streamUid is required/);
    const catalog = validateCatalog(withLesson(buildInput(), 'v04', PUBLISHED_FIELDS));
    expect(catalog.summary).toBe(
      'course catalog: 40 lessons, 9 modules, 1 published, 0 staged, 8 minutes published'
    );
  });

  it('lets a placeholder video publish without a transcript, but never while open', () => {
    const placeholder = withLesson(buildInput(), 'v04', {
      ...PUBLISHED_FIELDS,
      videoPlaceholder: true,
      approvals: { copy: '2026-09-12 DB' },
      body: PUBLISHED_FIELDS.body!.replace('Spoken words.', ''),
    });
    expect(() => validateCatalog(placeholder)).not.toThrow();
    expect(() => validateCatalog({ ...placeholder, courseStatus: 'open' })).toThrow(
      /placeholder video cannot ship/
    );
  });

  it('requires the preview lesson to be published once the course is public', () => {
    expect(() => validateCatalog({ ...buildInput(), courseStatus: 'preview' })).toThrow(
      /preview lesson must be published/
    );
  });

  it('rejects em dashes anywhere in a body', () => {
    const dashed = withLesson(buildInput(), 'v04', {
      body: buildInput().lessons[3].body.replace('## Transcript', '## Transcript\nA — B'),
    });
    expect(() => validateCatalog(dashed)).toThrow(/v04: no em dashes/);
  });

  it('rejects a worksheet that does not match its module', () => {
    expect(() => validateCatalog(withLesson(buildInput(), 'v04', { worksheet: 'w-m03' }))).toThrow(
      /v04: worksheet must be w-m02/
    );
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/course/__tests__/validate.test.ts`
Expected: FAIL (cannot resolve `../validate`)

- [ ] **Step 4: Write `src/lib/course/validate.ts`**

```ts
import {
  LESSON_ID_RE,
  WORKSHEET_ID_RE,
  hasBannedCopy,
  lessonId,
  lessonNumber,
  moduleId,
  moduleNumber,
  worksheetIdFor,
} from './ids';
import { parseLessonSections, type LessonSections } from './lessonSections';
import type { CourseStatus } from './status';
import {
  LESSON_STATUSES,
  type LessonInput,
  type LessonKind,
  type LessonStatus,
  type ModuleInput,
  type WorksheetInput,
} from './types';

/**
 * Every cross-file rule for the course content, in one pure function. The
 * catalog module feeds it the collections; the tests feed it fixtures. It
 * throws one Error listing every failure, so an author fixes a batch at once.
 */

export interface CatalogInput {
  lessons: LessonInput[];
  modules: ModuleInput[];
  worksheets: WorksheetInput[];
  courseStatus: CourseStatus;
  plan: { modules: number; lessons: number };
  previewLessonId: string;
  orientationLessonId: string;
  planLessonId: string;
}

export interface CatalogLesson extends LessonInput {
  /** 1-based position in the whole course. */
  seq: number;
  /** 1-based position within its module. */
  order: number;
  moduleOrder: number;
  prevId: string | null;
  nextId: string | null;
  sections: LessonSections;
}

export interface CatalogModule {
  id: string;
  order: number;
  title: string;
  summary: string;
  worksheet: string;
  lessonIds: string[];
  /** Sum of the lessons' durationMin. Derived, never typed. */
  minutes: number;
  checks: ModuleInput['checks'];
}

export interface Catalog {
  modules: CatalogModule[];
  lessons: CatalogLesson[];
  byId: Record<string, CatalogLesson>;
  worksheets: WorksheetInput[];
  /** One line for the build log: the release manifest in miniature. */
  summary: string;
}

const rank = (status: LessonStatus): number => LESSON_STATUSES.indexOf(status);

export function validateCatalog(input: CatalogInput): Catalog {
  const errors: string[] = [];
  const err = (message: string) => errors.push(message);
  const { lessons, modules, worksheets } = input;

  // Ids and counts.
  const expectedLessonIds = Array.from({ length: input.plan.lessons }, (_, i) => lessonId(i + 1));
  const lastLessonId = expectedLessonIds[expectedLessonIds.length - 1];
  const byId = new Map(lessons.map((l) => [l.id, l]));
  for (const id of expectedLessonIds) if (!byId.has(id)) err(`Missing lesson file for ${id}`);
  for (const l of lessons) {
    if (!LESSON_ID_RE.test(l.id) || lessonNumber(l.id) > input.plan.lessons) {
      err(`Unexpected lesson id "${l.id}" (expected v01..${lastLessonId})`);
    }
  }

  const expectedModuleIds = Array.from({ length: input.plan.modules }, (_, i) => moduleId(i + 1));
  const moduleById = new Map(modules.map((m) => [m.id, m]));
  for (const id of expectedModuleIds) if (!moduleById.has(id)) err(`Missing module file for ${id}`);
  for (const m of modules) {
    if (!expectedModuleIds.includes(m.id)) err(`Unexpected module id "${m.id}"`);
  }

  const worksheetById = new Map(worksheets.map((w) => [w.id, w]));
  for (const mid of expectedModuleIds) {
    if (!worksheetById.has(worksheetIdFor(mid))) {
      err(`Missing worksheet file ${worksheetIdFor(mid)} for module ${mid}`);
    }
  }
  for (const w of worksheets) {
    if (!WORKSHEET_ID_RE.test(w.id)) err(`Unexpected worksheet id "${w.id}"`);
    else if (w.module !== w.id.slice(2)) {
      err(`Worksheet ${w.id} must belong to module ${w.id.slice(2)} (module: ${w.module})`);
    }
    if (hasBannedCopy(w.title) || hasBannedCopy(w.body)) {
      err(`Worksheet ${w.id}: no em dashes, en dashes, or {{tokens}}`);
    }
  }

  for (const m of modules) {
    if (!expectedModuleIds.includes(m.id)) continue;
    if (m.worksheet !== worksheetIdFor(m.id)) {
      err(`Module ${m.id}: worksheet must be ${worksheetIdFor(m.id)} (got ${m.worksheet})`);
    }
    const expectedChecks = moduleNumber(m.id) === input.plan.modules ? 0 : 2;
    if (m.checks.length !== expectedChecks) {
      err(`Module ${m.id}: expected ${expectedChecks} checks, found ${m.checks.length}`);
    }
  }

  // The suggested order is a chain of `next` from v01. It must visit every
  // lesson exactly once, in id order, and end at the last lesson.
  const orderedIds: string[] = [];
  {
    const visited = new Set<string>();
    let cursor: string | undefined = 'v01';
    while (cursor) {
      if (visited.has(cursor)) {
        err(`Lesson chain loops back to ${cursor}`);
        break;
      }
      const lesson = byId.get(cursor);
      if (!lesson) {
        err(`Lesson chain points at missing lesson ${cursor}`);
        break;
      }
      visited.add(cursor);
      orderedIds.push(cursor);
      cursor = lesson.next;
    }
    const last = orderedIds[orderedIds.length - 1];
    if (last !== lastLessonId) err(`Lesson chain must end at ${lastLessonId} (ends at ${last})`);
    for (const l of lessons) {
      if (!visited.has(l.id)) err(`Lesson ${l.id} is not reachable from v01 via "next"`);
    }
    orderedIds.forEach((id, i) => {
      if (id !== expectedLessonIds[i]) {
        err(`Lesson ${id} is at position ${i + 1} in the chain but its id says ${lessonNumber(id)}`);
      }
    });
  }

  // Modules along the chain: ascending, contiguous, non-empty.
  const moduleLessons = new Map<string, string[]>();
  let lastModuleNumber = 0;
  for (const id of orderedIds) {
    const lesson = byId.get(id);
    if (!lesson) continue;
    if (!moduleById.has(lesson.module)) {
      err(`Lesson ${id}: unknown module ${lesson.module}`);
      continue;
    }
    const n = moduleNumber(lesson.module);
    if (n < lastModuleNumber) {
      err(
        `Lesson ${id} belongs to ${lesson.module} but follows a lesson from ${moduleId(lastModuleNumber)}; ` +
          'modules must ascend along the chain'
      );
    } else if (n > lastModuleNumber) {
      if (moduleLessons.has(lesson.module)) {
        err(`Module ${lesson.module} appears twice in the chain (its lessons must be contiguous)`);
      }
      lastModuleNumber = n;
    }
    const list = moduleLessons.get(lesson.module) ?? [];
    list.push(id);
    moduleLessons.set(lesson.module, list);
  }
  for (const m of modules) {
    if (expectedModuleIds.includes(m.id) && !moduleLessons.get(m.id)?.length) {
      err(`Module ${m.id} has no lessons`);
    }
  }

  // Per-lesson rules.
  const previews = lessons.filter((l) => l.preview);
  if (previews.length !== 1) {
    err(`Exactly one lesson must have preview: true (found ${previews.length})`);
  } else if (previews[0].id !== input.previewLessonId) {
    err(`The preview lesson must be ${input.previewLessonId} (found ${previews[0].id})`);
  }

  const parsed = new Map<string, LessonSections>();
  for (const l of lessons) {
    const where = `Lesson ${l.id}`;
    const expectedKind: LessonKind =
      l.id === input.orientationLessonId
        ? 'orientation'
        : l.id === input.planLessonId
          ? 'plan'
          : 'standard';
    if (l.kind !== expectedKind) err(`${where}: kind must be "${expectedKind}"`);

    const module = moduleById.get(l.module);
    if (module && l.worksheet !== module.worksheet) {
      err(`${where}: worksheet must be ${module.worksheet} (its module's)`);
    }
    if (hasBannedCopy(l.title) || hasBannedCopy(l.body)) {
      err(`${where}: no em dashes, en dashes, or {{tokens}} in the title or body`);
    }

    const result = parseLessonSections(l.body);
    if (!result.ok) {
      err(`${where}: ${result.error}`);
      continue;
    }
    parsed.set(l.id, result.sections);

    const s = result.sections;
    const r = rank(l.status);
    const need = (condition: boolean, message: string) => {
      if (!condition) err(`${where} (${l.status}): ${message}`);
    };
    if (r >= rank('approved')) {
      need(s.outcome.length > 0, 'Outcome is empty');
      need(s.keyPoints.length > 0, 'Key points is empty');
      if (l.kind !== 'orientation') need(s.exercise.length > 0, 'Exercise is empty');
      if (l.kind === 'standard') {
        need(s.modelResponse.length > 0, 'Model response is empty');
        need(s.selfReview.length > 0, 'Self-review is empty');
      }
      need(Boolean(l.approvals.copy), 'approvals.copy is required');
    }
    if (r >= rank('edited')) {
      need(l.streamUid !== null, 'streamUid is required');
      need(l.durationMin >= 1, 'durationMin must be at least 1');
      if (!l.videoPlaceholder) need(Boolean(l.approvals.edit), 'approvals.edit is required');
    }
    if (r >= rank('captioned') && !l.videoPlaceholder) {
      need(s.transcript.length > 0, 'Transcript is empty');
      need(Boolean(l.approvals.captions), 'approvals.captions is required');
    }
    if (l.videoPlaceholder && input.courseStatus === 'open' && r >= rank('staged')) {
      err(`${where}: a placeholder video cannot ship while the course is open for sale`);
    }
    if (l.preview && input.courseStatus !== 'hidden') {
      need(l.status === 'published', 'the preview lesson must be published once the course is public');
      need(
        !l.videoPlaceholder,
        'the preview lesson cannot use a placeholder video once the course is public'
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Course content validation failed (${errors.length}):\n- ${errors.join('\n- ')}`
    );
  }

  // Build the catalog.
  const catalogModules: CatalogModule[] = expectedModuleIds.map((id) => {
    const m = moduleById.get(id)!;
    const ids = moduleLessons.get(id) ?? [];
    return {
      id,
      order: moduleNumber(id),
      title: m.title,
      summary: m.summary,
      worksheet: m.worksheet,
      lessonIds: ids,
      minutes: ids.reduce((sum, lid) => sum + byId.get(lid)!.durationMin, 0),
      checks: m.checks,
    };
  });
  const catalogLessons: CatalogLesson[] = orderedIds.map((id, i) => {
    const l = byId.get(id)!;
    const siblings = moduleLessons.get(l.module) ?? [];
    return {
      ...l,
      seq: i + 1,
      order: siblings.indexOf(id) + 1,
      moduleOrder: moduleNumber(l.module),
      prevId: orderedIds[i - 1] ?? null,
      nextId: orderedIds[i + 1] ?? null,
      sections: parsed.get(id)!,
    };
  });
  const published = catalogLessons.filter((l) => l.status === 'published');
  const staged = catalogLessons.filter((l) => l.status === 'staged');
  const summary =
    `course catalog: ${catalogLessons.length} lessons, ${catalogModules.length} modules, ` +
    `${published.length} published, ${staged.length} staged, ` +
    `${published.reduce((sum, l) => sum + l.durationMin, 0)} minutes published`;

  return {
    modules: catalogModules,
    lessons: catalogLessons,
    byId: Object.fromEntries(catalogLessons.map((l) => [l.id, l])),
    worksheets,
    summary,
  };
}
```

- [ ] **Step 5: Run the validator test to verify it passes**

Run: `npx vitest run src/lib/course/__tests__/validate.test.ts`
Expected: PASS (14 tests). If a message assertion fails, fix the message in `validate.ts` to match the test, not the other way round: the messages are the authoring UX.

- [ ] **Step 6: Write the failing curriculum and visibility tests**

`src/lib/course/__tests__/curriculum.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { publicCurriculum } from '../curriculum';
import { validateCatalog } from '../validate';
import { PUBLISHED_FIELDS, buildInput, withLesson } from './fixtures';

describe('publicCurriculum', () => {
  it('carries only titles, order, status and minutes', () => {
    const catalog = validateCatalog(withLesson(buildInput(), 'v04', PUBLISHED_FIELDS));
    const curriculum = publicCurriculum(catalog);
    expect(curriculum.modules).toHaveLength(9);
    expect(curriculum.totalLessons).toBe(40);
    expect(curriculum.modules[1]).toMatchObject({ id: 'm02', order: 2, title: 'Module 2' });
    expect(curriculum.modules[1].lessons[0]).toEqual({
      id: 'v04',
      title: 'Lesson 4',
      order: 1,
      seq: 4,
      status: 'published',
      durationMin: 8,
    });
    // No check answers, bodies, or stream ids can leak through this shape.
    expect(JSON.stringify(curriculum)).not.toMatch(/answer|Spoken words|5d5bc37f/);
  });
});
```

`src/lib/course/__tests__/visibility.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hasShell, isLearnerVisible, isVisibleTo } from '../visibility';

describe('lesson visibility', () => {
  it('shows learners only published lessons', () => {
    expect(isLearnerVisible({ status: 'published' })).toBe(true);
    expect(isLearnerVisible({ status: 'staged' })).toBe(false);
    expect(isLearnerVisible({ status: 'draft' })).toBe(false);
  });

  it('gives staged and published lessons a URL', () => {
    expect(hasShell({ status: 'staged' })).toBe(true);
    expect(hasShell({ status: 'published' })).toBe(true);
    expect(hasShell({ status: 'captioned' })).toBe(false);
  });

  it('lets an admin preview a staged lesson, and nobody preview a draft', () => {
    expect(isVisibleTo({ status: 'staged' }, true)).toBe(true);
    expect(isVisibleTo({ status: 'staged' }, false)).toBe(false);
    expect(isVisibleTo({ status: 'draft' }, true)).toBe(false);
  });
});
```

- [ ] **Step 7: Run them to verify they fail**

Run: `npx vitest run src/lib/course/__tests__/curriculum.test.ts src/lib/course/__tests__/visibility.test.ts`
Expected: FAIL (modules not found)

- [ ] **Step 8: Write `src/lib/course/curriculum.ts` and `src/lib/course/visibility.ts`**

`src/lib/course/curriculum.ts`:

```ts
import type { LessonStatus } from './types';
import type { Catalog } from './validate';

/**
 * The only course shape a prerendered shell may pass to a React island. It is
 * public metadata (the sales page lists the same titles) and structurally
 * cannot carry check answers, lesson bodies, or stream ids.
 */
export interface PublicCurriculumLesson {
  id: string;
  title: string;
  order: number;
  seq: number;
  status: LessonStatus;
  durationMin: number;
}

export interface PublicCurriculumModule {
  id: string;
  order: number;
  title: string;
  summary: string;
  minutes: number;
  lessons: PublicCurriculumLesson[];
}

export interface PublicCurriculum {
  modules: PublicCurriculumModule[];
  totalLessons: number;
  totalMinutes: number;
}

export function publicCurriculum(catalog: Catalog): PublicCurriculum {
  const modules = catalog.modules.map((m) => ({
    id: m.id,
    order: m.order,
    title: m.title,
    summary: m.summary,
    minutes: m.minutes,
    lessons: m.lessonIds.map((id) => {
      const l = catalog.byId[id];
      return {
        id: l.id,
        title: l.title,
        order: l.order,
        seq: l.seq,
        status: l.status,
        durationMin: l.durationMin,
      };
    }),
  }));
  return {
    modules,
    totalLessons: catalog.lessons.length,
    totalMinutes: modules.reduce((sum, m) => sum + m.minutes, 0),
  };
}
```

`src/lib/course/visibility.ts`:

```ts
import type { LessonStatus } from './types';

type WithStatus = { status: LessonStatus };

/** Enrolled learners see published lessons only. */
export const isLearnerVisible = (lesson: WithStatus): boolean => lesson.status === 'published';

/** Staged and published lessons get a prerendered shell (a URL); drafts have none. */
export const hasShell = (lesson: WithStatus): boolean =>
  lesson.status === 'staged' || lesson.status === 'published';

/** An admin previewing (`?preview=1` + requireAdmin) may also open staged lessons. */
export const isVisibleTo = (lesson: WithStatus, adminPreview: boolean): boolean =>
  isLearnerVisible(lesson) || (adminPreview && lesson.status === 'staged');
```

- [ ] **Step 9: Run the whole suite and the type check**

Run: `npm test && npm run check`
Expected: 8 test files, all green; 0 check errors.

- [ ] **Step 10: Commit**

```bash
git add src/lib/course/validate.ts src/lib/course/curriculum.ts src/lib/course/visibility.ts src/lib/course/__tests__
git commit -m "Validate the course catalog at build time and define the public curriculum shape

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The catalog module and the content: modules, worksheets, lesson stubs, V04

**Files:**
- Create: `src/lib/course/catalog.ts`, `scripts/scaffold-course-lessons.mjs`, `src/content/course/modules/m01.yaml` to `m09.yaml`, `src/content/course/worksheets/w-m01.md` to `w-m09.md`, `src/content/course/lessons/v01.md` to `v40.md`

**Interfaces:**
- Consumes: Task 4 `validateCatalog`, Task 2 `COURSE`, `COURSE_STATUS`.
- Produces: `getCourseCatalog(): Promise<Catalog>` (`catalog.ts`), memoised per build.

- [ ] **Step 1: Write `src/lib/course/catalog.ts`**

```ts
import { getCollection } from 'astro:content';
import { COURSE, COURSE_STATUS } from '../../data/course';
import { validateCatalog, type Catalog } from './validate';

/**
 * The ONLY way a page, endpoint, or OG route reads the course collections.
 * Reads all three, runs every cross-file rule, and throws at build time on a
 * violation (the same way src/lib/demoExcerpt.ts guards the home page quote).
 * Memoised per process; in dev it re-reads so content edits show up.
 */
let cached: Promise<Catalog> | null = null;

export function getCourseCatalog(): Promise<Catalog> {
  if (cached && !import.meta.env.DEV) return cached;
  cached = load();
  return cached;
}

async function load(): Promise<Catalog> {
  const [lessons, modules, worksheets] = await Promise.all([
    getCollection('courseLessons'),
    getCollection('courseModules'),
    getCollection('courseWorksheets'),
  ]);
  const catalog = validateCatalog({
    lessons: lessons.map((entry) => ({ id: entry.id, ...entry.data, body: entry.body ?? '' })),
    modules: modules.map((entry) => ({ id: entry.id, ...entry.data })),
    worksheets: worksheets.map((entry) => ({
      id: entry.id,
      ...entry.data,
      body: entry.body ?? '',
    })),
    courseStatus: COURSE_STATUS,
    plan: COURSE.plan,
    previewLessonId: COURSE.previewLessonId,
    orientationLessonId: COURSE.orientationLessonId,
    planLessonId: COURSE.planLessonId,
  });
  console.log(catalog.summary);
  return catalog;
}
```

- [ ] **Step 2: Write the nine module files**

`src/content/course/modules/m01.yaml`:

```yaml
title: Start with the whole system
summary: >-
  See the whole system in a short example, choose a practice case, and record
  your starting point.
worksheet: w-m01
# Explanations are interim wording from the course brief. David replaces each
# one with the matching expected-answer text from the Module 1 workbook.
checks:
  - question: >-
      Do possible motives listed during private Introspection establish the
      other person's perspective?
    choices:
      - Yes, if they seem compassionate.
      - No, they are possibilities to check with the person.
    answer: 2
    explanation: >-
      Motives you imagine during Introspection are possibilities, not findings.
      The only way to learn the other person's perspective is to ask them and
      let them correct you.
  - question: Which shows a Living System in practice?
    choices:
      - An implemented solution revised through participant feedback.
      - A policy written once and left unchanged regardless of results.
    answer: 1
    explanation: >-
      A Living System is one that people keep using and improving. Feedback
      from the people inside it drives the next revision, so a solution that
      changes with experience is the system at work.
```

`src/content/course/modules/m02.yaml`:

```yaml
title: Introspection
summary: >-
  Work through all seven Introspection steps. Examine assumptions, name
  feelings, and prepare useful questions.
worksheet: w-m02
checks:
  - question: >-
      In "Brian interrupted because he does not respect me," what needs
      checking?
    choices:
      - The assertion about his motive.
      - Nothing. The interruption proves the motive.
    answer: 1
    explanation: >-
      The interruption is an observation. The reason behind it is an assumption
      about Brian's motive, and it stays an assumption until Brian confirms or
      corrects it.
  - question: >-
      Does forgiveness require immediate trust or saying the harm did not
      matter?
    choices:
      - Yes, otherwise it is incomplete.
      - No, understanding can coexist with boundaries and accountability.
    answer: 2
    explanation: >-
      Forgiveness releases resentment so you can understand the other person.
      It does not erase the harm, restore trust on its own, or remove the need
      for boundaries and accountability.
```

`src/content/course/modules/m03.yaml`:

```yaml
title: Mutual Understanding
summary: >-
  Share clearly, listen carefully, and check each person's perspective through
  questions and corrected summaries.
worksheet: w-m03
checks:
  - question: Someone corrects your summary. What should you do next?
    choices:
      - Ask what is missing and revise it to reflect their meaning.
      - Keep the original wording and move to solutions.
    answer: 1
    explanation: >-
      A correction is the point of summarizing. Ask what you missed, revise the
      summary in their words, and check again before moving on.
  - question: >-
      Both people understand each other but prefer different solutions. Has
      understanding necessarily failed?
    choices:
      - Yes, they must hold the same opinion.
      - No, accurate understanding can coexist with disagreement.
    answer: 2
    explanation: >-
      Mutual Understanding means each person can state the other's perspective
      accurately. Agreeing on what to do comes later, and honest disagreement
      about the best solution is not a failure of understanding.
```

`src/content/course/modules/m04.yaml`:

```yaml
title: Solution Seeking
summary: >-
  Explore options and agree on fair actions you can test, implement, and
  review.
worksheet: w-m04
checks:
  - question: Is "We will communicate better" a complete solution?
    choices:
      - Yes, a shared intention is enough.
      - No. Specify actions, owners, evidence, timing, fairness, and review.
    answer: 2
    explanation: >-
      A solution you can test names who does what, by when, how you will know
      it worked, whether it is fair to everyone, and when you will review it.
      An intention has none of those.
  - question: An agreed task was never done. What should the review examine first?
    choices:
      - What prevented implementation and how to repair the commitment.
      - Why the proposed method is proven ineffective.
    answer: 1
    explanation: >-
      A plan that was never tried has not been tested. The review starts with
      what got in the way of doing it and how to repair the commitment, before
      anyone judges the method.
```

`src/content/course/modules/m05.yaml`:

```yaml
title: Work through difficult moments
summary: >-
  Repair a tense exchange, respond to a request for time, respect participation
  limits, and revisit recurring problems.
worksheet: w-m05
checks:
  - question: A person declines a voluntary conversation. What is appropriate?
    choices:
      - Force the conversation to complete the protocol.
      - Respect the choice and consider a proportionate next action.
    answer: 2
    explanation: >-
      Participation is voluntary. Respect the decline, and choose a next step
      that fits the situation, which may mean waiting, using a different tool,
      or seeking other support.
  - question: A clear trial was used and did not help. What is the next focus?
    choices:
      - Evaluate the results, revisit understanding if needed, and agree on a revision.
      - Repeat it indefinitely without checking the participants' experience.
    answer: 1
    explanation: >-
      A trial that did not help is information. Look at what happened, check
      whether the problem was understood correctly, and agree on the next
      revision together.
```

`src/content/course/modules/m06.yaml`:

```yaml
title: Use the Leadership Tools
summary: >-
  Choose and use One-on-Ones, Feedback, Targeted Conversations, and Solution
  Seeking Sessions.
worksheet: w-m06
checks:
  - question: Where should a known complex concern be raised?
    choices:
      - Inside an apparently open One-on-One without advance notice.
      - In a transparent invitation to an appropriate Targeted Conversation or Session.
    answer: 2
    explanation: >-
      One-on-Ones are the participant's space. A concern you already know is
      complex deserves a transparent invitation to the tool built for it, so
      the other person can prepare.
  - question: Which distinguishes a Solution Seeking Session?
    choices:
      - More formal written preparation, a factual record, and explicit progress review.
      - A requirement that participants agree with the organizer.
    answer: 1
    explanation: >-
      A Session adds structure for serious or persistent concerns: written
      preparation, a factual recap, and a review of progress. It never requires
      anyone to agree with the organizer.
```

`src/content/course/modules/m07.yaml`:

```yaml
title: Build a Living System
summary: >-
  Build participant feedback and review into the routines, processes, and tools
  you use together.
worksheet: w-m07
checks:
  - question: >-
      A policy is written but never used or reviewed. Does that establish a
      Living System?
    choices:
      - Yes, writing is sufficient.
      - No, implementation and participant feedback are needed.
    answer: 2
    explanation: >-
      Writing a policy is a proposal. It becomes part of a Living System when
      people use it, give feedback on it, and revise it.
  - question: Can a Leadership Tool be adapted for a household or community?
    choices:
      - Yes. Fit it to the purpose and people while retaining the protocol and principles.
      - No, the tools only apply to workplaces.
    answer: 1
    explanation: >-
      The tools are adaptations of the Communication Protocol. Change the format
      to fit the people and purpose, and keep the protocol steps and principles
      recognizable.
```

`src/content/course/modules/m08.yaml`:

```yaml
title: Apply the complete system
summary: >-
  Follow complete fictional cases at work, at home, and in a community group,
  including what happens after the agreement.
worksheet: w-m08
checks:
  - question: Which is stronger evidence of Mutual Understanding?
    choices:
      - A calm tone alone.
      - Each participant correcting and confirming a summary.
    answer: 2
    explanation: >-
      Calm is welcome but proves nothing about understanding. Each person
      correcting and then confirming the other's summary is the evidence.
  - question: Why include follow-up after an agreement?
    choices:
      - To examine implementation, effectiveness, fairness, and the next revision.
      - To show that a first agreement always solves the problem permanently.
    answer: 1
    explanation: >-
      Follow-up checks whether the agreement was carried out, whether it helped,
      whether it was fair, and what to revise next. A first agreement is a
      trial, not a permanent fix.
```

`src/content/course/modules/m09.yaml`:

```yaml
title: Earn certification and continue practicing
summary: >-
  Complete the AI-assessed final assessment, use your feedback, and choose a
  continuing practice.
worksheet: w-m09
# No checks: Module 9 uses the orientation acknowledgement and the assessment.
checks: []
```

- [ ] **Step 3: Write the nine worksheet files**

`src/content/course/worksheets/w-m02.md` (the Phase 1 worksheet, mirroring the seven steps of the site's Guided Introspection tool):

```markdown
---
title: Introspection preparation sheet
module: m02
---

Use this for one conversation you are preparing for. Write by hand or type; a
fictional situation works whenever a real one is unsuitable. Work down the
seven steps in order, and keep each answer short enough to read back.

## 1. What happened

Describe the event the way a camera would record it. What was said or done,
and in what order? Leave out reasons and motives for now.

## 2. Your first impression

What did you feel and think in the first few seconds? Write it down as it was,
even if you would not say it aloud.

## 3. Dig deeper

Why do you think you reacted that way? Which past experiences, expectations, or
worries were already in the room before this happened?

## 4. Name your feelings

What is underneath the first reaction? Anger and frustration usually sit on
top of something quieter: embarrassment, fear, hurt, tiredness. Name it.

## 5. Ask more questions

Keep asking yourself questions until you understand how you felt and why.
Which of your conclusions are observations, and which are assumptions you have
not checked?

## 6. Explore with compassion

What might the other person have been feeling, fearing, or dealing with? Write
two possibilities. Treat both as questions to ask, not facts you now know.

## 7. Prepare for the conversation

What do you want to ask them? What is your goal for the conversation? How will
you express your own perspective clearly, and how might the two of you avoid
this problem in future?

## A completed example

The fictional case from Lesson 4: Alex was showing Brian, a newer coworker, a
quicker way to mop the back room, and Brian said "I've got it" partway through
and took the mop.

1. **What happened:** I started explaining the faster way to mop. Halfway
   through my sentence Brian said "I've got it" and took the mop.
2. **First impression:** He thinks I am being condescending. I felt my face go
   hot.
3. **Dig deeper:** The last time I gave someone feedback here it went badly,
   and I have been waiting for it to happen again.
4. **Feelings:** Embarrassment first, then irritation. Underneath, a worry that
   my help is unwelcome.
5. **More questions:** Did I ask whether he wanted the tip, or did I just
   start? Is "condescending" his word or mine? It is mine.
6. **Compassion:** He may have been rushing to finish before his bus. He may
   have already been shown this by someone else and felt talked down to.
7. **Prepare:** Ask "How did my approach come across to you?" and "Is there a
   better time or way for me to pass on tips?" My goal is to find out how he
   prefers to receive help, and to say that I want to be useful, not in charge.
```

`src/content/course/worksheets/w-m01.md`:

```markdown
---
title: Starting point and learning goal
module: m01
---

Your starting response, your learning goal for the course, and a map of the
whole system to keep beside the lessons. The full worksheet arrives with
Module 1's lessons. Until then, write your starting response in your own
words: one conversation you are putting off, and what you would say today.
```

`src/content/course/worksheets/w-m03.md`:

```markdown
---
title: Mutual Understanding conversation sheet
module: m03
---

An invitation, your own perspective in a few clear sentences, the questions you
want to ask, and space for two summaries: yours of their view, and theirs of
yours, each corrected until it is right. The full worksheet arrives with
Module 3's lessons.
```

`src/content/course/worksheets/w-m04.md`:

```markdown
---
title: Solution record
module: m04
---

Options, the proposed actions, who does what, how you will know it worked,
whether it is fair to everyone, the trial period, and the review date. The full
worksheet arrives with Module 4's lessons.
```

`src/content/course/worksheets/w-m05.md`:

```markdown
---
title: Repair, limits, and recurring problems
module: m05
---

A repair you can say aloud, the participation limits you will respect, and a
diagnosis sheet for a problem that keeps coming back. The full worksheet
arrives with Module 5's lessons.
```

`src/content/course/worksheets/w-m06.md`:

```markdown
---
title: Leadership Tool templates
module: m06
---

Templates for a One-on-One, a piece of Feedback, a Targeted Conversation, and a
Solution Seeking Session. The full worksheet arrives with Module 6's lessons.
```

`src/content/course/worksheets/w-m07.md`:

```markdown
---
title: Adapt a Leadership Tool
module: m07
---

An existing practice, its purpose and triggers, the protocol steps mapped into
it, and how participants will keep giving feedback on it. The full worksheet
arrives with Module 7's lessons.
```

`src/content/course/worksheets/w-m08.md`:

```markdown
---
title: Case analysis sheet
module: m08
---

One analysis sheet for the workplace, household, and community cases: what each
person observed, what changed their understanding, the agreed trial, and what
the follow-up revealed. The full worksheet arrives with Module 8's lessons.
```

`src/content/course/worksheets/w-m09.md`:

```markdown
---
title: Assessment orientation and continuing practice
module: m09
---

The assessment orientation checklist and your 30-day continuing-practice plan:
one modest application, one specific agreement or next step, and a review date.
The full worksheet arrives with Module 9's lessons.
```

- [ ] **Step 4: Write the scaffold script `scripts/scaffold-course-lessons.mjs`**

```js
/**
 * Writes a draft lesson file for every video in the course plan that does not
 * exist yet. Never overwrites: rerunning it is safe. Titles, modules and
 * planned minutes come from "Solution Seeking Course and Video Plan v1.0".
 *
 *   node scripts/scaffold-course-lessons.mjs
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const LESSONS = [
  ['v01', 'm01', 'See what a different conversation can produce', 6],
  ['v02', 'm01', 'How the full Solution Seeking System fits together', 8],
  ['v03', 'm01', 'Set up your practice', 5],
  ['v04', 'm02', 'Introspection: understand your own experience', 8],
  ['v05', 'm02', 'Critical Thinking: examine the story you are telling', 5],
  ['v06', 'm02', 'Forgiveness: make room to understand', 5],
  ['v07', 'm02', 'Humility (and Understanding Pride)', 5],
  ['v08', 'm02', 'Compassion and Empathy', 5],
  ['v09', 'm02', 'Turn reflection into conversation preparation', 7],
  ['v10', 'm02', 'Watch an introspection from start to finish', 8],
  ['v11', 'm03', 'Prepare and open a Mutual Understanding conversation', 6],
  ['v12', 'm03', 'Understanding: check the picture you have built', 5],
  ['v13', 'm03', 'Good Faith', 5],
  ['v14', 'm03', 'Bravery', 4],
  ['v15', 'm03', 'Vulnerability', 5],
  ['v16', 'm03', 'Patience', 4],
  ['v17', 'm03', 'Share clearly and listen carefully', 8],
  ['v18', 'm03', 'Ask questions that make room for an answer', 6],
  ['v19', 'm03', 'Recognize mutual understanding and choose the next step', 9],
  ['v20', 'm04', 'Restate the shared problem and explore options', 7],
  ['v21', 'm04', 'Fairness', 5],
  ['v22', 'm04', 'Integrity (Consistency)', 5],
  ['v23', 'm04', 'Flexibility', 5],
  ['v24', 'm04', 'Build a solution you can actually test', 8],
  ['v25', 'm04', 'Implement, follow up, and revise', 7],
  ['v26', 'm05', 'Recover when a conversation becomes tense', 6],
  ['v27', 'm05', 'When someone will not participate', 7],
  ['v28', 'm05', 'When the same problem comes back', 6],
  ['v29', 'm06', 'Choose a tool for the situation', 5],
  ['v30', 'm06', 'One-on-Ones', 8],
  ['v31', 'm06', 'Feedback', 7],
  ['v32', 'm06', 'Targeted Conversations', 9],
  ['v33', 'm06', 'Solution Seeking Sessions', 10],
  ['v34', 'm07', 'Turn a solution into a better shared system', 8],
  ['v35', 'm07', 'Adapt or build a Leadership Tool', 7],
  ['v36', 'm08', 'Complete case: a workplace misunderstanding', 12],
  ['v37', 'm08', 'Complete case: shared responsibilities at home', 10],
  ['v38', 'm08', 'Complete case: a community decision', 10],
  ['v39', 'm09', 'Complete your certification assessment', 8],
  ['v40', 'm09', 'Keep the system alive in everyday life', 5],
];

const dir = 'src/content/course/lessons';
mkdirSync(dir, { recursive: true });

LESSONS.forEach(([id, module, title, minutes], i) => {
  const file = `${dir}/${id}.md`;
  if (existsSync(file)) {
    console.log(`skip  ${file} (exists)`);
    return;
  }
  const next = LESSONS[i + 1]?.[0];
  const kind = id === 'v39' ? 'orientation' : id === 'v40' ? 'plan' : 'standard';
  const lines = [
    '---',
    `title: "${title.replace(/"/g, '\\"')}"`,
    `module: ${module}`,
    `kind: ${kind}`,
    ...(next ? [`next: ${next}`] : []),
    `worksheet: w-${module}`,
    'streamUid: null',
    `durationMin: ${minutes}`,
    'status: draft',
    'contentVersion: 1',
    `preview: ${id === 'v05'}`,
    'videoPlaceholder: false',
    'approvals: {}',
    '---',
    '',
    '## Outcome',
    '',
    '## Key points',
    '',
    '## Exercise',
    '',
    '## Model response',
    '',
    '## Self-review',
    '',
    '## Transcript',
    '',
  ];
  writeFileSync(file, lines.join('\n'));
  console.log(`wrote ${file}`);
});
```

- [ ] **Step 5: Run the scaffold**

Run: `node scripts/scaffold-course-lessons.mjs`
Expected: 40 lines starting `wrote src/content/course/lessons/v01.md` through `v40.md`. Run it again and every line says `skip`.

- [ ] **Step 6: Author V04 by replacing `src/content/course/lessons/v04.md`**

The copy is the brief's V04 lesson. `approvals.copy` is David's approval: David, if this copy is not approved as written, remove the stamp and set `status: draft` before committing. `streamUid` stays null here; Phase 1c fills it with the placeholder clip and sets `videoPlaceholder: true` and `status: published`.

```markdown
---
title: "Introspection: understand your own experience"
module: m02
kind: standard
next: v05
worksheet: w-m02
streamUid: null
durationMin: 8
status: approved
contentVersion: 1
preview: false
videoPlaceholder: false
approvals:
  copy: 2026-09-09 DB
---

## Outcome

Separate an initial reaction from the observations, concerns, and questions underneath it.

## Key points

- Begin with your own account of what happened, in your own words.
- Notice your first reaction, then examine the feelings and concerns underneath it.
- Keep what you observed separate from what you concluded about it.
- Treat possible explanations for someone else's behavior as questions to explore, not facts to act on.

## Exercise

Use this fictional case.

Alex is closing up with Brian, a newer coworker. Alex starts to show Brian a quicker way to mop the back room. Halfway through the sentence, Brian says "I've got it" and takes the mop.

Write four short lines from Alex's point of view:

1. What was said or done. Describe it the way a camera would, with no reason attached.
2. The initial emotion.
3. One concern underneath that emotion.
4. One question to explore with Brian.

## Model response

**Observation:** Brian interrupted the sentence and took the mop.

**Emotion:** anger and embarrassment.

**Concern:** being seen as unhelpful, or having future feedback rejected.

**Question:** "How did my approach come across to you?"

Notice what the model does not do. It never says why Brian interrupted. That reason is Brian's to give, and the question is how Alex will find it out.

## Self-review

- My observation describes what was said or done, without a reason attached.
- The concern is mine and about me. It is not a claim about Brian.
- My question could be answered in a way that changes my mind.

## Transcript
```

- [ ] **Step 7: Check the content schemas and the copy rule**

Run: `npm run check && grep -rn "—" src/content/course/ ; echo "grep exit $?"`
Expected: 0 check errors; grep prints nothing and exits 1 (no matches).

- [ ] **Step 8: Commit**

```bash
git add src/lib/course/catalog.ts scripts/scaffold-course-lessons.mjs src/content/course
git commit -m "Add the course catalog reader, nine module and worksheet files, 40 lesson stubs, and the V04 lesson

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Lesson shells so the build runs the validator, and the index gates

**Files:**
- Create: `src/pages/course/learn/lessons/[id].astro`
- Modify: `astro.config.mjs` (sitemap filter), `src/pages/robots.txt.ts`, `src/pages/og/[...route].ts`

**Interfaces:**
- Consumes: `getCourseCatalog()`, `hasShell()`, `StepNav` props `{ title, href }`.
- Produces: prerendered `/course/learn/lessons/<id>/` for every staged or published lesson; `course/learn/lessons/<id>` OG keys.

- [ ] **Step 1: Write the shell `src/pages/course/learn/lessons/[id].astro`**

```astro
---
import BaseLayout from '../../../../layouts/BaseLayout.astro';
import StepNav from '../../../../components/StepNav.astro';
import { getCourseCatalog } from '../../../../lib/course/catalog';
import { hasShell } from '../../../../lib/course/visibility';

/**
 * Prerendered public shell for one lesson, like /dashboard: it carries only
 * public metadata (the sales page lists the same titles). Everything a learner
 * pays for (transcript, exercise, model response, video token) comes from
 * /api/course/lesson behind the bearer token, in the LessonView island that
 * Phase 1c mounts here. Draft lessons have no shell at all.
 */
export async function getStaticPaths() {
  const catalog = await getCourseCatalog();
  const link = (id: string | null) => {
    const lesson = id ? catalog.byId[id] : undefined;
    return lesson && hasShell(lesson)
      ? { title: lesson.title, href: `/course/learn/lessons/${lesson.id}` }
      : undefined;
  };
  return catalog.lessons.filter(hasShell).map((lesson) => ({
    params: { id: lesson.id },
    props: {
      title: lesson.title,
      outcome: lesson.sections.outcome,
      moduleTitle: catalog.modules[lesson.moduleOrder - 1].title,
      moduleOrder: lesson.moduleOrder,
      order: lesson.order,
      prev: link(lesson.prevId),
      next: link(lesson.nextId),
    },
  }));
}

const { title, outcome, moduleTitle, moduleOrder, order, prev, next } = Astro.props;
---

<BaseLayout title={title} description={outcome} noindex>
  <div class="container-page py-10">
    <p class="eyebrow">Module {moduleOrder}, {moduleTitle}. Lesson {order}</p>
    <h1 class="mt-3 text-3xl font-extrabold tracking-tight text-ink-800 sm:text-4xl">{title}</h1>
    <p class="mt-4 max-w-prose text-lg leading-relaxed text-slate-600">{outcome}</p>
    <div class="mt-8 rounded-2xl border border-slate-100 bg-white p-6 text-slate-700 shadow-card">
      <p>
        The lesson player is on its way. Enrolled learners will watch, practice, and mark this
        lesson complete right here.
      </p>
      <p class="mt-3">
        <a class="font-semibold text-brand-700 hover:underline" href="/course">About the course</a>
      </p>
    </div>
    <StepNav prev={prev} next={next} />
  </div>
</BaseLayout>
```

- [ ] **Step 2: Keep the learner area out of the sitemap and the index**

In `astro.config.mjs`, extend the sitemap filter:

```js
      filter: (page) =>
        !page.includes('/account') &&
        !page.includes('/admin') &&
        !page.includes('/dashboard') &&
        !page.includes('/saved') &&
        !page.includes('/course/learn') &&
        !page.includes('/404'),
```

In `src/pages/robots.txt.ts`, add after `'Disallow: /a/',`:

```ts
    'Disallow: /course/learn',
```

- [ ] **Step 3: Register OG cards for the shells**

In `src/pages/og/[...route].ts`, add the imports:

```ts
import { getCourseCatalog } from '../../lib/course/catalog';
import { hasShell } from '../../lib/course/visibility';
```

After the `demos` constant, add:

```ts
// Learner lesson shells are noindex, but a shared link still shows a card.
const courseCatalog = await getCourseCatalog();
const courseLessonPages = Object.fromEntries(
  courseCatalog.lessons.filter(hasShell).map((lesson) => [
    `course/learn/lessons/${lesson.id}`,
    { title: lesson.title, description: lesson.sections.outcome },
  ])
);
```

Then spread `...courseLessonPages,` into the `pages` record next to the other collection spreads (find where the `principles`, `tools` and `demos` entries are spread and add it there).

- [ ] **Step 4: Prove the validator guards the build**

Temporarily set `status: staged` on `src/content/course/lessons/v04.md` with `streamUid: 5d5bc37ffcf54c9b82e996823bffbb81` and `approvals: { copy: 2026-09-09 DB, edit: 2026-09-09 BC, captions: 2026-09-09 DB }` plus a one-line Transcript so a shell exists, then change `next: v05` to `next: v06`.

Run: `npm run build`
Expected: the build FAILS with `Course content validation failed` naming `v05 is not reachable from v01 via "next"`.

Restore `next: v05`. Run `npm run build` again.
Expected: the build log prints `course catalog: 40 lessons, 9 modules, 0 published, 1 staged, 0 minutes published`, `dist/course/learn/lessons/v04/index.html` exists and contains `noindex` and the V04 title, `dist/og/course/learn/lessons/v04.png` exists, `dist/sitemap-0.xml` contains no `/course/learn`, and `dist/robots.txt` contains `Disallow: /course/learn`.

Then revert V04 to `status: approved`, `streamUid: null`, `approvals: { copy: 2026-09-09 DB }`, and the empty Transcript (Phase 1c publishes it with the real placeholder clip). Run `npm run build` once more: it passes and, with no staged or published lessons, `dist/course/learn/lessons/` does not exist.

- [ ] **Step 5: Verify the full gate**

Run: `npm test && npm run check && npm run build`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add "src/pages/course/learn/lessons/[id].astro" astro.config.mjs src/pages/robots.txt.ts "src/pages/og/[...route].ts"
git commit -m "Prerender learner lesson shells and keep the learner area out of the sitemap and index

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Migration 0030: enrollments, events, progress, check attempts, stream tokens

**Files:**
- Create: `supabase/migrations/0030_course.sql`

**Interfaces:**
- Produces: tables `course_enrollments`, `course_enrollment_events`, `course_progress`, `course_check_attempts`, `course_stream_tokens`; trigger function `course_progress_monotone()`. All server-write-only.

- [ ] **Step 1: Write the migration**

```sql
-- The paid video course: enrollment, progress, and video-token tables.
--
-- Every table here is server-write-only (the 0012 pattern): RLS on, NO
-- policies, no grants to anon/authenticated. Since 0010 revoked the default
-- privileges, a new table reaches nobody until a grant says otherwise, so the
-- grants at the bottom are the whole access story. The browser learns whether
-- it is enrolled by asking /api/course/entitlement, never by reading a table,
-- and completion prerequisites are validated in one place, /api/course/progress.

create table if not exists public.course_enrollments (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users (id) on delete cascade,
  course_id                   text not null,
  status                      text not null default 'enrolled'
                              check (status in ('enrolled', 'revoked', 'refunded')),
  source                      text not null check (source in ('stripe', 'admin')),
  -- The purchase reference. Unique, so a re-delivered webhook can never enroll twice.
  stripe_checkout_session_id  text unique,
  stripe_payment_intent_id    text,
  stripe_customer_id          text,
  amount_total                integer,          -- cents, exactly as Stripe reports it
  currency                    text,
  purchased_at                timestamptz,
  access_starts_at            timestamptz not null default now(),
  access_ends_at              timestamptz,      -- null = no end date
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  -- One enrollment per learner per course; the leading user_id also covers the FK.
  unique (user_id, course_id),
  check (source <> 'stripe' or stripe_checkout_session_id is not null)
);

-- Append-only audit of every access change and payment signal, and the
-- processed-once ledger for course webhook deliveries.
create table if not exists public.course_enrollment_events (
  id                          bigint generated always as identity primary key,
  enrollment_id               uuid references public.course_enrollments (id) on delete set null,
  user_id                     uuid not null references auth.users (id) on delete cascade,
  course_id                   text not null,
  kind                        text not null check (kind in (
                                'checkout_created', 'payment_pending', 'payment_failed', 'enrolled',
                                'reinstated', 'duplicate_payment', 'revoked', 'refunded',
                                'admin_granted', 'refund_received')),
  actor                       text not null check (actor in ('stripe', 'admin', 'system')),
  actor_user_id               uuid references auth.users (id) on delete set null,
  stripe_checkout_session_id  text,
  stripe_event_id             text,
  note                        text,
  created_at                  timestamptz not null default now()
);
create index if not exists course_enrollment_events_user_idx
  on public.course_enrollment_events (user_id, created_at desc);
create index if not exists course_enrollment_events_enrollment_idx
  on public.course_enrollment_events (enrollment_id);
create index if not exists course_enrollment_events_actor_idx
  on public.course_enrollment_events (actor_user_id);
create unique index if not exists course_enrollment_events_event_idx
  on public.course_enrollment_events (stripe_event_id) where stripe_event_id is not null;

create table if not exists public.course_progress (
  user_id                 uuid not null references auth.users (id) on delete cascade,
  course_id               text not null,
  lesson_id               text not null check (lesson_id ~ '^v[0-9]{2}$'),
  content_version         integer not null default 1,
  studied_at              timestamptz,
  practice_state          text not null default 'none'
                          check (practice_state in ('none', 'in_site', 'offline')),
  response_text           text not null default '' check (char_length(response_text) <= 20000),
  previous_response_text  text,                      -- kept when a revision conflict is resolved
  model_revealed_at       timestamptz,
  acknowledged_at         timestamptz,
  completed_at            timestamptz,
  revision                integer not null default 0, -- bumps on save_response only
  first_opened_at         timestamptz not null default now(),
  last_opened_at          timestamptz not null default now(),  -- the resume pointer derives from this
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  primary key (user_id, course_id, lesson_id)
);

create table if not exists public.course_check_attempts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  course_id   text not null,
  module_id   text not null check (module_id ~ '^m0[1-8]$'),
  check_id    text not null,
  choice      smallint not null check (choice in (1, 2)),
  correct     boolean not null,
  created_at  timestamptz not null default now()
);
create index if not exists course_check_attempts_user_idx
  on public.course_check_attempts (user_id, course_id, module_id, created_at desc);

-- One shared signed playback token per Stream video, refreshed every 12 hours.
-- Tokens are not user-bound, so sharing one keeps the mint rate far below the
-- Stream token endpoint's guidance regardless of how many learners watch.
create table if not exists public.course_stream_tokens (
  stream_uid  text primary key,
  token       text not null,
  expires_at  timestamptz not null,
  updated_at  timestamptz not null default now()
);

/*
 * Completion is monotone: revisiting, rewatching, or editing a practice answer
 * never erases it. The API is the writer, but the database refuses a
 * regression even if a future route gets it wrong.
 */
create or replace function public.course_progress_monotone() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.studied_at        := coalesce(old.studied_at, new.studied_at);
  new.model_revealed_at := coalesce(old.model_revealed_at, new.model_revealed_at);
  new.acknowledged_at   := coalesce(old.acknowledged_at, new.acknowledged_at);
  new.completed_at      := coalesce(old.completed_at, new.completed_at);
  if old.practice_state <> 'none' and new.practice_state = 'none' then
    new.practice_state := old.practice_state;
  end if;
  new.first_opened_at := old.first_opened_at;
  return new;
end $$;
revoke execute on function public.course_progress_monotone() from public, anon, authenticated;

drop trigger if exists course_progress_monotone on public.course_progress;
create trigger course_progress_monotone
  before update on public.course_progress
  for each row execute function public.course_progress_monotone();

drop trigger if exists course_enrollments_set_updated_at on public.course_enrollments;
create trigger course_enrollments_set_updated_at
  before update on public.course_enrollments
  for each row execute function public.set_updated_at();
drop trigger if exists course_progress_set_updated_at on public.course_progress;
create trigger course_progress_set_updated_at
  before update on public.course_progress
  for each row execute function public.set_updated_at();
drop trigger if exists course_stream_tokens_set_updated_at on public.course_stream_tokens;
create trigger course_stream_tokens_set_updated_at
  before update on public.course_stream_tokens
  for each row execute function public.set_updated_at();

alter table public.course_enrollments       enable row level security;
alter table public.course_enrollment_events enable row level security;
alter table public.course_progress          enable row level security;
alter table public.course_check_attempts    enable row level security;
alter table public.course_stream_tokens     enable row level security;

-- Deliberately no policies, and deliberately no grants to anon/authenticated.
grant select, insert, update, delete on public.course_enrollments       to service_role;
grant select, insert                 on public.course_enrollment_events to service_role;  -- append-only
grant select, insert, update, delete on public.course_progress          to service_role;
grant select, insert                 on public.course_check_attempts    to service_role;
grant select, insert, update, delete on public.course_stream_tokens     to service_role;
```

- [ ] **Step 2: Apply it to the local stack and prove the access story**

Start the local stack if it is not running (`npx supabase start`; the ports are documented in `docs/deployment.md`), then:

Run: `npx supabase migration up --local && npx supabase migration list --local`
Expected: `0030_course` listed as applied locally.

Prove the trigger with the local database URL from `npx supabase status` (the `DB URL` line):

```bash
psql "<DB URL>" -c "insert into public.course_progress (user_id, course_id, lesson_id, completed_at) select id, 'sss-course-v1', 'v04', now() from auth.users limit 1; update public.course_progress set completed_at = null where lesson_id = 'v04'; select completed_at is not null as still_complete from public.course_progress where lesson_id = 'v04'; delete from public.course_progress where lesson_id = 'v04';"
```
Expected: `still_complete` is `t` (the trigger kept the completion). If `auth.users` is empty, sign up once through `npm run dev` first.

Then, with the local publishable key and REST URL from `npx supabase status`:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "<API URL>/rest/v1/course_enrollments?select=id" -H "apikey: <ANON KEY>" -H "Authorization: Bearer <ANON KEY>"
```
Expected: `401` or `403` (permission denied). Repeat for `course_progress` and `course_stream_tokens`: same result.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0030_course.sql
git commit -m "Add the course enrollment, progress, check attempt, and stream token tables

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

The hosted push (`npx supabase db push`) and `npx supabase db advisors --linked` happen in the Phase 1 ship sub-plan, before the deploy that needs the tables.

---

## Handoff to the next sub-plans

- **Phase 1b (commerce):** `src/lib/server/course/offer.ts`, `enrollment.ts`, `privateJson`, `/api/course/entitlement`, `/api/course/checkout`, the webhook branch, `courseClient.ts`, `useCourseEntitlement.ts`, analytics union, the sales page and `CourseSalesCta`, the dashboard shell with the checkout return.
- **Phase 1c (lesson delivery):** `stream.ts`, `/api/course/lesson`, `/api/course/progress`, `/api/course/state`, `/api/course/worksheet`, `LessonView`, `LessonNav`, `StreamPlayer`, `LessonSections.tsx`, the worksheet page, and publishing V04 with the placeholder clip.
- **Phase 1d (assessment data path):** migration `0031`, the forms collection and guard scripts, pure grading modules, the assessment endpoint, the worker and sweeper.
- **Phase 1e (admin, wiring, docs, ship).**

Content David owns after this plan: V05 and V31 copy to `approved` (five sections plus `approvals.copy`), the Module 1 to 8 workbook explanations replacing the interim check explanations, and the remaining worksheet bodies.
