# Course Phase 1e: Admin, Wiring, Docs and Ship Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** David can grant, revoke, refund and reinstate course access from `/admin`; a failed grading job reaches an operator; the course appears in the site's public surfaces only when the launch flag says so; the docs describe how the course is built, authored, deployed and operated; and everything that must reach the hosted stack (migrations, the Netlify environment, the Stripe events, the deploy-preview checks) is written down as a runbook and executed only with David's go-ahead.

**Architecture:** The admin actions bind the existing enrollment store and ledger to `/api/admin/course` and an Enrollments tab; the account is found through the auth admin API, never by reading `auth.users` through PostgREST. The grading alert is a worker-shared module on the Resend SDK with injected configuration, called by the Netlify worker and the dev server's inline path. Every public touchpoint reads `COURSE_STATUS` at build time and renders nothing while the course is hidden, so production changes nothing until the flag flips. Docs are the deliverable of two tasks, not an afterthought. The ship task is a checklist run by the controller with David.

**Tech Stack:** Astro 5 pages and API routes, React islands, Supabase (service role, auth admin API), Resend, Netlify functions, vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-paid-video-course-design.md`, sections "Routes", "Offer configuration and launch flag", "Public surfaces and touchpoints", "Certificates, verification, reviews, emails, admin" (the admin paragraph), "Testing strategy" (HTML-level asserts) and Phase 1 tasks 13 to 15. Sub-plans 1a to 1d are complete on branch `course`. This plan consumes `enrollmentStore`, `findEnrollment`, `NewEvent` (1b), `requireAdmin`/`adminJson`, `/api/admin/course` and the admin `Tab` list (1d), `useCourseEntitlement`, `COURSE`, `COURSE_STATUS`, `COURSE_TOKENS`, `courseCopy`, `publicCurriculum`, `runGradingJob`'s outcome, and the guard scripts.

## Global Constraints

- **No em dashes (`—`) or en dashes between words** in any copy, comment, doc or commit message. Fix the sentence, never the character. Audit every changed file with `grep -n "—" <file>` (the docs tasks touch files that already carry dashes in old sections; new text must add none, and a sentence you rewrite loses its dash).
- **No machine tells, no counted-pair headings.** Docs are read by David and Bradley; write them the way a careful colleague would. Never type a price, a lesson count or a module count: derive them (`COURSE.plan`, the curriculum) or use the tokens.
- **Hidden means invisible.** Every public touchpoint (nav, footer, home, practice, pricing, FAQ, `/course/certification`, the `.md` variants, the llms sections, the sitemap) renders nothing while `COURSE_STATUS === 'hidden'`. The learner area and the account menu's "My course" link work for an enrolled account in every mode. A `hidden` build and a `preview` build are both verified.
- **Admin routes:** `requireAdmin` first, `adminJson` always, every action logged with the admin's email, every access change written to the ledger with `actor: 'admin'` and `actor_user_id`. Accounts are found through `supabaseAdmin.auth.admin`, never by reading `auth.users`.
- **Worker-shared modules stay bundler-clean** (the lint in `npm run check` walks the closure): the grading alert takes its configuration as arguments and imports only the `resend` package.
- **Entitlement rules stand:** the browser learns access only through `/api/course/entitlement`; a revoked or refunded learner gets the honest copy the sales page and dashboard already carry.
- **Gates for every task:** `npm test`, `npm run check` (0 errors), `npm run build` (green, both guards ok). New files CRLF via `unix2dos -q`; existing files edited with the Edit tool only (`sed -i` strips carriage returns). Python is not available; write files with the Write tool, not shell heredocs.
- **Commit trailer** names the authoring model, for example `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- **Secrets and the hosted stack:** never print `.env` or `.env.local` values. No task before Task 8 touches the hosted Supabase project, Netlify or Stripe; `npx supabase db push` stays forbidden until Task 8, which the controller runs with David.
- **Local test environment:** local Supabase on `127.0.0.1:55321` (keys via `npx supabase status -o env`); accounts `course-admin@example.com` (enrolled, the admin through `ADMIN_EMAILS` in `.env.local`) and `course-learner@example.com` (enrolled by SQL during 1d), password `course-test-password-1`; SQL through `docker exec -i supabase_db_SolutionSeekingSystem psql -U postgres -d postgres`; the dev server starts on the first free port from 4321 (read it from the output) and is stopped by PID, never `taskkill //IM node.exe`. `.env.local` may carry `COURSE_GRADER_MODE=off` so nothing grades for real.

## File structure

Created:

| File | Responsibility |
|---|---|
| `src/lib/server/course/adminEnrollment.ts` | `findUserByEmail`, `listEnrollments`, `grantEnrollment`, `setEnrollmentStatus`, `reinstateEnrollment` |
| `src/lib/server/course/gradingAlert.ts` (+ test) | `gradingFailureEmail`, `sendGradingFailureAlert` on the Resend SDK |
| `src/components/CourseCard.astro` | The home page's course section |
| `src/pages/course/certification.astro`, `src/pages/course/certification.md.ts`, `src/pages/course.md.ts` | The public certification page and the two GEO variants |
| `docs/course-production.md` | Bradley's runbook |
| `docs/features/course/README.md` + PNGs | The visual record |

Modified:

| File | Change |
|---|---|
| `src/pages/api/admin/course.ts` | `?view=enrollments`; actions `grant`, `revoke`, `refund`, `reinstate` |
| `src/components/react/AdminView.tsx` | the Enrollments tab |
| `src/lib/server/course/gradingJob.ts` (+ test) | failure outcomes carry `attemptId` and `error` |
| `netlify/functions/course-grade.mts`, `src/lib/server/course/workerTrigger.ts` | send the alert on a failed job |
| `src/lib/useCourseEntitlement.ts` | an optional per-user cache for the header |
| `src/data/nav.ts`, `src/components/react/AuthMenu.tsx`, `src/pages/index.astro`, `src/pages/practice.astro`, `src/pages/pricing.astro`, `src/data/faq.ts` | the touchpoints behind the flag |
| `src/lib/schema.ts`, `src/pages/course/index.astro`, `src/lib/llms.ts`, `src/pages/llms.txt.ts`, `src/pages/llms-full.txt.ts`, `src/pages/og/[...route].ts` | JSON-LD, markdown variants, llms sections, the certification card |
| `src/lib/course/progressRules.ts` (+ test), `src/pages/og/[...route].ts`, `src/pages/api/stripe-webhook.ts`, `src/components/react/CheckoutBanner.tsx`, the spec | tidy-ups carried from 1c |
| `.env.example`, `docs/deployment.md`, `docs/change-checklist.md`, `docs/architecture.md`, `docs/status.md`, `docs/roadmap.md`, `docs/README.md`, `docs/ads-campaign.md`, `docs/content-guide.md` | documentation |

## Shapes shared across tasks

**Admin route (Task 1).** `GET /api/admin/course?view=enrollments` answers `{ rows: EnrollmentListRow[] }` with `EnrollmentListRow { id, user_id, email: string | null, status: 'enrolled' | 'revoked' | 'refunded', source: 'stripe' | 'admin', purchased_at, access_starts_at, access_ends_at, created_at, updated_at }`. `POST /api/admin/course` gains `{ action: 'grant', email, note? }`, `{ action: 'revoke' | 'refund' | 'reinstate', user_id, note? }`, each answering `{ ok: true, enrollment }` or an error: `invalid` 400, `user_not_found` 404 (grant), `anonymous_account` 400 (grant), `already_enrolled` 409 (grant), `not_enrolled` 409 (revoke, refund), `not_inactive` 409 (reinstate), `server_error` 500. The existing `retry_job` and `kick_job` keep their shape.

**Grading alert (Task 2).** `RunOutcome`'s `failed` and `requeued` variants gain `attemptId: string` and `error: string`; `sendGradingFailureAlert(config: { apiKey: string; from: string; to: string }, failure: { jobId: string; attemptId: string; category: string; error: string; adminUrl: string }): Promise<boolean>`.

**Touchpoints (Tasks 3 and 4).** `COURSE_STATUS` from `src/data/course.ts` is the only gate; `courseVisible = COURSE_STATUS !== 'hidden'`. `useCourseEntitlement({ cacheSeconds })` returns the same state as before; the cache is per user id, in module memory, and `refetch()` bypasses it.

Rulings made while planning:

1. The admin grants by email, found through `supabaseAdmin.auth.admin.listUsers` paging (the user base is pilot-sized); the spec's "key on user_id" holds for revoke, refund and reinstate, which act on a listed row.
2. A grant on a revoked or refunded row reinstates it (ledger kind `reinstated`, actor admin); a fresh grant writes `admin_granted`.
3. The grading alert lives in the worker-shared layer on the Resend SDK directly, because `email.ts` imports the env helper the worker closure forbids.
4. The `/course/certification` page ships in this sub-plan: it is static data the JSON-LD, the FAQ and the llms section already point at.
5. The home page's course section derives its counts from the catalog at build time; no number is typed.
6. Task 8 (ship) is gated on David: the controller runs it with him and never on its own initiative.

---

### Task 1: Admin enrollment actions

**Files:**
- Create: `src/lib/server/course/adminEnrollment.ts`
- Modify: `src/pages/api/admin/course.ts`, `src/components/react/AdminView.tsx`

