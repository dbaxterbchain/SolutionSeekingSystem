/**
 * The rules of course enrollment, with no I/O.
 *
 * Everything that decides what an enrollment row means, or what a paid Stripe
 * session should do to one, lives here so it can be unit-tested with plain
 * objects and a fake store. enrollment.ts binds these rules to Supabase and to
 * the request; the webhook calls the bound version.
 */

export type EnrollmentStatus = 'enrolled' | 'revoked' | 'refunded';

export interface EnrollmentRow {
  id: string;
  user_id: string;
  course_id: string;
  status: EnrollmentStatus;
  source: 'stripe' | 'admin';
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_customer_id: string | null;
  amount_total: number | null;
  currency: string | null;
  purchased_at: string | null;
  access_starts_at: string;
  access_ends_at: string | null;
}

/** What the browser is told about an enrollment. Never a Stripe id. */
export interface EnrollmentSummary {
  id: string;
  source: 'stripe' | 'admin';
  purchased_at: string | null;
  access_starts_at: string;
  access_ends_at: string | null;
}

export type CourseEntitlement =
  | { kind: 'enrolled'; enrollment: EnrollmentSummary }
  | { kind: 'none' }
  | { kind: 'inactive'; reason: 'revoked' | 'refunded'; enrollment: EnrollmentSummary }
  | { kind: 'expired'; enrollment: EnrollmentSummary };

export const summarize = (row: EnrollmentRow): EnrollmentSummary => ({
  id: row.id,
  source: row.source,
  purchased_at: row.purchased_at,
  access_starts_at: row.access_starts_at,
  access_ends_at: row.access_ends_at,
});

/** Read an enrollment row as an entitlement, as of `now`. */
export function entitlementFromRow(row: EnrollmentRow | null, now: Date): CourseEntitlement {
  if (!row) return { kind: 'none' };
  const enrollment = summarize(row);
  if (row.status !== 'enrolled') return { kind: 'inactive', reason: row.status, enrollment };
  if (row.access_ends_at && new Date(row.access_ends_at).getTime() <= now.getTime()) {
    return { kind: 'expired', enrollment };
  }
  return { kind: 'enrolled', enrollment };
}

export type SaleStatus = 'hidden' | 'preview' | 'open';

/**
 * Whether /api/course/checkout would sell to this user. Before launch only
 * admins can buy (that is how checkout is tested against production);
 * someone enrolled has nothing to buy; someone revoked is refused rather than
 * quietly re-sold access an operator took away.
 */
export function canPurchase(
  entitlement: CourseEntitlement,
  opts: { status: SaleStatus; isAdmin: boolean; isAnonymous: boolean }
): boolean {
  if (opts.isAnonymous) return false;
  if (opts.status !== 'open' && !opts.isAdmin) return false;
  if (entitlement.kind === 'enrolled') return false;
  if (entitlement.kind === 'inactive' && entitlement.reason === 'revoked') return false;
  return true;
}

/** The facts about a paid Checkout Session that the rules need. */
export interface PaidSession {
  sessionId: string;
  userId: string;
  courseId: string;
  paymentIntentId: string | null;
  customerId: string | null;
  /** Cents, exactly as Stripe reports it. */
  amountTotal: number | null;
  currency: string | null;
  /** ISO 8601. */
  paidAt: string;
}

/** The shape of a Stripe Checkout Session this module reads. Structural, so tests need no Stripe import. */
export interface CheckoutSessionLike {
  id: string;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
  payment_intent?: string | { id: string } | null;
  customer?: string | { id: string } | null;
  amount_total?: number | null;
  currency?: string | null;
}

const refId = (value: string | { id: string } | null | undefined): string | null =>
  typeof value === 'string' ? value : value?.id ?? null;

/** Null when the session does not identify a learner and a course. */
export function paidSessionFacts(session: CheckoutSessionLike, now: Date): PaidSession | null {
  const userId = session.metadata?.user_id || session.client_reference_id || null;
  const courseId = session.metadata?.course_id || null;
  if (!userId || !courseId) return null;
  return {
    sessionId: session.id,
    userId,
    courseId,
    paymentIntentId: refId(session.payment_intent),
    customerId: refId(session.customer),
    amountTotal: session.amount_total ?? null,
    currency: session.currency ?? null,
    paidAt: now.toISOString(),
  };
}

/**
 * Whether a Checkout Session's payment_status means access is owed. In
 * payment mode `no_payment_required` can only be a zero total (a full
 * promotion code), which is still a purchase.
 */
export const isPaidStatus = (status: string | null | undefined): boolean =>
  status === 'paid' || status === 'no_payment_required';

/** The ledger kind for a session that completed without settling. */
export const paymentSignalKind = (eventType: string): 'payment_pending' | 'payment_failed' =>
  eventType === 'checkout.session.async_payment_failed' ? 'payment_failed' : 'payment_pending';

export type PaidOutcome =
  | 'enrolled'
  | 'reinstated'
  | 'already_processed'
  | 'duplicate_payment'
  | 'paid_while_revoked';

/** What a PAID session should do to the learner's existing enrollment, if any, as of `now`. */
export function classifyPaidSession(
  existing: EnrollmentRow | null,
  sessionId: string,
  now: Date
): PaidOutcome {
  if (!existing) return 'enrolled';
  if (existing.stripe_checkout_session_id === sessionId) return 'already_processed';
  if (existing.status === 'enrolled') {
    // Access that has ended may be bought again; the purchase re-opens the row.
    return entitlementFromRow(existing, now).kind === 'expired' ? 'reinstated' : 'duplicate_payment';
  }
  if (existing.status === 'refunded') return 'reinstated';
  return 'paid_while_revoked';
}

