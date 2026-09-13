# Course Phase 3b: Certificates and the Verify Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a learner who passed the final assessment their certificate: a page that confirms the name once, prints, and carries an optional verification link; a public page that confirms a shared certificate; the email that says a certificate is ready; and the admin's way to issue a pending one, revoke one, or fix a name.

**Architecture:** Phase 3 is four sub-plans: 3a results, retakes and the result email (done), **3b** (this one), 3c review requests, the review queue and regrades, 3d the grader benchmark and the release gate. 3b adds one migration (`0032`: three columns and two SQL functions beside the frozen `0031`), one learner route (`GET/POST /api/course/certificate`), one island and shell (`/course/learn/certificate/`), one server-rendered public page (`/course/verify/[token]/`), a worker-shared email skeleton that `resultEmail.ts` moves onto and the certificate email joins, and a Certificates tab in `/admin`. Certificates are still issued only by `finalize_course_grade` (awards on) or by the admin; `COURSE_AWARDS_ENABLED` stays off in every hosted context until 3d.

**Tech Stack:** Astro 5 (static-first, `@astrojs/netlify`), React islands, Supabase service role and SQL functions, the Resend SDK, vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-paid-video-course-design.md`, sections "Routes" (the certificate and verify rows), "Data model" (`course_certificates`), "Certificates, verification, reviews, emails, admin (Phase 3 build)", "Security checklist" (share tokens random and inactive by default; the verify page is not an oracle; `noindex` plus `X-Robots-Tag` and no robots Disallow for the verify page), and "Public surfaces" (OG entries for `noindex` pages). The 3a plan's carried item 5 (one claim-then-send skeleton shared by the course emails) is picked up here.

## Global Constraints

- **Nothing we publish reads as though a machine wrote it.** No em dashes or en dashes anywhere in copy, comments, docs, SQL comments or commit messages; fix the sentence, never the character. No counted-pair headings, no list where every item opens the same way, no "delve", no "It's not just X, it's Y". Never type a price or a lesson, module, attempt or character count into prose; derive it from the constant.
- **Line endings.** Every file is CRLF. New files get `unix2dos -q <file>`; existing files are edited with the Edit tool only, never `sed -i`.
- **Learner data stays scoped.** Every certificate read for a learner is by `user_id`; misses are 404, so ids are not probeable. The verify page answers every miss (unknown token, malformed token, sharing off, revoked, name not confirmed) with the same page and the same status. A share token is minted from 24 random bytes, is inactive by default, and never appears in a learner response except inside the full share url while sharing is on.
- **Every `/api/course/*` response goes through `privateJson`**; the certificate route gates with `getUserFromRequest` plus the anonymous check (sign-in and ownership, not enrollment: see Ruling 1); hand-rolled validation; snake_case error codes.
- **The email rules.** Subject "Your certificate is ready"; no score, no quote, no name in the body; the link lands on the certificate page, which asks for sign-in; one email per certificate, keyed `course-certificate/<id>`, with `course_certificates.email_sent_at` as the guard beyond Resend's 24 h idempotency window. `resultEmail.ts` keeps its subject, key and behaviour exactly; its test file is not edited.
- **Worker-shared modules** (`gradingJob.ts`, `jobStore.ts`, `grader.ts`, `gradingAlert.ts`, `resultEmail.ts`, and the new `courseEmail.ts` and `certificateEmail.ts`) import nothing from `astro:content`, `src/lib/server/env.ts`, `supabaseAdmin.ts`, `rateLimit.ts`, `src/data/course.ts`, `src/lib/server/email.ts` or `import.meta.env`; `scripts/check-private-content.mjs` walks the worker's import closure and enforces it. The Netlify function reads its configuration with `Netlify.env.get`; the dev path reads it with `serverEnv`.
- **Tests.** vitest under `src/lib/course/__tests__/**` and `src/lib/server/course/__tests__/**`; pure rules and the email modules get tests; routes, pages and islands are verified with curl, the build and the browser. `npm run check` and `npm test` green before every commit; `npm run build` (hidden mode) green with the dist scan ok before the last one.
- **Commits.** One per task, house voice, ending with the trailer for the model that wrote it: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`, `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` or `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. The `git commit` lines below show the title only.
- **Never** run `npx supabase db push`, `npx supabase db push --linked`, `npx supabase migration up --linked` or `npx supabase db reset`; never print `.env` or `.env.local` values, echo a key or token, or commit a secret; never edit `0030_course.sql` or `0031_course_assessment.sql` (applied to the hosted project and frozen). The new `0032` is applied to the **local** database only, with `npx supabase migration up` (no `--linked`); the hosted apply is David's, before the merge deploys (see Handoff).
- **Spend.** A grade under `astro dev` with `COURSE_GRADER_MODE` unset calls the real model (about thirty cents). Implementers never submit assessments; the controller's two scratch walks (Notes for the controller) create the passes the tasks need.
- **Branch.** `course-phase3b` from `main` after PR #19 (`1fd3796`).

## Shapes in place

- `supabase/migrations/0031_course_assessment.sql`: `course_certificates (id uuid, serial text unique, user_id, certification_version text, attempt_id uuid null, display_name text null, name_confirmed_at timestamptz null, issued_at timestamptz default now(), status 'active' | 'revoked', revoked_at, revoke_reason, share_token text unique null, share_active boolean default false, created_at, updated_at, unique (user_id, certification_version))`; sequence `course_certificate_serial_seq`; `finalize_course_grade` inserts `(serial, user_id, certification_version, attempt_id)` with `on conflict (user_id, certification_version) do nothing` when the attempt passed and `p_awards_enabled`; every function is `security invoker set search_path = ''`, execute revoked from `public, anon, authenticated` and granted to `service_role`; the table has RLS on, no policies, `select, insert, update` to `service_role`.
- `src/data/certification.ts`: `CERTIFICATION_VERSION = '1'`, `CERTIFICATION_TITLE = 'Solution Seeking System Certification'`, `CERTIFICATION_METHOD = 'AI-assessed, unproctored'`, `CRITERIA`, `PASS_TOTAL`, `PASS_MIN_CRITERION`. `src/pages/course/certification.astro` states the meaning sentence inline (lines 122 to 125).
- `src/lib/course/assessmentTypes.ts`: `AssessmentStatus { attempt; job; result; awards_enabled; certificate: null; eligibility; support_contact }` (the `certificate` field is typed as the literal `null` and nothing reads it yet); `CertificationStatus`; `AttemptSummary`, `AssessmentHistory`.
- `src/pages/api/course/assessment.ts`: `statusFor(user, row)` builds `AssessmentStatus` from `Promise.all([...])` and sets `certificate: null`; `eligibility()` uses `attempts.loadAssessmentSummary(user.id).passedCurrent`; helpers `str`, `bad`, `UUID_RE`; every response `privateJson`; errors caught as 503 `assessment_unavailable`.
- `src/lib/server/course/attempts.ts`: `loadAssessmentSummary(userId) -> { latestState; anySubmitted; passedCurrent }`, `loadOwnedAttempt`, `countExposures`.
- `src/lib/server/auth.ts`: `getUserFromRequest(request): Promise<User | null>`, `privateJson(body, status = 200)`. `src/lib/server/adminAuth.ts`: `requireAdmin(request): Promise<User | null>`, `adminJson(body, status = 200)`, `isAdminUser(user)`. Anonymous accounts are refused with `{ error: 'account_required' }` and 403 (`src/pages/api/course/checkout.ts` line 62).
- `src/lib/server/course/workerTrigger.ts`: `workerOrigin(requestOrigin)` (own deploy outside production, else `URL`, else `PUBLIC_CANONICAL_ORIGIN`, else the request origin under `astro dev`, else `''`), `awardsEnabled()`, `graderSettings()`, the inline dev path that runs `runGradingJob` and then sends the failure alert or `notifyLearnerOfResult`.
- `src/lib/server/course/gradingJob.ts`: `GradingJobStore { claim; loadContext; finalize; fail; markResultEmailSent(jobId): Promise<boolean> }`; `RunOutcome` with `{ outcome: 'finalized'; passed; attemptId; userId; generation }`. `src/lib/server/course/jobStore.ts`: `supabaseJobStore(client)`; `markResultEmailSent` is `update ... where result_email_sent_at is null ... select('id')` and returns whether one row changed. `src/lib/server/course/__tests__/gradingJob.test.ts`: `fakeStore(opts)` implements every store method and records calls; adding a method to the interface means adding it there.
- `src/lib/server/course/resultEmail.ts`: `ResultEmailConfig { apiKey; from }`, `ResultNotice { jobId; generation; userId; assessmentUrl }`, `ResultNoticeDeps { emailFor; markSent }`, `resultReadyEmail({ assessmentUrl }) -> { subject; text; html }`, `notifyLearnerOfResult(config, notice, deps)`: config check, then claim, then address, then `new Resend(apiKey).emails.send(payload, { idempotencyKey })`, never throws. Its test (`__tests__/resultEmail.test.ts`) mocks `resend` with `vi.fn().mockImplementation(function () { return { emails: { send } }; })` and asserts the subject, the key `course-result/job-1-1`, the claim-before-lookup order, and the no-config, no-address and rejected-send branches.
- `netlify/functions/course-grade.mts`: `env(name)`, `deployOrigin()`, the `runGradingJob` call, the alert on `failed` or `exhausted`, and after `finalized` the `notifyLearnerOfResult` call with `emailFor` (auth admin `getUserById`) and `markSent: (id) => store.markResultEmailSent(id)`.
- `src/lib/server/email.ts` imports `serverEnv`, so it is Astro-only; the worker-shared email modules duplicate `BRAND` and `INK` on purpose.
- `src/lib/courseClient.ts`: `getJson<T>(accessToken, path)`, `postJson<T>(accessToken, path, body)` (both throw `CourseActionError` with the server's code), `courseErrorMessage(code)` (a switch ending in `assessment_unavailable` then `default`), the type re-export line at the top (`export type { AssessmentHistory, AssessmentStatus, ... } from './course/assessmentTypes'`).
- `src/components/react/AssessmentView.tsx`: `Result({ result, awardsEnabled })` (called at two places with `awardsEnabled={status.awards_enabled}`) shows "Certificates are not being issued yet..." for a pass while awards are off; `ErrorLine({ text })`; the signed-out branch links `accountLink({ next: '/course/learn/assessment/' })` with class `font-semibold text-brand-700 underline`; `useSession()` returns `{ session, loading }`; `track()` from `src/lib/analytics.ts`.
- `src/components/react/CourseDashboard.tsx`: `CertificationPanel({ state })` renders `certificationCopy(state)` and one `btn-primary` link to the assessment page.
- `src/components/react/WorksheetView.tsx`: the print pattern (`window.print()` in a `no-print` toolbar, the sheet as `print-sheet`); `src/styles/global.css` has one `@media print` block hiding `header, footer, nav, .no-print` and flattening `.print-sheet` and `.container-page`; `.btn-primary`, `.btn-secondary`, `.eyebrow` exist.
- `src/components/react/AdminView.tsx`: `type Tab`, the `tabs` array, `call(path, body?)` (GET or POST to `/api/admin/<path>`; sets `error`; returns the JSON or null), `loadTab(which)` with `course?view=grading|enrollments|content` branches, `setNotice`, `GradingTab({ rows, onAction })` as the table pattern (`px-5 py-2.5` cells, learner ids shown as `user_id.slice(0, 8)` in mono), `EnrollmentsTab` as the form-plus-`act`-plus-`reload` pattern, `useDialog().prompt(opts)` (`PromptOptions { title; message?; label?; defaultValue?; placeholder?; maxLength?; confirmLabel?; cancelLabel? }` resolving to `string | null`).
- `src/pages/api/admin/course.ts`: `GET` branches on `view` (`enrollments`, `content`, else `grading`, with `if (view !== 'grading') return deny('invalid', 400)` before the grading query); `POST` reads `body.action`, `UUID_RE`, `deny(error, status)` mapping through a `MESSAGES` record, `origin = new URL(request.url).origin`, `findUserByEmail` and `changeCourseAccess` from `adminEnrollment.ts`. `src/lib/server/course/adminEnrollment.ts` shows the module shape for admin work.
- `src/pages/og/[...route].ts`: one-URL learner pages are registered by hand beside `'course/learn/assessment'` (outside the `COURSE_STATUS !== 'hidden'` block); `src/layouts/BaseLayout.astro` derives `/og/<path>.png` from the pathname unless `ogImage` is passed, and accepts `noindex`.
- `astro.config.mjs` excludes `/course/learn` from the sitemap; `src/pages/robots.txt.ts` disallows `/course/learn` and nothing else under `/course`. Server-rendered pages never enter the sitemap.
- `src/pages/a/[org]/[slug].astro`: the server-rendered precedent (`export const prerender = false`, a service-role lookup in frontmatter).
- `scripts/check-private-content.mjs`: rule 3 seeds the walk from `netlify/functions/*.mts` and `gradingJob.ts`, follows relative imports, and fails on the forbidden imports; it prints how many worker-reachable modules it checked.
- Local test setup: the local Supabase stack; `course-admin@example.com` (admin, enrolled) and `course-learner@example.com` (enrolled), password `course-test-password-1`; the dev server binds 4321; `.env.local` holds `ADMIN_EMAILS=course-admin@example.com` and a test `STRIPE_PRICE_ID_COURSE`; a bearer comes from the password grant against `http://127.0.0.1:55321` with the anon key from `npx supabase status -o env` (kept in a shell variable, never printed); `docker exec -i supabase_db_SolutionSeekingSystem psql -U postgres -d postgres -c "..."` for SQL; Resend is not configured locally, so every email path logs "not sent" and returns false, which is the expected local outcome.

## Rulings

1. **Certificate access needs sign-in and ownership, not enrollment.** A certificate is earned and outlives the access that earned it (access can end; the credential should not vanish with it), so `/api/course/certificate` and the certificate page use `getUserFromRequest` plus the anonymous check and read by `user_id`. An account whose access was revoked for cause gets its certificate revoked by the admin, which is a separate act. Cost if wrong: a refunded learner keeps reading a page that shows only their own certificate.
2. **The name is confirmed once, by the learner.** A second confirmation is refused (409 `name_already_confirmed`); a typo is fixed by the admin's rename action, which the spec does not list and this plan adds because the alternative is an operator editing a server-write-only table by hand. Cost if wrong: a learner writes to support for a typo instead of fixing it alone.
3. **Sharing needs a confirmed name and an active certificate.** The token is minted the first time sharing turns on and kept when it turns off, so turning it on again restores the same link. The verify lookup requires `share_active`, `status = 'active'` and a confirmed name. Cost if wrong: none; these are the spec's rules made explicit.
4. **Revoking touches nothing but the revoke columns.** The verify lookup's `status = 'active'` condition makes a shared link go dark the moment the revoke commits; the learner's page shows the revoked state and no share controls. There is no reinstatement in 3b. Cost if wrong: a wrongly revoked certificate is reissued through support later.
5. **The verify page is not gated on `PUBLIC_COURSE_STATUS`** and lives outside `/course/learn`. A link printed on paper must resolve whatever the sales page is doing, and the page shows nothing a miss could learn from. A database failure renders a distinct "unavailable" page with status 503, which does not depend on the token and so leaks nothing. Cost if wrong: a verify link works in a context nobody expected, showing four public facts.
6. **The serial expression lives in two SQL functions.** `finalize_course_grade` (frozen in `0031`) and `issue_course_certificate` (new) both build `SSS-YYYY-NNNNN` from the same sequence; a shared helper would mean replacing the frozen function. Cost if wrong: one expression to keep aligned if the format ever changes.
7. **The certificate email is sent from three places through one skeleton.** The worker and the inline dev path send it after a pass when `finalize_course_grade` issued a certificate (found by `attempt_id`), and the admin's Issue action sends it when it issued one. `courseEmail.ts` holds the claim-then-send skeleton and the one-paragraph-one-button template; `resultEmail.ts` moves onto it with its subject, key and tests unchanged. The spec's `courseEmail.ts` in `src/lib/server/` reusing `email.ts` helpers cannot hold, because `email.ts` imports `env.ts` and the worker's import closure forbids that. Cost if wrong: a second copy of forty lines.
8. **`certificate_issued` fires from the browser, once, when the learner confirms the name**, with no parameters (so no new GA4 dimension), and is added to the deployment doc's event registration list. The email is the server-side notification. Cost if wrong: a Phase 4 task moves it server-side.
9. **The dashboard's pass state gets a second link** to the certificate page, and the assessment page's pass result points there too; neither needs a new field in the state payload, because the certificate page explains every state itself. Cost if wrong: one extra click for a learner whose certificate is not issued yet.
10. **The learner's own view carries the share url only while sharing is on.** The token is never returned on its own; the admin tab shows whether sharing is on, never the token or the url. Cost if wrong: none.

---

### Task 1: Migration 0032, the certificate rules, and the shared types

**Files:**
- Create: `supabase/migrations/0032_course_certificates.sql`
- Create: `src/lib/course/certificateRules.ts`
- Create: `src/lib/course/__tests__/certificateRules.test.ts`
- Modify: `src/lib/course/assessmentTypes.ts` (the certificate types; `certificate: CertificateSummary | null`)
- Modify: `src/data/certification.ts` (add `CERTIFICATION_MEANING`), `src/pages/course/certification.astro` (render it), `src/lib/course/__tests__/certification.test.ts` (one assertion)

**Interfaces:**
- Consumes: `course_certificates` and `course_certificate_serial_seq` from `0031`; `hasBannedCopy` from `src/lib/course/ids.ts`.
- Produces: SQL `issue_course_certificate(p_attempt uuid, p_admin uuid) -> jsonb {outcome: 'not_found' | 'not_passed' | 'already_issued' | 'issued', certificate_id?, serial?}` and `revoke_course_certificate(p_certificate uuid, p_admin uuid, p_reason text) -> jsonb {outcome: 'not_found' | 'already_revoked' | 'revoked'}`; columns `email_sent_at`, `issued_by`, `revoked_by`; TypeScript `CertificateStatus`, `CertificateSummary`, `CertificateRecord`, `CertificatePayload`, `PublicCertificate`; `DISPLAY_NAME_MAX`, `SHARE_TOKEN_BYTES`, `SHARE_TOKEN_RE`, `normalizeDisplayName`, `certificateVerifyPath`, `certificateShareUrl`, `CertificateRowLike`, `certificateSummary`, `certificateRecord`; `CERTIFICATION_MEANING`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0032_course_certificates.sql`:

```sql
-- Certificates: what the certificate page, the verify page and the admin tab
-- need beyond 0031. That migration created the table, and its
-- finalize_course_grade issues a certificate when a passed attempt is graded
-- with awards on. This one adds the admin's way to issue one for a pass that
-- was recorded while awards were off, the way to revoke one, and the claim
-- column for the certificate email. Same rules as 0030 and 0031: RLS on, no
-- policies, service_role only, security invoker, empty search_path. 0030 and
-- 0031 are frozen; nothing here edits them.

alter table public.course_certificates
  add column if not exists email_sent_at timestamptz,
  add column if not exists issued_by uuid references auth.users (id) on delete set null,
  add column if not exists revoked_by uuid references auth.users (id) on delete set null;

comment on column public.course_certificates.email_sent_at is
  'Claimed by the sender before the certificate email goes out: the guard that outlives the Resend idempotency window.';
comment on column public.course_certificates.issued_by is
  'The admin who issued it by hand; null when finalize_course_grade issued it.';
comment on column public.course_certificates.revoked_by is
  'The admin who revoked it.';

/*
 * Issue a certificate for a passed attempt by hand: the path for a pass that
 * was recorded while COURSE_AWARDS_ENABLED was off. The attempt row lock
 * serialises two admins pressing Issue at once, and the unique (user, version)
 * constraint makes a race with finalize_course_grade harmless. The serial
 * format matches finalize_course_grade in 0031, which is frozen, so the
 * expression lives in both places on purpose.
 */
