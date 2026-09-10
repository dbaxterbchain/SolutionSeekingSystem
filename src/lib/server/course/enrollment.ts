import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '../supabaseAdmin';
import { getUserFromRequest } from '../auth';
import { COURSE } from '../../../data/course';
import {
  entitlementFromRow,
  type CourseEntitlement,
  type EnrollmentRow,
  type EnrollmentStore,
} from './enrollmentRules';

/**
 * The course's entitlement authority, bound to Supabase. It sits BESIDE
 * checkEntitlement (src/lib/server/entitlement.ts), never inside it: a
 * subscriber gets no course access and a course buyer gets no assistant
 * access, and neither authority has to know the other exists.
 *
 * Every function here throws on a database error rather than answering
 * "none": a paying learner told to buy again because a lookup hiccuped is
 * worse than a 500 that says what broke.
 */

const ENROLLMENT_COLUMNS =
  'id, user_id, course_id, status, source, stripe_checkout_session_id, stripe_payment_intent_id, stripe_customer_id, amount_total, currency, purchased_at, access_starts_at, access_ends_at' as const;

export async function findEnrollment(
  userId: string,
  courseId: string = COURSE.id
): Promise<EnrollmentRow | null> {
  const { data, error } = await supabaseAdmin
    .from('course_enrollments')
    .select(ENROLLMENT_COLUMNS)
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle();
  if (error) {
    console.error('course enrollment lookup failed', error);
    throw new Error(`course enrollment lookup failed: ${error.message}`);
  }
  return (data as EnrollmentRow | null) ?? null;
}

export async function getCourseEntitlement(user: User, now = new Date()): Promise<CourseEntitlement> {
  // An anonymous trial user can never have bought anything: checkout refuses
  // them, since an enrollment with no email address is unrecoverable.
  if (user.is_anonymous === true) return { kind: 'none' };
  return entitlementFromRow(await findEnrollment(user.id), now);
}

/**
 * Gate a request to an enrolled learner, the way requireSubscriber gates the
 * dashboard endpoints:
 *
 *   const auth = await requireEnrolled(request);
 *   if ('error' in auth) return privateJson({ error: auth.error, reason: auth.reason }, auth.status);
 */
export async function requireEnrolled(
  request: Request
): Promise<
  | { user: User; entitlement: Extract<CourseEntitlement, { kind: 'enrolled' }> }
  | { error: 'unauthorized'; status: 401; reason?: undefined }
  | { error: 'enrollment_required'; status: 403; reason: 'none' | 'revoked' | 'refunded' | 'expired' }
> {
  const user = await getUserFromRequest(request);
  if (!user) return { error: 'unauthorized', status: 401 };
  const entitlement = await getCourseEntitlement(user);
  if (entitlement.kind === 'enrolled') return { user, entitlement };
  const reason = entitlement.kind === 'inactive' ? entitlement.reason : entitlement.kind;
  return { error: 'enrollment_required', status: 403, reason };
}

/** The EnrollmentStore on the real tables. The webhook's course branch is its only caller. */
export const enrollmentStore: EnrollmentStore = {
  findByUser: (userId, courseId) => findEnrollment(userId, courseId),

  async hasEvent(stripeEventId) {
    const { data, error } = await supabaseAdmin
      .from('course_enrollment_events')
      .select('id')
      .eq('stripe_event_id', stripeEventId)
      .maybeSingle();
    if (error) throw new Error(`course event lookup failed: ${error.message}`);
    return data !== null;
  },

  async insert(s) {
    const { data, error } = await supabaseAdmin
      .from('course_enrollments')
      .insert({
        user_id: s.userId,
        course_id: s.courseId,
        status: 'enrolled',
        source: 'stripe',
        stripe_checkout_session_id: s.sessionId,
        stripe_payment_intent_id: s.paymentIntentId,
        stripe_customer_id: s.customerId,
        amount_total: s.amountTotal,
        currency: s.currency,
        purchased_at: s.paidAt,
        access_starts_at: s.paidAt,
        access_ends_at: null,
      })
      .select(ENROLLMENT_COLUMNS)
      .single();
    // 23505: the (user_id, course_id) or the session id unique constraint.
    if (error?.code === '23505') return 'conflict';
    if (error) throw new Error(`course enrollment insert failed: ${error.message}`);
    return data as EnrollmentRow;
  },

  async reinstate(id, s) {
    const { data, error } = await supabaseAdmin
      .from('course_enrollments')
      .update({
        status: 'enrolled',
        stripe_checkout_session_id: s.sessionId,
        stripe_payment_intent_id: s.paymentIntentId,
        stripe_customer_id: s.customerId,
        amount_total: s.amountTotal,
        currency: s.currency,
        purchased_at: s.paidAt,
        access_starts_at: s.paidAt,
        access_ends_at: null,
      })
      .eq('id', id)
      .select(ENROLLMENT_COLUMNS)
      .single();
    if (error) throw new Error(`course enrollment reinstate failed: ${error.message}`);
    return data as EnrollmentRow;
  },

  async addEvent(event) {
    const { error } = await supabaseAdmin.from('course_enrollment_events').insert(event);
    // 23505 here is the partial unique index on stripe_event_id: already recorded.
    if (error && error.code !== '23505') throw new Error(`course event insert failed: ${error.message}`);
  },
};

/**
 * The checkout endpoint's ledger row. Best effort: the Stripe session already
 * exists when this runs, and a failed audit row must not turn a working
 * checkout into a 502. A replayed session (the same Stripe idempotency key,
 * called again) leaves exactly one row: checked for here before inserting.
 */
export async function recordCheckoutCreated(
  userId: string,
  sessionId: string,
  enrollmentId: string | null
): Promise<void> {
  try {
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('course_enrollment_events')
      .select('id')
      .eq('kind', 'checkout_created')
      .eq('stripe_checkout_session_id', sessionId)
      .limit(1)
      .maybeSingle();
    if (lookupError) {
      console.error('course checkout_created lookup failed', lookupError);
      return;
    }
    if (existing) return;

    await enrollmentStore.addEvent({
      enrollment_id: enrollmentId,
      user_id: userId,
      course_id: COURSE.id,
      kind: 'checkout_created',
      actor: 'system',
      stripe_checkout_session_id: sessionId,
      stripe_event_id: null,
      note: null,
    });
  } catch (err) {
    console.error('course checkout_created event failed', err);
  }
}
