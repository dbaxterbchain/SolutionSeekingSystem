import { describe, expect, it } from 'vitest';
import {
  canPurchase,
  classifyPaidSession,
  enrollFromSession,
  entitlementFromRow,
  isPaidStatus,
  paidSessionFacts,
  paymentSignalKind,
  recordPaymentSignal,
  type EnrollmentRow,
  type EnrollmentStore,
  type NewEvent,
  type PaidSession,
} from '../enrollmentRules';

const NOW = new Date('2026-09-10T12:00:00Z');
const USER = '11111111-1111-4111-8111-111111111111';
const COURSE_ID = 'sss-course-v1';

function row(overrides: Partial<EnrollmentRow> = {}): EnrollmentRow {
  return {
    id: 'enr_1',
    user_id: USER,
    course_id: COURSE_ID,
    status: 'enrolled',
    source: 'stripe',
    stripe_checkout_session_id: 'cs_first',
    stripe_payment_intent_id: 'pi_first',
    stripe_customer_id: 'cus_1',
    amount_total: 19900,
    currency: 'usd',
    purchased_at: '2026-09-01T00:00:00Z',
    access_starts_at: '2026-09-01T00:00:00Z',
    access_ends_at: null,
    ...overrides,
  };
}

function session(overrides: Partial<PaidSession> = {}): PaidSession {
  return {
    sessionId: 'cs_new',
    userId: USER,
    courseId: COURSE_ID,
    paymentIntentId: 'pi_new',
    customerId: 'cus_1',
    amountTotal: 19900,
    currency: 'usd',
    paidAt: NOW.toISOString(),
    ...overrides,
  };
}

/** An in-memory store with the two unique constraints the real table has. */
function fakeStore(seed: EnrollmentRow[] = []) {
  const rows = seed.map((r) => ({ ...r }));
  const events: NewEvent[] = [];
  let n = rows.length;
  const store: EnrollmentStore = {
    async findByUser(userId, courseId) {
      return rows.find((r) => r.user_id === userId && r.course_id === courseId) ?? null;
    },
    async hasEvent(id) {
      return events.some((e) => e.stripe_event_id === id);
    },
    async hasGrantEvent(sessionId) {
      return events.some(
        (e) => e.stripe_checkout_session_id === sessionId && (e.kind === 'enrolled' || e.kind === 'reinstated')
      );
    },
    async insert(s) {
      if (rows.some((r) => r.user_id === s.userId && r.course_id === s.courseId)) return 'conflict';
      if (rows.some((r) => r.stripe_checkout_session_id === s.sessionId)) return 'conflict';
      const created: EnrollmentRow = {
        id: `enr_${++n}`,
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
      };
      rows.push(created);
      return created;
    },
    async reinstate(id, s) {
      const target = rows.find((r) => r.id === id);
      if (!target) throw new Error('missing row');
      Object.assign(target, {
        status: 'enrolled',
        stripe_checkout_session_id: s.sessionId,
        stripe_payment_intent_id: s.paymentIntentId,
        stripe_customer_id: s.customerId,
        amount_total: s.amountTotal,
        currency: s.currency,
        purchased_at: s.paidAt,
        access_starts_at: s.paidAt,
        access_ends_at: null,
      });
      return target;
    },
    async addEvent(e) {
      if (e.stripe_event_id && events.some((x) => x.stripe_event_id === e.stripe_event_id)) return;
      events.push(e);
    },
  };
  return { store, rows, events };
}