**Interfaces:**
- Consumes: `findEnrollment(userId, courseId)` and `enrollmentStore.addEvent(event)` from `src/lib/server/course/enrollment.ts`; `EnrollmentRow`, `NewEvent` from `enrollmentRules.ts`; `COURSE` from `src/data/course.ts`; `supabaseAdmin`; `requireAdmin`, `adminJson`; the admin view's `Tab`, tabs list, `call()`, `loadTab`, `setNotice`, `useDialog().confirm`, `date()`.
- Produces: the admin route contract in "Shapes shared across tasks" and the Enrollments tab.

- [ ] **Step 1: The server module**

`src/lib/server/course/adminEnrollment.ts`:

```ts
import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '../supabaseAdmin';
import { COURSE } from '../../../data/course';
import { enrollmentStore, findEnrollment } from './enrollment';
import type { EnrollmentRow, EventKind } from './enrollmentRules';

/**
 * Access changes made by a person from /admin. Every change is one row update
 * plus one ledger row with the admin's id, so the history of an enrollment
 * reads the same whether Stripe or an admin wrote it. Accounts are found
 * through the auth admin API: the service role cannot read auth.users
 * through PostgREST, and a lookup by email is what an operator has in hand.
 */

const LIST_COLUMNS =
  'id, user_id, status, source, purchased_at, access_starts_at, access_ends_at, created_at, updated_at' as const;
const PAGE = 200;

export async function findUserByEmail(email: string): Promise<User | null> {
  const wanted = email.trim().toLowerCase();
  if (!wanted) return null;
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new Error(`user lookup failed: ${error.message}`);
    const hit = data.users.find((u) => (u.email ?? '').trim().toLowerCase() === wanted);
    if (hit) return hit;
    if (data.users.length < PAGE) return null;
  }
  return null;
}

export interface EnrollmentListRow {
  id: string;
  user_id: string;
  email: string | null;
  status: 'enrolled' | 'revoked' | 'refunded';
  source: 'stripe' | 'admin';
  purchased_at: string | null;
  access_starts_at: string;
  access_ends_at: string | null;
  created_at: string;
  updated_at: string;
}

/** The newest 200 enrollments with the account's email resolved for each. */
export async function listEnrollments(): Promise<EnrollmentListRow[]> {
  const { data, error } = await supabaseAdmin
    .from('course_enrollments')
    .select(LIST_COLUMNS)
    .eq('course_id', COURSE.id)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(`enrollment list failed: ${error.message}`);
  const rows = data ?? [];
  const emails = new Map<string, string | null>();
  await Promise.all(
    [...new Set(rows.map((r) => r.user_id))].map(async (userId) => {
      const { data: found } = await supabaseAdmin.auth.admin.getUserById(userId);
      emails.set(userId, found?.user?.email ?? null);
    })
  );
  return rows.map((r) => ({ ...(r as Omit<EnrollmentListRow, 'email'>), email: emails.get(r.user_id) ?? null }));
}

export type AdminOutcome =
  | { ok: true; enrollment: EnrollmentRow; kind: EventKind }
  | { ok: false; error: 'already_enrolled' | 'not_enrolled' | 'not_inactive' };

async function ledger(row: EnrollmentRow, kind: EventKind, admin: User, note: string | null): Promise<void> {
  await enrollmentStore.addEvent({
    enrollment_id: row.id,
    user_id: row.user_id,
    course_id: row.course_id,
    kind,
    actor: 'admin',
    actor_user_id: admin.id,
    stripe_checkout_session_id: null,
    stripe_event_id: null,
    note,
  });
}

async function updateStatus(id: string, patch: Record<string, unknown>): Promise<EnrollmentRow> {
  const { data, error } = await supabaseAdmin
    .from('course_enrollments')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`enrollment update failed: ${error.message}`);
  return data as EnrollmentRow;
}

/** Give an account access. A revoked or refunded row is reinstated; a missing row is created with source admin. */
export async function grantEnrollment(userId: string, admin: User, note: string | null): Promise<AdminOutcome> {
  const existing = await findEnrollment(userId, COURSE.id);
  if (existing?.status === 'enrolled') return { ok: false, error: 'already_enrolled' };
  if (existing) {
    const row = await updateStatus(existing.id, { status: 'enrolled', access_starts_at: new Date().toISOString(), access_ends_at: null });
    await ledger(row, 'reinstated', admin, note);
    return { ok: true, enrollment: row, kind: 'reinstated' };
  }
  const { data, error } = await supabaseAdmin
    .from('course_enrollments')
    .insert({ user_id: userId, course_id: COURSE.id, status: 'enrolled', source: 'admin', access_starts_at: new Date().toISOString() })
    .select('*')
    .single();
  if (error) throw new Error(`enrollment insert failed: ${error.message}`);
  const row = data as EnrollmentRow;
  await ledger(row, 'admin_granted', admin, note);
  return { ok: true, enrollment: row, kind: 'admin_granted' };
}

/** End access: revoked (a decision) or refunded (the money moved back in the Stripe dashboard). */
export async function setEnrollmentStatus(
  userId: string,
  status: 'revoked' | 'refunded',
  admin: User,
  note: string | null
): Promise<AdminOutcome> {
  const existing = await findEnrollment(userId, COURSE.id);
  if (!existing || existing.status !== 'enrolled') return { ok: false, error: 'not_enrolled' };
  const row = await updateStatus(existing.id, { status, access_ends_at: new Date().toISOString() });
  await ledger(row, status, admin, note);
  return { ok: true, enrollment: row, kind: status };
}

/** Restore access to a revoked or refunded row. */
export async function reinstateEnrollment(userId: string, admin: User, note: string | null): Promise<AdminOutcome> {
  const existing = await findEnrollment(userId, COURSE.id);
  if (!existing || existing.status === 'enrolled') return { ok: false, error: 'not_inactive' };
  const row = await updateStatus(existing.id, { status: 'enrolled', access_ends_at: null });
  await ledger(row, 'reinstated', admin, note);
  return { ok: true, enrollment: row, kind: 'reinstated' };
}
```

Read `enrollment.ts` first: if `findEnrollment` selects a named column list rather than `*`, use the same list here (`ENROLLMENT_COLUMNS`) so the row shapes match; `EnrollmentRow` is the type both return.

- [ ] **Step 2: The route**