export type EventKind =
  | 'checkout_created'
  | 'payment_pending'
  | 'payment_failed'
  | 'enrolled'
  | 'reinstated'
  | 'duplicate_payment'
  | 'revoked'
  | 'refunded'
  | 'admin_granted'
  | 'refund_received';

export interface NewEvent {
  enrollment_id: string | null;
  user_id: string;
  course_id: string;
  kind: EventKind;
  actor: 'stripe' | 'admin' | 'system';
  actor_user_id?: string | null;
  stripe_checkout_session_id: string | null;
  stripe_event_id: string | null;
  note: string | null;
}

/** The writes enrollFromSession needs. enrollment.ts implements it on Supabase; tests fake it. */
export interface EnrollmentStore {
  findByUser(userId: string, courseId: string): Promise<EnrollmentRow | null>;
  /** True when a ledger row already carries this Stripe event id. */
  hasEvent(stripeEventId: string): Promise<boolean>;
  /** True when an `enrolled` or `reinstated` ledger row already records this session. */
  hasGrantEvent(sessionId: string): Promise<boolean>;
  /** Insert a fresh enrollment; 'conflict' when a row for this learner (or session) appeared meanwhile. */
  insert(session: PaidSession): Promise<EnrollmentRow | 'conflict'>;
  /** Re-activate a refunded enrollment with the new purchase. */
  reinstate(id: string, session: PaidSession): Promise<EnrollmentRow>;
  /** Append a ledger row. A duplicate stripe_event_id is silently ignored. */
  addEvent(event: NewEvent): Promise<void>;
}

export interface EnrollResult {
  outcome: PaidOutcome;
  enrollment: EnrollmentRow | null;
}

const EVENT_FOR: Record<Exclude<PaidOutcome, 'already_processed'>, EventKind> = {
  enrolled: 'enrolled',
  reinstated: 'reinstated',
  duplicate_payment: 'duplicate_payment',
  paid_while_revoked: 'duplicate_payment',
};

function noteFor(outcome: PaidOutcome, existing: EnrollmentRow | null): string | null {
  if (outcome === 'duplicate_payment') {
    return `Paid again while already enrolled (earlier session ${existing?.stripe_checkout_session_id ?? 'unknown'}). Refund the newer payment in Stripe.`;
  }
  if (outcome === 'paid_while_revoked') {
    return 'Paid while access was revoked. Access stays revoked; refund, or reinstate from /admin.';
  }
  return null;
}

/**
 * Apply one PAID Checkout Session to the learner's enrollment, exactly once.
 *
 * Idempotent three ways, because Stripe retries and people double-pay:
 *  - the ledger's unique stripe_event_id makes a re-delivered event a no-op;
 *  - the enrollment's unique stripe_checkout_session_id makes the same
 *    purchase a no-op even under a fresh event id;
 *  - the unique (user_id, course_id) turns two racing first purchases into one
 *    enrollment and one duplicate_payment record for a human to refund;
 *  - a delivery that died after the mutation is completed by the retry rather
 *    than skipped.
 */
export async function enrollFromSession(
  store: EnrollmentStore,
  session: PaidSession,
  stripeEventId: string
): Promise<EnrollResult> {
  if (await store.hasEvent(stripeEventId)) {
    return {
      outcome: 'already_processed',
      enrollment: await store.findByUser(session.userId, session.courseId),
    };
  }

  const now = new Date(session.paidAt);
  let existing = await store.findByUser(session.userId, session.courseId);
  let outcome = classifyPaidSession(existing, session.sessionId, now);
  let enrollment = existing;

  if (outcome === 'enrolled') {
    const inserted = await store.insert(session);
    if (inserted === 'conflict') {
      // A parallel delivery (a second tab, or a retry) won the insert race.
      existing = await store.findByUser(session.userId, session.courseId);
      if (!existing) throw new Error(`course enrollment insert conflicted but no row exists for ${session.userId}`);
      outcome = classifyPaidSession(existing, session.sessionId, now);
      enrollment = existing;
    } else {
      enrollment = inserted;
    }
  }
  if (outcome === 'reinstated' && existing) {
    enrollment = await store.reinstate(existing.id, session);
  }
  if (outcome === 'already_processed') {
    // The row carries this session, so an earlier delivery got as far as the
    // mutation. If it died before its ledger row, finish the job now: the
    // ledger row under this event id, and the side effects the caller runs.
    if (existing && !(await store.hasGrantEvent(session.sessionId))) {
      outcome = 'enrolled';
    } else {
      return { outcome, enrollment };
    }
  }

  await store.addEvent({
    enrollment_id: enrollment?.id ?? null,
    user_id: session.userId,
    course_id: session.courseId,
    kind: EVENT_FOR[outcome],
    actor: 'stripe',
    stripe_checkout_session_id: session.sessionId,
    stripe_event_id: stripeEventId,
    note: noteFor(outcome, existing),
  });
  return { outcome, enrollment };
}

/**
 * A session that completed without money changing hands yet (a bank debit
 * still processing), or whose delayed payment failed. Nothing changes on the
 * enrollment; the ledger keeps the signal.
 */
export async function recordPaymentSignal(
  store: EnrollmentStore,
  session: Pick<PaidSession, 'sessionId' | 'userId' | 'courseId'>,
  stripeEventId: string,
  kind: 'payment_pending' | 'payment_failed'
): Promise<void> {
  if (await store.hasEvent(stripeEventId)) return;
  const existing = await store.findByUser(session.userId, session.courseId);
  await store.addEvent({
    enrollment_id: existing?.id ?? null,
    user_id: session.userId,
    course_id: session.courseId,
    kind,
    actor: 'stripe',
    stripe_checkout_session_id: session.sessionId,
    stripe_event_id: stripeEventId,
    note: null,
  });
}