describe('entitlementFromRow', () => {
  it('is none without a row', () => {
    expect(entitlementFromRow(null, NOW)).toEqual({ kind: 'none' });
  });

  it('is enrolled for an active row with no end date', () => {
    const e = entitlementFromRow(row(), NOW);
    expect(e.kind).toBe('enrolled');
    if (e.kind === 'enrolled') {
      expect(e.enrollment).toEqual({
        id: 'enr_1',
        source: 'stripe',
        purchased_at: '2026-09-01T00:00:00Z',
        access_starts_at: '2026-09-01T00:00:00Z',
        access_ends_at: null,
      });
      expect('stripe_checkout_session_id' in e.enrollment).toBe(false);
    }
  });

  it('is expired once access_ends_at has passed, and enrolled before it', () => {
    expect(entitlementFromRow(row({ access_ends_at: '2026-09-09T00:00:00Z' }), NOW).kind).toBe('expired');
    expect(entitlementFromRow(row({ access_ends_at: '2026-09-11T00:00:00Z' }), NOW).kind).toBe('enrolled');
  });

  it('is inactive with the reason for revoked and refunded rows', () => {
    expect(entitlementFromRow(row({ status: 'revoked' }), NOW)).toMatchObject({ kind: 'inactive', reason: 'revoked' });
    expect(entitlementFromRow(row({ status: 'refunded' }), NOW)).toMatchObject({ kind: 'inactive', reason: 'refunded' });
  });
});

describe('canPurchase', () => {
  const none = { kind: 'none' } as const;
  it('refuses anonymous users regardless of status', () => {
    expect(canPurchase(none, { status: 'open', isAdmin: true, isAnonymous: true })).toBe(false);
  });
  it('sells only when open, except to admins', () => {
    expect(canPurchase(none, { status: 'hidden', isAdmin: false, isAnonymous: false })).toBe(false);
    expect(canPurchase(none, { status: 'preview', isAdmin: false, isAnonymous: false })).toBe(false);
    expect(canPurchase(none, { status: 'hidden', isAdmin: true, isAnonymous: false })).toBe(true);
    expect(canPurchase(none, { status: 'open', isAdmin: false, isAnonymous: false })).toBe(true);
  });
  it('never sells to someone enrolled or revoked, but does to refunded and expired', () => {
    const opts = { status: 'open', isAdmin: false, isAnonymous: false } as const;
    expect(canPurchase(entitlementFromRow(row(), NOW), opts)).toBe(false);
    expect(canPurchase(entitlementFromRow(row({ status: 'revoked' }), NOW), opts)).toBe(false);
    expect(canPurchase(entitlementFromRow(row({ status: 'refunded' }), NOW), opts)).toBe(true);
    expect(canPurchase(entitlementFromRow(row({ access_ends_at: '2026-01-01T00:00:00Z' }), NOW), opts)).toBe(true);
  });
});

describe('classifyPaidSession', () => {
  it('follows the decision table', () => {
    expect(classifyPaidSession(null, 'cs_new', NOW)).toBe('enrolled');
    expect(classifyPaidSession(row(), 'cs_first', NOW)).toBe('already_processed');
    expect(classifyPaidSession(row(), 'cs_new', NOW)).toBe('duplicate_payment');
    expect(classifyPaidSession(row({ status: 'refunded' }), 'cs_new', NOW)).toBe('reinstated');
    expect(classifyPaidSession(row({ status: 'revoked' }), 'cs_new', NOW)).toBe('paid_while_revoked');
    expect(classifyPaidSession(row({ access_ends_at: '2026-01-01T00:00:00Z' }), 'cs_new', NOW)).toBe('reinstated');
  });
});

describe('paidSessionFacts', () => {
  it('reads the ids from metadata and expanded or plain references', () => {
    const facts = paidSessionFacts(
      {
        id: 'cs_x',
        client_reference_id: null,
        metadata: { purchase_intent: 'course', user_id: USER, course_id: COURSE_ID },
        payment_intent: { id: 'pi_x' },
        customer: 'cus_x',
        amount_total: 19900,
        currency: 'usd',
      },
      NOW
    );
    expect(facts).toEqual({
      sessionId: 'cs_x',
      userId: USER,
      courseId: COURSE_ID,
      paymentIntentId: 'pi_x',
      customerId: 'cus_x',
      amountTotal: 19900,
      currency: 'usd',
      paidAt: NOW.toISOString(),
    });
  });

  it('falls back to client_reference_id for the user and is null without a course id', () => {
    expect(
      paidSessionFacts({ id: 'cs_y', client_reference_id: USER, metadata: { course_id: COURSE_ID } }, NOW)?.userId
    ).toBe(USER);
    expect(paidSessionFacts({ id: 'cs_z', metadata: { user_id: USER } }, NOW)).toBeNull();
  });
});

