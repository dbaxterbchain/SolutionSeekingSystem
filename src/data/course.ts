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