In `src/pages/api/admin/course.ts`:
- `GET`: accept `view=enrollments` beside `grading` and answer `adminJson({ rows: await listEnrollments() })` (500 `server_error` on a throw, logged).
- `POST`: branch on `action` before validating any id. `grant`: `email` must look like an address (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`), `note` optional string up to 500 characters; `findUserByEmail` → 404 `user_not_found` with `message: 'No account with that email. The learner creates the account first; then you grant access.'`; a user with `is_anonymous === true` or no email → 400 `anonymous_account`; then `grantEnrollment`; 409 `already_enrolled` with `message: 'That account already has access.'`. `revoke` and `refund`: `user_id` UUID, `note` optional → `setEnrollmentStatus`; 409 `not_enrolled`. `reinstate`: → `reinstateEnrollment`; 409 `not_inactive`. On success `adminJson({ ok: true, enrollment })` and `console.log('admin action', admin.email, action, <user id>, note ?? '')`. Keep `retry_job` and `kick_job` exactly as they are (their `job_id` check moves inside their branch).

- [ ] **Step 3: The tab**

In `AdminView.tsx`: `Tab` gains `'enrollments'`; the tabs list gains `{ id: 'enrollments', label: 'Enrollments', count: enrollments?.filter((e) => e.status === 'enrolled').length }`; state `enrollments: EnrollmentRow[] | null` (interface matching `EnrollmentListRow`); `loadTab('enrollments')` → `call('course?view=enrollments')`. Render an `EnrollmentsTab` with:
- a grant form: an email input (`type="email"`, required), a note input (placeholder "Why, for the ledger (optional)"), a "Grant access" button; on submit `call('course', { action: 'grant', email, note })`; on success notice "Access granted." and reload; the route's `message` shows through the existing error path.
- a table: Email (or the user id's first eight characters when null), Status (a pill: enrolled green, revoked slate, refunded amber), Source, Since (`date(access_starts_at)`), Ended (`date(access_ends_at)` or blank), Actions: for `enrolled` the buttons "Revoke" and "Record refund" (each behind `confirm({ title: 'Revoke access for <email>?', message: 'The learner keeps their progress but cannot open lessons until access is reinstated.', confirmLabel: 'Revoke', tone: 'danger' })` and `confirm({ title: 'Record a refund for <email>?', message: 'This ends access and writes the ledger. Move the money in the Stripe dashboard.', confirmLabel: 'Record refund' })`); for `revoked` or `refunded` the button "Reinstate" (`confirm({ title: 'Reinstate access for <email>?', confirmLabel: 'Reinstate' })`). Notices: "Access revoked.", "Refund recorded. Move the money in the Stripe dashboard.", "Access reinstated." Empty state: "No enrollments yet." Loading: "Loading…". Disable the row's buttons while its call is in flight (the file's `disabled={publishing}` idiom, per row).

- [ ] **Step 4: Gates and a curl walk**

`npm test && npm run check && npm run build` green. Then with the dev server on its port and tokens for both accounts (the 1d Task 7 recipe: the anon key from `npx supabase status -o env`, a password grant against `http://127.0.0.1:55321/auth/v1/token?grant_type=password`; never echo a key or token):

1. `GET /api/admin/course?view=enrollments` with the admin token → two rows with emails.
2. `POST { action: 'revoke', user_id: <learner id>, note: 'pilot test' }` → `ok`; then `GET /api/course/lesson?id=v04` with the learner token → 403 `{ error: 'enrollment_required', reason: 'revoked' }`; `GET /api/course/entitlement` → `kind: 'inactive'`, `reason: 'revoked'`.
3. `POST { action: 'reinstate', user_id: <learner id> }` → `ok`; the lesson call → 200.
4. `POST { action: 'refund', user_id: <learner id> }` → `ok`, status `refunded`; reinstate again → `ok`.
5. `POST { action: 'grant', email: 'course-learner@example.com' }` → 409 `already_enrolled`; `{ action: 'grant', email: 'nobody@example.com' }` → 404 `user_not_found`; `{ action: 'grant', email: 'not-an-email' }` → 400.
6. SQL: `select kind, actor, actor_user_id, note from public.course_enrollment_events where user_id = '<learner id>' order by created_at` shows `revoked`, `reinstated`, `refunded`, `reinstated`, each with `actor = 'admin'` and `actor_user_id` = the admin's id.
7. The learner token without admin rights: `GET /api/admin/course?view=enrollments` → 403.

Leave the learner enrolled. Stop the dev server by PID.

- [ ] **Step 5: Commit**

```bash
grep -n "—" src/lib/server/course/adminEnrollment.ts src/pages/api/admin/course.ts src/components/react/AdminView.tsx   # nothing new
unix2dos -q src/lib/server/course/adminEnrollment.ts
git add src/lib/server/course/adminEnrollment.ts src/pages/api/admin/course.ts src/components/react/AdminView.tsx
git commit -m "Let an admin grant, revoke, refund and reinstate course access"
```

---

### Task 2: The grading failure alert

**Files:**
- Create: `src/lib/server/course/gradingAlert.ts`, `src/lib/server/course/__tests__/gradingAlert.test.ts`
- Modify: `src/lib/server/course/gradingJob.ts`, `src/lib/server/course/__tests__/gradingJob.test.ts`, `netlify/functions/course-grade.mts`, `src/lib/server/course/workerTrigger.ts`, `.env.example`

**Interfaces:**
- Consumes: `runGradingJob` and `RunOutcome` (1d), the `resend` package (read `src/lib/server/email.ts` for how the SDK's `emails.send` takes an idempotency key in this version).
- Produces: `gradingFailureEmail(failure)`, `sendGradingFailureAlert(config, failure)`; `RunOutcome`'s `failed` and `requeued` variants carry `attemptId` and `error`.

- [ ] **Step 1: The outcome carries what an alert needs**

In `gradingJob.ts`, change `RunOutcome` to

```ts
export type RunOutcome =
  | { outcome: 'finalized'; passed: boolean }
  | { outcome: 'unavailable' | 'exhausted' | 'stale' }
  | { outcome: 'requeued' | 'failed'; category: ErrorCategory; attemptId: string; error: string };
```

and make the `fail` helper return `{ outcome: result, category, attemptId: claim.attemptId, error }`. In `gradingJob.test.ts` change the `toEqual` assertions on failed and requeued outcomes to `toMatchObject` with the same fields, and add `attemptId: 'att-1'` to one of them to prove it is carried.

- [ ] **Step 2: The failing alert test**

```ts
import { describe, expect, it } from 'vitest';
import { gradingFailureEmail } from '../gradingAlert';

describe('gradingFailureEmail', () => {
  it('names the job, the attempt, the category and where to retry', () => {
    const mail = gradingFailureEmail({ jobId: 'job-1', attemptId: 'att-1', category: 'internal', error: 'boom', adminUrl: 'https://example.com/admin/' });
    expect(mail.subject).toBe('A course grading job failed');
    expect(mail.text).toContain('Job: job-1');
    expect(mail.text).toContain('Attempt: att-1');
    expect(mail.text).toContain('Category: internal');
    expect(mail.text).toContain('Error: boom');
    expect(mail.text).toContain('https://example.com/admin/');
    expect(mail.text).not.toMatch(/[—–]/);
  });

  it('cuts a long error', () => {
    const mail = gradingFailureEmail({ jobId: 'j', attemptId: 'a', category: 'upstream', error: 'x'.repeat(2000), adminUrl: 'u' });
    expect(mail.text.length).toBeLessThan(1200);
  });
});
```

Run: `npx vitest run src/lib/server/course/__tests__/gradingAlert.test.ts` → FAIL (module missing).

- [ ] **Step 3: The module**

```ts
import { Resend } from 'resend';

/**
 * The operator's signal that a grading job has failed for good. The learner
 * sees the honest grading_error copy and is told to write to course support;
 * this email is what lets support act before they do. Worker-shared: the
 * Netlify function and the dev server both call it with configuration they
 * read themselves, and it imports only the Resend SDK.
 */
export interface GradingFailure {
  jobId: string;
  attemptId: string;
  category: string;
  error: string;
  adminUrl: string;
}

export function gradingFailureEmail(f: GradingFailure): { subject: string; text: string } {
  return {
    subject: 'A course grading job failed',
    text: [
      'A grading job ended in failure after its retries, and the learner now sees the grading_error state.',
      '',
      `Job: ${f.jobId}`,
      `Attempt: ${f.attemptId}`,
      `Category: ${f.category}`,
      `Error: ${f.error.slice(0, 500)}`,
      '',
      `Retry it from the admin area: ${f.adminUrl}`,
      'The learner has been told this is not a failed attempt and that course support can re-run the grading.',
    ].join('\n'),
  };
}

export interface AlertConfig {
  apiKey: string;
  from: string;
  to: string;
}

/** Send the alert once per job (an idempotency key keeps a retried worker from sending it twice). Never throws. */
export async function sendGradingFailureAlert(config: AlertConfig, f: GradingFailure): Promise<boolean> {
  if (!config.apiKey || !config.from || !config.to) {
    console.error(`grading job ${f.jobId}: failure alert not sent (RESEND_API_KEY, EMAIL_FROM or ALERTS_TO unset)`);
    return false;
  }
  try {
    const mail = gradingFailureEmail(f);
    const { error } = await new Resend(config.apiKey).emails.send(
      { from: config.from, to: config.to, subject: mail.subject, text: mail.text },
      { idempotencyKey: `course-grading-failed/${f.jobId}` }
    );
    if (error) {
      console.error(`grading job ${f.jobId}: failure alert rejected`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`grading job ${f.jobId}: failure alert failed`, err);
    return false;
  }
}
```

If `email.ts` passes the idempotency key differently in this SDK version, match it. Run the alert test → PASS (2 tests).

- [ ] **Step 4: The call sites**

`netlify/functions/course-grade.mts`: after `runGradingJob`, when `outcome.outcome === 'failed'`, `await sendGradingFailureAlert({ apiKey: env('RESEND_API_KEY'), from: env('EMAIL_FROM'), to: env('ALERTS_TO') || env('TEAM_ENQUIRY_TO') || env('EMAIL_FROM') }, { jobId, attemptId: outcome.attemptId, category: outcome.category, error: outcome.error, adminUrl: `${env('URL')}/admin/` })`.

`workerTrigger.ts` inline path: the `void runGradingJob(...)` becomes `.then((outcome) => { if (outcome.outcome === 'failed') return sendGradingFailureAlert({ apiKey: serverEnv('RESEND_API_KEY'), from: serverEnv('EMAIL_FROM'), to: serverEnv('ALERTS_TO') || serverEnv('TEAM_ENQUIRY_TO') || serverEnv('EMAIL_FROM') }, { jobId: args.jobId, attemptId: outcome.attemptId, category: outcome.category, error: outcome.error, adminUrl: `${workerOrigin(args.origin) || args.origin}/admin/` }); })` before its `.catch`.

`.env.example`: in the assessment grading block add one sentence: `RESEND_API_KEY`, `EMAIL_FROM` and `ALERTS_TO` must also be in Netlify's Functions scope, because the worker sends the failure alert itself.

- [ ] **Step 5: Gates and commit**

`npm test && npm run check && npm run build` green; the lint's module count grows by one (`gradingAlert.ts`). Then:

```bash
grep -n "—" src/lib/server/course/gradingAlert.ts src/lib/server/course/__tests__/gradingAlert.test.ts netlify/functions/course-grade.mts src/lib/server/course/workerTrigger.ts   # nothing
unix2dos -q src/lib/server/course/gradingAlert.ts src/lib/server/course/__tests__/gradingAlert.test.ts
git add src/lib/server/course/gradingAlert.ts src/lib/server/course/__tests__/ src/lib/server/course/gradingJob.ts netlify/functions/course-grade.mts src/lib/server/course/workerTrigger.ts .env.example
git commit -m "Email an operator when a grading job fails for good"
```

---

### Task 3: The public touchpoints behind the flag

**Files:**
- Create: `src/components/CourseCard.astro`
- Modify: `src/data/nav.ts`, `src/lib/useCourseEntitlement.ts`, `src/components/react/AuthMenu.tsx`, `src/pages/index.astro`, `src/pages/practice.astro`, `src/pages/pricing.astro`, `src/data/faq.ts`

**Interfaces:**
- Consumes: `COURSE`, `COURSE_STATUS` (`src/data/course.ts`), `courseCopy` (`src/lib/course/copy.ts`), `getCourseCatalog` + `publicCurriculum` (build time only), `CERTIFICATION_TITLE`, `PASS_TOTAL`, `PASS_MIN_CRITERION` (`src/data/certification.ts`), the CTA locations `home_course`, `pricing_course`, `practice_course` (already in `analytics.ts`).
- Produces: `useCourseEntitlement(options?: { cacheSeconds?: number })`; nothing else new is exported.

Read each file in full before editing. `COURSE_STATUS !== 'hidden'` is the only gate; write it once per file as `const courseVisible = COURSE_STATUS !== 'hidden';`.

- [ ] **Step 1: The nav**

`src/data/nav.ts`: import `{ COURSE, COURSE_STATUS } from './course'` and make the Learn group's children

```ts
      { label: 'Leadership Tools', href: '/tools' },
      // The course joins the Learn group only once it is public; the footer follows through navLinks.
      ...(COURSE_STATUS !== 'hidden' ? [{ label: COURSE.navLabel, href: '/course' }] : []),
```

- [ ] **Step 2: The entitlement cache and the account menu**

`src/lib/useCourseEntitlement.ts`: add a module-level `const cache = new Map<string, { at: number; value: CourseEntitlementView }>();` and an options parameter `useCourseEntitlement(options: { cacheSeconds?: number } = {})`. In the effect, before requesting: if `options.cacheSeconds` is set and the cache holds this user's entry younger than `cacheSeconds * 1000` ms, `setState({ entitlement: cached.value, loading: false, failed: false })` and return without a request. In `refetch`, after a non-null result, `cache.set(current.user.id, { at: Date.now(), value: entitlement })` (read the user id from the session's `user.id`). The generation guard and the existing behaviour are unchanged for callers that pass no options.

`src/components/react/AuthMenu.tsx`: import `useCourseEntitlement` and `COURSE_STATUS` (`../../data/course`). After the existing hooks, `const course = useCourseEntitlement({ cacheSeconds: 300 });` and

```ts
  const courseLink =
    course.entitlement?.kind === 'enrolled'
      ? { href: '/course/learn/', label: 'My course' }
      : COURSE_STATUS !== 'hidden'
        ? { href: '/course', label: 'Explore the course' }
        : null;
```

Render it, when non-null, as one more link after "My account" in both the mobile list and the desktop menu, with the same classes as its neighbours (`role="menuitem"` on the desktop one). Hooks stay unconditional: the call sits before the early returns for loading and signed-out states, and a signed-out user's `courseLink` is never rendered because those branches return first.

- [ ] **Step 3: The home section**

`src/components/CourseCard.astro`:

```astro
---
import { COURSE, COURSE_STATUS } from '../data/course';
import { getCourseCatalog } from '../lib/course/catalog';
import { publicCurriculum } from '../lib/course/curriculum';

/**
 * The home page's course section. Built only while the course is public; the
 * counts come from the catalog so nothing here is typed.
 */
const courseVisible = COURSE_STATUS !== 'hidden';
const curriculum = courseVisible ? publicCurriculum(await getCourseCatalog()) : null;
---

{
  courseVisible && curriculum && (
    <section class="border-b border-slate-100 bg-white">
      <div class="container-page py-14">
        <div class="mx-auto max-w-3xl">
          <p class="eyebrow mb-3">Video course</p>
          <h2 class="text-2xl font-bold text-ink-800 sm:text-3xl">{COURSE.title}</h2>
          <p class="mt-4 text-lg leading-relaxed text-slate-600">
            {curriculum.totalLessons} short video lessons with {COURSE.presenter} across {curriculum.modules.length} modules, an
            exercise and a model response for each, a printable worksheet for every module, and an AI-assessed
            certification at the end.
          </p>
          <p class="mt-3 text-slate-600">
            Everything else on the site stays free: the guide, the worksheets, the practice tools and the assistants
            trial.
          </p>
          <a href="/course" class="btn-primary mt-6" data-track-cta="home_course" data-track-label="See the course">
            See the course
          </a>
        </div>
      </div>
    </section>
  )
}
```

In `src/pages/index.astro`, import it and place `<CourseCard />` directly after the "Definition" section (the section headed "What is the Solution Seeking System?"). Check `publicCurriculum`'s return type for the exact names (`totalLessons`, `modules`); use what it exports.

- [ ] **Step 4: The practice band**

In `src/pages/practice.astro`, import `{ COURSE, COURSE_STATUS }` and add, after the "Interactive tools" section and inside the same container:

```astro
    {
      COURSE_STATUS !== 'hidden' && (
        <section class="mt-20 rounded-3xl border border-brand-100 bg-brand-50/60 p-7 sm:p-8">
          <p class="eyebrow mb-3">Video course</p>
          <h2 class="text-2xl font-bold text-ink-800">Want a step-by-step learning path?</h2>
          <p class="mt-3 max-w-2xl text-slate-600">
            The course walks the whole system in order with {COURSE.presenter}, one short lesson at a time, with an
            exercise to practise after each and a certification at the end.
          </p>
          <a href="/course" class="btn-secondary mt-5" data-track-cta="practice_course" data-track-label="See the video course">
            See the video course
          </a>
        </section>
      )
    }
```

- [ ] **Step 5: The pricing panel**

In `src/pages/pricing.astro`, import `{ COURSE, COURSE_STATUS }`, `courseCopy`, `getCourseCatalog` and `publicCurriculum`; in the frontmatter `const courseVisible = COURSE_STATUS !== 'hidden'; const curriculum = courseVisible ? publicCurriculum(await getCourseCatalog()) : null; const courseLine = COURSE_STATUS === 'open' ? courseCopy('{{course_price}} · {{access_summary}}') : 'Opens soon';` (an `open` build already asserts the tokens exist). Between the "Paid plans" section and the testimonials block:

```astro
    {
      courseVisible && curriculum && (
        <section class="mt-16 rounded-3xl border border-slate-100 bg-white p-7 shadow-card sm:p-8">
          <p class="eyebrow mb-3">One-time purchase</p>
          <h2 class="font-heading text-2xl font-bold text-ink-800">{COURSE.title}</h2>
          <p class="mt-3 max-w-2xl text-slate-600">
            {curriculum.totalLessons} short video lessons with {COURSE.presenter}, an exercise and a model response for
            each, a worksheet for every module, and an AI-assessed certification at the end. Separate from the
            subscription: it does not include the assistants, and the assistants do not include it.
          </p>
          <p class="mt-4 text-lg font-semibold text-ink-800">{courseLine}</p>
          <a href="/course" class="btn-primary mt-5" data-track-cta="pricing_course" data-track-label="See the course">
            See the course
          </a>
        </section>
      )
    }
```

- [ ] **Step 6: The FAQ**

In `src/data/faq.ts`, import `{ COURSE, COURSE_STATUS }` from `./course` and `{ CERTIFICATION_TITLE, PASS_MIN_CRITERION, PASS_TOTAL }` from `./certification`; `const courseVisible = COURSE_STATUS !== 'hidden';`. Change the "Is it really free?" answer to

```ts
    a: courseVisible
      ? 'Yes. Every page, the complete PDF guide, the interactive worksheets and the annotated example conversations are free and always will be. You pay only for unlimited conversations with the AI assistants, or for the video course if you want the guided path and the certification.'
      : 'Yes. The entire system is free to read and always will be: every page, the complete PDF guide, the interactive worksheets, and the annotated example conversations. You only pay if you want unlimited conversations with the AI assistants.',
```

and append, at the end of the array:

```ts
  ...(courseVisible
    ? [
        {
          q: 'Is there a course?',
          a: `Yes. The ${COURSE.title} is a paid video course with ${COURSE.presenter}: ${COURSE.plan.lessons} short lessons across ${COURSE.plan.modules} modules, an exercise and a model response for each, a printable worksheet for every module, and an AI-assessed certification at the end. Everything else on the site stays free.`,
        },
        {
          q: `What does the ${CERTIFICATION_TITLE} mean?`,
          a: `An AI-assessed course credential earned on supplied scenarios. It is not an accreditation and does not verify live behaviour. You pass with a weighted total of at least ${PASS_TOTAL} out of 100 and every criterion at ${PASS_MIN_CRITERION} or more, against a rubric that is published in full.`,
        },
      ]
    : []),
```

- [ ] **Step 7: Verify both modes**

Run `npm test && npm run check && npm run build` (hidden, the default): `grep -c "home_course\|pricing_course\|practice_course" dist/index.html dist/pricing/index.html dist/practice/index.html` prints 0 for each; `grep -c "Video course" dist/index.html` is 0; `grep -c "Is there a course" dist/faq/index.html` is 0.

Then `PUBLIC_COURSE_STATUS=preview npm run build` (both guards must still pass): the same greps print at least 1 each; `grep -c "Opens soon" dist/pricing/index.html` prints 1; `grep -o 'href="/course"' dist/index.html | head -1` finds the nav link; `grep -c "/course" dist/sitemap-0.xml` is at least 1 and `grep -c "/course/learn" dist/sitemap-0.xml` is 0. Finally run the default build once more so `dist/` is back to hidden.

The account menu is verified in the browser by the controller (Task 7).

- [ ] **Step 8: Commit**

```bash
grep -n "—" src/components/CourseCard.astro src/data/nav.ts src/lib/useCourseEntitlement.ts src/components/react/AuthMenu.tsx src/pages/index.astro src/pages/practice.astro src/pages/pricing.astro src/data/faq.ts   # nothing new
unix2dos -q src/components/CourseCard.astro
git add src/components/CourseCard.astro src/data/nav.ts src/lib/useCourseEntitlement.ts src/components/react/AuthMenu.tsx src/pages/index.astro src/pages/practice.astro src/pages/pricing.astro src/data/faq.ts
git commit -m "Show the course in the nav, the account menu, the home, practice and pricing pages and the FAQ when it is public"
```

---

### Task 4: The certification page, the JSON-LD, the markdown variants and the llms sections

**Files:**
- Create: `src/pages/course/certification.astro`, `src/pages/course/certification.md.ts`, `src/pages/course.md.ts`
- Modify: `src/lib/schema.ts`, `src/pages/course/index.astro`, `src/lib/llms.ts`, `src/pages/llms.txt.ts`, `src/pages/llms-full.txt.ts`, `src/pages/og/[...route].ts`

**Interfaces:**
- Consumes: `src/data/certification.ts` (`CERTIFICATION_TITLE`, `CERTIFICATION_METHOD`, `CERTIFICATION_VERSION`, `CRITERIA`, `SCORE_ANCHORS`, `PASS_TOTAL`, `PASS_MIN_CRITERION`), `COURSE`, `COURSE_STATUS`, `COURSE_TOKENS`, `COURSE_PRICE` (`src/data/pricing.ts`), `publicCurriculum`, `breadcrumbs` and the `Schema` type, `attributionFooter`.
- Produces: `schema.course(site, opts)`, `courseToMarkdown(site, curriculum, opts)`, `certificationToMarkdown(site)`.
- Look first at how the existing `.md.ts` routes are written (`ls src/pages/**/*.md.ts`; the protocol and principle pages have them) and how `src/pages/course/index.astro` returns a 404 while hidden; mirror both. Look at how `src/pages/og/[...route].ts` gates the `course` entry and add `course/certification` the same way.

- [ ] **Step 1: The JSON-LD helper**

In `src/lib/schema.ts`:

```ts
/**
 * The paid video course. `offers` is present only while the course is open,
 * so a preview build never claims a price. The workload is the top of the
 * learner-hours range.
 */
export function course(
  site: URL,
  opts: {
    path: string;
    name: string;
    description: string;
    presenter: string;
    workloadHours: number;
    sections: { name: string; lessons: string[] }[];
    credential: string;
    offer: { price: string; currency: string } | null;
  }
): Schema {
  return {
    '@context': CONTEXT,
    '@type': 'Course',
    name: opts.name,
    description: opts.description,
    url: new URL(opts.path, site).href,
    provider: { '@type': 'Organization', name: SITE_NAME, url: site.href },
    isAccessibleForFree: false,
    educationalCredentialAwarded: {
      '@type': 'EducationalOccupationalCredential',
      name: opts.credential,
      credentialCategory: 'certificate',
    },
    syllabusSections: opts.sections.map((s) => ({ '@type': 'Syllabus', name: s.name, description: s.lessons.join('. ') })),
    hasCourseInstance: [
      {
        '@type': 'CourseInstance',
        courseMode: 'Online',
        courseWorkload: `PT${opts.workloadHours}H`,
        instructor: { '@type': 'Person', name: opts.presenter },
      },
    ],
    ...(opts.offer
      ? {
          offers: [
            {
              '@type': 'Offer',
              price: opts.offer.price,
              priceCurrency: opts.offer.currency,
              availability: 'https://schema.org/InStock',
              category: 'Paid',
            },
          ],
        }
      : {}),
  };
}
```

In `src/pages/course/index.astro`, add to `schemas`:

```ts
  course(site, {
    path: '/course',
    name: COURSE.title,
    description: `Learn the Solution Seeking System with ${COURSE.presenter} through ${curriculum.totalLessons} video lessons, practical exercises, and AI-assessed certification.`,
    presenter: COURSE.presenter,
    workloadHours: Number(COURSE.learnerHours.split('-').pop()),
    sections: curriculum.modules.map((m) => ({ name: m.title, lessons: m.lessons.map((l) => l.title) })),
    credential: CERTIFICATION_TITLE,
    offer: COURSE_STATUS === 'open' && COURSE_PRICE ? { price: String(COURSE_PRICE.priceAmount), currency: COURSE_PRICE.currency } : null,
  }),
```

(reuse the page's existing description string rather than duplicating it if it is already a variable). This closes the deferred "Course schema" item in `docs/status.md` (Task 5a records it).

- [ ] **Step 2: The certification page**

`src/pages/course/certification.astro`, prerendered, a 404 while hidden exactly like the sales page, `BaseLayout` with `title={CERTIFICATION_TITLE}`, a description "How the Solution Seeking System Certification is assessed: the six criteria, their weights, the score anchors and the pass rule.", breadcrumbs (Home, Video course, Certification). Content, in this order, with headings that say what the section contains:

1. A `PageHero` (the sales page uses one) with eyebrow "Video course", the title `CERTIFICATION_TITLE`, and the intro "The certification at the end of the course is AI-assessed and unproctored. The rubric below is the whole rubric: what is scored, how much each criterion counts, what each score means, and what it takes to pass."
2. "How the assessment works": three short paragraphs: one scenario in three parts, each part revealing new information and locking the last; an AI grader that scores each criterion against the rubric, quotes the passages it relied on, and names the lessons to revisit for anything below the bar; and the retakes sentence from `COURSE_TOKENS.retakes_summary` (render it through `courseCopy('{{retakes_summary}}')`).
3. "What is scored": a table of `CRITERIA` with columns Criterion, Weight (as `${weight}%`), and What it demonstrates.
4. "What each score means": a list of `SCORE_ANCHORS` from 0 to 4.
5. "What it takes to pass": `A weighted total of at least ${PASS_TOTAL} out of 100, with every criterion at ${PASS_MIN_CRITERION} or more. A Wisdom Principle or a Leadership Tool that is missing or misapplied caps its criterion at 2, and so does a material misconception, so a strong total cannot carry a weak criterion.`
6. "What the certification means": the exact sentence `An AI-assessed course credential earned on supplied scenarios. It is not an accreditation and does not verify live behaviour.` followed by `Version ${CERTIFICATION_VERSION}. A change to the rubric bumps the version; a certificate keeps the version it was awarded under.` (a comment in the frontmatter notes the version rule is enforced by `finalize_course_grade` storing `certification_version`).
7. A closing link to `/course` ("See the course") with `data-track-cta="course_close"`.

- [ ] **Step 3: The markdown variants**

In `src/lib/llms.ts` add (imports: `COURSE`, `COURSE_TOKENS` from `../data/course`, the certification data, `PublicCurriculum`):

```ts
/** /course.md: the public shape of the course for machines, never lesson prose. */
export function courseToMarkdown(
  site: URL | undefined,
  curriculum: PublicCurriculum,
  opts: { status: 'preview' | 'open'; priceLine: string | null }
): string {
  const link = (path: string) => (site ? new URL(path, site).href : path);
  return [
    `# ${COURSE.title}`,
    '',
    `A paid video course with ${COURSE.presenter}: ${curriculum.totalLessons} short lessons across ${curriculum.modules.length} modules, an exercise and a model response for each, a printable worksheet for every module, and an AI-assessed certification at the end. About ${COURSE.learnerHours} hours of learner time over ${COURSE.suggestedWeeks} weeks.`,
    '',
    opts.status === 'open' && opts.priceLine ? opts.priceLine : 'Not on sale yet.',
    '',
    '## Syllabus',
    '',
    ...curriculum.modules.flatMap((m) => [`### ${m.title}`, '', ...m.lessons.map((l) => `- ${l.title}`), '']),
    '## Certification',
    '',
    `${link('/course/certification')}`,
    '',
    `Course page: ${link('/course')}`,
  ].join('\n');
}