create or replace function public.issue_course_certificate(p_attempt uuid, p_admin uuid)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_attempt public.course_assessment_attempts%rowtype;
  v_id uuid;
  v_serial text;
begin
  select * into v_attempt from public.course_assessment_attempts where id = p_attempt for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_attempt.state <> 'passed' then
    return jsonb_build_object('outcome', 'not_passed');
  end if;
  select id into v_id from public.course_certificates
    where user_id = v_attempt.user_id and certification_version = v_attempt.certification_version;
  if v_id is not null then
    return jsonb_build_object('outcome', 'already_issued', 'certificate_id', v_id);
  end if;
  v_serial := 'SSS-' || to_char(now(), 'YYYY') || '-'
    || lpad(nextval('public.course_certificate_serial_seq')::text, 5, '0');
  insert into public.course_certificates (serial, user_id, certification_version, attempt_id, issued_by)
    values (v_serial, v_attempt.user_id, v_attempt.certification_version, v_attempt.id, p_admin)
    on conflict (user_id, certification_version) do nothing
    returning id into v_id;
  if v_id is null then
    select id into v_id from public.course_certificates
      where user_id = v_attempt.user_id and certification_version = v_attempt.certification_version;
    return jsonb_build_object('outcome', 'already_issued', 'certificate_id', v_id);
  end if;
  return jsonb_build_object('outcome', 'issued', 'certificate_id', v_id, 'serial', v_serial);
end $$;

/*
 * Revoke: the status, the time, the reason and who did it. The sharing
 * columns are left alone; the verify lookup requires status = 'active', so a
 * shared link goes dark the moment this commits, and the learner's page
 * shows the revoked state.
 */
create or replace function public.revoke_course_certificate(p_certificate uuid, p_admin uuid, p_reason text)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_cert public.course_certificates%rowtype;
begin
  select * into v_cert from public.course_certificates where id = p_certificate for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_cert.status = 'revoked' then
    return jsonb_build_object('outcome', 'already_revoked');
  end if;
  update public.course_certificates
    set status = 'revoked', revoked_at = now(), revoke_reason = p_reason, revoked_by = p_admin
    where id = p_certificate;
  return jsonb_build_object('outcome', 'revoked');
end $$;

-- The service role is the only caller (the 0006 pattern).
revoke execute on function public.issue_course_certificate(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.issue_course_certificate(uuid, uuid) to service_role;
revoke execute on function public.revoke_course_certificate(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.revoke_course_certificate(uuid, uuid, text) to service_role;
```

- [ ] **Step 2: Apply it to the local database and prove the functions**

Run: `npx supabase migration up` (local only; never `--linked`).
Expected: the CLI applies `0032_course_certificates.sql` and `npx supabase migration list` shows `0032` under Local.

If the CLI refuses (for example the local history is out of step), apply the file by hand and record it:

```bash
docker exec -i supabase_db_SolutionSeekingSystem psql -U postgres -d postgres < supabase/migrations/0032_course_certificates.sql
docker exec -i supabase_db_SolutionSeekingSystem psql -U postgres -d postgres -c "insert into supabase_migrations.schema_migrations (version, name) values ('0032', 'course_certificates') on conflict do nothing;"
```

Then prove the outcomes that need no data:

```bash
docker exec -i supabase_db_SolutionSeekingSystem psql -U postgres -d postgres -At -c "select proname from pg_proc where proname in ('issue_course_certificate', 'revoke_course_certificate') order by 1;"
docker exec -i supabase_db_SolutionSeekingSystem psql -U postgres -d postgres -At -c "select public.issue_course_certificate('00000000-0000-0000-0000-000000000000', null);"
docker exec -i supabase_db_SolutionSeekingSystem psql -U postgres -d postgres -At -c "select public.revoke_course_certificate('00000000-0000-0000-0000-000000000000', null, 'test');"
docker exec -i supabase_db_SolutionSeekingSystem psql -U postgres -d postgres -At -c "select public.issue_course_certificate((select id from public.course_assessment_attempts where state = 'needs_revision' limit 1), null);"
docker exec -i supabase_db_SolutionSeekingSystem psql -U postgres -d postgres -At -c "select column_name from information_schema.columns where table_name = 'course_certificates' and column_name in ('email_sent_at', 'issued_by', 'revoked_by') order by 1;"
```

Expected, in order: both function names; `{"outcome": "not_found"}`; `{"outcome": "not_found"}`; `{"outcome": "not_passed"}`; the three column names. Do not call `issue_course_certificate` on a passed attempt in this task; the controller does that deliberately before Task 2.

- [ ] **Step 3: Write the failing rules test**

Create `src/lib/course/__tests__/certificateRules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DISPLAY_NAME_MAX, SHARE_TOKEN_RE, certificateRecord, certificateShareUrl, certificateSummary, normalizeDisplayName } from '../certificateRules';

const token = 'a'.repeat(32);
const row = {
  id: 'c1',
  serial: 'SSS-2026-00001',
  certification_version: '1',
  display_name: 'Ada Lovelace',
  name_confirmed_at: '2026-09-12T10:00:00Z',
  issued_at: '2026-09-12T09:00:00Z',
  status: 'active' as const,
  revoked_at: null,
  share_token: token,
  share_active: true,
};

describe('normalizeDisplayName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeDisplayName('  Ada   Lovelace ')).toBe('Ada Lovelace');
  });
  it('keeps hyphens, apostrophes and accents', () => {
    expect(normalizeDisplayName("Zoë O'Brien-Núñez")).toBe("Zoë O'Brien-Núñez");
  });
  it('refuses empty, overlong, letterless and unprintable names', () => {
    expect(normalizeDisplayName('   ')).toBeNull();
    expect(normalizeDisplayName('a'.repeat(DISPLAY_NAME_MAX + 1))).toBeNull();
    expect(normalizeDisplayName('a'.repeat(DISPLAY_NAME_MAX))).toHaveLength(DISPLAY_NAME_MAX);
    expect(normalizeDisplayName('12345')).toBeNull();
    expect(normalizeDisplayName('Ada' + String.fromCharCode(7) + 'Lovelace')).toBeNull();
    expect(normalizeDisplayName('Ada ' + String.fromCharCode(0x2014) + ' Lovelace')).toBeNull();
    expect(normalizeDisplayName('<Ada>')).toBeNull();
  });
});

describe('share tokens and urls', () => {
  it('accepts 32 base64url characters and nothing else', () => {
    expect(SHARE_TOKEN_RE.test('A-Za-z0-9_-'.padEnd(32, 'x'))).toBe(true);
    expect(SHARE_TOKEN_RE.test('x'.repeat(31))).toBe(false);
    expect(SHARE_TOKEN_RE.test('x'.repeat(31) + '=')).toBe(false);
    expect(SHARE_TOKEN_RE.test('x'.repeat(31) + '/')).toBe(false);
  });
  it('joins the origin and the verify path without a double slash', () => {
    expect(certificateShareUrl('https://solutionseeking.com/', 'tok')).toBe('https://solutionseeking.com/course/verify/tok/');
    expect(certificateShareUrl('http://localhost:4321', 'tok')).toBe('http://localhost:4321/course/verify/tok/');
  });
});

describe('views', () => {
  it('summarises whether the name is confirmed', () => {
    expect(certificateSummary(row)).toEqual({ id: 'c1', serial: 'SSS-2026-00001', status: 'active', name_confirmed: true, issued_at: row.issued_at });
    expect(certificateSummary({ ...row, name_confirmed_at: null }).name_confirmed).toBe(false);
  });
  it('carries the share url only while sharing is on, and never the bare token', () => {
    expect(certificateRecord(row, 'https://example.com').share_url).toBe(`https://example.com/course/verify/${token}/`);
    const off = certificateRecord({ ...row, share_active: false }, 'https://example.com');
    expect(off.share_url).toBeNull();
    expect(JSON.stringify(off)).not.toContain(token);
    expect(Object.keys(off)).not.toContain('share_token');
  });
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `npx vitest run src/lib/course/__tests__/certificateRules.test.ts`
Expected: FAIL, the module `../certificateRules` cannot be found.

- [ ] **Step 5: Add the types**

In `src/lib/course/assessmentTypes.ts`, change the `AssessmentStatus` line so the field reads `certificate: CertificateSummary | null;` and append after the `AssessmentHistory` interface:

```ts
export type CertificateStatus = 'active' | 'revoked';

/** What the assessment page needs in order to point at the certificate page. */
export interface CertificateSummary {
  id: string;
  serial: string;
  status: CertificateStatus;
  name_confirmed: boolean;
  issued_at: string;
}

/** The learner's own certificate, as the certificate page shows it. The share url is present only while sharing is on. */
export interface CertificateRecord {
  id: string;
  serial: string;
  certification_version: string;
  display_name: string | null;
  name_confirmed_at: string | null;
  issued_at: string;
  status: CertificateStatus;
  revoked_at: string | null;
  share_active: boolean;
  share_url: string | null;
}

/** GET /api/course/certificate: the certificate, or null with the facts the page needs to say why. */
export interface CertificatePayload {
  certificate: CertificateRecord | null;
  awards_enabled: boolean;
  passed_current: boolean;
  certification_version: string;
}

/** What the verify page shows: an active, shared certificate with a confirmed name, and nothing else. */
export interface PublicCertificate {
  display_name: string;
  serial: string;
  certification_version: string;
  issued_at: string;
}
```

`src/pages/api/course/assessment.ts` keeps compiling: its `certificate: null` satisfies the widened type until Task 2 fills it.

- [ ] **Step 6: Write the rules module**

Create `src/lib/course/certificateRules.ts`:

```ts
/**
 * Pure certificate rules shared by the API, the islands and the verify page:
 * the display name a learner may put on a certificate, the shape of a share
 * token, and the learner-facing views built from a row. Nothing here reads
 * the environment or the database.
 */

import type { CertificateRecord, CertificateStatus, CertificateSummary } from './assessmentTypes';

export const DISPLAY_NAME_MAX = 80;
/** 24 random bytes as base64url: 32 characters, no padding. */
export const SHARE_TOKEN_BYTES = 24;
export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

/** Control characters, the C0 and C1 ranges. */
const CONTROL_RE = /\p{Cc}/u;
/** The em dash, the en dash, template braces and angle brackets: the verify page prints the name, and the copy rules apply to it. Built from code points so the source carries no dash. */
const BANNED_RE = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}{}<>]`);
const LETTER_RE = /\p{L}/u;

/**
 * The name as it will print: trimmed, inner whitespace collapsed to one space.
 * Null when empty, longer than DISPLAY_NAME_MAX, without a letter, or carrying
 * a control character or a banned character.
 */
export function normalizeDisplayName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name || name.length > DISPLAY_NAME_MAX) return null;
  if (CONTROL_RE.test(name) || BANNED_RE.test(name) || !LETTER_RE.test(name)) return null;
  return name;
}

