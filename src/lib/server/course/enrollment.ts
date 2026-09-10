import type { User } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { supabaseAdmin } from '../supabaseAdmin';
import { getUserFromRequest } from '../auth';
import { trackCourseEnrolled } from '../ga4';
import { internalAlertTo, sendEmail } from '../email';
import { coursePurchaseEmail, courseDuplicatePaymentAlertEmail } from '../courseEmail';
import { CANONICAL_ORIGIN } from '../../canonical';
import { courseCopy } from '../../course/copy';
import { COURSE } from '../../../data/course';
import {
  entitlementFromRow,
  enrollFromSession,
  isPaidStatus,
  paidSessionFacts,
  paymentSignalKind,
  recordPaymentSignal,
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

  async hasGrantEvent(sessionId) {
    const { data, error } = await supabaseAdmin
      .from('course_enrollment_events')
      .select('id')
      .eq('stripe_checkout_session_id', sessionId)
      .in('kind', ['enrolled', 'reinstated'])
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`course grant event lookup failed: ${error.message}`);
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

/**
 * The webhook's course branch. Called for checkout.session.completed and the
 * two async payment events whenever metadata.purchase_intent is 'course'.
 * Throws on a database failure so the route 500s and Stripe retries into the
 * idempotency above; email and analytics failures are logged, never thrown.
 * Email links use CANONICAL_ORIGIN, not the webhook request's origin, which
 * is Stripe's and has nothing to do with the buyer's site.
 *
 * Once the enrollment is written, nothing here may throw: a retry would find
 * the row already applied and never reach the side effects, so a failed email
 * or event is logged and the delivery is acknowledged.
 */
export async function handleCourseCheckoutEvent(
  session: Stripe.Checkout.Session,
  event: { id: string; type: string; created: number }
): Promise<void> {
  // Stripe's own timestamp for the event, so a delayed retry records the day
  // the payment settled, not the day it was retried.
  const facts = paidSessionFacts(session, new Date(event.created * 1000));
  if (!facts) {
    console.warn('course checkout session missing user_id or course_id', session.id);
    return;
  }

  if (!isPaidStatus(session.payment_status)) {
    const kind = paymentSignalKind(event.type);
    await recordPaymentSignal(enrollmentStore, facts, event.id, kind);
    console.log(`course checkout ${session.id}: ${kind}`);
    return;
  }

  const { outcome, enrollment } = await enrollFromSession(enrollmentStore, facts, event.id);
  console.log(`course checkout ${session.id}: ${outcome}`);

  try {
    if (outcome === 'enrolled' || outcome === 'reinstated') {
      // The conversion of record, deduped by GA4 on the session id. Fired only
      // when access actually changed hands, never on a retry or a duplicate.
      await trackCourseEnrolled({
        clientId: session.metadata?.ga_client_id || facts.userId,
        sessionId: session.metadata?.ga_session_id || undefined,
        courseId: facts.courseId,
        value: (session.amount_total ?? 0) / 100,
        currency: (session.currency ?? 'usd').toUpperCase(),
        transactionId: session.id,
      });
      await sendPurchaseEmail(facts.userId, enrollment?.id ?? session.id, session);
      return;
    }

    if (outcome === 'duplicate_payment' || outcome === 'paid_while_revoked') {
      const amount = `${((session.amount_total ?? 0) / 100).toFixed(2)} ${(session.currency ?? 'usd').toUpperCase()}`;
      const mail = courseDuplicatePaymentAlertEmail({
        userId: facts.userId,
        sessionId: session.id,
        amountLabel: amount,
        note:
          outcome === 'duplicate_payment'
            ? 'They already had access and paid again, probably from a second tab.'
            : 'Their access was revoked and they paid again. Access stays revoked.',
        adminUrl: `${CANONICAL_ORIGIN}/admin`,
      });
      await sendEmail({ to: internalAlertTo(), ...mail, idempotencyKey: `course-duplicate/${session.id}` });
    }
  } catch (err) {
    console.error(`course checkout ${session.id}: side effect failed after ${outcome}`, err);
  }
}

async function sendPurchaseEmail(
  userId: string,
  enrollmentId: string,
  session: Stripe.Checkout.Session
): Promise<void> {
  // The account's address, not what they typed at Stripe: the link needs a sign-in.
  // A transient getUserById error still leaves the customer_details fallback
  // usable, so only the absence of an address is fatal here.
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  const to = data?.user?.email || session.customer_details?.email || null;
  if (!to) {
    console.error('course purchase email: no address for', userId, error?.message);
    return;
  }
  const mail = coursePurchaseEmail({
    courseTitle: COURSE.title,
    courseUrl: `${CANONICAL_ORIGIN}/course/learn/`,
    supportEmail: courseCopy('{{support_contact}}'),
  });
  // Keyed per purchase, not just per enrollment: a refund-then-repurchase inside
  // Resend's 24h idempotency window must still send a second confirmation.
  await sendEmail({ to, ...mail, idempotencyKey: `course-purchase/${enrollmentId}/${session.id}` });
}
