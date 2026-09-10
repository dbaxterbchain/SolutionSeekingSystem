# Course Phase 1b: Commerce Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in learner can buy the course once through Stripe Checkout, the Stripe webhook enrolls them exactly once, the public sales page and the learner dashboard reflect their access, and every later course API route can gate on enrollment.

**Architecture:** `POST /api/course/checkout` creates a one-time `payment` mode Checkout Session whose metadata carries `purchase_intent: 'course'`. The webhook's course branch, placed before the org and personal paths, is the only writer of `course_enrollments`; the pure rules in `enrollmentRules.ts` decide what a paid session does to an enrollment and are unit-tested against a fake store. `getCourseEntitlement` is the course's own authority beside `checkEntitlement`, never inside it. Public pages stay prerendered shells plus islands that read `/api/course/entitlement` with the bearer token.

**Tech Stack:** Astro 5 (static-first, Netlify adapter), React islands, Supabase (service role on the server, bearer JWT from the browser), Stripe Node SDK 22 (`checkout.sessions.create` in payment mode, webhook signature verification), Resend, GA4 Measurement Protocol, vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-paid-video-course-design.md`, sections "Server modules", "API contract", "Offer configuration and launch flag", "Public surfaces and touchpoints" and Phase 1 tasks 5 to 9. Sub-plan 1a (`docs/superpowers/plans/2026-09-09-course-phase1a-foundations.md`) built everything this plan consumes.

## Global Constraints

- **No em dashes (`—`) or en dashes between words** in any user-facing copy, comment, error message, email or commit message. Fix the sentence, never the character. Audit every new file with `grep -n "—" <file>` before committing.
- **No machine tells and no counted-pair headings** ("One purchase, two outcomes"). Headings say what a section contains.
- **Never type a price.** `COURSE_PRICE` in `src/data/pricing.ts` is `null` and stays `null`; `{{course_price}}` renders only through `courseCopy()` and only when `PUBLIC_COURSE_STATUS=open`. The test-mode Stripe price created for verification is never a launch decision.
- **API routes:** `export const prerender = false`; bearer auth via `getUserFromRequest`; hand-rolled validation (no Zod); snake_case error codes with an optional `message`; every `/api/course/*` response goes through `privateJson` (never cached).
- **The webhook is the only writer of `course_enrollments`.** Course tables have no client grants; the browser learns about enrollment only from `/api/course/entitlement`.
- **`PlanId`, `PLANS` and `resolvePlan` stay closed.** The course resolves its price through `resolveCourseOffer()` and never touches `src/lib/server/plans.ts`.
- **Tests:** vitest, pure modules only. A test file never imports (directly or transitively) `astro:content`, `src/lib/server/supabaseAdmin.ts`, Stripe, Resend or real `fetch`. Course server tests live in `src/lib/server/course/__tests__/`, course client-side pure tests in `src/lib/course/__tests__/`.
- **Every task ends green:** `npm test`, `npm run check`, `npm run build` (the build runs in `hidden` mode with the repo's `.env`; it prints `course catalog: 40 lessons, ...`).
- **Line endings:** the repo checks out CRLF. Run `unix2dos -q <file>` on every new file before committing.
- **Commit trailer** names the model that wrote the commit, for example `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. One task, one commit unless a task says otherwise.
- **Secrets:** never print a value from `.env` or `.env.local`; read variable names only. Before any Stripe checkout test, confirm the key is test mode with `grep -o "^STRIPE_SECRET_KEY=.\{7\}" .env` (expect `rk_test` or `sk_test`); if it is anything else, stop and report BLOCKED.
- **Local test settings go in `.env.local`** (git-ignored by `.env*.local`; Vite loads it after `.env`, so its values win). Never edit `.env`. Restart the dev server after changing either file.
- **Docs are owned by sub-plan 1e** (standing ruling from 1a): do not edit `docs/status.md`, `deployment.md`, `architecture.md` or `content-guide.md` here. `.env.example` and the spec amendment in Task 6 are the only documentation edits.
- **Never run `npx supabase db push`.** The local stack only (`npx supabase status` must show it running; if it is stopped, `npx supabase start`).
- **Background processes:** start the dev server and `stripe listen` with the Bash tool's `run_in_background`. Stop them when the task ends: the dev server by PID (`netstat -ano | grep :4321` then `taskkill //PID <pid> //F`), the Stripe CLI with `taskkill //F //IM stripe.exe`. Never `taskkill //IM node.exe`: that kills the tooling you are running in.
- **`docs/change-checklist.md` applies:** new pages register an OG entry, private shells pass `noindex`, new CTAs get an analytics event, and `npm run check` plus `npm run build` gate every task.

## File structure

Created:

| File | Responsibility |
|---|---|
| `src/lib/server/course/offer.ts` | `resolveCourseOffer()`: the course's Stripe price from `STRIPE_PRICE_ID_COURSE` |
| `src/lib/server/course/enrollmentRules.ts` | Pure: enrollment types, `entitlementFromRow`, `canPurchase`, `classifyPaidSession`, `paidSessionFacts`, `enrollFromSession(store, ...)`, `recordPaymentSignal` |
| `src/lib/server/course/enrollment.ts` | Supabase-bound: `findEnrollment`, `getCourseEntitlement`, `requireEnrolled`, `enrollmentStore`, `recordCheckoutCreated`, `handleCourseCheckoutEvent` |
| `src/lib/server/courseEmail.ts` | `coursePurchaseEmail`, `courseDuplicatePaymentAlertEmail` |
| `src/pages/api/course/entitlement.ts` | `GET`: entitlement plus the sale block |
| `src/pages/api/course/checkout.ts` | `POST`: the one-time Checkout Session |
| `src/lib/courseClient.ts` | Browser client: `fetchCourseEntitlement`, `startCourseCheckout`, `CourseActionError`, `courseErrorMessage` |
| `src/lib/useCourseEntitlement.ts` | React hook mirroring `useEntitlement`, with `refetch()` |
| `src/components/react/CourseSalesCta.tsx` | The buy control: signed-out, purchasable, enrolled, ended and coming-soon states |
| `src/components/CourseSyllabus.astro` | The nine modules and their lesson titles from the catalog |
| `src/pages/course/index.astro` | The sales page; a 404 response while hidden |
| `src/components/react/CourseDashboard.tsx` | The learner dashboard island, including the `?checkout=success` return |
| `src/pages/course/learn/index.astro` | The dashboard shell (`noindex`) |
| `src/lib/server/course/__tests__/offer.test.ts`, `enrollmentRules.test.ts` | Unit tests |

Modified:

| File | Change |
|---|---|
| `src/lib/server/auth.ts` | `privateJson` |
| `src/lib/server/adminAuth.ts` | `isAdminUser(user)` extracted from `requireAdmin` |
| `src/lib/server/email.ts` | export `BRAND`, `INK`, `esc`, `layout`, `button` |
| `src/lib/server/ga4.ts` | shared sender, `trackCourseEnrolled` |
| `src/pages/api/stripe-webhook.ts` | course branch first; the two async payment events |
| `src/lib/analytics.ts` | CTA locations, `PlanId` gains `course`, `course_viewed` and `enrollment_ready` events |
| `src/components/react/CheckoutBanner.tsx` | course-aware cancel copy |
| `src/pages/og/[...route].ts` | `course` (gated) and `course/learn` entries |
| `astro.config.mjs` | sitemap keeps `/course` out unless the course is public |
| `src/lib/course/validate.ts` + test, spec | the preview lesson gate applies to `open`, not `preview` |
| `src/pages/course/learn/lessons/[id].astro` | placeholder card links to the dashboard |
| `.env.example`, `src/env.d.ts` | `STRIPE_PRICE_ID_COURSE` |

## Local test environment (used from Task 2 onward)

Every verification below assumes:

1. The local Supabase stack is running (`npx supabase status` prints the URLs; `.env` already points `PUBLIC_SUPABASE_URL` at `127.0.0.1:55321`). Migration `0030_course.sql` is applied locally; if `curl -s http://127.0.0.1:55321/rest/v1/course_enrollments -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"` returns `[]` it is.
2. Local keys come from `npx supabase status -o env` (`ANON_KEY`, `SERVICE_ROLE_KEY`, values quoted). Read them into shell variables; never paste them into a file that is not git-ignored.
3. A confirmed test account created through the local admin API (the local stack requires email confirmation, so create the user already confirmed):

```bash
eval "$(npx supabase status -o env 2>/dev/null | grep -E '^(ANON_KEY|SERVICE_ROLE_KEY)=')"
curl -s -X POST http://127.0.0.1:55321/auth/v1/admin/users \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
  -d '{"email":"course-admin@example.com","password":"course-test-password-1","email_confirm":true}'
TOKEN=$(curl -s -X POST "http://127.0.0.1:55321/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"course-admin@example.com","password":"course-test-password-1"}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).access_token))")
USER_ID=$(curl -s http://127.0.0.1:55321/auth/v1/user -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).id))")
```

   A second account, `course-learner@example.com`, is created the same way for the non-admin cases (`TOKEN2`).

4. `.env.local` with these lines (create it if absent; it is git-ignored):

```
ADMIN_EMAILS=course-admin@example.com
STRIPE_PRICE_ID_COURSE=<the test price id from Task 3>
```

   `ADMIN_EMAILS` is unset in `.env`, so without this line the admin path fails closed and checkout refuses everyone in hidden mode.

5. The dev server: `npm run dev` in the background, then `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/` until it answers `200`.

## Conventions the code follows

- Error responses: `privateJson({ error: '<snake_case>' , ...extra }, status)`.
- Stripe metadata values are strings; drop absent keys rather than sending empty ones.
- Supabase errors are logged with a prefix naming the operation and rethrown as `Error` so a webhook 500s and Stripe retries.
- Copy: short sentences, full stops, no dashes. The interim sentences for unset launch tokens are honest ("Access details are confirmed when the course opens.").

---

### Task 1: `privateJson`, the course offer, env plumbing

**Files:**
- Modify: `src/lib/server/auth.ts`
- Create: `src/lib/server/course/offer.ts`
- Test: `src/lib/server/course/__tests__/offer.test.ts`
- Modify: `.env.example`, `src/env.d.ts`

**Interfaces:**
- Produces: `privateJson(body: unknown, status = 200): Response`; `resolveCourseOffer(): CourseOffer | null` with `CourseOffer = { priceId: string; value: number }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/server/course/__tests__/offer.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveCourseOffer } from '../offer';
import { COURSE_PRICE } from '../../../../data/pricing';

describe('resolveCourseOffer', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('resolves the price id from STRIPE_PRICE_ID_COURSE', () => {
    vi.stubEnv('STRIPE_PRICE_ID_COURSE', 'price_course_test');
    expect(resolveCourseOffer()).toEqual({
      priceId: 'price_course_test',
      value: Number(COURSE_PRICE?.priceAmount ?? 0),
    });
  });

  it('returns null and logs when the price is not configured', () => {
    vi.stubEnv('STRIPE_PRICE_ID_COURSE', '');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(resolveCourseOffer()).toBeNull();
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/server/course/__tests__/offer.test.ts`
Expected: FAIL, cannot resolve `../offer`.

- [ ] **Step 3: Create `src/lib/server/course/offer.ts`**

```ts
import { serverEnv } from '../env';
import { COURSE_PRICE } from '../../../data/pricing';

export interface CourseOffer {
  priceId: string;
  /** Dollar amount for the conversion event. 0 until COURSE_PRICE exists. */
  value: number;
}