export const certificateVerifyPath = (token: string): string => `/course/verify/${token}/`;

export function certificateShareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}${certificateVerifyPath(token)}`;
}

/** The columns the views need; the server's row type carries more. */
export interface CertificateRowLike {
  id: string;
  serial: string;
  certification_version: string;
  display_name: string | null;
  name_confirmed_at: string | null;
  issued_at: string;
  status: CertificateStatus;
  revoked_at: string | null;
  share_token: string | null;
  share_active: boolean;
}

export function certificateSummary(row: CertificateRowLike): CertificateSummary {
  return { id: row.id, serial: row.serial, status: row.status, name_confirmed: row.name_confirmed_at !== null, issued_at: row.issued_at };
}

/** The learner's own view. The token travels only inside the full share url, and only while sharing is on. */
export function certificateRecord(row: CertificateRowLike, origin: string): CertificateRecord {
  return {
    id: row.id,
    serial: row.serial,
    certification_version: row.certification_version,
    display_name: row.display_name,
    name_confirmed_at: row.name_confirmed_at,
    issued_at: row.issued_at,
    status: row.status,
    revoked_at: row.revoked_at,
    share_active: row.share_active,
    share_url: row.share_active && row.share_token ? certificateShareUrl(origin, row.share_token) : null,
  };
}
```

- [ ] **Step 7: Run the test to see it pass**

Run: `npx vitest run src/lib/course/__tests__/certificateRules.test.ts`
Expected: PASS, every test green.

- [ ] **Step 8: Hoist the meaning sentence**

In `src/data/certification.ts`, after the `CERTIFICATION_METHOD` line add:

```ts
/** The one sentence that says what the credential is and is not. Printed on the certificate, the verify page and the certification page, from here, so they cannot disagree. */
export const CERTIFICATION_MEANING =
  'An AI-assessed course credential earned on supplied scenarios. It is not an accreditation and does not verify live behaviour.';
```

In `src/pages/course/certification.astro`, import `CERTIFICATION_MEANING` beside the existing certification imports and replace the two-line inline sentence inside the "What the certification means" paragraph (the `<p class="mt-4 text-slate-600">` whose text begins "An AI-assessed course credential") with `{CERTIFICATION_MEANING}`.

In `src/lib/course/__tests__/certification.test.ts`, add one test beside the existing ones (import `CERTIFICATION_MEANING` from `../../../data/certification` and `hasBannedCopy` from `../ids`):

```ts
it('states the meaning of the credential in house copy', () => {
  expect(CERTIFICATION_MEANING).toMatch(/AI-assessed/);
  expect(hasBannedCopy(CERTIFICATION_MEANING)).toBe(false);
});
```

- [ ] **Step 9: Run every gate**

Run: `npm test && npm run check`
Expected: every test green; `astro check` reports 0 errors; the guard prints its ok line.

- [ ] **Step 10: CRLF and commit**

Run: `unix2dos -q supabase/migrations/0032_course_certificates.sql src/lib/course/certificateRules.ts src/lib/course/__tests__/certificateRules.test.ts`

```bash
git add supabase/migrations/0032_course_certificates.sql src/lib/course/certificateRules.ts src/lib/course/__tests__/certificateRules.test.ts src/lib/course/assessmentTypes.ts src/data/certification.ts src/pages/course/certification.astro src/lib/course/__tests__/certification.test.ts
git commit -m "Add the certificate migration, its pure rules and the shared types"
```

---

### Task 2: The certificate module, `/api/course/certificate`, the client calls and the status link

**Files:**
- Create: `src/lib/server/course/certificates.ts`
- Create: `src/pages/api/course/certificate.ts`
- Modify: `src/lib/courseClient.ts` (type re-exports, three calls, five error messages)
- Modify: `src/pages/api/course/assessment.ts` (`statusFor` fills `certificate`)

**Interfaces:**
- Consumes: Task 1's types and rules; `supabaseAdmin`; `workerOrigin` from `workerTrigger.ts`; `loadAssessmentSummary` from `attempts.ts`; `getUserFromRequest`, `privateJson`; `awardsEnabled`.
- Produces: `CERTIFICATE_COLUMNS`, `CertificateRow`, `certificateOrigin(requestOrigin)`, `loadOwnedCertificate(userId, version?)`, `confirmCertificateName(id, userId, name)`, `mintShareToken()`, `setCertificateSharing(row, active)`, `lookupSharedCertificate(token)`; the route `GET /api/course/certificate -> CertificatePayload` and `POST { action: 'confirm_name', name } | { action: 'share', active }` -> `CertificatePayload`; client `fetchCertificate(token)`, `confirmCertificateName(token, name)`, `setCertificateSharing(token, active)`; `AssessmentStatus.certificate` carries the learner's `CertificateSummary`.

The controller has issued a certificate for `course-admin@example.com` before this task starts (Notes for the controller), so the curl checks below have a real row.

- [ ] **Step 1: Write the server module**

Create `src/lib/server/course/certificates.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { supabaseAdmin } from '../supabaseAdmin';
import { COURSE } from '../../../data/course';
import { SHARE_TOKEN_BYTES, type CertificateRowLike } from '../../course/certificateRules';
import type { PublicCertificate } from '../../course/assessmentTypes';
import { workerOrigin } from './workerTrigger';

/**
 * The learner's certificate: one row per (user, certification version),
 * written by finalize_course_grade or issue_course_certificate and read here
 * by user id, so a certificate id on its own opens nothing. The share token is
 * minted the first time sharing turns on and kept when it turns off, so
 * turning it on again restores the same link. Every function throws with a
 * prefix on a database error; the route answers 503.
 */

export const CERTIFICATE_COLUMNS =
  'id, serial, user_id, certification_version, attempt_id, display_name, name_confirmed_at, issued_at, status, revoked_at, revoke_reason, share_token, share_active, email_sent_at, issued_by, revoked_by, created_at, updated_at' as const;

export interface CertificateRow extends CertificateRowLike {
  user_id: string;
  attempt_id: string | null;
  revoke_reason: string | null;
  email_sent_at: string | null;
  issued_by: string | null;
  revoked_by: string | null;
  created_at: string;
  updated_at: string;
}

const asRow = (data: unknown): CertificateRow => data as CertificateRow;

/** Where share links and email links point: the deploy that is serving, production's own address in production. */
export const certificateOrigin = (requestOrigin: string): string => workerOrigin(requestOrigin) || requestOrigin;

export async function loadOwnedCertificate(userId: string, version: string = COURSE.certificationVersion): Promise<CertificateRow | null> {
  const { data, error } = await supabaseAdmin
    .from('course_certificates')
    .select(CERTIFICATE_COLUMNS)
    .eq('user_id', userId)
    .eq('certification_version', version)
    .maybeSingle();
  if (error) throw new Error(`certificate load failed: ${error.message}`);
  return data ? asRow(data) : null;
}

/**
 * Sets the name once: a compare-and-set on name_confirmed_at. Null when the
 * row is not this learner's, is revoked, or already has a confirmed name.
 */
export async function confirmCertificateName(id: string, userId: string, name: string): Promise<CertificateRow | null> {
  const { data, error } = await supabaseAdmin
    .from('course_certificates')
    .update({ display_name: name, name_confirmed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('name_confirmed_at', null)
    .select(CERTIFICATE_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`certificate name failed: ${error.message}`);
  return data ? asRow(data) : null;
}

export const mintShareToken = (): string => randomBytes(SHARE_TOKEN_BYTES).toString('base64url');

/**
 * Turns sharing on or off. The caller has checked that the row is active with
 * a confirmed name; null when the row is no longer this learner's active
 * certificate.
 */
export async function setCertificateSharing(row: CertificateRow, active: boolean): Promise<CertificateRow | null> {
  const token = row.share_token ?? mintShareToken();
  const { data, error } = await supabaseAdmin
    .from('course_certificates')
    .update({ share_token: token, share_active: active })
    .eq('id', row.id)
    .eq('user_id', row.user_id)
    .eq('status', 'active')
    .select(CERTIFICATE_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`certificate sharing failed: ${error.message}`);
  return data ? asRow(data) : null;
}

/**
 * The verify page's lookup: active, shared, with a confirmed name. Anything
 * else is null, and the page treats every null the same way.
 */
export async function lookupSharedCertificate(token: string): Promise<PublicCertificate | null> {
  const { data, error } = await supabaseAdmin
    .from('course_certificates')
    .select('display_name, serial, certification_version, issued_at')
    .eq('share_token', token)
    .eq('share_active', true)
    .eq('status', 'active')
    .not('name_confirmed_at', 'is', null)
    .maybeSingle();
  if (error) throw new Error(`certificate lookup failed: ${error.message}`);
  if (!data || !data.display_name) return null;
  return { display_name: data.display_name, serial: data.serial, certification_version: data.certification_version, issued_at: data.issued_at };
}
```

- [ ] **Step 2: Write the route**

Create `src/pages/api/course/certificate.ts`:

```ts
import type { APIRoute } from 'astro';
import type { User } from '@supabase/supabase-js';
import { COURSE } from '../../../data/course';
import { getUserFromRequest, privateJson } from '../../../lib/server/auth';
import { awardsEnabled } from '../../../lib/server/course/workerTrigger';
import { loadAssessmentSummary } from '../../../lib/server/course/attempts';
import { certificateOrigin, confirmCertificateName, loadOwnedCertificate, setCertificateSharing } from '../../../lib/server/course/certificates';
import { certificateRecord, normalizeDisplayName } from '../../../lib/course/certificateRules';
import type { CertificatePayload } from '../../../lib/course/assessmentTypes';

export const prerender = false;

/**
 * The learner's certificate. Sign-in and ownership, not enrollment: a
 * certificate is earned, and it outlives the access that earned it. Every
 * response is no-store. GET returns the certificate, or null with the facts
 * the page needs to say why; POST confirms the name once, or turns sharing
 * on and off.
 */
const ACTIONS = ['confirm_name', 'share'] as const;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const bad = (field: string) => privateJson({ error: 'bad_request', field }, 400);

async function requireAccount(request: Request): Promise<User | Response> {
  const user = await getUserFromRequest(request);
  if (!user) return privateJson({ error: 'unauthorized' }, 401);
  if (user.is_anonymous) return privateJson({ error: 'account_required' }, 403);
  return user;
}

async function payloadFor(user: User, origin: string): Promise<CertificatePayload> {
  const [row, summary] = await Promise.all([loadOwnedCertificate(user.id), loadAssessmentSummary(user.id)]);
  return {
    certificate: row ? certificateRecord(row, origin) : null,
    awards_enabled: awardsEnabled(),
    passed_current: summary.passedCurrent,
    certification_version: COURSE.certificationVersion,
  };
}

export const GET: APIRoute = async ({ request }) => {
  const user = await requireAccount(request);
  if (user instanceof Response) return user;
  try {
    return privateJson(await payloadFor(user, certificateOrigin(new URL(request.url).origin)));
  } catch (err) {
    console.error('course certificate failed', err);
    return privateJson({ error: 'certificate_unavailable' }, 503);
  }
};

export const POST: APIRoute = async ({ request }) => {
  const user = await requireAccount(request);
  if (user instanceof Response) return user;
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const action = str(body.action);
  if (!(ACTIONS as readonly string[]).includes(action)) return bad('action');
  const origin = certificateOrigin(new URL(request.url).origin);
  try {
    const row = await loadOwnedCertificate(user.id);
    if (!row) return privateJson({ error: 'no_certificate' }, 404);
    if (row.status === 'revoked') return privateJson({ error: 'certificate_revoked' }, 409);
    if (action === 'confirm_name') {
      const name = normalizeDisplayName(str(body.name));
      if (!name) return bad('name');
      if (row.name_confirmed_at) return privateJson({ error: 'name_already_confirmed' }, 409);
      const updated = await confirmCertificateName(row.id, user.id, name);
      if (!updated) return privateJson({ error: 'name_already_confirmed' }, 409);
      return privateJson(await payloadFor(user, origin));
    }
    if (typeof body.active !== 'boolean') return bad('active');
    if (!row.name_confirmed_at) return privateJson({ error: 'name_required' }, 409);
    const updated = await setCertificateSharing(row, body.active);
    if (!updated) return privateJson({ error: 'certificate_revoked' }, 409);
    return privateJson(await payloadFor(user, origin));
  } catch (err) {
    console.error('course certificate action failed', err);
    return privateJson({ error: 'certificate_unavailable' }, 503);
  }
};
```

- [ ] **Step 3: Add the client calls and copy**

In `src/lib/courseClient.ts`:

1. Extend the type re-export line at the top with `CertificatePayload, CertificateRecord, CertificateSummary` (keep the list alphabetical).
2. In `courseErrorMessage`, before `case 'assessment_unavailable':`, add:

```ts
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
```

3. After the `listAttempts` export at the end of the assessment section, add:

```ts
/** The learner's certificate page: GET the record, confirm the name once, or turn the verification link on and off. */
export const fetchCertificate = (accessToken: string): Promise<CertificatePayload> => getJson(accessToken, '/api/course/certificate');
export const confirmCertificateName = (accessToken: string, name: string): Promise<CertificatePayload> =>
  postJson(accessToken, '/api/course/certificate', { action: 'confirm_name', name });
export const setCertificateSharing = (accessToken: string, active: boolean): Promise<CertificatePayload> =>
  postJson(accessToken, '/api/course/certificate', { action: 'share', active });
```

`CertificatePayload` needs importing as a type for these signatures: add `import type { CertificatePayload } from './course/assessmentTypes';` beside the file's other imports if the re-export line alone does not put the name in scope.

- [ ] **Step 4: Fill the status field**

In `src/pages/api/course/assessment.ts`:

1. Add the imports `import { loadOwnedCertificate } from '../../../lib/server/course/certificates';` and `import { certificateSummary } from '../../../lib/course/certificateRules';`.
2. In `statusFor`, add a fifth element to the `Promise.all` array and destructuring: `loadOwnedCertificate(user.id)` bound as `certificate`, and replace `certificate: null,` with `certificate: certificate ? certificateSummary(certificate) : null,`.

- [ ] **Step 5: Check and run the curl walk**

Run: `npm run check && npm test`
Expected: 0 errors; every test green.

With the dev server running on 4321, sign in twice (the anon key and the tokens stay in shell variables and are never printed):