/** /course/certification.md: the published rubric. */
export function certificationToMarkdown(site: URL | undefined): string {
  const link = (path: string) => (site ? new URL(path, site).href : path);
  return [
    `# ${CERTIFICATION_TITLE}`,
    '',
    `${CERTIFICATION_METHOD}. An AI-assessed course credential earned on supplied scenarios. It is not an accreditation and does not verify live behaviour. Version ${CERTIFICATION_VERSION}.`,
    '',
    '## Criteria',
    '',
    ...CRITERIA.map((c) => `- ${c.name} (${c.weight}%): ${c.demonstrates}`),
    '',
    '## Score anchors',
    '',
    ...Object.entries(SCORE_ANCHORS).map(([score, meaning]) => `- ${score}: ${meaning}`),
    '',
    '## Passing',
    '',
    `A weighted total of at least ${PASS_TOTAL} out of 100 with every criterion at ${PASS_MIN_CRITERION} or more. A missing or misapplied Wisdom Principle or Leadership Tool caps its criterion at 2, as does a material misconception.`,
    '',
    `Course page: ${link('/course')}`,
  ].join('\n');
}
```

`src/pages/course.md.ts` and `src/pages/course/certification.md.ts`: prerendered `GET` routes mirroring the existing `.md.ts` pattern (content type `text/markdown; charset=utf-8` or whatever the existing ones use, `attributionFooter` appended), returning `new Response(null, { status: 404 })` while hidden. The course one builds the curriculum from the catalog and passes `priceLine` as `COURSE_STATUS === 'open' ? courseCopy('{{course_price}} · {{access_summary}}') : null`.

- [ ] **Step 4: The llms sections and the OG card**

`src/pages/llms.txt.ts`: after the "Free interactive practice tools" section and before "Optional", when `COURSE_STATUS !== 'hidden'`, a section

```
## Video course (paid)