/**
 * The course's Stripe price, resolved from env the way resolvePlan() resolves
 * a subscription price, and deliberately NOT through resolvePlan: the course
 * is a one-time payment with its own endpoint, so PLANS and PlanId stay
 * closed and resolvePlan keeps rejecting anything it does not know.
 */
export function resolveCourseOffer(): CourseOffer | null {
  const priceId = serverEnv('STRIPE_PRICE_ID_COURSE');
  if (!priceId) {
    console.error('Stripe price not configured for the course (STRIPE_PRICE_ID_COURSE)');
    return null;
  }
  return { priceId, value: Number(COURSE_PRICE?.priceAmount ?? 0) };
}
```

- [ ] **Step 4: Add `privateJson` to `src/lib/server/auth.ts`** (after `json`)

```ts
/**
 * JSON that must never be cached by any intermediary: one user's private
 * state. Every /api/course/* response uses this, the way adminJson does for
 * the admin routes.
 */
export function privateJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
```

- [ ] **Step 5: Env plumbing**

In `.env.example`, after the `STRIPE_PRICE_ID_TEAM=...` line, add:

```
# The video course: a ONE-TIME price (not recurring) on its own product,
# "Solution Seeking Course". Resolved by src/lib/server/course/offer.ts and
# nowhere else; the course is not a PlanId. UNSET means /api/course/checkout
# answers 503 course_not_configured and nothing else breaks.
STRIPE_PRICE_ID_COURSE=price_your_course_one_time_price_id
```

In `src/env.d.ts`, after `readonly STRIPE_PRICE_ID: string;`, add:

```ts
  /** The course's one-time price; see src/lib/server/course/offer.ts. */
  readonly STRIPE_PRICE_ID_COURSE?: string;
```

- [ ] **Step 6: Run the tests and the gates**

Run: `npm test` (expect 57 passing: the 55 from 1a plus these 2), `npm run check` (0 errors), `npm run build` (green, hidden mode).

- [ ] **Step 7: Commit**

```bash
unix2dos -q src/lib/server/course/offer.ts src/lib/server/course/__tests__/offer.test.ts
git add src/lib/server/auth.ts src/lib/server/course/offer.ts src/lib/server/course/__tests__/offer.test.ts .env.example src/env.d.ts
git commit -m "Add the course offer resolver and privateJson"
```

---

### Task 2: Enrollment rules, `getCourseEntitlement`, `requireEnrolled`, `GET /api/course/entitlement`

**Files:**
- Create: `src/lib/server/course/enrollmentRules.ts`
- Create: `src/lib/server/course/enrollment.ts`
- Modify: `src/lib/server/adminAuth.ts`
- Create: `src/pages/api/course/entitlement.ts`
- Test: `src/lib/server/course/__tests__/enrollmentRules.test.ts`

**Interfaces:**
- Consumes: `privateJson` (Task 1), `supabaseAdmin`, `getUserFromRequest`, `COURSE` from `src/data/course.ts`, `COURSE_STATUS`.
- Produces (rules): `EnrollmentRow`, `EnrollmentSummary`, `CourseEntitlement`, `PaidSession`, `PaidOutcome`, `EnrollmentStore`, `NewEvent`, `entitlementFromRow(row, now)`, `canPurchase(entitlement, opts)`, `classifyPaidSession(existing, sessionId)`, `paidSessionFacts(sessionLike, now)`, `enrollFromSession(store, session, eventId)`, `recordPaymentSignal(store, session, eventId, kind)`.
- Produces (bound): `findEnrollment(userId, courseId?)`, `getCourseEntitlement(user, now?)`, `requireEnrolled(request)`, `enrollmentStore`, `recordCheckoutCreated(userId, sessionId, enrollmentId)`; `isAdminUser(user)` in adminAuth.
- The API: `GET /api/course/entitlement` returns the entitlement object spread with `sale: { status, can_purchase }`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/server/course/__tests__/enrollmentRules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  canPurchase,
  classifyPaidSession,
  enrollFromSession,
  entitlementFromRow,
  paidSessionFacts,
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
    expect(classifyPaidSession(null, 'cs_new')).toBe('enrolled');
    expect(classifyPaidSession(row(), 'cs_first')).toBe('already_processed');
    expect(classifyPaidSession(row(), 'cs_new')).toBe('duplicate_payment');
    expect(classifyPaidSession(row({ status: 'refunded' }), 'cs_new')).toBe('reinstated');
    expect(classifyPaidSession(row({ status: 'revoked' }), 'cs_new')).toBe('paid_while_revoked');
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
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/server/course/__tests__/enrollmentRules.test.ts`
Expected: FAIL, cannot resolve `../enrollmentRules`.

- [ ] **Step 3: Create `src/lib/server/course/enrollmentRules.ts`**

```ts
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

export type PaidOutcome =
  | 'enrolled'
  | 'reinstated'
  | 'already_processed'
  | 'duplicate_payment'
  | 'paid_while_revoked';

/** What a PAID session should do to the learner's existing enrollment, if any. */
export function classifyPaidSession(existing: EnrollmentRow | null, sessionId: string): PaidOutcome {
  if (!existing) return 'enrolled';
  if (existing.stripe_checkout_session_id === sessionId) return 'already_processed';
  if (existing.status === 'enrolled') return 'duplicate_payment';
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
  stripe_checkout_session_id: string | null;
  stripe_event_id: string | null;
  note: string | null;
}

/** The writes enrollFromSession needs. enrollment.ts implements it on Supabase; tests fake it. */
export interface EnrollmentStore {
  findByUser(userId: string, courseId: string): Promise<EnrollmentRow | null>;
  /** True when a ledger row already carries this Stripe event id. */
  hasEvent(stripeEventId: string): Promise<boolean>;
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
 *    enrollment and one duplicate_payment record for a human to refund.
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

  let existing = await store.findByUser(session.userId, session.courseId);
  let outcome = classifyPaidSession(existing, session.sessionId);
  let enrollment = existing;

  if (outcome === 'enrolled') {
    const inserted = await store.insert(session);
    if (inserted === 'conflict') {
      // A parallel delivery (a second tab, or a retry) won the insert race.
      existing = await store.findByUser(session.userId, session.courseId);
      if (!existing) throw new Error(`course enrollment insert conflicted but no row exists for ${session.userId}`);
      outcome = classifyPaidSession(existing, session.sessionId);
      enrollment = existing;
    } else {
      enrollment = inserted;
    }
  }
  if (outcome === 'reinstated' && existing) {
    enrollment = await store.reinstate(existing.id, session);
  }
  if (outcome === 'already_processed') return { outcome, enrollment };

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
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/server/course/__tests__/enrollmentRules.test.ts`
Expected: PASS (18 tests).

- [ ] **Step 5: Extract `isAdminUser` in `src/lib/server/adminAuth.ts`**

Replace the `requireAdmin` function with:

```ts
/**
 * Whether an already-verified user is on the allowlist. Same rules as
 * requireAdmin, for callers that hold the user and must not verify the token
 * a second time (the course entitlement endpoint).
 */
export function isAdminUser(user: User): boolean {
  // An anonymous trial user has a real auth.users row and no email at all.
  if (user.is_anonymous === true) return false;
  if (!user.email || !user.email_confirmed_at) return false;

  const allow = adminEmails();
  if (allow.length === 0) {
    console.error('ADMIN_EMAILS is not set: refusing all admin access.');
    return false;
  }

  return allow.includes(user.email.toLowerCase());
}

/**
 * The caller if they are an admin, otherwise null. Callers 403 on null.
 *
 * `email_confirmed_at` is not paranoia. If email confirmation is ever switched
 * off on the Supabase project, then without this check anyone could sign up as
 * the admin's address, never confirm it, and own the panel. The allowlist is
 * only as trustworthy as the proof that the caller owns the address.
 */
export async function requireAdmin(request: Request): Promise<User | null> {
  const user = await getUserFromRequest(request);
  if (!user) return null;
  return isAdminUser(user) ? user : null;
}
```

(The old body of `requireAdmin` moves into `isAdminUser` unchanged; `adminJson` stays.)

- [ ] **Step 6: Create `src/lib/server/course/enrollment.ts`**

```ts
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
  'id, user_id, course_id, status, source, stripe_checkout_session_id, stripe_payment_intent_id, ' +
  'stripe_customer_id, amount_total, currency, purchased_at, access_starts_at, access_ends_at';

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
 * checkout into a 502.
 */
export async function recordCheckoutCreated(
  userId: string,
  sessionId: string,
  enrollmentId: string | null
): Promise<void> {
  try {
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
```

- [ ] **Step 7: Create `src/pages/api/course/entitlement.ts`**

```ts
import type { APIRoute } from 'astro';
import { getUserFromRequest, privateJson } from '../../../lib/server/auth';
import { isAdminUser } from '../../../lib/server/adminAuth';
import { getCourseEntitlement } from '../../../lib/server/course/enrollment';
import { canPurchase } from '../../../lib/server/course/enrollmentRules';
import { COURSE_STATUS } from '../../../data/course';

export const prerender = false;

/**
 * Whether this user has the course, according to the server, plus whether
 * checkout would sell it to them right now. The browser never reads the
 * course tables (they have no client grants), so this is the only way an
 * island learns either fact. Never cached.
 */
export const GET: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return privateJson({ error: 'unauthorized' }, 401);

  const entitlement = await getCourseEntitlement(user);
  // Admins may buy before launch (that is how the pilot tests checkout), so the
  // answer depends on who is asking. Only consulted while the course is not open.
  const isAdmin = COURSE_STATUS !== 'open' && isAdminUser(user);

  return privateJson({
    ...entitlement,
    sale: {
      status: COURSE_STATUS,
      can_purchase: canPurchase(entitlement, {
        status: COURSE_STATUS,
        isAdmin,
        isAnonymous: user.is_anonymous === true,
      }),
    },
  });
};
```

- [ ] **Step 8: Gates**

Run: `npm test` (75 passing), `npm run check`, `npm run build`.

- [ ] **Step 9: Verify with curl**