```bash
ANON=$(npx supabase status -o env | grep '^ANON_KEY=' | cut -d= -f2- | tr -d '"')
tok() { curl -s "http://127.0.0.1:55321/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H "Content-Type: application/json" -d "{\"email\":\"$1\",\"password\":\"course-test-password-1\"}" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).access_token))'; }
ADMIN=$(tok course-admin@example.com); LEARNER=$(tok course-learner@example.com)
C=http://localhost:4321/api/course/certificate
curl -s -o /dev/null -w "%{http_code}\n" $C                                                                # 401
curl -s $C -H "Authorization: Bearer $LEARNER"                                                             # {"certificate":null,"awards_enabled":...,"passed_current":false,...}
curl -s $C -H "Authorization: Bearer $ADMIN"                                                               # certificate with "name_confirmed_at":null, "share_url":null; no "share_token" key
curl -s $C -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"action":"share","active":true}'     # {"error":"name_required"} 409
curl -s $C -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"action":"confirm_name","name":"  Ada   Lovelace "}'   # display_name "Ada Lovelace", name_confirmed_at set
curl -s $C -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"action":"confirm_name","name":"Someone Else"}'        # {"error":"name_already_confirmed"} 409
curl -s $C -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"action":"confirm_name","name":"<b>"}'                 # {"error":"bad_request","field":"name"} 400
curl -s $C -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"action":"share","active":true}'      # share_active true, share_url "http://localhost:4321/course/verify/<32 chars>/"
curl -s $C -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"action":"share","active":false}'     # share_active false, share_url null
curl -s $C -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"action":"share","active":true}'      # the same share_url as before
curl -s $C -H "Authorization: Bearer $LEARNER" -H 'Content-Type: application/json' -d '{"action":"confirm_name","name":"Ada"}'   # {"error":"no_certificate"} 404
curl -s http://localhost:4321/api/course/assessment -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"action":"status"}' | node -e 'process.stdin.on("data",d=>console.log(JSON.stringify(JSON.parse(d).certificate)))'   # {"id":...,"serial":"SSS-2026-0000N","status":"active","name_confirmed":true,"issued_at":...}
```

Leave sharing on at the end: Task 4's verify walk uses it.

- [ ] **Step 6: CRLF and commit**

Run: `unix2dos -q src/lib/server/course/certificates.ts src/pages/api/course/certificate.ts`

```bash
git add src/lib/server/course/certificates.ts src/pages/api/course/certificate.ts src/lib/courseClient.ts src/pages/api/course/assessment.ts
git commit -m "Serve a learner's certificate with name confirmation and a shareable link"
```

---

### Task 3: The certificate page, printing, the verification link, and the ways in

**Files:**
- Create: `src/components/react/CertificateView.tsx`
- Create: `src/pages/course/learn/certificate.astro`
- Modify: `src/styles/global.css` (the print block), `src/components/react/AssessmentView.tsx` (`Result`), `src/components/react/CourseDashboard.tsx` (`CertificationPanel`), `src/lib/analytics.ts` (`certificate_issued`), `src/pages/og/[...route].ts` (`course/learn/certificate`)

**Interfaces:**
- Consumes: Task 2's client calls and payload; `CERTIFICATION_TITLE`, `CERTIFICATION_METHOD`, `CERTIFICATION_MEANING`; `courseCopy('{{support_contact}}')`; `useSession`, `accountLink`, `track`; `DISPLAY_NAME_MAX`, `normalizeDisplayName`.
- Produces: the page `/course/learn/certificate/` (prerendered shell, `noindex`, island `CertificateView`); the analytics member `{ event: 'certificate_issued' }`; the OG entry `course/learn/certificate`; `.certificate-sheet` print styling.

- [ ] **Step 1: Register the event and the card**

In `src/lib/analytics.ts`, after the `grading_error` member of `AnalyticsEvent`, add:

```ts
  /** The learner confirmed the name on an issued certificate (once per certificate; the server refuses a second confirmation). */
  | { event: 'certificate_issued' }
```

In `src/pages/og/[...route].ts`, after the `'course/learn/assessment'` entry, add:

```ts
  'course/learn/certificate': {
    title: 'Your certificate',
    description: 'The certificate for the Solution Seeking System Certification, with its verification link.',
  },
```

- [ ] **Step 2: Extend the print block**

In `src/styles/global.css`, inside the existing `@media print { ... }` block, after the `.container-page` rule, add:

```css
  .certificate-sheet {
    box-shadow: none;
    page-break-inside: avoid;
  }
  @page {
    margin: 14mm;
  }
```

- [ ] **Step 3: Write the island**

Create `src/components/react/CertificateView.tsx`:

```tsx
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSession } from '../../lib/useSession';
import { accountLink } from '../../lib/accountLink';
import { track } from '../../lib/analytics';
import {
  CourseActionError,
  confirmCertificateName,
  courseErrorMessage,
  fetchCertificate,
  setCertificateSharing,
  type CertificatePayload,
  type CertificateRecord,
} from '../../lib/courseClient';
import { DISPLAY_NAME_MAX, normalizeDisplayName } from '../../lib/course/certificateRules';

/**
 * The learner's certificate page. Everything comes from GET /api/course/
 * certificate with the bearer token; the prerendered shell carries only the
 * certification's public strings. Four states: no certificate (with the
 * honest reason), a certificate waiting for its name, an issued certificate
 * (the printable sheet and the verification link), and a revoked one.
 */

interface Props {
  certificationTitle: string;
  method: string;
  meaning: string;
  supportContact: string;
}

const PAGE_PATH = '/course/learn/certificate/';
const dateOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const messageFor = (err: unknown) => (err instanceof CourseActionError ? courseErrorMessage(err.code) : 'Something went wrong. Please try again.');

export default function CertificateView(props: Props) {
  const { session, loading } = useSession();
  const [payload, setPayload] = useState<CertificatePayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const token = session?.access_token ?? null;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchCertificate(token)
      .then((p) => {
        if (cancelled) return;
        setPayload(p);
        setLoadError(null);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(messageFor(err));
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const run = useCallback(
    async (action: (accessToken: string) => Promise<CertificatePayload>) => {
      if (!token || busy) return;
      setBusy(true);
      setActionError(null);
      try {
        setPayload(await action(token));
      } catch (err) {
        setActionError(messageFor(err));
      } finally {
        setBusy(false);
      }
    },
    [token, busy]
  );

  const confirmName = (name: string) =>
    run(async (accessToken) => {
      const next = await confirmCertificateName(accessToken, name);
      // Once per certificate: the server refuses a second confirmation.
      track({ event: 'certificate_issued' });
      return next;
    });
  const share = (active: boolean) => run((accessToken) => setCertificateSharing(accessToken, active));

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (!session) {
    return (
      <p className="text-slate-700">
        <a href={accountLink({ next: PAGE_PATH })} className="font-semibold text-brand-700 underline">
          Sign in
        </a>{' '}
        to see your certificate.
      </p>
    );
  }
  if (loadError) return <ErrorLine text={loadError} />;
  if (!payload) return <p className="text-slate-500">Loading…</p>;

  const { certificate } = payload;
  return (
    <div>
      <p className="eyebrow">{props.certificationTitle}</p>
      <h1 className="mt-2 font-heading text-3xl font-bold text-ink-800">Your certificate</h1>
      {!certificate && <NoCertificate payload={payload} />}
      {certificate && certificate.status === 'revoked' && <Revoked certificate={certificate} supportContact={props.supportContact} />}
      {certificate && certificate.status === 'active' && !certificate.name_confirmed_at && <NameForm busy={busy} error={actionError} onConfirm={confirmName} />}
      {certificate && certificate.status === 'active' && certificate.name_confirmed_at && (
        <Issued certificate={certificate} busy={busy} error={actionError} onShare={share} certificationTitle={props.certificationTitle} method={props.method} meaning={props.meaning} />
      )}
    </div>
  );
}

function NoCertificate({ payload }: { payload: CertificatePayload }) {
  if (payload.passed_current && payload.awards_enabled) {
    return <p className="mt-4 text-slate-700">Your pass is recorded. Your certificate has not been issued yet and will appear here when it is.</p>;
  }
  if (payload.passed_current) {
    return <p className="mt-4 text-slate-700">Certificates are not being issued yet. Your pass is recorded against your account and will be awarded when they open.</p>;
  }
  return (
    <p className="mt-4 text-slate-700">
      There is no certificate on this account yet. It is awarded when you pass the{' '}
      <a href="/course/learn/assessment/" className="font-semibold text-brand-700 underline">
        final assessment
      </a>
      .
    </p>
  );
}

function Revoked({ certificate, supportContact }: { certificate: CertificateRecord; supportContact: string }) {
  return (
    <section className="mt-6 max-w-xl rounded-2xl border border-slate-200 bg-white p-6">
      <p className="text-slate-700">
        Certificate {certificate.serial} was revoked{certificate.revoked_at ? ` on ${dateOf(certificate.revoked_at)}` : ''}. Its verification link no longer resolves.
      </p>
      <p className="mt-3 text-slate-700">
        If that seems wrong, write to{' '}
        <a href={`mailto:${supportContact}`} className="font-semibold text-brand-700 underline">
          {supportContact}
        </a>
        .
      </p>
    </section>
  );
}

function NameForm({ busy, error, onConfirm }: { busy: boolean; error: string | null; onConfirm: (name: string) => void }) {
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = normalizeDisplayName(name);
    if (!clean) {
      setProblem(`Enter the name as it should appear, up to ${DISPLAY_NAME_MAX} characters.`);
      return;
    }
    setProblem(null);
    onConfirm(clean);
  };
  return (
    <form onSubmit={submit} className="mt-6 max-w-xl rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="font-heading text-xl font-bold text-ink-800">Confirm the name for your certificate</h2>
      <p className="mt-2 text-slate-700">This is the name printed on the certificate and shown to anyone who opens its verification link. It is set once, so check the spelling.</p>
      <label className="mt-4 block text-sm font-semibold text-slate-700">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={DISPLAY_NAME_MAX}
          autoComplete="name"
          required
          className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 font-normal"
        />
      </label>
      {problem && <ErrorLine text={problem} />}
      {error && <ErrorLine text={error} />}
      <button type="submit" className="btn-primary mt-4" disabled={busy}>
        {busy ? 'Saving…' : 'Confirm name'}
      </button>
    </form>
  );
}

function Issued({
  certificate,
  busy,
  error,
  onShare,
  certificationTitle,
  method,
  meaning,
}: {
  certificate: CertificateRecord;
  busy: boolean;
  error: string | null;
  onShare: (active: boolean) => void;
  certificationTitle: string;
  method: string;
  meaning: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!certificate.share_url) return;
    try {
      await navigator.clipboard.writeText(certificate.share_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The link is on screen to select by hand.
    }
  };
  return (
    <div>
      <div className="no-print mt-6 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => window.print()} className="btn-primary">
          Print or save as PDF
        </button>
        <a href="/course/learn/" className="btn-secondary">
          Back to your course
        </a>
      </div>
      <article className="certificate-sheet mt-6 rounded-2xl border border-slate-200 bg-white p-8 sm:p-12" aria-label={`${certificationTitle}, awarded to ${certificate.display_name}`}>
        <p className="eyebrow">{certificationTitle}</p>
        <p className="mt-8 text-sm uppercase tracking-wide text-slate-500">Awarded to</p>
        <p className="mt-2 font-heading text-4xl font-bold text-ink-800">{certificate.display_name}</p>
        <p className="mt-8 max-w-xl text-slate-700">{meaning}</p>
        <p className="mt-6 text-sm text-slate-500">{method}</p>
        <dl className="mt-8 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-500">Issued</dt>
            <dd className="font-semibold text-ink-800">{dateOf(certificate.issued_at)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Version</dt>
            <dd className="font-semibold text-ink-800">{certificate.certification_version}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Serial</dt>
            <dd className="font-semibold text-ink-800">{certificate.serial}</dd>
          </div>
        </dl>
        {certificate.share_url && <p className="mt-8 break-all text-sm text-slate-500">Verify at {certificate.share_url}</p>}
      </article>
      <section className="no-print mt-8 max-w-xl rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-heading text-xl font-bold text-ink-800">Verification link</h2>
        {certificate.share_active && certificate.share_url ? (
          <>
            <p className="mt-2 text-slate-700">Anyone with this link sees your name, the certification, its version, the issue date and the serial. Nothing else.</p>
            <p className="mt-3 break-all rounded-xl bg-slate-50 px-4 py-3 font-mono text-sm text-ink-800">{certificate.share_url}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" className="btn-secondary" onClick={copy}>
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => onShare(false)}>
                {busy ? 'Saving…' : 'Turn the link off'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-slate-700">The link is off. Turn it on to get a page that confirms this certificate. Turning it off later stops the same link until you turn it on again.</p>
            <button type="button" className="btn-primary mt-4" disabled={busy} onClick={() => onShare(true)}>
              {busy ? 'Saving…' : 'Turn the link on'}
            </button>
          </>
        )}
        {error && <ErrorLine text={error} />}
      </section>
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
      {text}
    </p>
  );
}
```

- [ ] **Step 4: Write the shell**

Create `src/pages/course/learn/certificate.astro`:

```astro
---
import BaseLayout from '../../../layouts/BaseLayout.astro';
import CertificateView from '../../../components/react/CertificateView.tsx';
import { CERTIFICATION_MEANING, CERTIFICATION_METHOD, CERTIFICATION_TITLE } from '../../../data/certification';
import { courseCopy } from '../../../lib/course/copy';

// Prerendered public shell, like the assessment page: no certificate data in
// the HTML. The island fetches the certificate with the bearer token.
---

<BaseLayout title="Your certificate" description="The certificate for the Solution Seeking System Certification, with its verification link." noindex>
  <div class="container-page py-10">
    <CertificateView
      client:load
      certificationTitle={CERTIFICATION_TITLE}
      method={CERTIFICATION_METHOD}
      meaning={CERTIFICATION_MEANING}
      supportContact={courseCopy('{{support_contact}}')}
    />
  </div>
</BaseLayout>
```

- [ ] **Step 5: Point the result and the dashboard at it**

In `src/components/react/AssessmentView.tsx`:

1. Add `type CertificateSummary,` to the type imports from `'../../lib/courseClient'`.
2. Change the `Result` signature to `function Result({ result, awardsEnabled, certificate }: { result: NonNullable<AssessmentStatus['result']>; awardsEnabled: boolean; certificate: CertificateSummary | null })`.
3. Replace the block that starts `{result.passed && !awardsEnabled && (` and ends with its closing `)}` with:

```tsx
        {result.passed && certificate?.status === 'active' && (
          <p className="mt-2 text-slate-700">
            Your certificate is ready.{' '}
            <a href="/course/learn/certificate/" className="font-semibold text-brand-700 underline">
              {certificate.name_confirmed ? 'Open your certificate' : 'Confirm the name it should show'}
            </a>
          </p>
        )}
        {result.passed && !certificate && awardsEnabled && (
          <p className="mt-2 text-slate-700">Your pass is recorded. Your certificate has not been issued yet and will appear on your certificate page when it is.</p>
        )}
        {result.passed && !certificate && !awardsEnabled && (
          <p className="mt-2 text-slate-700">Certificates are not being issued yet. Your pass is recorded against your account and will be awarded when they open.</p>
        )}
```