- The Complete Solution Seeking course (syllabus and access): <site>/course.md
- The certification rubric: <site>/course/certification.md
```

with the same list-line style the file uses. `src/pages/llms-full.txt.ts`: the same two links as a short section after "Practice the system", gated the same way; lesson content is never listed. `src/pages/og/[...route].ts`: a `course/certification` entry (title `CERTIFICATION_TITLE`, description "The six criteria, their weights, the score anchors and the pass rule.") gated exactly like the `course` entry.

- [ ] **Step 5: Verify both modes**

Default (hidden) build: `ls dist/course/` has no `certification` directory, `dist/course.md` does not exist, `grep -c "Video course (paid)" dist/llms.txt` is 0. `PUBLIC_COURSE_STATUS=preview npm run build`: `dist/course/certification/index.html`, `dist/course.md` and `dist/course/certification.md` exist; `grep -c '"@type":"Course"' dist/course/index.html` is 1 and the JSON-LD has no `offers` key; `grep -c "Video course (paid)" dist/llms.txt` is 1; `dist/og/course/certification.png` exists; `grep -c "/course/certification" dist/sitemap-0.xml` is 1; the certification page's HTML contains no em dash and the heading audit from the checklist finds nothing. Run the default build again at the end.

- [ ] **Step 6: Commit**

```bash
grep -n "—" src/pages/course/certification.astro src/pages/course/certification.md.ts src/pages/course.md.ts src/lib/schema.ts src/lib/llms.ts src/pages/llms.txt.ts src/pages/llms-full.txt.ts   # nothing new
unix2dos -q src/pages/course/certification.astro src/pages/course/certification.md.ts src/pages/course.md.ts
git add src/pages/course/certification.astro src/pages/course/certification.md.ts src/pages/course.md.ts src/lib/schema.ts src/pages/course/index.astro src/lib/llms.ts src/pages/llms.txt.ts src/pages/llms-full.txt.ts "src/pages/og/[...route].ts"
git commit -m "Publish the certification rubric, the course JSON-LD and the markdown variants"
```

---

### Task 5: Operator and contributor docs

**Files:**
- Modify: `docs/deployment.md`, `docs/change-checklist.md`, `docs/architecture.md`, `docs/status.md`, `docs/roadmap.md`, `docs/README.md`, `docs/ads-campaign.md`, `docs/content-guide.md`
- Create: `docs/course-production.md`, `docs/features/course/README.md` (the PNGs are already in `docs/features/course/`, placed there by the controller)

**Interfaces:**
- Consumes: the facts below, the plans' execution records (`docs/superpowers/plans/2026-09-0*-course-phase1*.md`, read their "Execution record" and "Carried forward" sections, not the task bodies), the spec's "Video delivery", "Grading job execution", "Offer configuration and launch flag" and "Phase 4" sections, and the code itself when a fact needs checking (`src/lib/course/validate.ts`, `src/lib/course/assessmentForm.ts` `checkForm`, `src/lib/server/course/grader.ts` docblock, `scripts/check-*.mjs` headers).
- Produces: documentation only; no code changes.

Write as a careful colleague explaining the system to David (who operates it) and Bradley (who films and uploads). Read the existing docs first and match their register, heading style and link conventions. New headings never use an em dash or an en dash even where old headings do; say what the section contains. Never type a price, a lesson count or a module count as a bare number in prose that could drift; say "every lesson", "each module", or point at the config. Every internal link is relative and checked to exist.

- [ ] **Step 1: `docs/deployment.md`, a new top-level section "## Paid video course"** (place it before "## Analytics & conversion tracking (GA4 + GTM)"), with these subsections and facts:

- **Launch flag.** `PUBLIC_COURSE_STATUS`: `hidden` (default; public course pages are not built, the nav and footer carry nothing, the learner area at `/course/learn/` still works for granted enrollments, checkout refuses non-admins), `preview` (the sales page, the certification page, the `.md` variants, the llms sections, the nav entry and the home, practice, pricing and FAQ touchpoints appear; no purchase; "Opens soon"), `open` (purchase enabled; the build asserts every launch token in `src/data/course.ts`, `COURSE_PRICE` in `src/data/pricing.ts` and `launchConfirmed`, and refuses a placeholder lesson or an unpublished free lesson). Per context: production stays `hidden` through the pilots; a `course-beta` branch deploy carries `open` with Stripe test keys and a test-mode webhook endpoint. Run both a hidden and a preview build locally when a public course surface changes.
- **Environment variables.** A table with columns Variable, Scope, Secret, What it does, for: `PUBLIC_COURSE_STATUS` (Builds), `STRIPE_PRICE_ID_COURSE` (Functions; the one-time price on the "Solution Seeking Course" product; unset means checkout answers 503), `CLOUDFLARE_STREAM_API_TOKEN` (Functions, secret, Stream-scoped, separate from `CLOUDFLARE_API_TOKEN`), `CLOUDFLARE_ACCOUNT_ID` (Functions), `CLOUDFLARE_STREAM_CUSTOMER_CODE` (Functions; the subdomain code, not a secret), `COURSE_WORKER_SECRET` (Functions, secret; 32 random bytes base64url; the SSR function and the sweeper send it, the worker checks it with a constant-time compare; unset means the worker refuses everything), `COURSE_GRADER_MODE` (Functions; unset means `worker` on Netlify and `inline` under `astro dev`; `off` leaves jobs queued), `COURSE_GRADER_MODEL` (Functions; default `claude-opus-5`), `COURSE_AWARDS_ENABLED` (Functions; exactly `true` to issue certificates; stays `false` until the grader's release gate), `COURSE_SAMPLE_FORMS` (Functions; `true` only on the course-beta context). Also list what the worker needs in Functions scope that already exists for the site: `ANTHROPIC_API_KEY`, `PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `ALERTS_TO`. Netlify provides `URL`, `DEPLOY_PRIME_URL` and `CONTEXT`; the worker trigger uses them to call the running deploy's own function. The combined function environment must stay under about 4 KB.
- **Stripe.** The product and price (test mode first, then live); the webhook endpoint must subscribe to `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed` beside the existing events; the course branch is picked by `metadata.purchase_intent = course` before the org and personal paths; a re-delivered event, a second purchase from another tab and a delivery that died before its ledger row are all safe (one enrollment, one charge, a `duplicate_payment` alert email when it happens). The refund runbook: refund in the Stripe dashboard, then in `/admin`, Enrollments, "Record refund" (access ends, the ledger records it); "Reinstate" restores access; money never moves from the site.
- **Cloudflare Stream.** One video per lesson with "Require signed URLs" on (off only for the free preview lesson), the English captions uploaded on the video, the UID in the lesson file (`streamUid`). The stand-in clip from `scripts/render-placeholder-video.mjs` is uploaded once with signed URLs on and its UID goes in `COURSE.placeholderStreamUid`; every lesson with `videoPlaceholder: true` and no `streamUid` plays it. Playback tokens: one shared 12 hour token per video, cached in `course_stream_tokens`, reused until an hour before expiry, minted with the Stream-scoped token; the per-viewer upgrade path is a Stream signing key (`src/lib/course/streamUrls.ts`). Verify playback on a deploy preview once the UID and the three variables exist.
- **Migrations and advisors.** `supabase/migrations/0030_course.sql` and `0031_course_assessment.sql`; `npx supabase db push`, then `npx supabase migration list`; the advisors run (the dashboard or `npx supabase db advisors --linked`) reports `rls_enabled_no_policy` for each of the twelve course tables, which is the accepted server-write-only pattern (link the existing "Database advisors & accepted findings" section); probe every course table with the publishable key and expect 401 or 403; the two identity sequences and the certificate serial sequence are revoked from the client roles.
- **Grading.** The path: submit writes the attempt and the job in one transaction and triggers the worker; the worker claims the job for a lease, recomputes the submission hash, grades with structured output, validates every quote, applies the decision rule and finalizes with its lock token; a stale token is refused, so a worker that outlived its lease cannot bank a second grade. Time budgets: 300 s per model call, 720 s per grade, an 840 s lease, Netlify's 900 s. The sweeper (`netlify/functions/course-grade-sweeper.mts`, every ten minutes, published deploys only) re-triggers jobs queued for more than 90 s or running past the lease; check the deploy log that the schedule registered. The admin queue (`/admin`, Grading): Retry re-queues a failed job with a fresh budget; Kick re-triggers the worker for any job. A job that fails for good emails `ALERTS_TO` with the job and attempt ids; the learner sees "this is not a failed attempt" and is pointed at course support. Deploy-preview checks: a POST to `/.netlify/functions/course-grade` without the secret leaves the job untouched and logs `course-grade: refused` (the caller always sees 202; that is how background functions answer); with the secret the job finalizes; a preview calls its own function through `DEPLOY_PRIME_URL`. Cost is about thirty cents per grade with a warm cache. During the pilot there is one sample form and one exposure per form per learner, so a learner who does not pass and starts again gets the honest "every form has been used" message; support should expect it until Forms A and B exist.
- **Course access from /admin.** The Enrollments tab: grant by email (the learner creates the account first), Revoke, Record refund, Reinstate; every action writes `course_enrollment_events` with `actor = admin` and the admin's id; the learner sees "Access to the course has ended for this account" on the sales page and the dashboard, and every course endpoint answers 403 with the reason.
- **Analytics registration.** The four places for the course events, pointing at the existing GTM and GA4 subsections for the mechanics: the GTM custom-event trigger regex gains `course_viewed|enrollment_ready|lesson_completed|module_completed|assessment_submitted|grade_ready|grading_error`; GA4 custom dimensions `course_id`, `sale_status`, `lesson_id`, `module_id`, `content_version`, `attempt_id`, `form_id`, `result`; key events `course_enrolled` (already sent server-side by the webhook through the Measurement Protocol) and `assessment_submitted`; the Google Ads import of `course_enrolled` as a secondary conversion until a course campaign exists.
- **Ready-to-open checklist.** The spec's Phase 4 list as checkboxes: every launch token and `launchConfirmed` set and asserted by an `open` build; `COURSE_PRICE` and the live Stripe price; the webhook events; all lessons signed except the preview lesson, captions on all; migrations applied and advisors clean; the voice audit; the four-place analytics done and `course_enrolled` seen in DebugView; one real purchase by David then a refund and the revocation path observed; sitemap and robots verified; the OG cards render; `llms.txt` updated; the support inbox staffed to the review target; `status.md` and the screenshots updated.

