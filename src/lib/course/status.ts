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