4. At both call sites, change `<Result result={status.result} awardsEnabled={status.awards_enabled} />` to `<Result result={status.result} awardsEnabled={status.awards_enabled} certificate={status.certificate} />`.

In `src/components/react/CourseDashboard.tsx`, in `CertificationPanel`, replace the single `<a href="/course/learn/assessment/" className="btn-primary mt-4">{linkLabel}</a>` element (three lines in the source) with:

```tsx
      <div className="mt-4 flex flex-wrap gap-3">
        <a href="/course/learn/assessment/" className="btn-primary">
          {linkLabel}
        </a>
        {state.certification.status === 'passed' && (
          <a href="/course/learn/certificate/" className="btn-secondary">
            Your certificate
          </a>
        )}
      </div>
```

- [ ] **Step 6: Check, build and inspect**

Run: `npm run check && npm test`
Expected: 0 errors; every test green.

Run: `PUBLIC_COURSE_STATUS=hidden npm run build` (with the placeholder `PUBLIC_SUPABASE_*` values the repo's build instructions name).
Expected: build green, the dist scan ok, and:

```bash
grep -c 'name="robots" content="noindex"' dist/course/learn/certificate/index.html    # 1
grep -c "Awarded to" dist/course/learn/certificate/index.html                          # 0
ls dist/og/course/learn/certificate.png                                                # exists
grep -c "course/learn/certificate" dist/sitemap-0.xml                                  # 0
```

Then, with the dev server on 4321 and a browser signed in as `course-admin@example.com`, open `/course/learn/certificate/`: the issued sheet renders with "Ada Lovelace" (the name Task 2 confirmed), the verification link section shows the url with Copy and Turn the link off, and the browser's print preview shows the sheet without the header, footer or the buttons. The controller repeats this walk with screenshots in Task 7; here it is a smoke check.

- [ ] **Step 7: CRLF and commit**

Run: `unix2dos -q src/components/react/CertificateView.tsx src/pages/course/learn/certificate.astro`

```bash
git add src/components/react/CertificateView.tsx src/pages/course/learn/certificate.astro src/styles/global.css src/components/react/AssessmentView.tsx src/components/react/CourseDashboard.tsx src/lib/analytics.ts "src/pages/og/[...route].ts"
git commit -m "Show the certificate page with printing and the verification link"
```

---

### Task 4: The public page that verifies a shared certificate

**Files:**
- Create: `src/pages/course/verify/[token].astro`
- Modify: `src/pages/og/[...route].ts` (`course/verify`, outside the status gate)

**Interfaces:**
- Consumes: `lookupSharedCertificate` (Task 2), `SHARE_TOKEN_RE` (Task 1), `CERTIFICATION_TITLE`, `CERTIFICATION_METHOD`, `CERTIFICATION_MEANING`, `COURSE_STATUS`.
- Produces: `/course/verify/<token>/`, server-rendered, `noindex` by meta and header, `Cache-Control: no-store`, one page for every miss.

- [ ] **Step 1: Register the card**

In `src/pages/og/[...route].ts`, after the `'course/learn/certificate'` entry (outside the `COURSE_STATUS !== 'hidden'` block, since the verify page is not gated), add:

```ts
  'course/verify': {
    title: 'Certificate verification',
    description: 'Confirms a Solution Seeking System Certification that its holder chose to share.',
  },
```

- [ ] **Step 2: Write the page**

Create `src/pages/course/verify/[token].astro`:

```astro
---
import BaseLayout from '../../../layouts/BaseLayout.astro';
import { COURSE_STATUS } from '../../../data/course';
import { CERTIFICATION_MEANING, CERTIFICATION_METHOD, CERTIFICATION_TITLE } from '../../../data/certification';
import { SHARE_TOKEN_RE } from '../../../lib/course/certificateRules';
import { lookupSharedCertificate } from '../../../lib/server/course/certificates';

// Server-rendered per request with the service role. Every miss (unknown
// token, malformed token, sharing off, revoked, name not confirmed) renders
// the same page with the same status, so the page cannot be used to test
// tokens. Not gated on PUBLIC_COURSE_STATUS: a link printed on a certificate
// must resolve whatever the sales page is doing. The card is passed by hand
// because the pathname carries the token.
export const prerender = false;

const token = Astro.params.token ?? '';
let certificate = null;
let unavailable = false;
if (SHARE_TOKEN_RE.test(token)) {
  try {
    certificate = await lookupSharedCertificate(token);
  } catch (err) {
    console.error('certificate verify lookup failed', err);
    unavailable = true;
  }
}
Astro.response.headers.set('X-Robots-Tag', 'noindex, nofollow');
Astro.response.headers.set('Cache-Control', 'no-store');
if (unavailable) Astro.response.status = 503;

const issued = certificate ? new Date(certificate.issued_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
---

<BaseLayout title="Certificate verification" description="Confirms a Solution Seeking System Certification that its holder chose to share." noindex ogImage="/og/course/verify.png">
  <div class="container-page max-w-2xl py-10 sm:py-14">
    <p class="eyebrow">{CERTIFICATION_TITLE}</p>
    {unavailable ? (
      <section class="mt-4 rounded-2xl border border-slate-200 bg-white p-8">
        <h1 class="font-heading text-3xl font-bold text-ink-800">Verification is unavailable right now</h1>
        <p class="mt-4 text-slate-700">Please try the link again in a few minutes.</p>
      </section>
    ) : certificate ? (
      <section class="mt-4 rounded-2xl border border-slate-200 bg-white p-8">
        <h1 class="font-heading text-3xl font-bold text-ink-800">This certificate is active</h1>
        <p class="mt-6 text-sm uppercase tracking-wide text-slate-500">Awarded to</p>
        <p class="mt-1 font-heading text-2xl font-bold text-ink-800">{certificate.display_name}</p>
        <dl class="mt-6 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt class="text-slate-500">Issued</dt>
            <dd class="font-semibold text-ink-800">{issued}</dd>
          </div>
          <div>
            <dt class="text-slate-500">Version</dt>
            <dd class="font-semibold text-ink-800">{certificate.certification_version}</dd>
          </div>
          <div>
            <dt class="text-slate-500">Serial</dt>
            <dd class="font-semibold text-ink-800">{certificate.serial}</dd>
          </div>
        </dl>
        <p class="mt-6 text-slate-700">{CERTIFICATION_MEANING}</p>
        <p class="mt-2 text-sm text-slate-500">
          {CERTIFICATION_METHOD}.
          {COURSE_STATUS !== 'hidden' && (
            <a href="/course/certification/" class="underline">How the certification is assessed</a>
          )}
        </p>
      </section>
    ) : (
      <section class="mt-4 rounded-2xl border border-slate-200 bg-white p-8">
        <h1 class="font-heading text-3xl font-bold text-ink-800">This verification link is not active</h1>
        <p class="mt-4 text-slate-700">The holder may have turned sharing off, or the link may be incomplete. Ask them for a current link.</p>
      </section>
    )}
  </div>
</BaseLayout>
```

- [ ] **Step 3: Walk it with curl**

`npm run check` first (0 errors). Then, with the dev server on 4321 and the admin's certificate sharing on (Task 2 left it on; if not, turn it on with the `share` call from Task 2's walk):

```bash
URL=$(curl -s http://localhost:4321/api/course/certificate -H "Authorization: Bearer $ADMIN" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).certificate.share_url))')
curl -s -D - -o /tmp/verify-ok.html "$URL" | grep -i "^HTTP\|x-robots-tag\|cache-control"      # HTTP/1.1 200, x-robots-tag: noindex, nofollow, cache-control: no-store
grep -c "This certificate is active" /tmp/verify-ok.html                                        # 1
grep -c "Ada Lovelace" /tmp/verify-ok.html                                                      # 1
grep -c 'name="robots" content="noindex"' /tmp/verify-ok.html                                   # 1
curl -s -o /tmp/miss-unknown.html -w "%{http_code}\n" "http://localhost:4321/course/verify/$(printf 'x%.0s' $(seq 1 32))/"   # 200
curl -s -o /tmp/miss-short.html -w "%{http_code}\n" "http://localhost:4321/course/verify/not-a-token/"                       # 200
curl -s http://localhost:4321/api/course/certificate -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"action":"share","active":false}' > /dev/null
curl -s -o /tmp/miss-off.html -w "%{http_code}\n" "$URL"                                                                     # 200
diff /tmp/miss-unknown.html /tmp/miss-short.html && diff /tmp/miss-unknown.html /tmp/miss-off.html && echo "every miss is the same page"
grep -c "not active" /tmp/miss-off.html                                                          # 1
curl -s http://localhost:4321/api/course/certificate -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"action":"share","active":true}' > /dev/null
curl -s "$URL" | grep -c "Ada Lovelace"                                                          # 1: the same link works again
```

If the miss bodies differ only in the Astro dev toolbar's per-request markup, compare after stripping `<astro-dev-toolbar` blocks, and say so in the report.

- [ ] **Step 4: CRLF and commit**

Run: `unix2dos -q "src/pages/course/verify/[token].astro"`

```bash
git add "src/pages/course/verify/[token].astro" "src/pages/og/[...route].ts"
git commit -m "Add the public page that verifies a shared certificate"
```

---

### Task 5: One claim-then-send email skeleton, and the certificate email from the worker

**Files:**
- Create: `src/lib/server/course/courseEmail.ts`
- Create: `src/lib/server/course/__tests__/courseEmail.test.ts`
- Modify: `src/lib/server/course/resultEmail.ts` (onto the skeleton; its test file is untouched and stays green)
- Create: `src/lib/server/course/certificateEmail.ts`
- Create: `src/lib/server/course/__tests__/certificateEmail.test.ts`
- Modify: `src/lib/server/course/gradingJob.ts` (two store methods), `src/lib/server/course/jobStore.ts` (implement them), `src/lib/server/course/__tests__/gradingJob.test.ts` (`fakeStore` stubs)
- Modify: `netlify/functions/course-grade.mts`, `src/lib/server/course/workerTrigger.ts` (send after a pass)

**Interfaces:**
- Consumes: the Resend SDK; `RunOutcome.finalized { passed; attemptId; userId; generation }`; `deployOrigin()` and `workerOrigin()`.
- Produces: `CourseEmailConfig`, `CourseMail`, `courseMail({ subject, intro, button, footer })`, `escapeHtml`, `ClaimedSend`, `sendClaimedEmail(config, args)`; `certificateReadyEmail({ certificateUrl })`, `CertificateNotice { certificateId; userId; certificateUrl }`, `CertificateNoticeDeps { emailFor; markSent }`, `notifyLearnerOfCertificate(config, notice, deps)`; store methods `certificateForAttempt(attemptId): Promise<{ id: string } | null>` and `markCertificateEmailSent(certificateId): Promise<boolean>`.

- [ ] **Step 1: Write the skeleton's failing test**

Create `src/lib/server/course/__tests__/courseEmail.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send } };
  }),
}));

import { courseMail, escapeHtml, sendClaimedEmail } from '../courseEmail';

const config = { apiKey: 'key', from: 'Course <course@example.com>' };
const mail = courseMail({ subject: 'Subject', intro: 'Intro <b>', button: { href: 'https://example.com/x/', label: 'Open' }, footer: 'Footer' });
const args = (claimed: boolean, to: string | null) => ({
  label: 'thing t-1: test email',
  key: 'course-test/t-1',
  claim: vi.fn(async () => claimed),
  to: vi.fn(async () => to),
  mail,
});

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ error: null });
});

describe('courseMail', () => {
  it('escapes text in the html and keeps the text version plain', () => {
    expect(mail.html).toContain('Intro &lt;b&gt;');
    expect(mail.html).toContain('href="https://example.com/x/"');
    expect(mail.text).toContain('Open: https://example.com/x/');
    expect(mail.text).toContain('Intro <b>');
    expect(escapeHtml(`"a" & 'b'`)).toBe('&quot;a&quot; &amp; &#39;b&#39;');
  });
});

describe('sendClaimedEmail', () => {
  it('claims, then looks up the address, then sends once under the key', async () => {
    const a = args(true, 'learner@example.com');
    expect(await sendClaimedEmail(config, a)).toBe(true);
    expect(a.claim).toHaveBeenCalledTimes(1);
    expect(a.to).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ from: config.from, to: 'learner@example.com', subject: 'Subject' });
    expect(send.mock.calls[0][1]).toEqual({ idempotencyKey: 'course-test/t-1' });
  });
  it('sends nothing when the claim says it was already sent', async () => {
    const a = args(false, 'learner@example.com');
    expect(await sendClaimedEmail(config, a)).toBe(false);
    expect(a.to).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
  it('sends nothing without configuration, without an address, or when Resend refuses, and never throws', async () => {
    const unconfigured = args(true, 'learner@example.com');
    expect(await sendClaimedEmail({ apiKey: '', from: '' }, unconfigured)).toBe(false);
    expect(unconfigured.claim).not.toHaveBeenCalled();
    expect(await sendClaimedEmail(config, args(true, null))).toBe(false);
    send.mockResolvedValueOnce({ error: { message: 'no' } });
    expect(await sendClaimedEmail(config, args(true, 'learner@example.com'))).toBe(false);
    send.mockRejectedValueOnce(new Error('network'));
    expect(await sendClaimedEmail(config, args(true, 'learner@example.com'))).toBe(false);
    const throwing = { ...args(true, 'learner@example.com'), claim: vi.fn(async () => { throw new Error('db'); }) };
    expect(await sendClaimedEmail(config, throwing)).toBe(false);
  });
});
```

Run: `npx vitest run src/lib/server/course/__tests__/courseEmail.test.ts`
Expected: FAIL, the module `../courseEmail` cannot be found.

- [ ] **Step 2: Write the skeleton**

Create `src/lib/server/course/courseEmail.ts`:

```ts
import { Resend } from 'resend';

/**
 * The one shape every learner email in the course takes (a subject, one
 * paragraph, one button, a footer line) and the one way any of them is sent:
 * claim the sent-at column first, then send under an idempotency key, and
 * never throw. Worker-shared, so it imports only the Resend SDK; the Netlify
 * function and the dev server pass in the configuration they read themselves.
 */

export interface CourseEmailConfig {
  apiKey: string;
  from: string;
}

export interface CourseMail {
  subject: string;
  text: string;
  html: string;
}

export const BRAND = '#5271FF';
export const INK = '#16276B';

export const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** One paragraph, one button, one footer line. Text fields are escaped in the html; the href is built by our code, never from input. */
export function courseMail(opts: { subject: string; intro: string; button: { href: string; label: string }; footer: string }): CourseMail {
  const text = [opts.subject, '', opts.intro, '', `${opts.button.label}: ${opts.button.href}`, '', 'Beanchain Coffee LLC'].join('\n');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#1e293b;line-height:1.5;">
<h1 style="margin:0 0 12px;font-size:22px;color:${INK};">${escapeHtml(opts.subject)}</h1>
<p style="margin:0 0 20px;">${escapeHtml(opts.intro)}</p>
<p style="margin:0 0 24px;"><a href="${escapeHtml(opts.button.href)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:${BRAND};color:#ffffff;font-weight:600;text-decoration:none;">${escapeHtml(opts.button.label)}</a></p>
<p style="margin:0;font-size:13px;color:#64748b;">${escapeHtml(opts.footer)}<br>Beanchain Coffee LLC</p>
</body></html>`;
  return { subject: opts.subject, text, html };
}

