import { getGaIds } from './analytics';
import { getFirstTouch } from './attribution';
import type { CourseStatus } from './course/status';

/**
 * The browser's view of the course, fetched from the server and never
 * computed here. Mirrors src/lib/server/course/enrollmentRules.ts plus the
 * sale block that GET /api/course/entitlement adds.
 */
export interface CourseEnrollmentSummary {
  id: string;
  source: 'stripe' | 'admin';
  purchased_at: string | null;
  access_starts_at: string;
  access_ends_at: string | null;
}

export type CourseEntitlementView = (
  | { kind: 'enrolled'; enrollment: CourseEnrollmentSummary }
  | { kind: 'none' }
  | { kind: 'inactive'; reason: 'revoked' | 'refunded'; enrollment: CourseEnrollmentSummary }
  | { kind: 'expired'; enrollment: CourseEnrollmentSummary }
) & { sale: { status: CourseStatus; can_purchase: boolean } };

/** Null on any failure. Callers treat null as "ask the server", never as "deny". */
export async function fetchCourseEntitlement(accessToken: string): Promise<CourseEntitlementView | null> {
  try {
    const res = await fetch('/api/course/entitlement', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as CourseEntitlementView;
  } catch {
    return null;
  }
}

/** A failed course action, keeping the server's code so callers can branch on it. */
export class CourseActionError extends Error {
  code: string;
  status: number;
  /** The rest of the error body (for example `server` on a revision conflict, `missing` on incomplete). */
  extra: Record<string, unknown>;

  constructor(code: string, status: number, message?: string, extra: Record<string, unknown> = {}) {
    super(message ?? courseErrorMessage(code));
    this.name = 'CourseActionError';
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

/** Start checkout. Resolves to the Stripe URL to navigate to. */
export async function startCourseCheckout(
  accessToken: string,
  input: { request_key: string; returnPath: string }
): Promise<string> {
  let res: Response;
  try {
    res = await fetch('/api/course/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        ...input,
        ga: getGaIds(),
        attribution: getFirstTouch() ?? undefined,
      }),
    });
  } catch {
    // The request never reached the server: offline, DNS, or a blocking extension.
    throw new CourseActionError('network_error', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || typeof data?.url !== 'string') {
    throw new CourseActionError(
      typeof data?.error === 'string' ? data.error : 'checkout_failed',
      res.status,
      typeof data?.message === 'string' ? data.message : undefined
    );
  }
  return data.url;
}

export function courseErrorMessage(code: string): string {
  switch (code) {
    case 'account_required':
      return 'Create an account with an email address first, so the course has somewhere to live.';
    case 'course_not_on_sale':
      return 'The course is not on sale yet.';
    case 'already_enrolled':
      return 'You already have access to the course.';
    case 'enrollment_revoked':
      return 'Access to the course has ended for this account. Contact course support if that seems wrong.';
    case 'rate_limited':
      return 'Too many attempts. Please wait a while and try again.';
    case 'course_not_configured':
      return 'Checkout is not available right now. Please try again later.';
    case 'request_key_reused':
      return 'That checkout attempt expired. Please try again.';
    case 'payment_pending':
      return 'Your payment is still being processed. Your course opens as soon as it settles.';
    case 'entitlement_unavailable':
    case 'checkout_unavailable':
      return 'Checkout is not available right now. Please try again in a moment.';
    case 'network_error':
      return 'Could not reach the server. Check your connection and try again.';
    case 'enrollment_required':
      return 'This lesson is for enrolled learners.';
    case 'not_found':
      return 'This lesson is not available yet.';
    case 'progress_unavailable':
      return 'Your progress could not be saved just now. Please try again in a moment.';
    case 'incomplete':
      return 'A few steps are still open in this lesson.';
    case 'practice_required':
      return 'Try the exercise first, then compare with the model response.';
    default:
      return 'Could not start checkout. Please try again.';
  }
}

export interface ProgressView {
  lesson_id: string;
  content_version: number;
  studied: boolean;
  practice_state: 'none' | 'in_site' | 'offline';
  response_text: string;
  previous_response_text: string | null;
  revision: number;
  model_revealed: boolean;
  acknowledged: boolean;
  completed: boolean;
  completed_at: string | null;
  last_opened_at: string;
}

export interface LessonNeighbour {
  id: string;
  title: string;
  available: boolean;
}

export interface LessonPayload {
  lesson: {
    id: string;
    title: string;
    kind: 'standard' | 'orientation' | 'plan';
    module_id: string;
    module_title: string;
    module_order: number;
    order: number;
    content_version: number;
    duration_min: number;
    status: string;
    video_placeholder: boolean;
    worksheet_id: string;
    has_exercise: boolean;
    has_model_response: boolean;
    sections: { outcome: string; key_points: string; exercise: string; self_review: string; transcript: string };
    prev: LessonNeighbour | null;
    next: LessonNeighbour | null;
  };
  video: { embed_url: string; poster_url: string; expires_at: string } | null;
  video_unavailable: boolean;
  progress: ProgressView | null;
}

export interface ProgressResponse {
  progress: ProgressView;
  lesson_completed: boolean;
  module_completed: boolean;
  next_lesson_id: string | null;
  model_response?: string;
}

export interface CourseStateView {
  lessons: Record<string, { completed: boolean; studied: boolean; practice_state: string; model_revealed: boolean; acknowledged: boolean; last_opened_at: string }>;
  modules: Record<string, { complete: boolean; lessons_published: number; lessons_completed: number; checks_complete: boolean }>;
  resume_lesson_id: string | null;
  assessment_eligible: boolean;
  plan_complete: boolean;
  course_complete: boolean;
  certification: { version: string; status: 'none' };
}

export interface WorksheetPayload {
  id: string;
  title: string;
  module_id: string;
  markdown: string;
}

/** The rest of a failed response's JSON body, mapped to CourseActionError and thrown. Shared by getJson and postProgress. */
function throwFor(res: Response, data: unknown): never {
  const { error, message, ...extra } = (data ?? {}) as Record<string, unknown>;
  throw new CourseActionError(
    typeof error === 'string' ? error : 'request_failed',
    res.status,
    typeof message === 'string' ? message : undefined,
    extra
  );
}

/** GET with the bearer; throws CourseActionError with the server's code (or network_error). */
async function getJson<T>(accessToken: string, path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { headers: { Authorization: `Bearer ${accessToken}` } });
  } catch {
    throw new CourseActionError('network_error', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throwFor(res, data);
  return data as T;
}

export const fetchLesson = (accessToken: string, id: string, preview = false): Promise<LessonPayload> =>
  getJson(accessToken, `/api/course/lesson?id=${encodeURIComponent(id)}${preview ? '&preview=1' : ''}`);

export const fetchCourseState = (accessToken: string): Promise<CourseStateView> => getJson(accessToken, '/api/course/state');

export const fetchWorksheet = (accessToken: string, id: string): Promise<WorksheetPayload> =>
  getJson(accessToken, `/api/course/worksheet?id=${encodeURIComponent(id)}`);

export interface ProgressBody {
  lesson_id: string;
  action: 'open' | 'studied' | 'save_response' | 'practiced_offline' | 'reveal_model' | 'acknowledge' | 'complete';
  text?: string;
  expected_revision?: number;
  keep_previous?: boolean;
}

export async function postProgress(accessToken: string, body: ProgressBody): Promise<ProgressResponse> {
  let res: Response;
  try {
    res = await fetch('/api/course/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new CourseActionError('network_error', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throwFor(res, data);
  return data as ProgressResponse;
}