- [ ] **Step 2: `docs/change-checklist.md`.** Under "Every change", add `npm test` beside `npm run check` (the course modules have unit tests and Netlify runs them before every build). Under "Database changes", one bullet: the course tables follow the server-write-only pattern and the assessment's state changes go through the SQL functions in `0031`; never add a client policy or a direct write path. Under "New environment variable", one bullet: decide the Netlify scope (Builds, Functions or both) and remember the worker's 4 KB budget. A new section "## Course content and course pages" listing: the catalog validator runs at build and names the file that broke it (the lesson chain, module contiguity, the six sections, the status ladder, the no-dash rule); publishing a lesson walks the status ladder and `contentVersion` is bumped when copy or the master changes after publish (progress is never reset); a lesson without a recording carries `videoPlaceholder: true` and cannot ship while the course is `open`; assessment forms are private: the only reader is `src/lib/server/course/forms.ts`, `npm run check` fails on a second reference or on a worker module importing Astro or env code, and `npm run build` fails if a reveal, a reference response or a later-stage prompt reaches `dist/`; a public course surface needs a hidden build and a preview build; course events follow the four-place analytics rule; update `content-guide.md`, `course-production.md` or `deployment.md` when the authoring format, the production steps or the operations change.

- [ ] **Step 3: `docs/architecture.md`.** In "Routes", the course routes: public (`/course`, `/course/certification`, their `.md` variants, gated by the flag), learner shells (`/course/learn/`, `/course/learn/lessons/[id]/`, `/course/learn/worksheets/[id]/`, `/course/learn/assessment/`, all `noindex`, out of the sitemap, disallowed in robots), the API (`/api/course/{entitlement,checkout,lesson,progress,state,worksheet,assessment}`), `/api/admin/course`, the webhook's course branch, and the two Netlify functions. In "Content model", the four course collections and the catalog validator (`src/lib/course/catalog.ts` is the only reader). A new "### Course delivery" subsection: the shells-plus-islands-plus-bearer-API model (no lesson prose in HTML), the entitlement authority beside `checkEntitlement`, the pure rule modules under `src/lib/course/` with tests versus the bindings under `src/lib/server/course/`, the worker-shared subset and the lint that keeps it bundler-clean, Stream signed tokens, and the assessment data path (frozen snapshots, jobs with lock tokens, the worker and sweeper, the grader's cached prompt, the two guard scripts).

