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

  constructor(code: string, status: number, message?: string) {
    super(message ?? courseErrorMessage(code));
    this.name = 'CourseActionError';
    this.code = code;
    this.status = status;
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
    default:
      return 'Could not start checkout. Please try again.';
  }
}
