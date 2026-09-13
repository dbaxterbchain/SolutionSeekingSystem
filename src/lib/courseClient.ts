import { getGaIds } from './analytics';
import { getFirstTouch } from './attribution';
import type { ProgressAction } from './course/progressRules';
import type { CourseStatus } from './course/status';
import type { AssessmentHistory, AssessmentStatus, CertificationStatus } from './course/assessmentTypes';
import type { CertificatePayload } from './course/assessmentTypes';

export type { AssessmentHistory, AssessmentStatus, AttemptSummary, AttemptView, CapApplied, CertificatePayload, CertificateRecord, CertificateSummary, CriterionFeedback, JobView, PromptView, ResultView, StageView } from './course/assessmentTypes';

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
      return 'Too many requests. Please wait a while and try again.';
    case 'course_not_configured':
      return 'Checkout is not available right now. Please try again later.';
    case 'request_key_reused':
      return 'That checkout attempt expired. Please try again.';
    case 'payment_pending':
      return 'Your payment is still being processed. Your course opens as soon as it settles.';
    case 'entitlement_unavailable':
    case 'checkout_unavailable':
      return 'Checkout is not available right now. Please try again in a moment.';
    case 'checkout_failed':
      return 'Could not start checkout. Please try again.';
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
    case 'request_failed':
      return 'The server did not answer properly. Please try again.';
    case 'reveal_required':
      return 'Reveal the model response first, then compare.';
    case 'studied_required':
      return 'Mark the lesson as studied first.';
    case 'too_long':
      return 'Your response is too long. Keep it under 20,000 characters.';
    case 'no_exercise':
      return 'This lesson has no exercise to record.';
    case 'no_model_response':
      return 'This lesson has no model response.';
    case 'revision_conflict':
      return 'This response was changed somewhere else. Reload to see the latest version.';
    case 'not_eligible':
      return 'The final assessment opens when modules 1 to 8 and the orientation lesson are complete.';
    case 'no_forms_available':
      return 'Every assessment form has been used on a previous attempt. Write to course support for the next step.';
    case 'already_submitted':
      return 'This assessment has already been submitted.';
    case 'stage_locked':
      return 'This part is locked. Your later parts are still open.';
    case 'stage_mismatch':
      return 'This page is out of date. Reload to see where you are.';
    case 'no_certificate':
      return 'There is no certificate on this account yet.';
    case 'name_already_confirmed':
      return 'The name on this certificate is already confirmed. Write to course support to change it.';
    case 'name_required':
      return 'Confirm the name on your certificate before turning on its link.';
    case 'certificate_revoked':
      return 'This certificate has been revoked. Write to course support if that seems wrong.';
    case 'certificate_unavailable':
      return 'Your certificate is unavailable right now. Please try again in a minute.';
    case 'assessment_unavailable':
      return 'The assessment is unavailable right now. Please try again in a minute.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

/**
 * The copy for a refused start. courseErrorMessage only sees the code, and
 * `not_eligible` covers three different situations, so callers pass the
 * server's `reason` here instead.
 */
export function notEligibleMessage(reason: unknown): string {
  if (reason === 'already_passed') return 'You have passed this version of the assessment.';
  if (reason === 'open_attempt') return 'Your assessment is already open.';
  return courseErrorMessage('not_eligible');
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
  certification: { version: string; status: CertificationStatus };
}

export interface WorksheetPayload {
  id: string;
  title: string;
  module_id: string;
  markdown: string;
}

export interface CheckStandingView {
  id: string;
  question: string;
  choices: [string, string];
  answered_correctly: boolean;
}
export interface ModuleChecksPayload {
  module: { id: string; title: string; order: number };
  checks: CheckStandingView[];
  lessons_complete: boolean;
  module_complete: boolean;
}
export interface CheckAnswerResponse {
  correct: boolean;
  explanation: string;
  module_complete: boolean;
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

/** POST JSON with the bearer; throws CourseActionError with the server's code (or network_error). */
async function postJson<T>(accessToken: string, path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new CourseActionError('network_error', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throwFor(res, data);
  return data as T;
}

export const fetchModuleChecks = (accessToken: string, moduleId: string): Promise<ModuleChecksPayload> =>
  getJson(accessToken, `/api/course/check?module_id=${encodeURIComponent(moduleId)}`);
export const answerCheck = (
  accessToken: string,
  body: { module_id: string; check_id: string; choice: 1 | 2 }
): Promise<CheckAnswerResponse> => postJson(accessToken, '/api/course/check', body);

export interface ProgressBody {
  lesson_id: string;
  action: ProgressAction;
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

export type AssessmentAction = 'start' | 'save' | 'advance' | 'submit' | 'status' | 'list';

/** POST to the assessment endpoint, keyed by `action`. Twin of postProgress. */
async function postAssessment<T>(accessToken: string, body: Record<string, unknown> & { action: AssessmentAction }): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api/course/assessment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new CourseActionError('network_error', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throwFor(res, data);
  return data as T;
}

export const startAssessment = (accessToken: string): Promise<AssessmentStatus> => postAssessment(accessToken, { action: 'start' });
export const fetchAssessmentStatus = (accessToken: string, attemptId?: string): Promise<AssessmentStatus> =>
  postAssessment(accessToken, { action: 'status', ...(attemptId ? { attempt_id: attemptId } : {}) });
export const saveAssessmentResponse = (accessToken: string, attemptId: string, promptId: string, text: string, expectedRevision: number) =>
  postAssessment<{ prompt_id: string; revision: number; saved_at: string }>(accessToken, {
    action: 'save',
    attempt_id: attemptId,
    prompt_id: promptId,
    text,
    expected_revision: expectedRevision,
  });
export const advanceAssessment = (
  accessToken: string,
  attemptId: string,
  stage: number,
  expectedRevisions: Record<string, number>
): Promise<AssessmentStatus> =>
  postAssessment(accessToken, { action: 'advance', attempt_id: attemptId, stage, expected_revisions: expectedRevisions });
export const submitAssessment = (accessToken: string, attemptId: string, requestKey: string): Promise<AssessmentStatus> =>
  postAssessment(accessToken, { action: 'submit', attempt_id: attemptId, request_key: requestKey });
export const listAttempts = (accessToken: string): Promise<AssessmentHistory> => postAssessment(accessToken, { action: 'list' });

/** The learner's certificate page: GET the record, confirm the name once, or turn the verification link on and off. */
export const fetchCertificate = (accessToken: string): Promise<CertificatePayload> => getJson(accessToken, '/api/course/certificate');
export const confirmCertificateName = (accessToken: string, name: string): Promise<CertificatePayload> =>
  postJson(accessToken, '/api/course/certificate', { action: 'confirm_name', name });
export const setCertificateSharing = (accessToken: string, active: boolean): Promise<CertificatePayload> =>
  postJson(accessToken, '/api/course/certificate', { action: 'share', active });