export interface ClaimedSend {
  /** Names the thing in log lines, for example "grading job abc: result email". */
  label: string;
  /** The Resend idempotency key; covers a repeat inside Resend's window. */
  key: string;
  /** Sets the sent-at column where it is null and says whether this call did. Only a true claim sends. */
  claim(): Promise<boolean>;
  /** The learner's address, or null when the account has none. */
  to(): Promise<string | null>;
  mail: CourseMail;
}

/**
 * Claim first, then send: the sent-at column is the guard that outlives
 * Resend's idempotency window. A send that fails after the claim is logged
 * and not retried, because what the email announces is already on its page.
 * Never throws; true only when Resend accepted the message.
 */
export async function sendClaimedEmail(config: CourseEmailConfig, args: ClaimedSend): Promise<boolean> {
  if (!config.apiKey || !config.from) {
    console.error(`${args.label} not sent (RESEND_API_KEY or EMAIL_FROM unset)`);
    return false;
  }
  try {
    if (!(await args.claim())) return false;
    const to = await args.to();
    if (!to) {
      console.error(`${args.label} not sent (the account has no email address)`);
      return false;
    }
    const { error } = await new Resend(config.apiKey).emails.send(
      { from: config.from, to, subject: args.mail.subject, text: args.mail.text, html: args.mail.html },
      { idempotencyKey: args.key }
    );
    if (error) {
      console.error(`${args.label} rejected`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`${args.label} failed`, err);
    return false;
  }
}
```

Run: `npx vitest run src/lib/server/course/__tests__/courseEmail.test.ts`
Expected: PASS.

- [ ] **Step 3: Move the result email onto it**

Replace the whole of `src/lib/server/course/resultEmail.ts` with:

```ts
import { courseMail, sendClaimedEmail, type CourseEmailConfig, type CourseMail } from './courseEmail';

/**
 * The learner's "your result is ready" email. It names no outcome, no score
 * and no quote: the result lives on the assessment page behind sign-in, and
 * an email is not a place for it. Worker-shared: the Netlify function and the
 * dev server both call it with configuration they read themselves, through
 * the skeleton in courseEmail.ts.
 */

export type ResultEmailConfig = CourseEmailConfig;

export interface ResultNotice {
  jobId: string;
  generation: number;
  userId: string;
  assessmentUrl: string;
}

export interface ResultNoticeDeps {
  /** The learner's sign-in address, or null when the account has none. */
  emailFor(userId: string): Promise<string | null>;
  /** Sets result_email_sent_at where it is null and says whether this call did. */
  markSent(jobId: string): Promise<boolean>;
}

export function resultReadyEmail(opts: { assessmentUrl: string }): CourseMail {
  return courseMail({
    subject: 'Your assessment result is ready',
    intro: 'The grader has finished with your final assessment. Sign in to read the feedback and the lessons it points to.',
    button: { href: opts.assessmentUrl, label: 'Open your assessment' },
    footer: 'Sent because this address took the final assessment on solutionseeking.com.',
  });
}

/** Once per job and generation: the sent-at column is claimed first, and only the claim that won sends. Never throws. */
export function notifyLearnerOfResult(config: ResultEmailConfig, notice: ResultNotice, deps: ResultNoticeDeps): Promise<boolean> {
  return sendClaimedEmail(config, {
    label: `grading job ${notice.jobId}: result email`,
    key: `course-result/${notice.jobId}-${notice.generation}`,
    claim: () => deps.markSent(notice.jobId),
    to: () => deps.emailFor(notice.userId),
    mail: resultReadyEmail({ assessmentUrl: notice.assessmentUrl }),
  });
}
```

Run: `npx vitest run src/lib/server/course/__tests__/resultEmail.test.ts`
Expected: PASS with the test file unchanged. If a test fails, the skeleton is wrong, not the test.

- [ ] **Step 4: Write the certificate email and its failing test**

Create `src/lib/server/course/__tests__/certificateEmail.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send } };
  }),
}));

import { certificateReadyEmail, notifyLearnerOfCertificate } from '../certificateEmail';

const config = { apiKey: 'key', from: 'Course <course@example.com>' };
const notice = { certificateId: 'cert-1', userId: 'user-1', certificateUrl: 'https://example.com/course/learn/certificate/' };
const deps = (email: string | null, claimed: boolean) => ({ emailFor: vi.fn(async () => email), markSent: vi.fn(async () => claimed) });

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ error: null });
});

describe('certificateReadyEmail', () => {
  it('names no score, no quote and no name', () => {
    const mail = certificateReadyEmail({ certificateUrl: notice.certificateUrl });
    expect(mail.subject).toBe('Your certificate is ready');
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain(notice.certificateUrl);
      expect(body).not.toMatch(/score|total|criterion|awarded to/i);
    }
  });
});