Set up the local test environment (see "Local test environment": Supabase running, `.env.local` with `ADMIN_EMAILS=course-admin@example.com`, the two accounts, `TOKEN`, `TOKEN2`, the dev server in the background). Then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/api/course/entitlement
# 401
curl -s -D - http://localhost:4321/api/course/entitlement -H "Authorization: Bearer $TOKEN2"
# 200, header Cache-Control: no-store, body {"kind":"none","sale":{"status":"hidden","can_purchase":false}}
curl -s http://localhost:4321/api/course/entitlement -H "Authorization: Bearer $TOKEN"
# {"kind":"none","sale":{"status":"hidden","can_purchase":true}}   (the admin)
```

Grant the admin an enrollment by hand to see the other shapes, then remove it:

```bash
curl -s -X POST http://127.0.0.1:55321/rest/v1/course_enrollments \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"user_id\":\"$USER_ID\",\"course_id\":\"sss-course-v1\",\"source\":\"admin\"}"
curl -s http://localhost:4321/api/course/entitlement -H "Authorization: Bearer $TOKEN"
# kind enrolled, enrollment {id, source admin, ...}, can_purchase false, and NO stripe_ keys in the body
curl -s -X PATCH "http://127.0.0.1:55321/rest/v1/course_enrollments?user_id=eq.$USER_ID" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" -d '{"status":"revoked"}'
curl -s http://localhost:4321/api/course/entitlement -H "Authorization: Bearer $TOKEN"
# kind inactive, reason revoked, can_purchase false
curl -s -X DELETE "http://127.0.0.1:55321/rest/v1/course_enrollments?user_id=eq.$USER_ID" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY"
```

Record the exact responses in the report. Stop the dev server (by PID) when done.

- [ ] **Step 10: Commit**

```bash
unix2dos -q src/lib/server/course/enrollmentRules.ts src/lib/server/course/enrollment.ts src/pages/api/course/entitlement.ts src/lib/server/course/__tests__/enrollmentRules.test.ts
git add src/lib/server/course/enrollmentRules.ts src/lib/server/course/enrollment.ts src/lib/server/adminAuth.ts src/pages/api/course/entitlement.ts src/lib/server/course/__tests__/enrollmentRules.test.ts
git commit -m "Add the course enrollment authority and entitlement endpoint"
```

---

### Task 3: `POST /api/course/checkout`

**Files:**
- Create: `src/pages/api/course/checkout.ts`

**Interfaces:**
- Consumes: `privateJson`, `isAdminUser`, `getCourseEntitlement`, `recordCheckoutCreated`, `resolveCourseOffer`, `getStripe`, `clientIp`/`isRateLimited`, `supabaseAdmin`, `COURSE`, `COURSE_STATUS`, `FirstTouch`.
- Produces: the endpoint contract. Body `{ request_key: uuid, ga?, attribution?, returnPath? }`. Responses: 401 `unauthorized`; 403 `account_required`; 403 `course_not_on_sale`; 400 `bad_request` (`field: 'request_key'`); 429 `rate_limited`; 409 `already_enrolled`; 403 `enrollment_revoked`; 503 `course_not_configured`; 502 `checkout_failed`; 200 `{ url }`.

- [ ] **Step 1: Create `src/pages/api/course/checkout.ts`**

```ts
import type { APIRoute } from 'astro';
import { getUserFromRequest, privateJson } from '../../../lib/server/auth';
import { isAdminUser } from '../../../lib/server/adminAuth';
import { supabaseAdmin } from '../../../lib/server/supabaseAdmin';
import { getStripe } from '../../../lib/server/stripe';
import { clientIp, isRateLimited } from '../../../lib/server/rateLimit';
import { resolveCourseOffer } from '../../../lib/server/course/offer';
import { getCourseEntitlement, recordCheckoutCreated } from '../../../lib/server/course/enrollment';
import { COURSE, COURSE_STATUS } from '../../../data/course';
import type { FirstTouch } from '../../../lib/attribution';

export const prerender = false;