describe('enrollFromSession', () => {
  it('enrolls a first purchase and writes one ledger row carrying the event id', async () => {
    const { store, rows, events } = fakeStore();
    const result = await enrollFromSession(store, session(), 'evt_1');
    expect(result.outcome).toBe('enrolled');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'enrolled', stripe_checkout_session_id: 'cs_new', source: 'stripe' });
    expect(events).toEqual([
      expect.objectContaining({ kind: 'enrolled', actor: 'stripe', stripe_event_id: 'evt_1', enrollment_id: rows[0].id }),
    ]);
  });

  it('treats a re-delivered event as already processed', async () => {
    const { store, rows, events } = fakeStore();
    await enrollFromSession(store, session(), 'evt_1');
    const again = await enrollFromSession(store, session(), 'evt_1');
    expect(again.outcome).toBe('already_processed');
    expect(again.enrollment?.id).toBe(rows[0].id);
    expect(rows).toHaveLength(1);
    expect(events).toHaveLength(1);
  });

  it('treats the same session under a new event id as already processed, without a ledger row', async () => {
    const { store, events } = fakeStore();
    await enrollFromSession(store, session(), 'evt_1');
    const again = await enrollFromSession(store, session(), 'evt_2');
    expect(again.outcome).toBe('already_processed');
    expect(events).toHaveLength(1);
  });

  it('records a second payment while enrolled as duplicate_payment and leaves the enrollment alone', async () => {
    const { store, rows, events } = fakeStore([row()]);
    const result = await enrollFromSession(store, session({ sessionId: 'cs_second' }), 'evt_9');
    expect(result.outcome).toBe('duplicate_payment');
    expect(rows[0].stripe_checkout_session_id).toBe('cs_first');
    expect(events).toEqual([
      expect.objectContaining({ kind: 'duplicate_payment', stripe_checkout_session_id: 'cs_second', enrollment_id: 'enr_1' }),
    ]);
    expect(events[0].note).toContain('cs_first');
  });

  it('reinstates a refunded enrollment with the new purchase', async () => {
    const { store, rows, events } = fakeStore([row({ status: 'refunded' })]);
    const result = await enrollFromSession(store, session({ sessionId: 'cs_again', paymentIntentId: 'pi_again' }), 'evt_5');
    expect(result.outcome).toBe('reinstated');
    expect(rows[0]).toMatchObject({ status: 'enrolled', stripe_checkout_session_id: 'cs_again', stripe_payment_intent_id: 'pi_again', access_ends_at: null });
    expect(events[0]).toMatchObject({ kind: 'reinstated', enrollment_id: 'enr_1' });
  });

  it('keeps a revoked enrollment revoked when a payment arrives, and records it for a refund', async () => {
    const { store, rows, events } = fakeStore([row({ status: 'revoked' })]);
    const result = await enrollFromSession(store, session(), 'evt_7');
    expect(result.outcome).toBe('paid_while_revoked');
    expect(rows[0].status).toBe('revoked');
    expect(events[0]).toMatchObject({ kind: 'duplicate_payment' });
    expect(events[0].note).toMatch(/revoked/);
  });

  it('turns two racing first purchases into one enrollment and one duplicate', async () => {
    const { store, rows, events } = fakeStore();
    const [a, b] = await Promise.all([
      enrollFromSession(store, session({ sessionId: 'cs_tab1' }), 'evt_a'),
      enrollFromSession(store, session({ sessionId: 'cs_tab2' }), 'evt_b'),
    ]);
    expect([a.outcome, b.outcome].sort()).toEqual(['duplicate_payment', 'enrolled']);
    expect(rows).toHaveLength(1);
    expect(events.map((e) => e.kind).sort()).toEqual(['duplicate_payment', 'enrolled']);
  });

  it('re-opens an enrollment whose access ended when the learner buys again', async () => {
    const { store, rows, events } = fakeStore([row({ access_ends_at: '2026-01-01T00:00:00Z' })]);
    const result = await enrollFromSession(store, session({ sessionId: 'cs_renew' }), 'evt_r');
    expect(result.outcome).toBe('reinstated');
    expect(rows[0]).toMatchObject({ status: 'enrolled', access_ends_at: null, stripe_checkout_session_id: 'cs_renew' });
    expect(events[0]).toMatchObject({ kind: 'reinstated', stripe_event_id: 'evt_r' });
  });

  it('finishes a delivery that died between the enrollment write and its ledger row', async () => {
    const { store, rows, events } = fakeStore();
    let failNext = true;
    const flaky: EnrollmentStore = {
      ...store,
      async addEvent(e) {
        if (failNext) {
          failNext = false;
          throw new Error('ledger unavailable');
        }
        return store.addEvent(e);
      },
    };
    await expect(enrollFromSession(flaky, session(), 'evt_1')).rejects.toThrow('ledger unavailable');
    expect(rows).toHaveLength(1);
    expect(events).toHaveLength(0);
    const retry = await enrollFromSession(flaky, session(), 'evt_1');
    expect(retry.outcome).toBe('enrolled');
    expect(events).toEqual([
      expect.objectContaining({ kind: 'enrolled', stripe_event_id: 'evt_1', enrollment_id: rows[0].id }),
    ]);
  });

  it('throws when an insert conflicts but no row can be found', async () => {
    const { store } = fakeStore();
    const broken: EnrollmentStore = { ...store, async insert() { return 'conflict'; } };
    await expect(enrollFromSession(broken, session(), 'evt_x')).rejects.toThrow(/conflicted but no row/);
  });

  it('does not finish a dead delivery for a row an operator has since revoked', async () => {
    const { store, rows, events } = fakeStore([row({ status: 'revoked', stripe_checkout_session_id: 'cs_new' })]);
    const result = await enrollFromSession(store, session(), 'evt_late');
    expect(result.outcome).toBe('already_processed');
    expect(rows[0].status).toBe('revoked');
    expect(events).toHaveLength(0);
  });
});