describe('notifyLearnerOfCertificate', () => {
  it('claims the certificate, looks up the address, and sends once with the certificate id as the key', async () => {
    const d = deps('learner@example.com', true);
    expect(await notifyLearnerOfCertificate(config, notice, d)).toBe(true);
    expect(d.markSent).toHaveBeenCalledWith('cert-1');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ to: 'learner@example.com', subject: 'Your certificate is ready' });
    expect(send.mock.calls[0][1]).toEqual({ idempotencyKey: 'course-certificate/cert-1' });
  });
  it('sends nothing when the claim says it was already sent', async () => {
    const d = deps('learner@example.com', false);
    expect(await notifyLearnerOfCertificate(config, notice, d)).toBe(false);
    expect(d.emailFor).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run src/lib/server/course/__tests__/certificateEmail.test.ts`
Expected: FAIL, the module cannot be found.

Create `src/lib/server/course/certificateEmail.ts`:

```ts
import { courseMail, sendClaimedEmail, type CourseEmailConfig, type CourseMail } from './courseEmail';

/**
 * "Your certificate is ready": sent once per certificate, from wherever the
 * certificate was issued (the worker after a pass with awards on, the dev
 * server's inline run, or the admin's Issue action). It names no score and no
 * name; the certificate page behind sign-in carries both. Worker-shared.
 */

export interface CertificateNotice {
  certificateId: string;
  userId: string;
  certificateUrl: string;
}

export interface CertificateNoticeDeps {
  /** The learner's sign-in address, or null when the account has none. */
  emailFor(userId: string): Promise<string | null>;
  /** Sets email_sent_at on the certificate where it is null and says whether this call did. */
  markSent(certificateId: string): Promise<boolean>;
}

export function certificateReadyEmail(opts: { certificateUrl: string }): CourseMail {
  return courseMail({
    subject: 'Your certificate is ready',
    intro: 'Your Solution Seeking System Certification has been issued. Sign in to confirm the name it should show, then print it or turn on its verification link.',
    button: { href: opts.certificateUrl, label: 'Open your certificate' },
    footer: 'Sent because this address passed the final assessment on solutionseeking.com.',
  });
}

/** Once per certificate: the sent-at column is claimed first, and only the claim that won sends. Never throws. */
export function notifyLearnerOfCertificate(config: CourseEmailConfig, notice: CertificateNotice, deps: CertificateNoticeDeps): Promise<boolean> {
  return sendClaimedEmail(config, {
    label: `certificate ${notice.certificateId}: certificate email`,
    key: `course-certificate/${notice.certificateId}`,
    claim: () => deps.markSent(notice.certificateId),
    to: () => deps.emailFor(notice.userId),
    mail: certificateReadyEmail({ certificateUrl: notice.certificateUrl }),
  });
}
```

Run: `npx vitest run src/lib/server/course/__tests__/certificateEmail.test.ts`
Expected: PASS.

- [ ] **Step 5: Teach the store about certificates**

In `src/lib/server/course/gradingJob.ts`, add to `GradingJobStore` after `markResultEmailSent`:

```ts
  /** The certificate finalize issued for this attempt, if any: null while awards are off, or when the pass was recorded before they were. */
  certificateForAttempt(attemptId: string): Promise<{ id: string } | null>;
  /** Sets email_sent_at on the certificate where it is null; true when this call set it. */
  markCertificateEmailSent(certificateId: string): Promise<boolean>;
```

In `src/lib/server/course/jobStore.ts`, add to the object `supabaseJobStore` returns, after `markResultEmailSent`:

```ts
    async certificateForAttempt(attemptId): Promise<{ id: string } | null> {
      const { data, error } = await client.from('course_certificates').select('id').eq('attempt_id', attemptId).maybeSingle();
      if (error) throw new Error(`certificate lookup failed: ${error.message}`);
      return data ? { id: data.id as string } : null;
    },
    async markCertificateEmailSent(certificateId): Promise<boolean> {
      const { data, error } = await client
        .from('course_certificates')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('id', certificateId)
        .is('email_sent_at', null)
        .select('id');
      if (error) throw new Error(`certificate email claim failed: ${error.message}`);
      return (data ?? []).length === 1;
    },
```

In `src/lib/server/course/__tests__/gradingJob.test.ts`, add to `fakeStore`'s store object after `markResultEmailSent`:

```ts
    async certificateForAttempt(attemptId) {
      calls.push({ name: 'certificateForAttempt', args: attemptId });
      return null;
    },
    async markCertificateEmailSent(certificateId) {
      calls.push({ name: 'markCertificateEmailSent', args: certificateId });
      return true;
    },
```

- [ ] **Step 6: Send it from the worker and the inline path**

In `netlify/functions/course-grade.mts`, add `import { notifyLearnerOfCertificate } from '../../src/lib/server/course/certificateEmail';` beside the other imports, and replace the `if (outcome.outcome === 'finalized') { ... }` block with:

```ts
  if (outcome.outcome === 'finalized') {
    const emailConfig = { apiKey: env('RESEND_API_KEY'), from: env('EMAIL_FROM') };
    const emailFor = async (userId: string) => {
      const { data, error } = await supabase.auth.admin.getUserById(userId);
      if (error) console.error(`grading job ${jobId}: learner lookup failed`, error);
      return data.user?.email ?? null;
    };
    await notifyLearnerOfResult(
      emailConfig,
      { jobId, generation: outcome.generation, userId: outcome.userId, assessmentUrl: `${deployOrigin()}/course/learn/assessment/` },
      { emailFor, markSent: (id) => store.markResultEmailSent(id) }
    );
    // A certificate exists here only when awards were on at finalize; the
    // admin's Issue action sends the same email for a pass recorded before.
    if (outcome.passed) {
      const certificate = await store.certificateForAttempt(outcome.attemptId).catch((err) => {
        console.error(`grading job ${jobId}: certificate lookup failed`, err);
        return null;
      });
      if (certificate)
        await notifyLearnerOfCertificate(
          emailConfig,
          { certificateId: certificate.id, userId: outcome.userId, certificateUrl: `${deployOrigin()}/course/learn/certificate/` },
          { emailFor, markSent: (id) => store.markCertificateEmailSent(id) }
        );
    }
  }
```

In `src/lib/server/course/workerTrigger.ts`, add `import { notifyLearnerOfCertificate } from './certificateEmail';` and replace the `.then((outcome) => { ... })` handler of the inline `runGradingJob` call (everything from `.then((outcome) => {` through the line before `.catch(`) with:

```ts
      .then(async (outcome) => {
        // Exhausted counts as a failure: the claim retired the job without
        // grading it, so the learner is on grading_error with nobody told.
        if (outcome.outcome === 'failed' || outcome.outcome === 'exhausted') {
          await sendGradingFailureAlert(
            { apiKey: serverEnv('RESEND_API_KEY'), from: serverEnv('EMAIL_FROM'), to: serverEnv('ALERTS_TO') || serverEnv('TEAM_ENQUIRY_TO') || serverEnv('EMAIL_FROM') },
            {
              jobId: args.jobId,
              attemptId: outcome.attemptId,
              category: outcome.outcome === 'failed' ? outcome.category : 'retry_budget_exhausted',
              error: outcome.error,
              attempts: outcome.attempts,
              // Unique per failing run, so an admin's retry that fails again
              // alerts rather than looking like a duplicate of the first.
              runKey: outcome.outcome === 'failed' ? outcome.lockToken : `exhausted-${new Date().toISOString().slice(0, 10)}`,
              adminUrl: `${workerOrigin(args.origin) || args.origin}/admin/`,
            }
          );
          return;
        }
        if (outcome.outcome !== 'finalized') return;
        const emailConfig = { apiKey: serverEnv('RESEND_API_KEY'), from: serverEnv('EMAIL_FROM') };
        const origin = workerOrigin(args.origin) || args.origin;
        const emailFor = async (userId: string) => {
          const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
          if (error) console.error(`grading job ${args.jobId}: learner lookup failed`, error);
          return data.user?.email ?? null;
        };
        await notifyLearnerOfResult(
          emailConfig,
          { jobId: args.jobId, generation: outcome.generation, userId: outcome.userId, assessmentUrl: `${origin}/course/learn/assessment/` },
          { emailFor, markSent: (id) => store.markResultEmailSent(id) }
        );
        if (!outcome.passed) return;
        const certificate = await store.certificateForAttempt(outcome.attemptId);
        if (certificate)
          await notifyLearnerOfCertificate(
            emailConfig,
            { certificateId: certificate.id, userId: outcome.userId, certificateUrl: `${origin}/course/learn/certificate/` },
            { emailFor, markSent: (id) => store.markCertificateEmailSent(id) }
          );
      })
```

The `.catch((err) => console.error(...inline run failed...))` line after it stays.

- [ ] **Step 7: Run every gate**

Run: `npm test && npm run check`
Expected: every test green (the result email tests unchanged and passing); `astro check` 0 errors; the guard's ok line now counts two more worker-reachable modules than before and reports no forbidden import.

- [ ] **Step 8: CRLF and commit**

Run: `unix2dos -q src/lib/server/course/courseEmail.ts src/lib/server/course/__tests__/courseEmail.test.ts src/lib/server/course/certificateEmail.ts src/lib/server/course/__tests__/certificateEmail.test.ts`

```bash
git add src/lib/server/course/courseEmail.ts src/lib/server/course/__tests__/courseEmail.test.ts src/lib/server/course/resultEmail.ts src/lib/server/course/certificateEmail.ts src/lib/server/course/__tests__/certificateEmail.test.ts src/lib/server/course/gradingJob.ts src/lib/server/course/jobStore.ts src/lib/server/course/__tests__/gradingJob.test.ts netlify/functions/course-grade.mts src/lib/server/course/workerTrigger.ts
git commit -m "Share one claim-then-send email skeleton and send the certificate email"
```

---

### Task 6: The admin's Certificates tab: pending passes, issue, revoke and rename

**Files:**
- Create: `src/lib/server/course/adminCertificates.ts`
- Modify: `src/pages/api/admin/course.ts` (`?view=certificates&q=`; actions `issue_pending`, `revoke_certificate`, `rename_certificate`)
- Modify: `src/components/react/AdminView.tsx` (the `Certificates` tab)

**Interfaces:**
- Consumes: `CERTIFICATE_COLUMNS`, `CertificateRow`, `certificateOrigin` (Task 2); `notifyLearnerOfCertificate` (Task 5); `supabaseJobStore` (for the claim); `findUserByEmail`; `normalizeDisplayName`, `DISPLAY_NAME_MAX`; the SQL functions from Task 1.
- Produces: `listCertificatesForAdmin(q) -> { rows: CertificateRow[]; pending: PendingPassRow[] }`, `issuePendingCertificate(attemptId, admin, origin)`, `revokeCertificate(id, admin, reason)`, `renameCertificate(id, name)`, `sendCertificateEmail(certificate, origin)`; the admin view and actions.

The controller has created a pending pass for `course-learner@example.com` before this task starts (Notes for the controller).

- [ ] **Step 1: Write the admin module**

Create `src/lib/server/course/adminCertificates.ts`:

```ts
import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '../supabaseAdmin';
import { serverEnv } from '../env';
import { COURSE } from '../../../data/course';
import { findUserByEmail } from './adminEnrollment';
import { CERTIFICATE_COLUMNS, certificateOrigin, type CertificateRow } from './certificates';
import { notifyLearnerOfCertificate } from './certificateEmail';
import { supabaseJobStore } from './jobStore';

/**
 * The admin's side of certificates: the list behind ?view=certificates, the
 * passes waiting for a certificate, and the three actions. Issue and revoke go
 * through the SQL functions in 0032 so the row lock and the audit columns are
 * theirs; rename is one guarded update. Learners are shown by id, as the
 * grading queue does; a search by email resolves to the id first.
 */

export interface PendingPassRow {
  attempt_id: string;
  user_id: string;
  certification_version: string;
  finalized_at: string | null;
}

const SERIAL_RE = /^SSS-\d{4}-\d{5}$/i;
const LIMIT = 100;

/** `q` is a serial, an email, or a certification version; empty lists the newest. Pending passes are listed only for the empty query. */
export async function listCertificatesForAdmin(q: string): Promise<{ rows: CertificateRow[]; pending: PendingPassRow[] }> {
  const query = q.trim();
  // Filters first, then order and limit: the filter builder is what `.eq()` returns, so the reassignments type-check.
  let builder = supabaseAdmin.from('course_certificates').select(CERTIFICATE_COLUMNS);
  if (SERIAL_RE.test(query)) builder = builder.eq('serial', query.toUpperCase());
  else if (query.includes('@')) {
    const account = await findUserByEmail(query);
    if (!account) return { rows: [], pending: [] };
    builder = builder.eq('user_id', account.id);
  } else if (query) builder = builder.eq('certification_version', query);
  const { data, error } = await builder.order('issued_at', { ascending: false }).limit(LIMIT);
  if (error) throw new Error(`certificate list failed: ${error.message}`);
  return { rows: (data ?? []) as CertificateRow[], pending: query ? [] : await listPendingPasses() };
}

/** Passed attempts at the current version whose learner has no certificate for it. */
async function listPendingPasses(): Promise<PendingPassRow[]> {
  const { data, error } = await supabaseAdmin
    .from('course_assessment_attempts')
    .select('id, user_id, certification_version, finalized_at')
    .eq('course_id', COURSE.id)
    .eq('state', 'passed')
    .eq('certification_version', COURSE.certificationVersion)
    .order('finalized_at', { ascending: false })
    .limit(LIMIT);
  if (error) throw new Error(`pending pass list failed: ${error.message}`);
  const passes = data ?? [];
  if (!passes.length) return [];
  const { data: certs, error: certError } = await supabaseAdmin
    .from('course_certificates')
    .select('user_id')
    .eq('certification_version', COURSE.certificationVersion)
    .in('user_id', [...new Set(passes.map((p) => p.user_id))]);
  if (certError) throw new Error(`pending pass certificates failed: ${certError.message}`);
  const covered = new Set((certs ?? []).map((c) => c.user_id));
  return passes
    .filter((p) => !covered.has(p.user_id))
    .map((p) => ({ attempt_id: p.id, user_id: p.user_id, certification_version: p.certification_version, finalized_at: p.finalized_at }));
}

export type IssueOutcome = { ok: true; certificate: CertificateRow; issued: boolean } | { ok: false; error: 'not_found' | 'not_passed' };

/** Issue by hand; when this call issued it, send the certificate email. An already-issued certificate is reported, not refused. */
export async function issuePendingCertificate(attemptId: string, admin: User, origin: string): Promise<IssueOutcome> {
  const { data, error } = await supabaseAdmin.rpc('issue_course_certificate', { p_attempt: attemptId, p_admin: admin.id });
  if (error) throw new Error(`certificate issue failed: ${error.message}`);
  const result = data as { outcome: 'not_found' | 'not_passed' | 'already_issued' | 'issued'; certificate_id?: string };
  if (result.outcome === 'not_found' || result.outcome === 'not_passed') return { ok: false, error: result.outcome };
  const { data: row, error: loadError } = await supabaseAdmin.from('course_certificates').select(CERTIFICATE_COLUMNS).eq('id', result.certificate_id ?? '').single();
  if (loadError) throw new Error(`certificate load failed: ${loadError.message}`);
  const certificate = row as CertificateRow;
  if (result.outcome === 'issued') await sendCertificateEmail(certificate, origin);
  return { ok: true, certificate, issued: result.outcome === 'issued' };
}

/** The same email the worker sends after a pass with awards on, from the Astro side. Never throws. */
export function sendCertificateEmail(certificate: CertificateRow, origin: string): Promise<boolean> {
  return notifyLearnerOfCertificate(
    { apiKey: serverEnv('RESEND_API_KEY'), from: serverEnv('EMAIL_FROM') },
    { certificateId: certificate.id, userId: certificate.user_id, certificateUrl: `${certificateOrigin(origin)}/course/learn/certificate/` },
    {
      emailFor: async (userId) => {
        const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (error) console.error(`certificate ${certificate.id}: learner lookup failed`, error);
        return data.user?.email ?? null;
      },
      markSent: (id) => supabaseJobStore(supabaseAdmin).markCertificateEmailSent(id),
    }
  );
}

export async function revokeCertificate(id: string, admin: User, reason: string): Promise<'revoked' | 'already_revoked' | 'not_found'> {
  const { data, error } = await supabaseAdmin.rpc('revoke_course_certificate', { p_certificate: id, p_admin: admin.id, p_reason: reason });
  if (error) throw new Error(`certificate revoke failed: ${error.message}`);
  return (data as { outcome: 'revoked' | 'already_revoked' | 'not_found' }).outcome;
}

/** A typo fix after the learner confirmed. The confirmation stands, since the learner did confirm; only the printed name changes. Null when no such certificate. */
export async function renameCertificate(id: string, name: string): Promise<CertificateRow | null> {
  const { data, error } = await supabaseAdmin.from('course_certificates').update({ display_name: name }).eq('id', id).select(CERTIFICATE_COLUMNS).maybeSingle();
  if (error) throw new Error(`certificate rename failed: ${error.message}`);
  return data ? (data as CertificateRow) : null;
}
```

- [ ] **Step 2: Extend the admin route**

In `src/pages/api/admin/course.ts`:

1. Add the imports `import { issuePendingCertificate, listCertificatesForAdmin, renameCertificate, revokeCertificate } from '../../../lib/server/course/adminCertificates';` and `import { normalizeDisplayName } from '../../../lib/course/certificateRules';`.
2. Add to the `MESSAGES` record (keep every existing key): `not_passed: 'Only a passed attempt can be issued a certificate.'`, `already_revoked: 'This certificate is already revoked.'`, and, if the key is not there yet, `not_found: 'No such record.'`.
3. In `GET`, before the line `if (view !== 'grading') return deny('invalid', 400);`, add:

```ts
  if (view === 'certificates') {
    try {
      return adminJson(await listCertificatesForAdmin(new URL(request.url).searchParams.get('q') ?? ''));
    } catch (err) {
      console.error('admin certificate list failed', err);
      return adminJson({ error: 'server_error' }, 500);
    }
  }
```

4. In `POST`, before the final `return deny('invalid', 400);`, add:

```ts
  if (action === 'issue_pending') {
    const attemptId = typeof body?.attempt_id === 'string' ? body.attempt_id : '';
    if (!UUID_RE.test(attemptId)) return deny('invalid', 400);
    try {
      const outcome = await issuePendingCertificate(attemptId, admin, origin);
      if (!outcome.ok) return deny(outcome.error, outcome.error === 'not_found' ? 404 : 409);
      console.log('admin action', admin.email, 'issue_pending', attemptId, outcome.issued ? 'issued' : 'already issued');
      return adminJson({ ok: true, issued: outcome.issued, serial: outcome.certificate.serial });
    } catch (err) {
      console.error('admin issue_pending failed', err);
      return adminJson({ error: 'server_error' }, 500);
    }
  }

  if (action === 'revoke_certificate') {
    const certificateId = typeof body?.certificate_id === 'string' ? body.certificate_id : '';
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (!UUID_RE.test(certificateId) || !reason || reason.length > 500) return deny('invalid', 400);
    try {
      const outcome = await revokeCertificate(certificateId, admin, reason);
      if (outcome !== 'revoked') return deny(outcome, outcome === 'not_found' ? 404 : 409);
      console.log('admin action', admin.email, 'revoke_certificate', certificateId);
      return adminJson({ ok: true });
    } catch (err) {
      console.error('admin revoke_certificate failed', err);
      return adminJson({ error: 'server_error' }, 500);
    }
  }

  if (action === 'rename_certificate') {
    const certificateId = typeof body?.certificate_id === 'string' ? body.certificate_id : '';
    const name = normalizeDisplayName(typeof body?.name === 'string' ? body.name : '');
    if (!UUID_RE.test(certificateId) || !name) return deny('invalid', 400);
    try {
      const row = await renameCertificate(certificateId, name);
      if (!row) return deny('not_found', 404);
      console.log('admin action', admin.email, 'rename_certificate', certificateId);
      return adminJson({ ok: true });
    } catch (err) {
      console.error('admin rename_certificate failed', err);
      return adminJson({ error: 'server_error' }, 500);
    }
  }
```

Also update the route's header comment so it names the certificates view and the three actions.

- [ ] **Step 3: Add the tab**

In `src/components/react/AdminView.tsx`:

1. Add `'certificates'` to the `Tab` union, and `{ id: 'certificates', label: 'Certificates' }` to the `tabs` array after the `enrollments` entry.
2. Add `import { DISPLAY_NAME_MAX } from '../../lib/course/certificateRules';` and make sure `useRef` is imported from `react`.
3. Add the state and the query ref beside the other tab state:

```tsx
  const [certificates, setCertificates] = useState<{ rows: AdminCertificateRow[]; pending: PendingPassRow[] } | null>(null);
  const certificateQuery = useRef('');
```

4. Add a branch to `loadTab` before the final `else`:

```tsx
    } else if (which === 'certificates') {
      const d = await call(`course?view=certificates&q=${encodeURIComponent(certificateQuery.current)}`);
      if (d) setCertificates({ rows: d.rows, pending: d.pending });
```

5. Render the tab beside the others:

```tsx
      {tab === 'certificates' && (
        <CertificatesTab
          data={certificates}
          onSearch={(q) => {
            certificateQuery.current = q;
            void loadTab('certificates');
          }}
          act={(body) => call('course', body)}
          reload={() => loadTab('certificates')}
          notify={setNotice}
        />
      )}
```

6. Add the row types and the component near `GradingTab`:

```tsx
interface AdminCertificateRow {
  id: string;
  serial: string;
  user_id: string;
  certification_version: string;
  attempt_id: string | null;
  display_name: string | null;
  name_confirmed_at: string | null;
  issued_at: string;
  status: 'active' | 'revoked';
  revoked_at: string | null;
  revoke_reason: string | null;
  share_active: boolean;
  email_sent_at: string | null;
}

interface PendingPassRow {
  attempt_id: string;
  user_id: string;
  certification_version: string;
  finalized_at: string | null;
}

/**
 * Certificates: a search box (serial, email or version), the passes still
 * waiting for a certificate, and the list. Learners appear by id, as in the
 * grading queue. Every action reloads the list either way, since a refusal
 * usually means the list was behind the database.
 */
function CertificatesTab({
  data,
  onSearch,
  act,
  reload,
  notify,
}: {
  data: { rows: AdminCertificateRow[]; pending: PendingPassRow[] } | null;
  onSearch: (q: string) => void;
  act: (body: Record<string, unknown>) => Promise<{ ok?: boolean; issued?: boolean; serial?: string } | null>;
  reload: () => Promise<void>;
  notify: (text: string) => void;
}) {
  const { prompt } = useDialog();
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const issue = async (attemptId: string) => {
    setBusyId(attemptId);
    const d = await act({ action: 'issue_pending', attempt_id: attemptId });
    if (d) notify(d.issued ? `Issued ${d.serial}.` : `Already issued as ${d.serial}.`);
    await reload();
    setBusyId(null);
  };
  const revoke = async (row: AdminCertificateRow) => {
    const reason = await prompt({
      title: `Revoke ${row.serial}?`,
      message: 'The learner sees the revoked state and the verification link stops resolving. There is no undo here.',
      label: 'Reason',
      maxLength: 500,
      confirmLabel: 'Revoke',
    });
    if (!reason?.trim()) return;
    setBusyId(row.id);
    const d = await act({ action: 'revoke_certificate', certificate_id: row.id, reason: reason.trim() });
    if (d) notify(`Revoked ${row.serial}.`);
    await reload();
    setBusyId(null);
  };
  const rename = async (row: AdminCertificateRow) => {
    const name = await prompt({
      title: `Rename ${row.serial}`,
      message: 'For a typo the learner reports. The confirmation stands; only the printed name changes.',
      label: 'Name',
      defaultValue: row.display_name ?? '',
      maxLength: DISPLAY_NAME_MAX,
      confirmLabel: 'Rename',
    });
    if (!name?.trim()) return;
    setBusyId(row.id);
    const d = await act({ action: 'rename_certificate', certificate_id: row.id, name: name.trim() });
    if (d) notify('Name updated.');
    await reload();
    setBusyId(null);
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSearch(q);
        }}
        className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-slate-600">
            Serial, email or version
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SSS-2026-00001" className="mt-1 block w-72 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </label>
          <button type="submit" className="btn-primary py-2 text-xs">
            Search
          </button>
        </div>
      </form>

      {data && data.pending.length > 0 && (
        <section className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-card">
          <h2 className="px-5 pt-4 font-heading text-base font-bold text-ink-800">Passes without a certificate</h2>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-3">Attempt</th>
                <th className="px-5 py-3">Learner</th>
                <th className="px-5 py-3">Version</th>
                <th className="px-5 py-3">Passed</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.pending.map((p) => (
                <tr key={p.attempt_id} className="border-t border-slate-100">
                  <td className="px-5 py-2.5 font-mono text-xs text-slate-500">{p.attempt_id.slice(0, 8)}</td>
                  <td className="px-5 py-2.5 font-mono text-xs text-slate-500">{p.user_id.slice(0, 8)}</td>
                  <td className="px-5 py-2.5">{p.certification_version}</td>
                  <td className="px-5 py-2.5 text-slate-400">{p.finalized_at ? `${date(p.finalized_at)} ${time(p.finalized_at)}` : ''}</td>
                  <td className="px-5 py-2.5">
                    <button
                      type="button"
                      disabled={busyId === p.attempt_id}
                      onClick={() => issue(p.attempt_id)}
                      className="rounded-full bg-brand-500 px-3.5 py-1 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                    >
                      Issue
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-5 py-3">Serial</th>
              <th className="px-5 py-3">Learner</th>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Version</th>
              <th className="px-5 py-3">Issued</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Link</th>
              <th className="px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data && data.rows.length === 0 && (
              <tr>
                <td className="px-5 py-6 text-slate-400" colSpan={8}>
                  No certificates match.
                </td>
              </tr>
            )}
            {data?.rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-5 py-2.5 font-mono text-xs">{r.serial}</td>
                <td className="px-5 py-2.5 font-mono text-xs text-slate-500">{r.user_id.slice(0, 8)}</td>
                <td className="px-5 py-2.5">{r.display_name ?? <span className="text-slate-400">not confirmed</span>}</td>
                <td className="px-5 py-2.5">{r.certification_version}</td>
                <td className="px-5 py-2.5 text-slate-400">
                  {date(r.issued_at)} {time(r.issued_at)}
                </td>
                <td className="px-5 py-2.5">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{r.status}</span>
                </td>
                <td className="px-5 py-2.5 text-slate-500">{r.share_active ? 'on' : 'off'}</td>
                <td className="space-x-2 px-5 py-2.5">
                  {r.status === 'active' && (
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => rename(r)}
                      className="rounded-full border border-slate-200 px-3.5 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300 disabled:opacity-60"
                    >
                      Rename
                    </button>
                  )}
                  {r.status === 'active' && (
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => revoke(r)}
                      className="rounded-full border border-rose-200 px-3.5 py-1 text-xs font-semibold text-rose-700 hover:border-rose-300 disabled:opacity-60"
                    >
                      Revoke
                    </button>
                  )}
                  {r.status === 'revoked' && r.revoke_reason && <span className="text-xs text-slate-400">{r.revoke_reason}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
```

`date()` and `time()` are the formatting helpers the file already uses in `GradingTab`; use whatever names they have there.

- [ ] **Step 4: Check and walk it with curl as the admin**

Run: `npm run check && npm test`
Expected: 0 errors; every test green.

With the dev server on 4321 and `$ADMIN` from Task 2's walk:

```bash
A=http://localhost:4321/api/admin/course
curl -s "$A?view=certificates" -H "Authorization: Bearer $ADMIN" | node -e 'process.stdin.on("data",d=>{const j=JSON.parse(d);console.log("rows",j.rows.length,"pending",j.pending.length, j.pending.map(p=>p.attempt_id).join(","))})'   # rows 1, pending 1 (the learner's pass)
PENDING=<the attempt id printed above>
curl -s $A -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d "{\"action\":\"issue_pending\",\"attempt_id\":\"$PENDING\"}"      # {"ok":true,"issued":true,"serial":"SSS-2026-0000N"}; the dev server logs the certificate email as not sent (no Resend locally)
curl -s $A -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d "{\"action\":\"issue_pending\",\"attempt_id\":\"$PENDING\"}"      # {"ok":true,"issued":false,"serial":...}: reported, not refused
curl -s $A -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"action":"issue_pending","attempt_id":"00000000-0000-0000-0000-000000000000"}'   # {"error":"not_found",...} 404
curl -s "$A?view=certificates" -H "Authorization: Bearer $ADMIN" | node -e 'process.stdin.on("data",d=>{const j=JSON.parse(d);console.log("rows",j.rows.length,"pending",j.pending.length)})'   # rows 2, pending 0
curl -s "$A?view=certificates&q=course-learner@example.com" -H "Authorization: Bearer $ADMIN" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).rows.length))'   # 1
curl -s "$A?view=certificates&q=nobody@example.com" -H "Authorization: Bearer $ADMIN" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).rows.length))'          # 0
LEARNER_CERT=<the learner's certificate id from the email search>
curl -s $A -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d "{\"action\":\"rename_certificate\",\"certificate_id\":\"$LEARNER_CERT\",\"name\":\"Grace Hopper\"}"   # {"ok":true}
curl -s http://localhost:4321/api/course/certificate -H "Authorization: Bearer $LEARNER" | node -e 'process.stdin.on("data",d=>{const c=JSON.parse(d).certificate;console.log(c.display_name, c.name_confirmed_at)})'   # Grace Hopper null (the learner still confirms; confirming overwrites the name)
curl -s $A -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d "{\"action\":\"revoke_certificate\",\"certificate_id\":\"$LEARNER_CERT\",\"reason\":\"test revoke\"}"   # {"ok":true}
curl -s $A -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d "{\"action\":\"revoke_certificate\",\"certificate_id\":\"$LEARNER_CERT\",\"reason\":\"again\"}"        # {"error":"already_revoked",...} 409
curl -s http://localhost:4321/api/course/certificate -H "Authorization: Bearer $LEARNER" -H 'Content-Type: application/json' -d '{"action":"confirm_name","name":"Grace Hopper"}'   # {"error":"certificate_revoked"} 409
curl -s -o /dev/null -w "%{http_code}\n" $A -H "Authorization: Bearer $LEARNER" -H 'Content-Type: application/json' -d '{"action":"issue_pending","attempt_id":"00000000-0000-0000-0000-000000000000"}'   # 403 (not an admin)
```

Then in a browser signed in as the admin, open `/admin`, Certificates tab: the search form, the list with the two certificates (one active with Rename and Revoke, one revoked with its reason), and no pending section. Type the learner's email and search: one row.

- [ ] **Step 5: CRLF and commit**

Run: `unix2dos -q src/lib/server/course/adminCertificates.ts`

```bash
git add src/lib/server/course/adminCertificates.ts src/pages/api/admin/course.ts src/components/react/AdminView.tsx
git commit -m "Give the admin area a Certificates tab with issue, revoke and rename"
```

---

### Task 7: Docs, the browser pass and the visual record (controller)

**Files:**
- Modify: `docs/architecture.md`, `docs/deployment.md`, `docs/status.md`, `docs/change-checklist.md`, `docs/features/course/README.md`, `docs/superpowers/plans/2026-09-12-course-phase3a-results-retakes-result-email.md` (one sentence)
- Create: screenshots under `docs/features/course/`

- [ ] **Step 1: Architecture and checklist**

`docs/architecture.md`: add rows to the course routes table for `/course/learn/certificate` (`pages/course/learn/certificate.astro`, "The learner's certificate: name confirmation, printing and the verification link (`CertificateView` island)"), `/course/verify/[token]` (`pages/course/verify/[token].astro`, "Server-rendered; confirms a shared certificate, or shows the same not-active page for every miss"), `/api/course/certificate` (`pages/api/course/certificate.ts`, "The learner's certificate: confirm the name once, turn the verification link on and off; sign-in and ownership, not enrollment"), and extend the `/api/admin/course` row to name certificates. Name `0032` where the migrations are listed.

`docs/change-checklist.md`: in the course pages section, one bullet: the verify page is server-rendered, `noindex` by meta and by the `X-Robots-Tag` header, registered in the OG route by hand, and deliberately absent from the robots Disallow list, since a Disallow would keep crawlers from reading the noindex.

- [ ] **Step 2: Deployment**

In `docs/deployment.md`:

1. "Course migrations and advisors": add `0032_course_certificates.sql` (the certificate email claim column, the audit columns, `issue_course_certificate`, `revoke_course_certificate`) to the paragraph and to the `proname` check's expected list; say it must be applied before the deploy that carries 3b, because the certificate reads select the new columns.
2. After "The result email" paragraph, a "The certificate email" paragraph in the same shape: sent from the worker after a pass with awards on, from the inline dev path, and from the admin's Issue action; once per certificate through `email_sent_at` and the key `course-certificate/<id>`; what an empty or set `email_sent_at` means when a learner writes in.
3. A new subsection "Certificates from /admin" after "Course access from /admin": the Certificates tab (search by serial, email or version; the pending list), Issue for a pass recorded while awards were off, Revoke (reason required; the verification link goes dark at once; no undo in the admin area), Rename for a typo; the verify page's behaviour and why it is not gated; that `COURSE_AWARDS_ENABLED` stays off until 3d and what that means (passes accumulate in the pending list).
4. "Registering the course events": add `certificate_issued` (no parameters) to the list David registers.

- [ ] **Step 3: Status**

In `docs/status.md`: update the date line and the "Current phase" row; in the Phase 3 paragraph, record 3a as shipped with the hosted email proven on the `course-beta` deploy on 2026-09-13 (one graded attempt produced one email, the sent-at column was set, and a kick through the admin API afterwards sent nothing), and add **3b, certificates and the verify page: code complete** with the plan link and a two-sentence summary; keep the "still to come" list at 3c and 3d.

In the 3a plan's execution record, replace the sentence "The real email is proven on the `course-beta` deploy after the merge." with one that states the proof (date, one email, sent-at set, the kick sent nothing).

- [ ] **Step 4: The browser pass and the screenshots**

With the local stack, the dev server on 4321, and the certificates the scratch walks and Task 6 produced, capture with the Playwright MCP (1280 wide unless named otherwise) and save under `docs/features/course/`:

- `certificate-name-confirmation-1280.png`: the name form (use a fresh certificate: revoke nothing; if both local certificates already carry a name, clear the learner's with local SQL `update public.course_certificates set display_name = null, name_confirmed_at = null, status = 'active', revoked_at = null, revoke_reason = null, revoked_by = null where user_id = (select id from auth.users where email = 'course-learner@example.com');` and sign in as the learner).
- `certificate-issued-1280.png`: the sheet with the name, the meaning sentence, issued date, version and serial, and the link section with the url.
- `certificate-print-1280.png`: the same page under print media emulation (`page.emulateMedia({ media: 'print' })` through `browser_run_code_unsafe`), showing the sheet alone.
- `certificate-link-390.png`: the verification link section at 390 wide.
- `verify-active-1280.png`: the verify page for the active link.
- `verify-not-active-390.png`: the verify page for a wrong token at 390 wide.
- `admin-certificates-1280.png`: the Certificates tab with a pending pass if one exists, else the list.

Add a captioned row per screenshot to `docs/features/course/README.md` in the table's voice.

- [ ] **Step 5: Gates and commit**

Run: `grep -rn $'\xe2\x80\x94\|\xe2\x80\x93' src/ docs/ | grep -v node_modules | head` (expect no hits in files this branch touched), `npm test`, `npm run check`, `PUBLIC_COURSE_STATUS=hidden npm run build` with the dist scan ok, and the HTML asserts from Task 3 step 6 plus `ls dist/og/course/verify.png` and `grep -c "course/verify" dist/sitemap-0.xml` (0).\xe2\x80\x94\|\xe2\x80\x93' src/ docs/ | grep -v node_modules | head` (expect no hits in files this branch touched), `npm test`, `npm run check`, `PUBLIC_COURSE_STATUS=hidden npm run build` with the dist scan ok, and the HTML asserts from Task 3 step 6 plus `ls dist/og/course/verify.png` and `grep -c "course/verify" dist/sitemap-0.xml` (0).