- [ ] **Step 4: `docs/status.md`, `docs/roadmap.md`, `docs/README.md`, `docs/ads-campaign.md`.** `status.md`: update the `_Last updated_` line; in "At a glance" mention the course initiative in the current-phase cell; a new block under "Next up", "### Paid video course (in progress, 4 phases)", with the spec date (2026-09-09), sub-plans 1a to 1e with their dates (1a to 1d on 2026-09-10, 1e today) and one line each, what is pending (the hosted push, the Netlify environment, the pilot, David's Forms A and B, the videos), and Phases 2 to 4 in one line each; close the deferred "Course schema" item if the file lists one. `roadmap.md`: a new phase section headed "## Phase 6: Paid video course _(in progress)_" (no dash in the heading) summarising the four phases from the spec with Phase 1 marked as built pending the ship step. `README.md`: a row for `course-production.md` and a mention that `features/course/` holds the course's visual record. `ads-campaign.md`: a note wherever the negatives are listed that `course` and `certification` come off the negative list at launch.

- [ ] **Step 5: `docs/content-guide.md`, a new section "## Course content (`src/content/course/`)"** covering: the layout (modules YAML, lessons Markdown with the six `##` sections in order, worksheets Markdown, assessment forms JSON); the lesson frontmatter fields and what each status on the ladder requires (from `validate.ts`); the chain rule and module contiguity; `contentVersion`; `preview`; `videoPlaceholder` and the placeholder UID setting; the module checks (`answer` is developer-only and never sent to the browser); worksheets; then "### Assessment forms" with every field of the JSON, the cross-field rules of `checkForm` in plain words (unique ids, the first stage has no reveal, a reveal requires the previous stage to lock, parts in order, every principle and tool covered, a reference response for every required prompt, one anchor per criterion, real lesson ids, no dashes), the status semantics (`active`, `retired`, `sample`) and `order`, `certification_version`, how to add Form A and Form B, and the privacy rules (never reference the collection elsewhere, never render a form field in a page, what the two guards fail on). Point at `sample-p0.json` as the worked example.

- [ ] **Step 6: `docs/course-production.md`** (new, for Bradley): filenames matching lesson ids (`v04.mp4`, `v04.vtt`); the media baseline (1080p, 16:9, H.264 MP4 with AAC stereo, WebVTT captions in English); the Stream upload steps (upload, "Require signed URLs" on except for the free preview lesson, upload the VTT as `en` captions, copy the UID into the lesson file's `streamUid`, set `durationMin` from the master, add the `approvals.edit` and `approvals.captions` stamps in the `YYYY-MM-DD INITIALS` format); the status ladder with who advances each step (David: copy approval and publishing; Bradley: filmed, edited, captioned; staged is David's admin preview); the stand-in clip (render with `scripts/render-placeholder-video.mjs`, upload once with signed URLs, David sets `COURSE.placeholderStreamUid`; swapping in the real recording is a content edit: `streamUid` set, `videoPlaceholder` removed); the poster is the two-second thumbnail; and where to ask when a step fails the build (the validator names the file and the gate).

- [ ] **Step 7: `docs/features/course/README.md`.** The table format of the other feature READMEs (screenshot, what it shows), one row per PNG in the directory, in journey order: the sales page (preview mode, desktop and phone), the dashboard buy state, the dashboard ready state, the dashboard "Start here", the lesson at phone width, the lesson complete, the worksheet print view (desktop and phone), the assessment in part B, the grading-in-progress state, the passed result (desktop and phone), the grading-error state and its dashboard card, the admin grading queue, and whatever Task 7 added (the Enrollments tab, the account menu, the certification page, the home course section). Each caption states what is verified, not how it looks.

- [ ] **Step 8: Gates and commit**

`npm test && npm run check && npm run build` (docs do not affect them, but the checklist says run them). Audit: `grep -n "—" docs/deployment.md docs/change-checklist.md docs/architecture.md docs/status.md docs/roadmap.md docs/README.md docs/ads-campaign.md docs/content-guide.md docs/course-production.md docs/features/course/README.md | grep -v "<pre-existing lines>"`: every hit must be a line you did not write; list the pre-existing ones in the report. Check every relative link you added resolves (`ls` the target).

```bash
unix2dos -q docs/course-production.md docs/features/course/README.md
git add docs/
git commit -m "Document the paid course: operations, authoring, production and the visual record"
```

---

### Task 6: Tidy-ups carried from earlier sub-plans

**Files:**
- Modify: `src/lib/course/progressRules.ts`, `src/lib/course/__tests__/progressRules.test.ts`, `src/pages/og/[...route].ts`, `src/pages/api/stripe-webhook.ts`, `src/components/react/CheckoutBanner.tsx`, `docs/superpowers/specs/2026-09-09-paid-video-course-design.md`

- [ ] **Step 1: Remove `lessonComplete`.** It is exported from `progressRules.ts` and used only by its own tests since 1c ruled that completion means the learner's explicit `completed_at`. Delete the function and its tests; `grep -rn "lessonComplete" src/` must then find nothing. Run `npx vitest run src/lib/course/__tests__/progressRules.test.ts`.

- [ ] **Step 2: Dashes in three comments.** `grep -n "—" "src/pages/og/[...route].ts" src/pages/api/stripe-webhook.ts src/components/react/CheckoutBanner.tsx` lists the lines. Rewrite each sentence so it no longer needs the dash (a full stop and two sentences, or a comma where the clause is a real aside); do not touch any other line. Afterwards the grep prints nothing for these three files.

- [ ] **Step 3: The spec's studied wording.** In the spec, the progress rules table says the learner confirms "I watched the video or studied the transcript"; the island ships "I watched the video or studied this lesson". Change the spec's sentence to the shipped copy so the spec stays the authority (an execution record already notes the amendment).

- [ ] **Step 4: Gates and commit**

`npm test && npm run check && npm run build` green.

```bash
git add src/lib/course/progressRules.ts src/lib/course/__tests__/progressRules.test.ts "src/pages/og/[...route].ts" src/pages/api/stripe-webhook.ts src/components/react/CheckoutBanner.tsx docs/superpowers/specs/2026-09-09-paid-video-course-design.md
git commit -m "Drop the unused completion helper and fix three dashed comments"
```

---

### Task 7: Browser verification (controller)

Run by the controller with the Playwright MCP against the local stack, after Tasks 1 to 4 and 6 and before Task 5 (so the docs task can caption the new screenshots). Screenshots go to `docs/features/course/` with the 1c and 1d PNGs the controller copies in from its scratch directory and `.playwright-mcp/`.

- [ ] **A. Admin Enrollments tab.** Sign in as `course-admin@example.com`, open `/admin`, the Enrollments tab: both accounts listed with emails and status pills; grant `nobody@example.com` → the "No account with that email" message; Revoke the learner → confirm dialog → "Access revoked."; in a second context signed in as the learner, `/course/learn/` shows "Access to the course has ended for this account" and `/course` shows the ended copy; Reinstate → the learner's dashboard is back. Screenshot the tab (`admin-enrollments-1280.png`).
- [ ] **B. Account menu.** The enrolled admin's menu shows "My course" pointing at `/course/learn/` (default hidden mode); a signed-in but not enrolled account (revoke the learner briefly, or use a fresh sign-up) shows no course link in hidden mode. Screenshot (`account-menu-my-course-1280.png`).
- [ ] **C. Preview mode.** Restart the dev server with `PUBLIC_COURSE_STATUS=preview npm run dev`: the nav's Learn group lists "Video course"; the home course section, the practice band, the pricing panel ("Opens soon") and the two FAQ entries render; `/course/certification/` renders the rubric with no em dash; the account menu of the not-enrolled account shows "Explore the course". Screenshots: `home-course-section-1280.png`, `pricing-course-panel-1280.png`, `certification-page-1280.png`, `certification-page-390.png`.
- [ ] **D. Hidden mode again.** Restart without the override: `/course/certification/` is a 404, the nav has no course entry, the learner area still opens for the enrolled account.
- [ ] **E. Grading alert.** With `COURSE_GRADER_MODE=inline` and `COURSE_GRADER_MODEL=no-such-model` in `.env.local`, submit a walk as the learner (the 1d `walk.mjs` script in the scratch directory); the job fails and the dev server log shows either the alert sent or the "failure alert not sent" line naming the unset variables (locally Resend is not configured; the log line is the evidence). Restore the model and clear the attempts.

Clean up: attempts deleted, the learner still enrolled, `.env.local` back to `ADMIN_EMAILS=course-admin@example.com` and the throwaway price, the dev server stopped by PID, the browser closed.

---

### Task 8: Ship (controller, with David)

Nothing in this task runs without David's explicit go-ahead in the conversation; each item names what it changes outside the repo. The controller prepares the commands and the values it can generate, asks once with the list, and executes what David approves.

- [ ] **1. Hosted migrations.** `npx supabase db push` applies `0030_course.sql` and `0031_course_assessment.sql` to the linked project; `npx supabase migration list` shows both; the advisors run (the Supabase MCP `get_advisors` with type `security`, or the dashboard) reports the twelve `rls_enabled_no_policy` findings and nothing else new; a publishable-key probe on each of the twelve tables answers 401 or 403 (a small script with the project URL and the publishable key from `get_publishable_keys`). Record the advisor output in `deployment.md`'s accepted findings.
- [ ] **2. Netlify environment.** Production context: `PUBLIC_COURSE_STATUS=hidden` (Builds), `COURSE_AWARDS_ENABLED=false`, `COURSE_GRADER_MODEL=claude-opus-5`, `COURSE_WORKER_SECRET` (generated with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`, never printed into the transcript beyond the moment it is set), `STRIPE_PRICE_ID_COURSE` (the test price for now, David supplies the live one at launch), `CLOUDFLARE_STREAM_API_TOKEN` and `CLOUDFLARE_STREAM_CUSTOMER_CODE` (David supplies), and the Functions-scope copies of `ANTHROPIC_API_KEY`, `PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `ALERTS_TO` if they are Builds-only today. The Netlify MCP `netlify-project-services-updater` can set them, or David does it in the UI from the table in `deployment.md`. A `course-beta` branch deploy context with `PUBLIC_COURSE_STATUS=open`, `COURSE_SAMPLE_FORMS=true` and the Stripe test keys (branch deploys must be enabled for that branch name).
- [ ] **3. Stripe.** Add `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed` to the hosted webhook endpoint in test mode (and in live mode at launch); the Stripe MCP `stripe_api_write` on the webhook endpoint, or the dashboard.
- [ ] **4. The branch deploy.** Push `course` as `course-beta` (or point the context at `course`), watch the deploy log for the sweeper's schedule registration and the two functions; on the deploy: `/course` open with the test checkout (the 1b walk), a grant from `/admin`, a lesson with the stand-in clip once `COURSE.placeholderStreamUid` is set, a POST to `/.netlify/functions/course-grade` without the secret (the log says refused, the job untouched) and an assessment submission that grades through the real worker with `cache_read_input_tokens` on the second grade; the failure alert email received at `ALERTS_TO` after a deliberate bad-model run if David wants to see it.
- [ ] **5. Production.** Stays `hidden`. When David is satisfied, the branch is merged through PR #15 (the finishing skill's menu: merge locally, PR, or keep).

## Execution record (2026-09-10 to 2026-09-11)

Executed with subagent-driven development: Tasks 1 to 6 in eight commits from `66d4051` to `a22ead0` (Task 1 had one fix round that moved the admin's row update and ledger insert into one SQL function, `admin_change_course_access`, appended to the unpushed `0030`; the plan's three module functions became one `changeCourseAccess` binding over it), the controller's browser pass (Task 7), a whole-branch review and a docs review, and one fix wave of five commits (`781e307` to `b87e11f`) followed by one residual commit from the scoped re-review (`7849f96`). Amendments the reviews forced on this plan, now in the code:

- The grading alert also fires when the claim retires a job whose retry budget is spent (`exhausted` now carries the attempt id and the last error), not only on an in-run failure; its idempotency key is the failing run's lock token (a retirement keys on its date), because an admin retry resets the attempt count, so a retried job that fails again alerts again; the alert's admin link uses the running deploy's own address.
- A refund can follow a revoke (`already_refunded` refuses a second one); Revoke, Record refund and Reinstate ask for a note through the dialog's prompt and every refusal carries a message; the route echoes the module's error code.
- Published rubric numbers (the count of criteria, the caps) are derived from the data file; the JSON-LD workload reads `COURSE.learnerHoursMax`.
- The header's entitlement lookup is shared across the page's mounts and skipped for an anonymous session.
- The docs lost a wrong Stream diagnostic, gained the post-push proof for the course functions, the sixth banned worker import, the second allowed collection reader, the plan lesson's completion assertion returned to the tests, and the placeholder render script's header now matches the shipped rule.

Browser verification (Task 7) on 2026-09-11: the Enrollments tab (grant refusal for an unknown email, revoke with its dialog and notice, the learner's "access has ended" dashboard, reinstate), the account menu ("My course" for an enrolled account in hidden mode, "Explore the course" for a not-enrolled account in preview mode), the preview build's nav entry, home section, practice band, pricing panel, FAQ entries, certification page at both widths, `/course.md` and the llms section, the hidden build's 404s and empty nav, and the alert path's log line when Resend is not configured locally. Screenshots are in `docs/features/course/`.

Carried forward:

1. Task 8 (ship) runs with David: the hosted push of `0030` and `0031` with the post-push function check and a real grant and revoke, the advisors run, the Netlify environment (with `ALERTS_TO` confirmed in Functions scope), the two Stripe async events, the `course-beta` branch context, the deploy-preview checks of the worker and sweeper, production staying hidden.
2. The webhook's enrollment writes are still two statements (`enrollment.ts`); the admin path now has the transactional shape to copy (Phase 2).
3. A repeatable SQL test for the two state-function matrices (a `supabase/snippets/` script) would pay for itself on the next edit.
4. The `course/learn` OG card is built in hidden mode (the learner area works in every mode) and the account menu's chunk carries the "Explore the course" string; neither renders while hidden.
5. `syllabusSections` and `Syllabus` are pending schema.org vocabulary; validators flag them as unknown.
6. A session-scoped entitlement cache would turn the header's request per page load into one per session.
7. `listUsers` paging caps the grant lookup at 5,000 accounts; the enrollment list resolves emails one account at a time.
8. The dev-only React "Invalid hook call" warning noted in 1c on `/dashboard` and `/course/learn` is untouched.

## Handoff

Phase 2 (the content system) consumes the catalog, `LessonNav`, the worksheet route and the dashboard as they stand, and adds `GET/POST /api/course/check` with the `ModuleCheck` island (the `checkId` convention from 1c), the free preview page at `/course/preview/` rendering `LessonSections` at build time once V05 is published, the module-by-module import loop for David's lesson copy and Bradley's masters (the ladder in `docs/course-production.md`), the dashboard's module cards with check status, and the resources page. Phase 3 consumes the assessment data path: Forms A and B and the practice form P1 in the private collection, the `list` and `review` actions, certificates with the verify page, the result and certificate emails keyed `course-result/<job>-<generation>` and `course-certificate/<id>`, the review queue's single `snapshot_private` read, the benchmark script against `grader.ts`, `decision.ts` and `gradeValidation.ts`, and the release gate that flips `COURSE_AWARDS_ENABLED`. Phase 4 consumes the ready-to-open checklist in `deployment.md`.