describe('recordPaymentSignal', () => {
  it('writes one pending or failed row per event and links an existing enrollment', async () => {
    const { store, events } = fakeStore([row({ status: 'refunded' })]);
    await recordPaymentSignal(store, session({ sessionId: 'cs_bank' }), 'evt_p', 'payment_pending');
    await recordPaymentSignal(store, session({ sessionId: 'cs_bank' }), 'evt_p', 'payment_pending');
    await recordPaymentSignal(store, session({ sessionId: 'cs_bank' }), 'evt_f', 'payment_failed');
    expect(events.map((e) => e.kind)).toEqual(['payment_pending', 'payment_failed']);
    expect(events[0]).toMatchObject({ enrollment_id: 'enr_1', actor: 'stripe', stripe_checkout_session_id: 'cs_bank' });
  });
});

describe('payment helpers', () => {
  it('treats paid and no_payment_required as paid', () => {
    expect(isPaidStatus('paid')).toBe(true);
    expect(isPaidStatus('no_payment_required')).toBe(true);
    expect(isPaidStatus('unpaid')).toBe(false);
    expect(isPaidStatus(null)).toBe(false);
  });
  it('maps the failed async event to payment_failed and everything else to payment_pending', () => {
    expect(paymentSignalKind('checkout.session.async_payment_failed')).toBe('payment_failed');
    expect(paymentSignalKind('checkout.session.completed')).toBe('payment_pending');
  });
});