```bash
git add docs/ 
git commit -m "Document certificates and add their visual record"
```

---

## Notes for the controller

- **Scratch walk 1 (before Task 2): a pass with awards on for the admin.** In `.env.local` set `COURSE_AWARDS_ENABLED=true` (local only). The admin account has an open draft on the deleted form `sample-p2`, which blocks a new start: delete it with local SQL (`delete from public.course_assessment_attempts where user_id = (select id from auth.users where email = 'course-admin@example.com') and state = 'draft';`). Copy `src/content/course/assessment-forms/sample-p0.json` to `sample-p3.json` in the same folder with `form_id` set to `sample-p3` (untracked, never committed, deleted at the close). Restart the dev server, run the 3a walk helper in `pass` mode as the admin, wait for the grade (about a minute; one real grade, about thirty cents), and confirm with SQL that the attempt is `passed` and `course_certificates` holds one row for the admin with `attempt_id` set and `issued_by` null: this is the only local exercise of `finalize_course_grade`'s award branch. Then set `COURSE_AWARDS_ENABLED=false` again.
- **Scratch walk 2 (before Task 6): a pending pass for the learner.** Add `course-learner@example.com` to `ADMIN_EMAILS` in `.env.local` so the account is eligible with one lesson published (admins bypass the module gate); keep awards off; restart; run the walk in `pass` mode as the learner on `sample-p0` (unexposed for that account). Confirm `passed` with no certificate row: the pending pass Task 6 issues. The learner stays an admin locally for the rest of the phase; it changes nothing in the browser pass except that `/admin` opens for it too.
- **Local emails** log "not sent (RESEND_API_KEY or EMAIL_FROM unset)" and return false; `email_sent_at` stays null locally because the configuration check runs before the claim. That is the expected local outcome; the hosted proof is in the Handoff.
- **At the close:** delete `sample-p3.json`, restore `.env.local` (`ADMIN_EMAILS=course-admin@example.com`, awards off or the line removed), and confirm `git status` shows nothing untracked under `src/content/`.
- Review each task with the global constraints as the lens; the whole-branch review goes to the most capable model. The likely places for a Critical are the verify page's miss handling (must be one page, one status, no timing difference worth exploiting), the `certificate` field reaching the read-only assessment view, and the worker's import closure.

## Handoff

After the merge, in this order:

1. **David applies `0032` to the hosted project before the deploy carries 3b** (`npx supabase db push`, then `npx supabase migration list`), then runs the `proname` check and `npx supabase db advisors --linked` (no new findings expected beyond the accepted server-only rows). Until this is done, the hosted assessment status route would fail on the new columns, so the merge waits for it.
2. Fast-forward `course-beta` to main and let the branch deploy build.
3. On the branch deploy, as the admin: `/admin`, Certificates: the alias account's pass (job `d2139a6d`, recorded with awards off) is in the pending list; press Issue. The alias inbox receives "Your certificate is ready"; `course_certificates.email_sent_at` is set on the hosted row.
4. As the alias: open the link, confirm a name, print preview, turn the link on, open the verify url in a private window (active), turn it off (not active), turn it on (the same url works).
5. As the admin: Revoke it with a reason; the verify url shows not active; the alias's page shows the revoked state.
6. Production stays `hidden` and `COURSE_AWARDS_ENABLED` stays `false` everywhere until 3d.

Then 3c: review requests, the review queue and regrades.