interface CourseCheckoutBody {
  /** Client-generated uuid. The same key replays the same Stripe session instead of minting a second one. */
  request_key?: string;
  /** GA4 ids, so the server-side conversion can be attributed to this session. */
  ga?: { client_id?: string; session_id?: string };
  /** First-touch ad attribution (src/lib/attribution.ts). */
  attribution?: FirstTouch;
  /** Path to return to if the user abandons checkout. */
  returnPath?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Same open-redirect rule as /api/checkout: same-origin paths only. */
function safePath(path: unknown, fallback: string): string {
  if (typeof path !== 'string') return fallback;
  if (!path.startsWith('/') || path.startsWith('//')) return fallback;
  return path;
}

/** Same trimming rules as /api/checkout: 120 default, click ids get the full 500. */
const trimmed = (value: unknown, max = 120): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.slice(0, max) : undefined;

const CLICK_ID_MAX = 500;

/**
 * Create a one-time Checkout Session for the course.
 *
 * Separate from /api/checkout on purpose: that endpoint sells subscriptions
 * through resolvePlan(), which must keep rejecting everything that is not a
 * self-serve plan. The webhook tells the two apart by metadata.purchase_intent
 * and enrolls AFTER payment, so an abandoned checkout leaves only a ledger row.
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const user = await getUserFromRequest(request);
  if (!user) return privateJson({ error: 'unauthorized' }, 401);

  // An anonymous trial user has no email: Stripe would take the money and
  // attach the course to an account nobody can sign back into.
  if (user.is_anonymous) return privateJson({ error: 'account_required' }, 403);

  // Before launch only admins can buy; that is how checkout is tested against
  // production without a page that sells it.
  if (COURSE_STATUS !== 'open' && !isAdminUser(user)) {
    return privateJson({ error: 'course_not_on_sale' }, 403);
  }

  const body = ((await request.json().catch(() => null)) ?? {}) as CourseCheckoutBody;
  if (typeof body.request_key !== 'string' || !UUID_RE.test(body.request_key)) {
    return privateJson({ error: 'bad_request', field: 'request_key' }, 400);
  }

  const ip = clientIp(request, clientAddress);
  if (await isRateLimited('course_checkout', ip, 10, 60 * 60)) {
    return privateJson({ error: 'rate_limited' }, 429);
  }

  const entitlement = await getCourseEntitlement(user);
  if (entitlement.kind === 'enrolled') return privateJson({ error: 'already_enrolled' }, 409);
  if (entitlement.kind === 'inactive' && entitlement.reason === 'revoked') {
    return privateJson({ error: 'enrollment_revoked' }, 403);
  }

  const offer = resolveCourseOffer();
  if (!offer) return privateJson({ error: 'course_not_configured' }, 503);

  // A subscriber already has a Stripe customer; reuse it so one person is one
  // customer in Stripe. Otherwise Checkout creates one, so the receipt and a
  // refund have a customer to hang off.
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const origin = new URL(request.url).origin;
  const returnPath = safePath(body.returnPath, '/course');

  const gaMetadata = {
    ...(trimmed(body.ga?.client_id) ? { ga_client_id: trimmed(body.ga?.client_id)! } : {}),
    ...(trimmed(body.ga?.session_id) ? { ga_session_id: trimmed(body.ga?.session_id)! } : {}),
  };

  const a = body.attribution;
  const attributionMetadata = a
    ? {
        ...(trimmed(a.click_id, CLICK_ID_MAX) ? { click_id: trimmed(a.click_id, CLICK_ID_MAX)! } : {}),
        ...(trimmed(a.click_source) ? { click_source: trimmed(a.click_source)! } : {}),
        ...(trimmed(a.utm_source) ? { utm_source: trimmed(a.utm_source)! } : {}),
        ...(trimmed(a.utm_medium) ? { utm_medium: trimmed(a.utm_medium)! } : {}),
        ...(trimmed(a.utm_campaign) ? { utm_campaign: trimmed(a.utm_campaign)! } : {}),
        ...(trimmed(a.utm_term) ? { utm_term: trimmed(a.utm_term)! } : {}),
        ...(trimmed(a.utm_content) ? { utm_content: trimmed(a.utm_content)! } : {}),
        ...(trimmed(a.landing_path) ? { landing_path: trimmed(a.landing_path)! } : {}),
        ...(typeof a.at === 'number' ? { first_touch_at: String(a.at) } : {}),
      }
    : {};

  // purchase_intent is the discriminator the webhook branches on, BEFORE the
  // org and personal paths. 16 keys at most; Stripe's ceiling is 50.
  const metadata = {
    purchase_intent: 'course',
    course_id: COURSE.id,
    user_id: user.id,
    request_key: body.request_key,
    plan: 'course',
    ...gaMetadata,
    ...attributionMetadata,
  };

  try {
    const session = await getStripe().checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [{ price: offer.priceId, quantity: 1 }],
        ...(sub?.stripe_customer_id
          ? { customer: sub.stripe_customer_id }
          : { customer_email: user.email, customer_creation: 'always' as const }),
        client_reference_id: user.id,
        metadata,
        // Copied onto the PaymentIntent so a refund event can name the learner.
        payment_intent_data: { metadata },
        success_url: `${origin}/course/learn/?checkout=success`,
        cancel_url: `${origin}${returnPath}${returnPath.includes('?') ? '&' : '?'}checkout=cancelled`,
      },
      // A retry with the same key gets the same session back from Stripe.
      { idempotencyKey: `course:${user.id}:${body.request_key}` }
    );
    await recordCheckoutCreated(
      user.id,
      session.id,
      entitlement.kind === 'none' ? null : entitlement.enrollment.id
    );
    return privateJson({ url: session.url });
  } catch (err) {
    console.error('course checkout session failed', err);
    return privateJson({ error: 'checkout_failed' }, 502);
  }
};
```

- [ ] **Step 2: Gates**

Run: `npm run check`, `npm test`, `npm run build`.

- [ ] **Step 3: Create the test-mode price (once) and verify with curl**

Confirm the key mode first: `grep -o "^STRIPE_SECRET_KEY=.\{7\}" .env` must print `rk_test` or `sk_test`. If it does not, stop and report BLOCKED.

The Stripe CLI is installed (`stripe --version`) and logged in to the team's account; it works in test mode by default. Create the test product and a one-time price (the amount is a throwaway test value, not a launch decision):

```bash
PRICE=$(stripe prices create --currency usd --unit-amount 19900 -d "product_data[name]=Solution Seeking Course (test)" 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).id))")
printf 'STRIPE_PRICE_ID_COURSE=%s\n' "$PRICE" >> .env.local
```

(If `stripe prices create` refuses `-d`, use `--product-data.name` per `stripe prices create --help`, or create the price in the Stripe dashboard's test mode and paste the id.)

Restart the dev server so it reads `.env.local`, then:

```bash
KEY=$(node -e "console.log(require('crypto').randomUUID())")
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4321/api/course/checkout -H "Content-Type: application/json" -d '{}'
# 401
curl -s -X POST http://localhost:4321/api/course/checkout -H "Authorization: Bearer $TOKEN2" -H "Content-Type: application/json" -d "{\"request_key\":\"$KEY\"}"
# {"error":"course_not_on_sale"} 403   (non-admin, hidden)
curl -s -X POST http://localhost:4321/api/course/checkout -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"request_key":"nope"}'
# {"error":"bad_request","field":"request_key"} 400
curl -s -X POST http://localhost:4321/api/course/checkout -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"request_key\":\"$KEY\",\"returnPath\":\"/course/learn\"}"
# {"url":"https://checkout.stripe.com/c/pay/cs_test_..."}
```

Repeat the last call with the same `KEY`: the `url` must be identical (Stripe's idempotency). Then check the ledger:

```bash
curl -s "http://127.0.0.1:55321/rest/v1/course_enrollment_events?select=kind,actor,stripe_checkout_session_id&user_id=eq.$USER_ID" -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY"
# exactly one checkout_created row (one session), actor system
```

The 409 and revoked paths, using a hand-made enrollment as in Task 2 (insert with `source: admin`; PATCH to `revoked`; PATCH to `refunded`):

```
enrolled  -> {"error":"already_enrolled"} 409
revoked   -> {"error":"enrollment_revoked"} 403
refunded  -> 200 with a url (a refunded learner may buy again)
```

Delete the hand-made row afterwards (`DELETE ...course_enrollments?user_id=eq.$USER_ID`) and the ledger rows for the test user (`DELETE ...course_enrollment_events?user_id=eq.$USER_ID`) so Task 4 starts clean. Record every response in the report. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
unix2dos -q src/pages/api/course/checkout.ts
git add src/pages/api/course/checkout.ts
git commit -m "Add the one-time course checkout endpoint"
```

---

### Task 4: The webhook's course branch, GA4 `course_enrolled`, purchase and alert emails

**Files:**
- Modify: `src/lib/server/email.ts` (export the helpers)
- Create: `src/lib/server/courseEmail.ts`
- Modify: `src/lib/server/ga4.ts`
- Modify: `src/lib/server/course/enrollment.ts` (add `handleCourseCheckoutEvent`)
- Modify: `src/pages/api/stripe-webhook.ts`

**Interfaces:**
- Consumes: `enrollmentStore`, `enrollFromSession`, `recordPaymentSignal`, `paidSessionFacts` (Task 2), `sendEmail`, `internalAlertTo`.
- Produces: `trackCourseEnrolled(e)`, `coursePurchaseEmail(opts)`, `courseDuplicatePaymentAlertEmail(opts)`, `handleCourseCheckoutEvent(session, event, origin)`.

- [ ] **Step 1: Export the email helpers**

In `src/lib/server/email.ts` change the four declarations to exports, bodies unchanged:

```ts
export const BRAND = '#5271FF';
export const INK = '#16276B';
...
export const esc = (value: string) => ...
...
export const layout = (bodyHtml: string, footerHtml: string) => ...
...
export const button = (href: string, label: string) => ...
```

- [ ] **Step 2: Create `src/lib/server/courseEmail.ts`**

```ts
import { BRAND, INK, button, esc, layout } from './email';

/**
 * Course emails. Subjects are plain; bodies carry no prices, no answers and
 * no scores; every link lands on a page that asks for sign-in.
 */

/** "Your course is ready", sent once per enrollment (idempotency key course-purchase/<enrollment_id>). */
export function coursePurchaseEmail(opts: { courseTitle: string; courseUrl: string; supportEmail: string }) {
  const html = layout(
    `
    <h1 style="margin:0 0 12px;font-size:22px;color:${INK};">Your course is ready</h1>
    <p style="margin:0 0 20px;">Thank you for buying the ${esc(opts.courseTitle)}. Your lessons are waiting in your account.</p>
    <p style="margin:0 0 24px;">${button(opts.courseUrl, 'Open your course')}</p>
    <p style="margin:0 0 12px;">Sign in with the same email address you used at checkout. Stripe sends your receipt separately.</p>
    <p style="margin:0;">Questions about access? Write to <a href="mailto:${esc(opts.supportEmail)}" style="color:${BRAND};font-weight:600;">${esc(opts.supportEmail)}</a>.</p>`,
    'Sent because this address bought the course on solutionseeking.com.'
  );

  const text = [
    'Your course is ready',
    '',
    `Thank you for buying the ${opts.courseTitle}. Your lessons are waiting in your account.`,
    '',
    `Open your course: ${opts.courseUrl}`,
    '',
    'Sign in with the same email address you used at checkout. Stripe sends your receipt separately.',
    `Questions about access? Write to ${opts.supportEmail}.`,
    '',
    'Beanchain Coffee LLC',
  ].join('\n');

  return { subject: 'Your course is ready', html, text };
}

/** Internal alert: somebody paid for a course they already have, or paid while revoked. Money needs a human. */
export function courseDuplicatePaymentAlertEmail(opts: {
  userId: string;
  sessionId: string;
  amountLabel: string;
  note: string;
  adminUrl: string;
}) {
  const row = (label: string, value: string) =>
    `<p style="margin:0 0 6px;"><strong style="color:${INK};">${label}:</strong> ${value}</p>`;

  const html = layout(
    `
    <h1 style="margin:0 0 16px;font-size:20px;color:${INK};">A course payment needs a refund</h1>
    ${row('Learner', esc(opts.userId))}
    ${row('Checkout session', esc(opts.sessionId))}
    ${row('Amount', esc(opts.amountLabel))}
    <p style="margin:16px 0 0;padding:12px 14px;background:#f8fafc;border-radius:10px;">${esc(opts.note)}</p>
    <p style="margin:16px 0 0;">Their access did not change. Refund the newer payment from the Stripe dashboard, then record it in the admin area.</p>
    <p style="margin:20px 0 0;font-size:13px;color:#64748b;">${esc(opts.adminUrl)}</p>`,
    'Sent because the Stripe webhook saw a course payment it could not apply.'
  );

  const text = [
    'A course payment needs a refund',
    '',
    `Learner: ${opts.userId}`,
    `Checkout session: ${opts.sessionId}`,
    `Amount: ${opts.amountLabel}`,
    '',
    opts.note,
    '',
    'Their access did not change. Refund the newer payment from the Stripe dashboard, then record it in the admin area.',
    opts.adminUrl,
  ].join('\n');

  return { subject: 'A course payment needs a refund', html, text };
}
```

- [ ] **Step 3: Share the GA4 sender and add `trackCourseEnrolled`**

Rewrite `src/lib/server/ga4.ts` below the `MP_ENDPOINT` constant so both events use one sender. Keep the file's opening comment.

```ts
const MP_ENDPOINT = 'https://www.google-analytics.com/mp/collect';

interface SubscriptionEvent {
  /** GA client id stitched through Stripe metadata; falls back to the user id. */
  clientId: string;
  sessionId?: string;
  plan: string;
  /** Amount in dollars (Stripe reports cents). */
  value: number;
  currency: string;
  /** Stripe Checkout Session id. GA4 dedupes retries on this. */
  transactionId: string;
}

interface CourseEnrolledEvent {
  clientId: string;
  sessionId?: string;
  courseId: string;
  value: number;
  currency: string;
  transactionId: string;
}

/**
 * Send one Measurement Protocol event. Best-effort: a failure here must never
 * fail the webhook, or Stripe will retry a delivery we already processed.
 */
async function sendEvent(name: string, clientId: string, params: Record<string, unknown>): Promise<void> {
  const measurementId = serverEnv('PUBLIC_GA4_MEASUREMENT_ID');
  const apiSecret = serverEnv('GA4_API_SECRET');
  if (!measurementId || !apiSecret) {
    console.warn(`GA4 not configured; skipping ${name}`);
    return;
  }

  const url = `${MP_ENDPOINT}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  const body = {
    client_id: clientId,
    events: [
      {
        name,
        // engagement_time_msec is required, or GA4 attributes the event to no session at all.
        params: { ...params, engagement_time_msec: 1 },
      },
    ],
  };

  try {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) {
      console.error('GA4 measurement protocol rejected the event', res.status, await res.text());
    }
  } catch (err) {
    console.error('GA4 measurement protocol request failed', err);
  }
}

/** Fire `subscription_completed`. */
export async function trackSubscriptionCompleted(e: SubscriptionEvent): Promise<void> {
  await sendEvent('subscription_completed', e.clientId, {
    plan: e.plan,
    value: e.value,
    currency: e.currency,
    transaction_id: e.transactionId,
    ...(e.sessionId ? { session_id: e.sessionId } : {}),
  });
}

/** Fire `course_enrolled`, the course's conversion of record. Only on enrolled and reinstated. */
export async function trackCourseEnrolled(e: CourseEnrolledEvent): Promise<void> {
  await sendEvent('course_enrolled', e.clientId, {
    course_id: e.courseId,
    plan: 'course',
    value: e.value,
    currency: e.currency,
    transaction_id: e.transactionId,
    ...(e.sessionId ? { session_id: e.sessionId } : {}),
  });
}
```

- [ ] **Step 4: Add `handleCourseCheckoutEvent` to `src/lib/server/course/enrollment.ts`**

Add these imports at the top:

```ts
import type Stripe from 'stripe';
import { trackCourseEnrolled } from '../ga4';
import { internalAlertTo, sendEmail } from '../email';
import { coursePurchaseEmail, courseDuplicatePaymentAlertEmail } from '../courseEmail';
import { COURSE_TOKENS } from '../../../data/course';
import { enrollFromSession, paidSessionFacts, recordPaymentSignal } from './enrollmentRules';
```

(merge with the existing `./enrollmentRules` import) and append:

```ts
/**
 * The webhook's course branch. Called for checkout.session.completed and the
 * two async payment events whenever metadata.purchase_intent is 'course'.
 * Throws on a database failure so the route 500s and Stripe retries into the
 * idempotency above; email and analytics failures are logged, never thrown.
 */
export async function handleCourseCheckoutEvent(
  session: Stripe.Checkout.Session,
  event: { id: string; type: string },
  origin: string
): Promise<void> {
  const facts = paidSessionFacts(session, new Date());
  if (!facts) {
    console.warn('course checkout session missing user_id or course_id', session.id);
    return;
  }

  if (session.payment_status !== 'paid') {
    const kind = event.type === 'checkout.session.async_payment_failed' ? 'payment_failed' : 'payment_pending';
    await recordPaymentSignal(enrollmentStore, facts, event.id, kind);
    console.log(`course checkout ${session.id}: ${kind}`);
    return;
  }

  const { outcome, enrollment } = await enrollFromSession(enrollmentStore, facts, event.id);
  console.log(`course checkout ${session.id}: ${outcome}`);

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
    await sendPurchaseEmail(facts.userId, enrollment?.id ?? session.id, session, origin);
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
      adminUrl: `${origin}/admin`,
    });
    await sendEmail({ to: internalAlertTo(), ...mail, idempotencyKey: `course-duplicate/${session.id}` });
  }
}

async function sendPurchaseEmail(
  userId: string,
  enrollmentId: string,
  session: Stripe.Checkout.Session,
  origin: string
): Promise<void> {
  // The account's address, not what they typed at Stripe: the link needs a sign-in.
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  const to = data?.user?.email || session.customer_details?.email || null;
  if (error || !to) {
    console.error('course purchase email: no address for', userId, error?.message);
    return;
  }
  const mail = coursePurchaseEmail({
    courseTitle: COURSE.title,
    courseUrl: `${origin}/course/learn/`,
    supportEmail: COURSE_TOKENS.support_contact ?? 'hello@solutionseeking.com',
  });
  await sendEmail({ to, ...mail, idempotencyKey: `course-purchase/${enrollmentId}` });
}
```

- [ ] **Step 5: Wire the webhook**

In `src/pages/api/stripe-webhook.ts`:

1. Add the import `import { handleCourseCheckoutEvent } from '../../lib/server/course/enrollment';`.
2. Update the registration comment at the top of the route to list the two async events: `Register in the Stripe dashboard for: checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, customer.subscription.created / .updated / .deleted.`
3. In `case 'checkout.session.completed'`, before the org branch, insert:

```ts
        // A course purchase. Runs FIRST: a course session carries user_id in
        // its metadata just like a personal subscription does, so without this
        // branch it would fall into the personal path below, which expects a
        // subscription and would only log a warning.
        if (session.metadata?.purchase_intent === 'course') {
          await handleCourseCheckoutEvent(session, event, new URL(request.url).origin);
          break;
        }
```

4. Add a new case block after the `checkout.session.completed` case:

```ts
      case 'checkout.session.async_payment_succeeded':
      case 'checkout.session.async_payment_failed': {
        // Delayed payment methods (bank debits) complete the session first and
        // settle later. Only the course sells with them today; the subscription
        // flows are card-only and never see these events.
        const session = event.data.object;
        if (session.metadata?.purchase_intent === 'course') {
          await handleCourseCheckoutEvent(session, event, new URL(request.url).origin);
        }
        break;
      }
```

- [ ] **Step 6: Gates**

Run: `npm run check`, `npm test`, `npm run build`.

- [ ] **Step 7: Verify against real Stripe test events**

Prerequisites: the local Supabase stack, `.env.local` from Task 3, the test accounts, and the ledger and enrollment tables empty for `$USER_ID`.

The dev server verifies webhook signatures with `STRIPE_WEBHOOK_SECRET`. Compare `.env`'s value with the CLI's listen secret without printing either:

```bash
[ "$(stripe listen --print-secret)" = "$(grep '^STRIPE_WEBHOOK_SECRET=' .env | cut -d= -f2-)" ] && echo same || echo differs
```

If `differs`, append `STRIPE_WEBHOOK_SECRET=$(stripe listen --print-secret)` to `.env.local` (`printf 'STRIPE_WEBHOOK_SECRET=%s\n' "$(stripe listen --print-secret)" >> .env.local`). Start the dev server in the background, then the forwarder in the background with its output in a log file:

```bash
stripe listen --forward-to localhost:4321/api/stripe-webhook \
  --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted \
  > /tmp/stripe-listen.log 2>&1
```

The Stripe CLI can complete a real test-mode Checkout Session and add our metadata to it (`--add resource:path=value` on the `checkout_session` fixture step), so no browser is needed here:

```bash
stripe trigger checkout.session.completed \
  --add checkout_session:metadata.purchase_intent=course \
  --add checkout_session:metadata.course_id=sss-course-v1 \
  --add "checkout_session:metadata.user_id=$USER_ID" \
  --add checkout_session:metadata.plan=course \
  --add "checkout_session:client_reference_id=$USER_ID"
```

Then check, in order:

1. `/tmp/stripe-listen.log` shows `checkout.session.completed` forwarded with a `200`; the dev server log shows `course checkout cs_test_...: enrolled`. (Resend is not configured locally, so the purchase email logs "not configured"; that is expected.)
2. One enrollment: `curl -s "http://127.0.0.1:55321/rest/v1/course_enrollments?user_id=eq.$USER_ID&select=status,source,stripe_checkout_session_id,stripe_payment_intent_id,amount_total" -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY"` prints one row, `status enrolled`, `source stripe`, a `cs_test_` id, a `pi_` id and `amount_total 3000` (the fixture's own price).
3. One ledger row: the events table for the user has exactly one `enrolled` row whose `stripe_event_id` starts with `evt_`.
4. Re-delivery: copy the `evt_...` id of the `checkout.session.completed` line from the listen log and run `stripe events resend <evt_id>`. Dev server log: `already_processed`; still one enrollment and one ledger row.
5. Duplicate payment: run the same `stripe trigger` again (a new session). Log: `duplicate_payment`; the enrollment still carries the FIRST session id; a second ledger row of kind `duplicate_payment` with a note; the alert email attempt is logged.
6. Reinstate: `PATCH ...course_enrollments?user_id=eq.$USER_ID` with `{"status":"refunded"}`, trigger again. Log: `reinstated`; the row is `enrolled` with the NEW session id; a `reinstated` ledger row.
7. A subscription session without the discriminator still takes the personal path: `stripe trigger checkout.session.completed` with no `--add` flags. Log: `checkout.session.completed missing user_id or subscription` (the existing warning); no new enrollment row.
8. Optional, if it completes within a minute: `stripe trigger checkout.session.async_payment_succeeded` with the same five `--add` flags after PATCHing the row to `refunded`. Expect a `payment_pending` ledger row from the unpaid `completed` event followed by `reinstated` from the succeeded event.

Record the log lines and the REST responses in the report. Finish by deleting the test rows for `$USER_ID` (events first, then the enrollment), stopping `stripe listen` (`taskkill //F //IM stripe.exe`) and the dev server (by PID).

- [ ] **Step 8: Commit**

```bash
unix2dos -q src/lib/server/courseEmail.ts
git add src/lib/server/email.ts src/lib/server/courseEmail.ts src/lib/server/ga4.ts src/lib/server/course/enrollment.ts src/pages/api/stripe-webhook.ts
git commit -m "Enroll course buyers from the Stripe webhook"
```

---

### Task 5: Client plumbing and the analytics union

**Files:**
- Create: `src/lib/courseClient.ts`
- Create: `src/lib/useCourseEntitlement.ts`
- Modify: `src/lib/analytics.ts`

**Interfaces:**
- Produces: `CourseEntitlementView`, `fetchCourseEntitlement(accessToken)`, `startCourseCheckout(accessToken, { request_key, returnPath })`, `CourseActionError`, `courseErrorMessage(code)`; `useCourseEntitlement(): { entitlement, loading, failed, refetch }`; analytics: CTA locations `faq`, `home_course`, `pricing_course`, `practice_course`, `course_hero`, `course_close`, `course_preview`, `course_dashboard`; `PlanId` gains `'course'`; events `course_viewed`, `enrollment_ready`.

- [ ] **Step 1: Create `src/lib/courseClient.ts`**

```ts
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
  const res = await fetch('/api/course/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      ...input,
      ga: getGaIds(),
      attribution: getFirstTouch() ?? undefined,
    }),
  });
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
    default:
      return 'Could not start checkout. Please try again.';
  }
}
```

- [ ] **Step 2: Create `src/lib/useCourseEntitlement.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from './useSession';
import { fetchCourseEntitlement, type CourseEntitlementView } from './courseClient';

export interface CourseEntitlementState {
  entitlement: CourseEntitlementView | null;
  loading: boolean;
  /** The lookup failed. Fail OPEN in the UI: the server is still the gate. */
  failed: boolean;
  /** Ask again (the checkout return page polls with this). */
  refetch: () => Promise<CourseEntitlementView | null>;
}

/** Mirrors useEntitlement() for the course. Null means "ask the server", never "deny". */
export function useCourseEntitlement(): CourseEntitlementState {
  const { session, user, loading: sessionLoading } = useSession();
  const [state, setState] = useState<Omit<CourseEntitlementState, 'refetch'>>({
    entitlement: null,
    loading: true,
    failed: false,
  });

  // The latest session, so refetch never closes over a stale token.
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const refetch = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) {
      setState({ entitlement: null, loading: false, failed: false });
      return null;
    }
    const entitlement = await fetchCourseEntitlement(current.access_token);
    setState({ entitlement, loading: false, failed: entitlement === null });
    return entitlement;
  }, []);

  useEffect(() => {
    if (sessionLoading) return;
    let active = true;
    setState((s) => ({ ...s, loading: true }));
    void refetch().then(() => {
      if (!active) return;
    });
    return () => {
      active = false;
    };
    // Keyed on the user, not the session object: a token refresh replaces the
    // session and would otherwise refetch on a timer for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading, user?.id]);

  return { ...state, refetch };
}
```

- [ ] **Step 3: Extend `src/lib/analytics.ts`**

1. In `CTA_LOCATIONS`, after `'design_guide',` add:

```ts
  // faq.astro has carried data-track-cta="faq" since the FAQ shipped; listed now.
  'faq',
  // The video course.
  'home_course',
  'pricing_course',
  'practice_course',
  'course_hero',
  'course_close',
  'course_preview',
  'course_dashboard',
```

2. Change `export type PlanId = 'monthly' | 'annual' | 'team';` to `export type PlanId = 'monthly' | 'annual' | 'team' | 'course';`.

3. In the `AnalyticsEvent` union, after the `checkout_success_viewed` member, add:

```ts
  /** The course sales page rendered (or the dashboard's buy state, when hidden). */
  | { event: 'course_viewed'; course_id: string; sale_status: 'hidden' | 'preview' | 'open' }
  /** Back from Stripe and the enrollment is confirmed by the server. Fired once. */
  | { event: 'enrollment_ready'; course_id: string }
```

- [ ] **Step 4: Gates**

Run: `npm run check` (0 errors; the `faq` location is now typed), `npm test`, `npm run build`.

- [ ] **Step 5: Commit**

```bash
unix2dos -q src/lib/courseClient.ts src/lib/useCourseEntitlement.ts
git add src/lib/courseClient.ts src/lib/useCourseEntitlement.ts src/lib/analytics.ts
git commit -m "Add the course client, entitlement hook and analytics events"
```

---

### Task 6: The sales page, `CourseSalesCta`, OG entry, sitemap gate, cancel copy

**Files:**
- Create: `src/components/react/CourseSalesCta.tsx`
- Create: `src/components/CourseSyllabus.astro`
- Create: `src/pages/course/index.astro`
- Modify: `src/pages/og/[...route].ts`, `astro.config.mjs`, `src/components/react/CheckoutBanner.tsx`
- Modify: `src/lib/course/validate.ts`, `src/lib/course/__tests__/validate.test.ts`, `docs/superpowers/specs/2026-09-09-paid-video-course-design.md` (one sentence)

**Interfaces:**
- Consumes: `useCourseEntitlement`, `startCourseCheckout`, `CourseActionError`, `courseErrorMessage`, `track`, `useDialog`, `accountLink`, `COURSE`, `COURSE_STATUS`, `COURSE_TOKENS`, `courseCopy`, `assertLaunchSettings`, `getCourseCatalog`, `publicCurriculum`.
- Produces: `CourseSalesCta` props `{ location: 'course_hero' | 'course_close' | 'course_dashboard'; saleStatus; courseId; priceLabel: string | null; priceAmount: number; supportContact: string; trackView?: boolean }`; `CourseSyllabus` props `{ curriculum: PublicCurriculum }`.

**Ruling recorded here (spec amendment):** the validator required the preview lesson (V05) to be published whenever the status is not `hidden`. That makes a `preview` build impossible until the free lesson is filmed, which is months away, while the whole point of `preview` is a public "coming soon" page with no purchase. The gate now applies to `open` only. The spec sentence is amended in this task.

- [ ] **Step 1: Relax the preview gate in `src/lib/course/validate.ts`**

Change the block

```ts
    if (l.preview && input.courseStatus !== 'hidden') {
      need(l.status === 'published', 'the preview lesson must be published once the course is public');
      need(
        !l.videoPlaceholder,
        'the preview lesson cannot use a placeholder video once the course is public'
      );
    }
```

to

```ts
    // The free lesson has to exist before anything is sold. A preview build
    // only shows the course as coming soon, so it may run before V05 is filmed.
    if (l.preview && input.courseStatus === 'open') {
      need(l.status === 'published', 'the preview lesson must be published once the course is open');
      need(
        !l.videoPlaceholder,
        'the preview lesson cannot use a placeholder video once the course is open'
      );
    }
```

In `src/lib/course/__tests__/validate.test.ts`:

- Replace the test `requires the preview lesson to be published once the course is public` with:

```ts
  it('requires the preview lesson to be published once the course is open, not for a preview build', () => {
    expect(() => validateCatalog({ ...buildInput(), courseStatus: 'preview' })).not.toThrow();
    expect(() => validateCatalog({ ...buildInput(), courseStatus: 'open' })).toThrow(
      /preview lesson must be published/
    );
  });
```

- In the test `rejects a placeholder video on the preview lesson once the course is public`, change `courseStatus: 'preview'` to `courseStatus: 'open'`, the test name to `... once the course is open`, and the expected message to `/the preview lesson cannot use a placeholder video once the course is open/`.

In the spec, in the "Build-time validation" bullet list, replace `exactly one \`preview: true\` lesson, and it is published whenever the status is not hidden` with `exactly one \`preview: true\` lesson, and it is published (no placeholder video) once the status is \`open\`; a \`preview\` build may run before the free lesson exists (amended 2026-09-10, sub-plan 1b)`.

Run `npm test`: green.

- [ ] **Step 2: Create `src/components/react/CourseSalesCta.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useSession } from '../../lib/useSession';
import { accountLink } from '../../lib/accountLink';
import { useCourseEntitlement } from '../../lib/useCourseEntitlement';
import { CourseActionError, courseErrorMessage, startCourseCheckout } from '../../lib/courseClient';
import { track } from '../../lib/analytics';
import { useDialog } from './Dialog';
import type { CourseStatus } from '../../lib/course/status';

interface Props {
  location: 'course_hero' | 'course_close' | 'course_dashboard';
  saleStatus: CourseStatus;
  courseId: string;
  /** "Get the course for $X" once the course is open; null renders "Get the course". */
  priceLabel: string | null;
  /** Dollar amount for checkout_started; 0 until COURSE_PRICE exists. */
  priceAmount: number;
  supportContact: string;
  /** Only one instance per page fires course_viewed. */
  trackView?: boolean;
}

/**
 * The buy control. An island because checkout needs the session, because the
 * enrolled state must come from the server, and because checkout_started has
 * to fire with the location that was clicked.
 *
 * Entitlement fails OPEN: a failed lookup still shows the button, and the
 * server answers 409 if they already own the course.
 */
export default function CourseSalesCta(props: Props) {
  const { session, user, loading: sessionLoading } = useSession();
  const { entitlement, loading, refetch } = useCourseEntitlement();
  const { confirm, dialog } = useDialog();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justEnrolled, setJustEnrolled] = useState(false);
  // One key per mount: a double click or a retry replays the same Stripe session.
  const [requestKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (props.trackView) {
      track({ event: 'course_viewed', course_id: props.courseId, sale_status: props.saleStatus });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signedIn = Boolean(session) && !user?.is_anonymous;
  const enrolled = justEnrolled || entitlement?.kind === 'enrolled';
  const revoked = entitlement?.kind === 'inactive' && entitlement.reason === 'revoked';
  // Signed out, the server has not been asked: the launch flag decides.
  const purchasable = entitlement ? entitlement.sale.can_purchase : props.saleStatus === 'open';
  const label = props.priceLabel ? `Get the course for ${props.priceLabel}` : 'Get the course';

  const buy = async () => {
    track({
      event: 'checkout_started',
      plan: 'course',
      cta_location: props.location,
      value: props.priceAmount,
      currency: 'USD',
    });

    // No account, or an anonymous trial user with no email: register first,
    // then come straight back here.
    if (!session || !signedIn) {
      window.location.href = accountLink({ mode: 'register', next: window.location.pathname });
      return;
    }

    const ok = await confirm({
      title: 'Continue to checkout?',
      message:
        'Stripe takes the payment on a secure page and sends you straight back here to start the course.',
      confirmLabel: 'Continue to checkout',
      cancelLabel: 'Not now',
    });
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      window.location.href = await startCourseCheckout(session.access_token, {
        request_key: requestKey,
        returnPath: window.location.pathname,
      });
    } catch (err) {
      if (err instanceof CourseActionError && err.code === 'already_enrolled') {
        setJustEnrolled(true);
        void refetch();
      } else {
        setError(err instanceof CourseActionError ? courseErrorMessage(err.code) : 'Could not start checkout. Please try again.');
      }
      setBusy(false);
    }
  };

  if (enrolled) {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
        <p className="font-semibold text-emerald-800">You already have access to the course.</p>
        <a href="/course/learn/" className="btn-primary mt-4" data-track-cta={props.location} data-track-label="Continue your course">
          Continue your course
        </a>
      </div>
    );
  }

  if (revoked) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-slate-700">
        <p className="font-semibold text-ink-800">Access to the course has ended for this account.</p>
        <p className="mt-2 text-sm">
          If that seems wrong, write to{' '}
          <a href={`mailto:${props.supportContact}`} className="font-semibold text-brand-700 underline">
            {props.supportContact}
          </a>
          .
        </p>
      </div>
    );
  }

  if (!purchasable) {
    return (
      <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-5 text-slate-700">
        <p className="font-semibold text-ink-800">The course opens soon.</p>
        <p className="mt-2 text-sm">The lessons are being filmed now. Everything else on the site is free to use today.</p>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={buy}
        disabled={busy || sessionLoading || (Boolean(session) && loading && !entitlement)}
        className="btn-primary disabled:opacity-60"
      >
        {busy ? 'Opening checkout…' : label}
      </button>
      {!sessionLoading && !signedIn && (
        <p className="mt-3 text-sm text-slate-500">Create a free account first. The course is added to it after payment.</p>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {dialog}
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/CourseSyllabus.astro`**

```astro
---
import type { PublicCurriculum } from '../lib/course/curriculum';

interface Props {
  curriculum: PublicCurriculum;
}
const { curriculum } = Astro.props;
---

<ol class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
  {
    curriculum.modules.map((m) => (
      <li class="flex flex-col rounded-2xl border border-slate-100 bg-white p-6 shadow-card">
        <p class="eyebrow">Module {m.order}</p>
        <h3 class="mt-2 font-heading text-lg font-bold text-ink-800">{m.title}</h3>
        <p class="mt-2 text-sm leading-relaxed text-slate-600">{m.summary}</p>
        <p class="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
          {m.lessons.length} {m.lessons.length === 1 ? 'lesson' : 'lessons'}
        </p>
        <ul class="mt-2 space-y-1 text-sm text-slate-700">
          {m.lessons.map((l) => (
            <li class="relative pl-4">
              <span class="absolute left-0 top-[0.6em] h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-brand-400" />
              {l.title}
            </li>
          ))}
        </ul>
      </li>
    ))
  }
</ol>
```

- [ ] **Step 4: Create `src/pages/course/index.astro`**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import PageHero from '../../components/PageHero.astro';
import CourseSyllabus from '../../components/CourseSyllabus.astro';
import CourseSalesCta from '../../components/react/CourseSalesCta.tsx';
import { breadcrumbs } from '../../lib/schema';
import { COURSE, COURSE_STATUS, COURSE_TOKENS, type CourseToken } from '../../data/course';
import { COURSE_PRICE } from '../../data/pricing';
import { assertLaunchSettings, courseCopy } from '../../lib/course/copy';
import { getCourseCatalog } from '../../lib/course/catalog';
import { publicCurriculum } from '../../lib/course/curriculum';

/**
 * The public sales page. Prerendered from the catalog and the offer config.
 * While the course is hidden there is no page at all: the 404 below writes
 * nothing to dist, and the sitemap filter in astro.config.mjs keeps the URL
 * out as well. Lesson prose never appears here; titles are public.
 */
if (COURSE_STATUS === 'hidden') return new Response(null, { status: 404 });

// Throws in an `open` build when a launch token, the price or David's
// confirmation is missing. A no-op in preview.
assertLaunchSettings();

const curriculum = publicCurriculum(await getCourseCatalog());

/** A launch token once it is set, else the honest interim sentence. The price only once the course is open. */
const tokenOr = (key: CourseToken, fallback: string): string => {
  if (key === 'course_price' && COURSE_STATUS !== 'open') return fallback;
  return COURSE_TOKENS[key] ? courseCopy(`{{${key}}}`) : fallback;
};

const priceLabel = COURSE_STATUS === 'open' ? courseCopy('{{course_price}}') : null;
const priceAmount = Number(COURSE_PRICE?.priceAmount ?? 0);
const supportContact = courseCopy('{{support_contact}}');

const facts = [
  `${curriculum.modules.length} modules`,
  `${curriculum.totalLessons} short video lessons`,
  `About ${COURSE.learnerHours} hours including practice`,
  'Self-paced',
  'AI-assessed certification included',
];

const practice = [
  'Separating what you observed from what you concluded, before a conversation starts.',
  'Asking questions that help the other person feel understood, then checking your summary with them.',
  'Turning a shared understanding into actions that are fair, testable and reviewed.',
  'Repairing a tense exchange, and respecting someone who asks for time.',
  'Running one-on-ones, feedback, targeted conversations and solution seeking sessions.',
  'Building review and participant feedback into the routines your team already has.',
];

const included = [
  `${curriculum.totalLessons} short video lessons, each with an exercise and a model response to compare against`,
  'A printable worksheet for every module',
  'Module checks that confirm you can apply each idea before you move on',
  `The final assessment and the Solution Seeking System Certification. ${tokenOr('retakes_summary', 'Retakes are included.')}`,
  'Everything on the site that is already free: the guide, the worksheets and the assistants trial',
];

const site = Astro.site ?? Astro.url;
const schemas = [
  breadcrumbs(site, [
    { name: 'Home', path: '/' },
    { name: 'Video course', path: '/course' },
  ]),
];

const cta = {
  saleStatus: COURSE_STATUS,
  courseId: COURSE.id,
  priceLabel,
  priceAmount,
  supportContact,
};
---

<BaseLayout
  title="Solution Seeking Course"
  description={`Learn the Solution Seeking System with ${COURSE.presenter} through ${curriculum.totalLessons} video lessons, practical exercises, and AI-assessed certification.`}
  schemas={schemas}
>
  <PageHero
    eyebrow="Video course"
    title="Learn to turn difficult conversations into shared understanding and workable solutions"
    intro={`${curriculum.totalLessons} short video lessons with ${COURSE.presenter}, each with an exercise and a model response, a worksheet for every module, and an AI-assessed certification at the end.`}
  >
    <div class="mt-8">
      <CourseSalesCta client:load location="course_hero" trackView {...cta} />
    </div>
    <p class="mt-6 text-sm text-slate-500">{facts.join(' · ')}</p>
  </PageHero>

  <div class="container-page py-16">
    <section class="max-w-2xl">
      <p class="eyebrow mb-3">Who it is for</p>
      <h2 class="text-3xl font-bold text-ink-800">For people who keep having the same hard conversation</h2>
      <p class="mt-4 text-slate-600">
        Managers, parents, teachers, organizers and partners who already know the free material and want
        to practice it properly: one lesson at a time, on a real situation of their own, with a model
        response to check their thinking against.
      </p>
    </section>

    <section class="mt-16">
      <p class="eyebrow mb-3">What you will practice</p>
      <h2 class="text-3xl font-bold text-ink-800">The skills, not just the ideas</h2>
      <ul class="mt-6 grid gap-3 text-slate-700 sm:grid-cols-2">
        {
          practice.map((item) => (
            <li class="relative pl-5">
              <span class="absolute left-0 top-2 h-1.5 w-1.5 rounded-full bg-brand-400" />
              {item}
            </li>
          ))
        }
      </ul>
    </section>

    <section class="mt-16">
      <p class="eyebrow mb-3">How the course works</p>
      <h2 class="text-3xl font-bold text-ink-800">Module by module</h2>
      <p class="mt-4 max-w-2xl text-slate-600">
        Watch a short lesson, work the exercise on a situation of your own, then compare your answer with
        the model response. Each module ends with two quick checks. A pace of {COURSE.suggestedWeeks} weeks
        works well, and the course waits for you if life gets in the way.
      </p>
      <div class="mt-8">
        <CourseSyllabus curriculum={curriculum} />
      </div>
    </section>

    <section class="mt-16">
      <p class="eyebrow mb-3">What is included</p>
      <h2 class="text-3xl font-bold text-ink-800">Everything you need to finish</h2>
      <ul class="mt-6 grid gap-3 text-slate-700 sm:grid-cols-2">
        {
          included.map((item) => (
            <li class="relative pl-5">
              <span class="absolute left-0 top-2 h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {item}
            </li>
          ))
        }
      </ul>
    </section>

    <section class="mt-16 max-w-2xl">
      <p class="eyebrow mb-3">Your presenter</p>
      <h2 class="text-3xl font-bold text-ink-800">{COURSE.presenter}</h2>
      <p class="mt-4 text-slate-600">
        {COURSE.presenter} developed the Solution Seeking System and presents every lesson. The examples
        come from the same places the system came from: workplaces, families and community groups.
        <a href="/about" class="font-medium text-brand-600 underline decoration-brand-200 underline-offset-2">Read the story behind the system</a>.
      </p>
    </section>

    <section class="mt-16 max-w-2xl">
      <p class="eyebrow mb-3">Time and access</p>
      <h2 class="text-3xl font-bold text-ink-800">Self-paced, and yours to keep coming back to</h2>
      <p class="mt-4 text-slate-600">
        Plan on about {COURSE.learnerHours} hours in total, practice included. {tokenOr('access_summary', 'Access details are confirmed when the course opens.')}
      </p>
    </section>

    <section class="mt-16 rounded-3xl border border-brand-100 bg-brand-50/50 p-7 sm:p-10">
      <h2 class="text-3xl font-bold text-ink-800">Start when you are ready</h2>
      <p class="mt-3 max-w-2xl text-slate-600">
        {tokenOr('refund_summary', 'Refund terms are confirmed when the course opens.')} Questions first? Write to
        <a href={`mailto:${supportContact}`} class="font-medium text-brand-600 underline decoration-brand-200 underline-offset-2">{supportContact}</a>.
      </p>
      <div class="mt-6">
        <CourseSalesCta client:load location="course_close" {...cta} />
      </div>
    </section>
  </div>
</BaseLayout>
```

- [ ] **Step 5: Register the OG card and gate the sitemap**

In `src/pages/og/[...route].ts`:

1. Add `import { COURSE, COURSE_STATUS } from '../../data/course';`.
2. Inside the `pages` object, after the `about` entry, add:

```ts
  // The sales page exists only when the course is public; its card follows.
  ...(COURSE_STATUS !== 'hidden'
    ? {
        course: {
          title: COURSE.title,
          description: `Learn the Solution Seeking System with ${COURSE.presenter}: video lessons, practical exercises, and AI-assessed certification.`,
        },
      }
    : {}),
```

In `astro.config.mjs`:

1. Add `import { loadEnv } from 'vite';` after the other imports.
2. Before `export default defineConfig`, add:

```js
// The launch flag, read the way the build reads it (from .env files and the
// process environment) so the sitemap agrees with the pages.
const { PUBLIC_COURSE_STATUS = '' } = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), 'PUBLIC_');
const coursePublic = PUBLIC_COURSE_STATUS === 'preview' || PUBLIC_COURSE_STATUS === 'open';
```

3. In the sitemap `filter`, replace `!page.includes('/course/learn') &&` with:

```js
        !page.includes('/course/learn') &&
        // The sales page 404s while hidden and writes no file; this keeps the
        // URL out of the sitemap even if that ever changes.
        (coursePublic || !page.includes('/course')) &&
```

- [ ] **Step 6: Course-aware cancel copy in `src/components/react/CheckoutBanner.tsx`**

Add `const [onCourse, setOnCourse] = useState(false);` beside `show`, set it in the effect (`setOnCourse(window.location.pathname.startsWith('/course'));` before `setShow(true)`), and render the sentence conditionally:

```tsx
        <p className="text-sm text-amber-900">
          {onCourse ? (
            'No charge was made. The course is here when you are ready.'
          ) : (
            <>
              No charge was made, and your conversation is right where you left it. Not sure yet?{' '}
              <a href="/practice/demos" className="font-semibold underline hover:text-amber-950">
                See what a full conversation produces
              </a>
              .
            </>
          )}
        </p>
```

- [ ] **Step 7: Gates and build checks in both modes**

```bash
npm test && npm run check
npm run build
test ! -e dist/course/index.html && echo "hidden: no sales page"
grep -c "solutionseeking.com/course" dist/sitemap-0.xml   # 0
PUBLIC_COURSE_STATUS=preview npm run build
test -e dist/course/index.html && echo "preview: sales page built"
test -e dist/og/course.png && echo "preview: og card"
grep -c "{{" dist/course/index.html                        # 0
grep -o "solutionseeking.com/course/[^<]*" dist/sitemap-0.xml   # exactly one line: /course/
grep -c "course/learn" dist/sitemap-0.xml                  # 0
grep -n "—" src/pages/course/index.astro src/components/react/CourseSalesCta.tsx src/components/CourseSyllabus.astro   # nothing
```

The preview build's page contains the "opens soon" state only after hydration (it is an island), so also check the server-rendered HTML carries the hero title and no price: `grep -c "Learn to turn difficult conversations" dist/course/index.html` is 1 and `grep -c "Get the course for" dist/course/index.html` is 0.

Then in the browser-free dev check: start the dev server (hidden mode), `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/course` must be `404`. Stop the server.

- [ ] **Step 8: Commit**

```bash
unix2dos -q src/components/react/CourseSalesCta.tsx src/components/CourseSyllabus.astro src/pages/course/index.astro
git add src/components/react/CourseSalesCta.tsx src/components/CourseSyllabus.astro src/pages/course/index.astro "src/pages/og/[...route].ts" astro.config.mjs src/components/react/CheckoutBanner.tsx src/lib/course/validate.ts src/lib/course/__tests__/validate.test.ts docs/superpowers/specs/2026-09-09-paid-video-course-design.md
git commit -m "Add the course sales page behind the launch flag"
```

---

### Task 7: The learner dashboard and the checkout return

**Files:**
- Create: `src/components/react/CourseDashboard.tsx`
- Create: `src/pages/course/learn/index.astro`
- Modify: `src/pages/og/[...route].ts` (the `course/learn` entry), `src/pages/course/learn/lessons/[id].astro` (the placeholder link)

**Interfaces:**
- Consumes: `useCourseEntitlement`, `CourseSalesCta` (location `course_dashboard`), `track` (`checkout_success_viewed`, `enrollment_ready`), `accountLink`, `PublicCurriculum`, `CourseStatus`.
- Produces: `CourseDashboard` props `{ curriculum: PublicCurriculum; saleStatus: CourseStatus; courseId: string; courseTitle: string; supportContact: string; priceAmount: number }`.

- [ ] **Step 1: Create `src/components/react/CourseDashboard.tsx`**

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSession } from '../../lib/useSession';
import { accountLink } from '../../lib/accountLink';
import { useCourseEntitlement } from '../../lib/useCourseEntitlement';
import { track } from '../../lib/analytics';
import CourseSalesCta from './CourseSalesCta';
import type { PublicCurriculum } from '../../lib/course/curriculum';
import type { CourseStatus } from '../../lib/course/status';

interface Props {
  curriculum: PublicCurriculum;
  saleStatus: CourseStatus;
  courseId: string;
  courseTitle: string;
  supportContact: string;
  priceAmount: number;
}

const checkoutSuccessParam = () =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('checkout') === 'success';

const clearCheckoutParam = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete('checkout');
  window.history.replaceState(null, '', url);
};

/** Back from Stripe: the webhook usually lands within seconds; the page waits, then says so honestly. */
type Activation = 'none' | 'pending' | 'ready' | 'slow';

const POLL_TRIES = 12;
const POLL_INTERVAL_MS = 1500;
const SESSION_GRACE_MS = 6000;

/**
 * The learner's home. A public shell mounts this; every fact about the learner
 * comes from /api/course/entitlement with the bearer token. Lesson links go to
 * shells that fetch their own content, so nothing paid is ever in HTML.
 */
export default function CourseDashboard(props: Props) {
  const { session, user, loading: sessionLoading } = useSession();
  const { entitlement, loading, failed, refetch } = useCourseEntitlement();
  const [fromCheckout] = useState(checkoutSuccessParam);
  const [activation, setActivation] = useState<Activation>(fromCheckout ? 'pending' : 'none');
  const [graceOver, setGraceOver] = useState(false);
  const [checking, setChecking] = useState(false);
  const readyTracked = useRef(false);

  // The session rehydrates from localStorage after the Stripe redirect. Hold a
  // neutral screen instead of flashing "sign in", with a grace window.
  useEffect(() => {
    if (!fromCheckout) return;
    const t = window.setTimeout(() => setGraceOver(true), SESSION_GRACE_MS);
    return () => window.clearTimeout(t);
  }, [fromCheckout]);

  useEffect(() => {
    if (!fromCheckout || sessionLoading || !session) return;
    let cancelled = false;
    let tries = 0;
    // A funnel step, not the conversion: course_enrolled is sent by the webhook.
    track({ event: 'checkout_success_viewed' });
    const poll = async () => {
      const current = await refetch();
      if (cancelled) return;
      if (current?.kind === 'enrolled') {
        setActivation('ready');
        clearCheckoutParam();
      } else if (tries < POLL_TRIES) {
        tries += 1;
        window.setTimeout(poll, POLL_INTERVAL_MS);
      } else {
        setActivation('slow');
        clearCheckoutParam();
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromCheckout, sessionLoading, user?.id]);

  useEffect(() => {
    if (activation === 'ready' && !readyTracked.current) {
      readyTracked.current = true;
      track({ event: 'enrollment_ready', course_id: props.courseId });
    }
  }, [activation, props.courseId]);

  const checkAccess = async () => {
    setChecking(true);
    const current = await refetch();
    setChecking(false);
    if (current?.kind === 'enrolled') setActivation('ready');
  };

  const enrolled = entitlement?.kind === 'enrolled';

  if (sessionLoading || (fromCheckout && !session && !graceOver)) {
    return <Neutral text={fromCheckout ? 'Finishing your purchase…' : 'Loading your course…'} />;
  }

  if (!session || user?.is_anonymous) {
    return (
      <Panel title="Sign in to open your course">
        <p>Your lessons are attached to the account you bought the course with.</p>
        <a href={accountLink({ next: '/course/learn' })} className="btn-primary mt-5">
          Sign in
        </a>
      </Panel>
    );
  }

  if (activation === 'pending' && !enrolled) {
    return <Neutral text="Setting up your course…" note="Your payment went through. This usually takes a few seconds." />;
  }

  if (activation === 'slow' && !enrolled) {
    return (
      <Panel title="Your course is on its way">
        <p>
          Your payment went through, and your access is being set up. Stripe emails your receipt as soon as
          the payment settles.
        </p>
        <button type="button" onClick={checkAccess} disabled={checking} className="btn-primary mt-5 disabled:opacity-60">
          {checking ? 'Checking…' : 'Check access'}
        </button>
        <p className="mt-4 text-sm text-slate-500">
          Still nothing after a few minutes? Write to{' '}
          <a href={`mailto:${props.supportContact}`} className="font-semibold text-brand-700 underline">
            {props.supportContact}
          </a>
          .
        </p>
      </Panel>
    );
  }

  if (loading && !entitlement && !failed) {
    return <Neutral text="Loading your course…" />;
  }

  // A failed lookup fails OPEN: the lesson API is the real gate.
  if (!enrolled && !failed) {
    if (entitlement?.kind === 'inactive' && entitlement.reason === 'revoked') {
      return (
        <Panel title="Access to the course has ended for this account">
          <p>
            If that seems wrong, write to{' '}
            <a href={`mailto:${props.supportContact}`} className="font-semibold text-brand-700 underline">
              {props.supportContact}
            </a>
            .
          </p>
        </Panel>
      );
    }
    return (
      <Panel title="You do not have access to the course yet">
        {entitlement?.sale.can_purchase ? (
          <div className="mt-2">
            <CourseSalesCta
              location="course_dashboard"
              saleStatus={props.saleStatus}
              courseId={props.courseId}
              priceLabel={null}
              priceAmount={props.priceAmount}
              supportContact={props.supportContact}
              trackView
            />
          </div>
        ) : props.saleStatus === 'hidden' ? (
          <p>
            The course is open to invited learners for now. If you were expecting access, write to{' '}
            <a href={`mailto:${props.supportContact}`} className="font-semibold text-brand-700 underline">
              {props.supportContact}
            </a>
            .
          </p>
        ) : (
          <a href="/course" className="btn-primary mt-2">
            About the course
          </a>
        )}
      </Panel>
    );
  }

  const firstLesson = props.curriculum.modules
    .flatMap((m) => m.lessons)
    .find((l) => l.status === 'published');

  return (
    <div>
      <header className="max-w-2xl">
        <p className="eyebrow">Video course</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink-800 sm:text-4xl">
          {activation === 'ready' ? 'Your course is ready' : props.courseTitle}
        </h1>
        {firstLesson ? (
          <div className="mt-6">
            <a href={`/course/learn/lessons/${firstLesson.id}`} className="btn-primary">
              Open the first lesson
            </a>
            <p className="mt-3 text-sm text-slate-500">{firstLesson.title}</p>
          </div>
        ) : (
          <p className="mt-4 text-slate-600">The first lessons are being prepared. Check back soon.</p>
        )}
      </header>

      <ol className="mt-10 grid gap-4 md:grid-cols-2">
        {props.curriculum.modules.map((m) => (
          <li key={m.id} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-card">
            <p className="eyebrow">Module {m.order}</p>
            <h2 className="mt-1 font-heading text-lg font-bold text-ink-800">{m.title}</h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              {m.lessons.map((l) => (
                <li key={l.id} className="flex items-baseline justify-between gap-3">
                  {l.status === 'published' ? (
                    <a href={`/course/learn/lessons/${l.id}`} className="font-medium text-brand-700 hover:underline">
                      {l.title}
                    </a>
                  ) : (
                    <>
                      <span className="text-slate-500">{l.title}</span>
                      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Coming soon
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Neutral({ text, note }: { text: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-card">
      <p className="font-semibold text-ink-800">{text}</p>
      {note && <p className="mt-2 text-sm text-slate-500">{note}</p>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="max-w-xl rounded-2xl border border-slate-100 bg-white p-8 text-slate-700 shadow-card">
      <h1 className="font-heading text-2xl font-bold text-ink-800">{title}</h1>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/pages/course/learn/index.astro`**

```astro
---
import BaseLayout from '../../../layouts/BaseLayout.astro';
import CourseDashboard from '../../../components/react/CourseDashboard.tsx';
import { COURSE, COURSE_STATUS } from '../../../data/course';
import { COURSE_PRICE } from '../../../data/pricing';
import { courseCopy } from '../../../lib/course/copy';
import { getCourseCatalog } from '../../../lib/course/catalog';
import { publicCurriculum } from '../../../lib/course/curriculum';

// Prerendered public shell, like /dashboard: it carries only public metadata
// (module and lesson titles, the same ones the sales page lists) and gates
// itself client-side. Built in every mode, so a learner granted access from
// /admin can use it while the course is hidden.
const curriculum = publicCurriculum(await getCourseCatalog());
---

<BaseLayout title="Your course" description="Your lessons, worksheets and progress in the Complete Solution Seeking course." noindex>
  <div class="container-page py-10">
    <CourseDashboard
      client:load
      curriculum={curriculum}
      saleStatus={COURSE_STATUS}
      courseId={COURSE.id}
      courseTitle={COURSE.title}
      supportContact={courseCopy('{{support_contact}}')}
      priceAmount={Number(COURSE_PRICE?.priceAmount ?? 0)}
    />
  </div>
</BaseLayout>
```

- [ ] **Step 3: Register the OG card and fix the lesson shell's link**

In `src/pages/og/[...route].ts`, after the gated `course` entry, add (ungated: the shell always exists):

```ts
  'course/learn': {
    title: 'Your course',
    description: 'Your lessons, worksheets and progress in the Complete Solution Seeking course.',
  },
```

In `src/pages/course/learn/lessons/[id].astro`, replace the placeholder card's link line

```astro
        <a class="font-semibold text-brand-700 hover:underline" href="/course">About the course</a>
```

with

```astro
        <a class="font-semibold text-brand-700 hover:underline" href="/course/learn/">Back to your course</a>
```

- [ ] **Step 4: Gates and HTML checks**

```bash
npm test && npm run check && npm run build
test -e dist/course/learn/index.html && echo "shell built"
grep -c 'name="robots" content="noindex"' dist/course/learn/index.html   # 1
grep -c "Begin with your own account" dist/course/learn/index.html       # 0 (no lesson prose in the shell)
test -e dist/og/course/learn.png && echo "og card"
grep -c "course/learn" dist/sitemap-0.xml                                 # 0
grep -n "—" src/components/react/CourseDashboard.tsx src/pages/course/learn/index.astro   # nothing
```

Dev check with the admin token flow from Task 3 (hidden mode, server running): `curl -s http://localhost:4321/course/learn/ | grep -c "astro-island"` is at least 1 (the island mounts). The interactive states are verified in Task 8.

- [ ] **Step 5: Commit**

```bash
unix2dos -q src/components/react/CourseDashboard.tsx src/pages/course/learn/index.astro
git add src/components/react/CourseDashboard.tsx src/pages/course/learn/index.astro "src/pages/og/[...route].ts" "src/pages/course/learn/lessons/[id].astro"
git commit -m "Add the learner dashboard with the checkout return"
```

---

### Task 8: End-to-end verification (controller-run, Playwright MCP)

Not a subagent task: the controller runs it after the final code review, with the Playwright MCP against the dev server, the local Supabase stack, `.env.local` from Tasks 2 to 4 and `stripe listen` forwarding.

- [ ] Sign in as `course-admin@example.com` (local stack; `PUBLIC_TURNSTILE_SITE_KEY` stays unset). Open `/course/learn/` in hidden mode: the "no access yet" panel shows the buy button (admin), `course_viewed` is in `window.dataLayer` with `sale_status: 'hidden'`.
- [ ] Click the button: the confirm dialog; Continue; the Stripe test checkout loads. Pay with `4242 4242 4242 4242`, any future expiry, any CVC, postal code `90210`. Land on `/course/learn/?checkout=success`: "Setting up your course…" then "Your course is ready", with `checkout_success_viewed` and exactly one `enrollment_ready` in the dataLayer, and the URL cleaned. One enrollment row and one `enrolled` ledger row in the database.
- [ ] Reload: the enrolled dashboard, "Coming soon" on every lesson (nothing is published yet), no buy button.
- [ ] Delayed webhook: PATCH the row to `refunded`; stop `stripe listen`; buy again with a new page load (new request key); land on the success page; after about 20 seconds the slow state with "Check access"; start `stripe listen` again and `stripe events resend` the `checkout.session.completed` event from the Stripe dashboard's event list (or trigger a resend from the CLI's log); click "Check access": "Your course is ready". One enrollment (reinstated), one charge for that session.
- [ ] Cancel path: buy again as a fresh non-admin? Not possible in hidden mode (403), so: as the admin with the row deleted, start checkout and use Stripe's back link. The banner reads "No charge was made. The course is here when you are ready." and `checkout_abandoned` fires. The ledger has a `checkout_created` row and nothing else for that session.
- [ ] Non-admin: sign in as `course-learner@example.com`, open `/course/learn/`: the invited-learners sentence, no button. `/course` is a 404.
- [ ] Preview mode: `PUBLIC_COURSE_STATUS=preview npm run dev`: `/course` renders with "The course opens soon." in both CTA spots, no price anywhere, and the sitemap check from Task 6 holds.
- [ ] Screenshots at 1280 and 390 of the sales page (preview mode), the dashboard buy state, and the ready state, saved to the scratchpad for sub-plan 1e's `docs/features/course/`.
- [ ] Clean up: delete the test enrollment and ledger rows; stop the servers; leave the two test accounts (they are local).

---

## Handoff to sub-plan 1c

Lesson delivery consumes `requireEnrolled` (Task 2) for `/api/course/lesson`, `/progress`, `/state` and `/worksheet`, `privateJson` for every response, `useCourseEntitlement` in `LessonView`, and the dashboard's "Coming soon" list, which `LessonNav` replaces. The lesson shell's placeholder card is replaced by the island. Publishing V04 with the placeholder clip (`videoPlaceholder: true`, `status: published`, the Stream UID of `scripts/placeholder-video/out/coming-soon.mp4` once David uploads it) makes "Open the first lesson" live.

Deferred to sub-plan 1e: `docs/status.md`, `deployment.md` (the two async webhook events, `STRIPE_PRICE_ID_COURSE`, the refund runbook), `architecture.md`, the JSON-LD `course()` helper, nav and footer wiring, `AuthMenu`, home, practice, pricing and FAQ touchpoints, `llms.txt`, the hosted migration push, Netlify env vars, the `course-beta` branch context, and the curated screenshots.
