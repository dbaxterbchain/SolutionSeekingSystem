# Course Phase 3c: Review Requests, the Review Queue and Regrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a learner say a criterion was scored wrongly, and let the operator answer: read the grade beside the learner's words, correct what was wrong, and record a new grade that supersedes the old one without erasing it.

**Architecture:** Phase 3 is four sub-plans: 3a results and retakes (done), 3b certificates and the verify page (done), **3c** (this one), 3d the grader benchmark and the release gate. 3c adds one migration (`0033`: two columns and two SQL functions beside the frozen `0031` and `0032`), one learner action on `POST /api/course/assessment`, a request form in the assessment island, an email on the shared claim-then-send skeleton, and a Reviews tab in `/admin` that resolves a review into a corrected grade. Scoring stays where it already lives: the operator supplies corrections, `decide()` recomputes the total and the pass, and SQL only persists what TypeScript computed, exactly as the grading worker already works.

**Tech Stack:** Astro 5 (static-first, `@astrojs/netlify`), React islands, Supabase service role and SQL functions, the Resend SDK, vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-paid-video-course-design.md`, sections "Data model" (the `course_review_requests` row), "Attempt lifecycle" (the `review` action row), "Certificates, verification, reviews, emails, admin (Phase 3 build)" (the reviews paragraph, the review email, and the `?view=reviews` admin surface), and the security checklist.

## Global Constraints

- **Nothing we publish reads as though a machine wrote it.** No em dashes or en dashes anywhere in copy, comments, docs, SQL comments or commit messages; fix the sentence, never the character. No "delve", no "It's not just X, it's Y", no list where every item opens the same way. Never type a count or a price into prose; derive it from the constant.
- **Line endings.** Every file is CRLF. New files get `unix2dos -q <file>`; existing files are edited with the Edit tool only, never `sed -i`.
- **Learner data stays scoped.** Every review read for a learner is by `user_id`; a miss is a 404 so ids are not probeable. The admin route is the only cross-account reader and calls `requireAdmin` first.
- **The grader scores, the server decides.** A corrected grade is built by applying the operator's corrections to the stored grade and running `decide()` over the result. No SQL function reimplements a cap, a weight or the pass rule.
- **A grade is never edited.** A resolution inserts a new grade at the next generation with `source = 'review'` and repoints the attempt at it. The superseded grade stays exactly as the grader left it.
- **Every `/api/course/*` response goes through `privateJson`**; the assessment route gates with `requireEnrolled`; hand-rolled validation; snake_case error codes.
- **The email rules.** Subject "We received your review request"; no score, no quote and no criterion name in the subject or body; the link lands on the assessment page, which asks for sign-in; one email per review, keyed `course-review-received/<id>`, with `course_review_requests.email_sent_at` claimed before the send. It goes out through `sendClaimedEmail` in `courseEmail.ts` rather than a second copy of that logic.
- **Worker-shared modules** (`gradingJob.ts`, `jobStore.ts`, `grader.ts`, `gradingAlert.ts`, `resultEmail.ts`, `courseEmail.ts`, `certificateEmail.ts`) import nothing from `astro:content`, `src/lib/server/env.ts`, `supabaseAdmin.ts`, `rateLimit.ts`, `src/data/course.ts`, `src/lib/server/email.ts` or `import.meta.env`. `scripts/check-private-content.mjs` walks the worker's import closure and enforces it. Nothing in this plan is reachable from that closure, but `courseEmail.ts` is, so anything added to it obeys the rule.
- **Tests.** vitest under `src/lib/course/__tests__/**` and `src/lib/server/course/__tests__/**`; pure rules and the email module get tests; routes, pages and islands are verified with curl, the build and the browser. `npm run check` and `npm test` green before every commit; `npm run build` green with the dist scan ok before the last one.
- **Commits.** One per task, house voice, ending with the trailer for the model that wrote it: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`, `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` or `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. The `git commit` lines below show the title only.
- **Never** run `npx supabase db push`, `db push --linked`, `migration up --linked` or `db reset`; never print `.env` or `.env.local` values, echo a key or token, or commit a secret; never edit `0030_course.sql`, `0031_course_assessment.sql` or `0032_course_certificates.sql`, all three applied to the hosted project and frozen. The new `0033` is applied to the **local** database only, with `npx supabase migration up` (no `--linked`). The hosted apply happens before the merge deploys.
- **Spend.** A grade under `astro dev` calls the real model and costs about thirty cents. Implementers never submit an assessment or run a grade. The controller creates the graded attempts the tasks need.
- **Branch.** `course-phase3c` from `main` after PR #22.

## Shapes in place

- `supabase/migrations/0031_course_assessment.sql`: `course_review_requests (id uuid, attempt_id uuid not null, user_id uuid not null, grade_id uuid null, criterion_id text not null, reason text check between 20 and 2000, state 'open' | 'resolved' default 'open', owner text null, resolution text null, original_scores jsonb null, corrected_scores jsonb null, certificate_action 'none' | 'issue' | 'revoke' default 'none', resolved_at timestamptz null, created_at, updated_at)`; a partial unique index on `attempt_id where state = 'open'`; indexes on `user_id` and `grade_id`; RLS on with no policies; `select, insert, update` to `service_role`. `course_grades (id, attempt_id, generation, job_id null, source 'model' | 'review', rubric_version, model, prompt_version, criteria, coverage, misconceptions, caps_applied, total numeric(6,3), passed, decision, created_at, unique (attempt_id, generation))`, granted `select, insert` only, so it is append only by design.
- `supabase/migrations/0032_course_certificates.sql`: `issue_course_certificate(p_attempt uuid, p_admin uuid)` and `revoke_course_certificate(p_certificate uuid, p_admin uuid, p_reason text)`, both `security invoker set search_path = ''`, execute revoked from `public, anon, authenticated` and granted to `service_role`. Their bodies are the pattern every new function in `0033` follows.
- `src/lib/server/course/decision.ts`: `decide(grade: ValidatedGrade): Decision`. It caps `wisdom_principles` at `COVERAGE_CAP` for each principle whose coverage is `missing` or `misapplied`, caps `judgment_tools` the same way for tools, caps the named criterion for each material misconception, sums `weight * effective / SCORE_MAX` unrounded, and passes on `total >= PASS_TOTAL` with every effective score at `PASS_MIN_CRITERION` or more. It returns the grade's own `rubric_version`, not the module's.
- `src/lib/course/assessmentTypes.ts`: `ValidatedGrade { attempt_id; rubric_version; criteria: ValidatedCriterion[]; principles: ValidatedCoverage<PrincipleId>[]; tools: ValidatedCoverage<ToolId>[]; material_misconceptions: ValidatedMisconception[] }`, `ValidatedCriterion { criterion_id; score: Score; reason; evidence_status; evidence: Evidence[]; revision_lesson_ids }`, `ValidatedCoverage<Id> { id; coverage: 'applied' | 'partial' | 'missing' | 'misapplied'; evidence }`, `ValidatedMisconception { criterion_id; description; evidence }`, `CapApplied { criterion_id; cause: 'principle' | 'tool' | 'misconception'; detail; from; to }`, `Decision { rubric_version; total; passed; raw; effective; caps_applied }`, `Score = 0 | 1 | 2 | 3 | 4`, `AssessmentStatus { attempt; job; result; awards_enabled; certificate; eligibility; support_contact }`, `ResultView`, `CriterionFeedback`, `AttemptState`, `OPEN_ATTEMPT_STATES`.
- `src/lib/server/course/attempts.ts`: `ATTEMPT_COLUMNS` (never `snapshot_private`), `AttemptRow`, `GRADE_COLUMNS = 'id, criteria, misconceptions, caps_applied, total, passed, decision, created_at'` which deliberately omits `coverage` and `rubric_version`, `GradeRow { id; criteria; misconceptions; caps_applied; total; passed; decision; created_at }`, `loadOwnedAttempt(id, userId)`, `loadLatestAttempt(userId)`, `loadGrade(gradeId)`, `loadResponses(attemptId)`, `loadAssessmentSummary(userId)`. Every function throws with a prefix on a database error and the route answers 503 `assessment_unavailable`.
- `src/pages/api/course/assessment.ts`: `ACTIONS = ['start', 'save', 'advance', 'submit', 'status', 'list']`, `POST` switching on `action`, `statusFor(user, row)` building `AssessmentStatus` from a `Promise.all`, `eligibility(user, row)`, `resultView(grade, row)` which maps the stored criteria onto `CRITERIA` and resolves lesson links, helpers `bad(field)`, `str(v)`, `isRecord(v)`, `UUID_RE`, and a `catch` that logs and answers 503.
- `src/lib/courseClient.ts`: `AssessmentAction`, `postAssessment<T>`, `startAssessment`, `fetchAssessmentStatus`, `saveAssessmentResponse`, `advanceAssessment`, `submitAssessment`, `listAttempts`, `fetchCertificate`, `confirmCertificateName`, `setCertificateSharing`, `courseErrorMessage(code)` ending in a `default`, `notEligibleMessage(reason)`, `CourseActionError { code; status; extra }`, and a type re-export line from `./course/assessmentTypes`.
- `src/components/react/AssessmentView.tsx`: `useSession`, `useDialog().confirm`, `load()`, the poll while `submitted` or `grading`, `Intro`, `Stages`, `Prompt`, `ReadOnlyAttempt`, `AttemptHistory`, `Result({ result, awardsEnabled, certificate })` with four passed-result branches, `Criterion({ feedback, caps })`, `ErrorLine({ text })`, and `messageFor(err)`.
- `src/lib/server/course/courseEmail.ts`: `CourseEmailConfig { apiKey; from }`, `CourseMail { subject; text; html }`, `escapeHtml`, `courseMail({ subject, intro, button, footer })`, `ClaimedSend { label; key; claim; to; mail }`, `sendClaimedEmail(config, args)` which checks configuration, claims, looks up the address, sends under the key and never throws. `certificateEmail.ts` is the smallest example of a module built on it.
- `src/lib/server/course/adminCertificates.ts`: the shape an admin module takes here, including `resolveEmails(userIds)` from `adminEnrollment.ts` for showing a learner by address, and `sendCertificateEmail(certificate, origin)` for sending from the Astro side with `serverEnv`.
- `src/pages/api/admin/course.ts`: `requireAdmin` first, `adminJson`, a `MESSAGES` record keyed by error code, `deny(error, status)`, `GET` branching on `view` (`enrollments`, `content`, `certificates`, else `grading`), `POST` branching on `action` (`retry_job`, `kick_job`, `grant`, `revoke`, `refund`, `reinstate`, `issue_pending`, `revoke_certificate`, `rename_certificate`, `resend_certificate_email`), `origin` from the request url, `UUID_RE`, and a `console.log('admin action', admin.email, ...)` line per action.
- `src/components/react/AdminView.tsx`: `Tab` union, the `tabs` array, `call(path, body?)`, `loadTab(which)` with a branch per `?view=`, `setNotice` and `setError`, `date()` and `time()` helpers accepting `string | null`, the `Learner({ email, userId })` cell, `useDialog().prompt`, and `CertificatesTab` as the closest model for a new tab with a list and actions.
- Local test setup: the local Supabase stack; `course-admin@example.com` (admin, enrolled) and `course-learner@example.com` (enrolled), password `course-test-password-1`; the dev server binds 4321; `.env.local` holds `ADMIN_EMAILS=course-admin@example.com` and a test `STRIPE_PRICE_ID_COURSE`; bearer tokens expire after an hour, so mint them in the same call as the request; `docker exec -i supabase_db_SolutionSeekingSystem psql -U postgres -d postgres -c "..."` for SQL; Resend is not configured locally, so every email path logs that it was not sent and returns false, which is the expected local outcome.

## Rulings

1. **A review is about one criterion, and there is one open review per attempt.** The partial unique index in `0031` already says so. A learner who thinks two criteria are wrong says so in the reason of one request; the operator can correct any number of criteria when resolving. Cost if wrong: a learner writes one paragraph instead of two requests.
2. **A resolution corrects scores and withdraws findings, rather than editing a grade.** The operator sends the criterion scores they changed and the coverage findings and misconceptions they judged wrong. The corrected grade is rebuilt from the stored one with those substitutions and run through `decide()`, so the caps, the weights and the pass rule stay in the one module that owns them. Cost if wrong: an operator who wants to change something outside that set has to say so in the resolution text and nothing else moves.
3. **A resolution may issue or revoke a certificate whatever `COURSE_AWARDS_ENABLED` says.** The flag exists to hold back automatic awards until the grader has passed its benchmark. An operator resolving a review has read the response themselves, which is a stronger warrant than the flag withholds. Cost if wrong: a certificate exists before the release gate, which the admin can revoke.
4. **The admin sees the learner's responses and the grader's findings, not `snapshot_private`.** The spec offers the reference response for the criterion under review, but reference responses are per prompt and criteria are not, so there is no clean mapping and shipping the private snapshot into the admin UI to build one adds risk for little gain. What judging a score actually needs is the response, the grader's reason and its quotes, and all three are already available. Cost if wrong: the operator opens the form file to compare.
5. **A learner may ask for a review once the attempt has a grade, whether they passed or not.** A pass at the bottom of the band can be worth questioning, and refusing reviews to people who passed would make the queue look better than the grader is. Cost if wrong: a few reviews that end with the resolution agreeing with the grader.
6. **The email names no criterion.** It says the request arrived and links to the assessment page. Naming the criterion in an email would be the first thing about a score to reach an inbox, and the result itself deliberately never does that. Cost if wrong: one more sentence later.
7. **Resolving is final, like revoking a certificate.** There is no reopen action. A second look at the same attempt is a second grade, which the resolution already knows how to insert. Cost if wrong: an operator who resolves too early cannot undo the state, though nothing is lost, since the next resolution supersedes it.

---

### Task 1: Migration 0033, the pure review rules, and the shared types

**Files:**
- Create: `supabase/migrations/0033_course_reviews.sql`
- Create: `src/lib/course/reviewRules.ts`
- Create: `src/lib/course/__tests__/reviewRules.test.ts`
- Modify: `src/lib/course/assessmentTypes.ts` (review types; `AssessmentStatus.review`)

**Interfaces:**
- Consumes: `ValidatedGrade`, `ValidatedCriterion`, `ValidatedCoverage`, `ValidatedMisconception`, `Score`, `CapApplied` from `assessmentTypes.ts`; `CriterionId`, `PrincipleId`, `ToolId` from `src/data/certification.ts`.
- Produces: SQL `create_course_review(p_attempt uuid, p_user uuid, p_criterion text, p_reason text, p_grade uuid, p_original jsonb) -> jsonb {outcome: 'not_found' | 'not_reviewable' | 'review_open' | 'created', review_id?}` and `resolve_course_review(p_review uuid, p_admin uuid, p_owner text, p_resolution text, p_grade jsonb, p_corrected jsonb, p_certificate_action text) -> jsonb {outcome: 'not_found' | 'already_resolved' | 'resolved', grade_id?, passed?, certificate?}`; columns `email_sent_at`, `resolved_by`; TypeScript `ReviewState`, `CertificateAction`, `ReviewSummary`, `ReviewCorrections`, `AdminReviewView`; `REVIEW_REASON_MIN`, `REVIEW_REASON_MAX`, `normalizeReviewReason`, `isCriterionId`, `applyReviewCorrections`, `correctedScoreMap`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0033_course_reviews.sql`:

```sql
-- Review requests: a learner says a criterion was scored wrongly, and an
-- operator answers. 0031 created the table; this migration adds the claim
-- column for the review email, records who resolved a request, and gives the
-- two state changes a function each so the writes that must happen together
-- cannot come apart. Same rules as 0030 to 0032: RLS on, no policies,
-- service_role only, security invoker, empty search_path. Nothing here
-- computes a score: the corrected grade arrives already built and decided by
-- decision.ts, which is the only place that owns the rubric.

alter table public.course_review_requests
  add column if not exists email_sent_at timestamptz,
  add column if not exists resolved_by uuid references auth.users (id) on delete set null;

comment on column public.course_review_requests.email_sent_at is
  'Claimed by the sender before the review-received email goes out: the guard that outlives the Resend idempotency window.';
comment on column public.course_review_requests.resolved_by is
  'The admin who resolved it.';

/*
 * Open a review. The attempt row lock serialises two requests racing from two
 * tabs; the partial unique index on open requests is what actually forbids a
 * second one, so a race that gets past the lock lands on the constraint and is
 * reported rather than raised.
 */
create or replace function public.create_course_review(
  p_attempt uuid, p_user uuid, p_criterion text, p_reason text, p_grade uuid, p_original jsonb
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_attempt public.course_assessment_attempts%rowtype;
  v_id uuid;
begin
  select * into v_attempt from public.course_assessment_attempts
    where id = p_attempt and user_id = p_user for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  -- A review is about a grade, so there has to be one.
  if v_attempt.state not in ('passed', 'needs_revision') or v_attempt.grade_id is null then
    return jsonb_build_object('outcome', 'not_reviewable');
  end if;
  begin
    insert into public.course_review_requests
      (attempt_id, user_id, grade_id, criterion_id, reason, original_scores)
    values (p_attempt, p_user, p_grade, p_criterion, p_reason, p_original)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('outcome', 'review_open');
  end;
  return jsonb_build_object('outcome', 'created', 'review_id', v_id);
end $$;

/*
 * Resolve a review. The corrected grade arrives whole: criteria, coverage,
 * misconceptions, the caps decision.ts applied, the total and the pass. This
 * function persists it at the next generation, points the attempt at it, and
 * applies the certificate action the operator chose, all under one lock. The
 * superseded grade is left exactly as the grader wrote it, because
 * course_grades is granted insert and select and nothing else.
 *
 * A certificate action here does not consult COURSE_AWARDS_ENABLED. That flag
 * holds back automatic awards until the grader has earned them; an operator
 * resolving a review has read the response.
 */
create or replace function public.resolve_course_review(
  p_review uuid, p_admin uuid, p_owner text, p_resolution text,
  p_grade jsonb, p_corrected jsonb, p_certificate_action text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_review public.course_review_requests%rowtype;
  v_attempt public.course_assessment_attempts%rowtype;
  v_generation integer;
  v_grade_id uuid;
  v_passed boolean;
  v_serial text;
  v_certificate uuid;
  v_applied text := 'none';
begin
  select * into v_review from public.course_review_requests where id = p_review for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_review.state = 'resolved' then
    return jsonb_build_object('outcome', 'already_resolved');
  end if;
  select * into v_attempt from public.course_assessment_attempts
    where id = v_review.attempt_id for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select coalesce(max(generation), 0) + 1 into v_generation
    from public.course_grades where attempt_id = v_attempt.id;
  v_passed := coalesce((p_grade->'decision'->>'passed')::boolean, false);

  insert into public.course_grades
    (attempt_id, generation, job_id, source, rubric_version, model, prompt_version,
     criteria, coverage, misconceptions, caps_applied, total, passed, decision)
  values
    (v_attempt.id, v_generation, null, 'review', p_grade->>'rubric_version', null, null,
     p_grade->'criteria', p_grade->'coverage',
     coalesce(p_grade->'misconceptions', '[]'::jsonb),
     coalesce(p_grade->'caps_applied', '[]'::jsonb),
     (p_grade->'decision'->>'total')::numeric, v_passed, p_grade->'decision')
  returning id into v_grade_id;

  update public.course_assessment_attempts
    set state = case when v_passed then 'passed' else 'needs_revision' end,
        grade_id = v_grade_id
    where id = v_attempt.id;

  if p_certificate_action = 'issue' then
    select id into v_certificate from public.course_certificates
      where user_id = v_attempt.user_id and certification_version = v_attempt.certification_version;
    if v_certificate is null then
      v_serial := 'SSS-' || to_char(now(), 'YYYY') || '-'
        || lpad(nextval('public.course_certificate_serial_seq')::text, 5, '0');
      insert into public.course_certificates (serial, user_id, certification_version, attempt_id, issued_by)
        values (v_serial, v_attempt.user_id, v_attempt.certification_version, v_attempt.id, p_admin)
        on conflict (user_id, certification_version) do nothing
        returning id into v_certificate;
    end if;
    v_applied := case when v_certificate is null then 'none' else 'issue' end;
  elsif p_certificate_action = 'revoke' then
    update public.course_certificates
      set status = 'revoked', revoked_at = now(), revoke_reason = p_resolution, revoked_by = p_admin
      where user_id = v_attempt.user_id
        and certification_version = v_attempt.certification_version
        and status = 'active'
      returning id into v_certificate;
    v_applied := case when v_certificate is null then 'none' else 'revoke' end;
  end if;

  update public.course_review_requests
    set state = 'resolved', owner = p_owner, resolution = p_resolution,
        corrected_scores = p_corrected, certificate_action = v_applied,
        resolved_at = now(), resolved_by = p_admin
    where id = p_review;

  return jsonb_build_object(
    'outcome', 'resolved', 'grade_id', v_grade_id, 'passed', v_passed,
    'certificate', v_applied
  );
end $$;

-- The service role is the only caller (the 0006 pattern).
revoke execute on function public.create_course_review(uuid, uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.create_course_review(uuid, uuid, text, text, uuid, jsonb) to service_role;
revoke execute on function public.resolve_course_review(uuid, uuid, text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant  execute on function public.resolve_course_review(uuid, uuid, text, text, jsonb, jsonb, text) to service_role;
```

- [ ] **Step 2: Apply it locally and prove what needs no data**

Run: `npx supabase migration up` (local only; never `--linked`).
Expected: `0033_course_reviews.sql` applies and `npx supabase migration list` shows `0033` under Local.

If the CLI refuses, apply by hand and record it:

```bash
docker exec -i supabase_db_SolutionSeekingSystem psql -U postgres -d postgres < supabase/migrations/0033_course_reviews.sql
docker exec -i supabase_db_SolutionSeekingSystem psql -U postgres -d postgres -c "insert into supabase_migrations.schema_migrations (version, name) values ('0033', 'course_reviews') on conflict do nothing;"
```

Then prove the outcomes that need no rows:

```bash
docker exec -i supabase_db_SolutionSeekingSystem psql -U postgres -d postgres -At -c "select proname from pg_proc where proname in ('create_course_review','resolve_course_review') order by 1;"
docker exec -i supabase_db_SolutionSeekingSystem psql -U postgres -d postgres -At -c "select public.create_course_review('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000000','wisdom_principles','x',null,null);"
docker exec -i supabase_db_SolutionSeekingSystem psql -U postgres -d postgres -At -c "select public.resolve_course_review('00000000-0000-0000-0000-000000000000',null,'x','y','{}'::jsonb,'{}'::jsonb,'none');"
docker exec -i supabase_db_SolutionSeekingSystem psql -U postgres -d postgres -At -c "select column_name from information_schema.columns where table_name='course_review_requests' and column_name in ('email_sent_at','resolved_by') order by 1;"
docker exec -i supabase_db_SolutionSeekingSystem psql -U postgres -d postgres -At -c "select has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('create_course_review','resolve_course_review');"
```

Expected, in order: both function names; `{"outcome": "not_found"}`; `{"outcome": "not_found"}`; both column names; `f` twice.

- [ ] **Step 3: Write the failing rules test**

Create `src/lib/course/__tests__/reviewRules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { REVIEW_REASON_MAX, REVIEW_REASON_MIN, applyReviewCorrections, correctedScoreMap, isCriterionId, normalizeReviewReason } from '../reviewRules';
import type { ValidatedGrade } from '../assessmentTypes';

const grade: ValidatedGrade = {
  attempt_id: 'att-1',
  rubric_version: '1',
  criteria: [
    { criterion_id: 'self_understanding', score: 3, reason: 'r', evidence_status: 'found', evidence: [], revision_lesson_ids: [] },
    { criterion_id: 'mutual_understanding', score: 4, reason: 'r', evidence_status: 'found', evidence: [], revision_lesson_ids: [] },
    { criterion_id: 'wisdom_principles', score: 4, reason: 'r', evidence_status: 'found', evidence: [], revision_lesson_ids: [] },
    { criterion_id: 'solution_quality', score: 3, reason: 'r', evidence_status: 'found', evidence: [], revision_lesson_ids: [] },
    { criterion_id: 'judgment_tools', score: 4, reason: 'r', evidence_status: 'found', evidence: [], revision_lesson_ids: [] },
    { criterion_id: 'learning_living_systems', score: 3, reason: 'r', evidence_status: 'found', evidence: [], revision_lesson_ids: [] },
  ],
  principles: [{ id: 'forgiveness', coverage: 'missing', evidence: [] }],
  tools: [{ id: 'feedback', coverage: 'applied', evidence: [] }],
  material_misconceptions: [{ criterion_id: 'solution_quality', description: 'said consensus means unanimity', evidence: [] }],
};

describe('normalizeReviewReason', () => {
  it('trims and collapses whitespace', () => {
    const raw = `  ${'a'.repeat(30)}   ${'b'.repeat(5)} `;
    expect(normalizeReviewReason(raw)).toBe(`${'a'.repeat(30)} ${'b'.repeat(5)}`);
  });
  it('refuses a reason that is too short, too long, or has no letters', () => {
    expect(normalizeReviewReason('too short')).toBeNull();
    expect(normalizeReviewReason('a'.repeat(REVIEW_REASON_MIN))).toHaveLength(REVIEW_REASON_MIN);
    expect(normalizeReviewReason('a'.repeat(REVIEW_REASON_MAX + 1))).toBeNull();
    expect(normalizeReviewReason('1'.repeat(40))).toBeNull();
  });
  it('refuses control and format characters, so a reason cannot carry an invisible payload', () => {
    expect(normalizeReviewReason('a'.repeat(30) + String.fromCharCode(7))).toBeNull();
    expect(normalizeReviewReason('a'.repeat(30) + String.fromCharCode(0x202e))).toBeNull();
  });
});

describe('isCriterionId', () => {
  it('accepts a published criterion and nothing else', () => {
    expect(isCriterionId('wisdom_principles')).toBe(true);
    expect(isCriterionId('made_up')).toBe(false);
    expect(isCriterionId('')).toBe(false);
  });
});

describe('applyReviewCorrections', () => {
  it('returns the grade untouched when nothing was corrected', () => {
    const out = applyReviewCorrections(grade, { scores: {}, principles: [], tools: [], misconceptions: [] });
    expect(out).toEqual(grade);
  });
  it('substitutes only the scores it was given', () => {
    const out = applyReviewCorrections(grade, { scores: { self_understanding: 4 }, principles: [], tools: [], misconceptions: [] });
    expect(out.criteria.find((c) => c.criterion_id === 'self_understanding')?.score).toBe(4);
    expect(out.criteria.find((c) => c.criterion_id === 'solution_quality')?.score).toBe(3);
  });
  it('withdraws a coverage finding by turning it into applied, so the cap it caused stops applying', () => {
    const out = applyReviewCorrections(grade, { scores: {}, principles: ['forgiveness'], tools: [], misconceptions: [] });
    expect(out.principles[0].coverage).toBe('applied');
  });
  it('drops a withdrawn misconception by its position', () => {
    const out = applyReviewCorrections(grade, { scores: {}, principles: [], tools: [], misconceptions: [0] });
    expect(out.material_misconceptions).toHaveLength(0);
  });
  it('never mutates the grade it was given', () => {
    const before = JSON.stringify(grade);
    applyReviewCorrections(grade, { scores: { wisdom_principles: 0 }, principles: ['forgiveness'], tools: [], misconceptions: [0] });
    expect(JSON.stringify(grade)).toBe(before);
  });
});

describe('correctedScoreMap', () => {
  it('records only the criteria whose score actually moved', () => {
    const corrected = applyReviewCorrections(grade, { scores: { self_understanding: 4 }, principles: [], tools: [], misconceptions: [] });
    expect(correctedScoreMap(grade, corrected)).toEqual({ self_understanding: { from: 3, to: 4 } });
  });
  it('is empty when only a finding was withdrawn', () => {
    const corrected = applyReviewCorrections(grade, { scores: {}, principles: ['forgiveness'], tools: [], misconceptions: [] });
    expect(correctedScoreMap(grade, corrected)).toEqual({});
  });
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `npx vitest run src/lib/course/__tests__/reviewRules.test.ts`
Expected: FAIL, the module `../reviewRules` cannot be found.

- [ ] **Step 5: Add the shared types**

In `src/lib/course/assessmentTypes.ts`, change the `AssessmentStatus` line so it reads `certificate: CertificateSummary | null; review: ReviewSummary | null;` and append after the certificate types:

```ts
export type ReviewState = 'open' | 'resolved';
export type CertificateAction = 'none' | 'issue' | 'revoke';

/** What the learner sees about their own review on the assessment page. */
export interface ReviewSummary {
  id: string;
  criterion_id: CriterionId;
  criterion_name: string;
  state: ReviewState;
  reason: string;
  resolution: string | null;
  created_at: string;
  resolved_at: string | null;
}

/** What an operator changes when resolving. Anything absent keeps what the grader said. */
export interface ReviewCorrections {
  scores: Partial<Record<CriterionId, Score>>;
  /** Principles whose coverage finding the operator judged wrong. */
  principles: PrincipleId[];
  /** Tools whose coverage finding the operator judged wrong. */
  tools: ToolId[];
  /** Positions in the stored material_misconceptions array to drop. */
  misconceptions: number[];
}

/** One row of the operator's review queue, with everything judging it needs. */
export interface AdminReviewView {
  id: string;
  attempt_id: string;
  user_id: string;
  email: string | null;
  state: ReviewState;
  criterion_id: CriterionId;
  criterion_name: string;
  reason: string;
  created_at: string;
  resolved_at: string | null;
  owner: string | null;
  resolution: string | null;
  certificate_action: CertificateAction;
  /** The grade under review, as the grader left it. */
  grade: {
    id: string;
    total: number;
    passed: boolean;
    rubric_version: string;
    criteria: ValidatedCriterion[];
    principles: ValidatedCoverage<PrincipleId>[];
    tools: ValidatedCoverage<ToolId>[];
    misconceptions: ValidatedMisconception[];
    caps_applied: CapApplied[];
  } | null;
  /** The learner's own words, so a score can be judged against them. */
  responses: { prompt_id: string; prompt_label: string; text: string }[];
  /** Whether this learner holds a certificate for the attempt's version right now. */
  certificate: { id: string; serial: string; status: 'active' | 'revoked' } | null;
}
```

- [ ] **Step 6: Write the rules module**

Create `src/lib/course/reviewRules.ts`:

```ts
/**
 * Pure review rules: what a learner may write when asking for a second look,
 * and how an operator's corrections are folded back into a grade. Nothing
 * here decides anything. The corrected grade this module builds goes through
 * decide() in decision.ts, which is the only place that owns the caps, the
 * weights and the pass rule.
 */

import { CRITERION_IDS, type CriterionId } from '../../data/certification';
import type { ReviewCorrections, ValidatedGrade } from './assessmentTypes';

export const REVIEW_REASON_MIN = 20;
export const REVIEW_REASON_MAX = 2000;

/** Control characters and format characters, the same guard the certificate's display name uses. */
const HIDDEN_RE = /[\p{Cc}\p{Cf}]/u;
const LETTER_RE = /\p{L}/u;

/**
 * The reason as it will be stored: trimmed, inner whitespace collapsed to one
 * space. Null when it is outside the bounds the column accepts, carries no
 * letter, or hides a control or format character. The bounds match the check
 * constraint in 0031, so a reason this returns can always be inserted.
 */
export function normalizeReviewReason(raw: string): string | null {
  const reason = raw.replace(/\s+/g, ' ').trim();
  if (reason.length < REVIEW_REASON_MIN || reason.length > REVIEW_REASON_MAX) return null;
  if (HIDDEN_RE.test(reason) || !LETTER_RE.test(reason)) return null;
  return reason;
}

export const isCriterionId = (value: string): value is CriterionId => (CRITERION_IDS as readonly string[]).includes(value);

/**
 * The grade as the operator says it should have read. Scores they did not
 * touch keep the grader's number; a withdrawn coverage finding becomes
 * applied, which is what stops it capping; a withdrawn misconception is
 * dropped. The grade passed in is never mutated.
 */
export function applyReviewCorrections(grade: ValidatedGrade, corrections: ReviewCorrections): ValidatedGrade {
  const principles = new Set<string>(corrections.principles);
  const tools = new Set<string>(corrections.tools);
  const dropped = new Set<number>(corrections.misconceptions);
  return {
    ...grade,
    criteria: grade.criteria.map((c) => {
      const corrected = corrections.scores[c.criterion_id];
      return corrected === undefined ? c : { ...c, score: corrected };
    }),
    principles: grade.principles.map((p) => (principles.has(p.id) ? { ...p, coverage: 'applied' as const } : p)),
    tools: grade.tools.map((t) => (tools.has(t.id) ? { ...t, coverage: 'applied' as const } : t)),
    material_misconceptions: grade.material_misconceptions.filter((_, i) => !dropped.has(i)),
  };
}

/** Which criterion scores actually moved, for the record kept on the review row. */
export function correctedScoreMap(before: ValidatedGrade, after: ValidatedGrade): Record<string, { from: number; to: number }> {
  const was = new Map(before.criteria.map((c) => [c.criterion_id, c.score]));
  const out: Record<string, { from: number; to: number }> = {};
  for (const c of after.criteria) {
    const from = was.get(c.criterion_id);
    if (from !== undefined && from !== c.score) out[c.criterion_id] = { from, to: c.score };
  }
  return out;
}
```

- [ ] **Step 7: Run the test to see it pass**

Run: `npx vitest run src/lib/course/__tests__/reviewRules.test.ts`
Expected: PASS, every test green.

- [ ] **Step 8: Run every gate**

Run: `npm test && npm run check`
Expected: every test green; `astro check` 0 errors; the guard prints its ok line. `src/pages/api/course/assessment.ts` will not compile until Task 2 adds the `review` field to the status it builds, so if `astro check` reports exactly that, add `review: null,` beside `certificate:` in `statusFor` now and say so in your report.

- [ ] **Step 9: CRLF and commit**

Run: `unix2dos -q supabase/migrations/0033_course_reviews.sql src/lib/course/reviewRules.ts src/lib/course/__tests__/reviewRules.test.ts`

```bash
git add supabase/migrations/0033_course_reviews.sql src/lib/course/reviewRules.ts src/lib/course/__tests__/reviewRules.test.ts src/lib/course/assessmentTypes.ts src/pages/api/course/assessment.ts
git commit -m "Add the review migration, its pure rules and the shared types"
```

---

### Task 2: The learner's review request, the client call and the email

**Files:**
- Create: `src/lib/server/course/reviews.ts`
- Create: `src/lib/server/course/reviewEmail.ts`
- Create: `src/lib/server/course/__tests__/reviewEmail.test.ts`
- Modify: `src/pages/api/course/assessment.ts` (the `review` action; `statusFor` carries the review)
- Modify: `src/lib/courseClient.ts` (`requestReview`, four error messages)

**Interfaces:**
- Consumes: Task 1's SQL, rules and types; `supabaseAdmin`; `loadOwnedAttempt`, `loadGrade`; `sendClaimedEmail`, `courseMail` from `courseEmail.ts`; `certificateOrigin` from `certificates.ts`; `CRITERIA` from `src/data/certification.ts`.
- Produces: `REVIEW_COLUMNS`, `ReviewRow`, `loadOwnedReview(attemptId, userId)`, `createReview(args)`, `markReviewEmailSent(reviewId)`, `reviewSummary(row)`; `reviewReceivedEmail({ assessmentUrl })`, `notifyLearnerOfReview(config, notice, deps)`; the route action `review`; client `requestReview(token, attemptId, criterionId, reason)`.

The controller has produced a graded attempt for `course-learner@example.com` before this task starts (Notes for the controller), so the walk below has a real grade to argue with.

- [ ] **Step 1: Write the server module**

Create `src/lib/server/course/reviews.ts`:

```ts
import { supabaseAdmin } from '../supabaseAdmin';
import { CRITERIA, type CriterionId } from '../../../data/certification';
import type { CertificateAction, ReviewState, ReviewSummary } from '../../course/assessmentTypes';

/**
 * A learner's review request. One open request per attempt is enforced by a
 * partial unique index in 0031, and the insert goes through
 * create_course_review so the attempt lock and that constraint are both on the
 * database side. Every read here is scoped by user id; a miss is a miss, so a
 * review id on its own opens nothing.
 */

export const REVIEW_COLUMNS =
  'id, attempt_id, user_id, grade_id, criterion_id, reason, state, owner, resolution, original_scores, corrected_scores, certificate_action, resolved_at, resolved_by, email_sent_at, created_at, updated_at' as const;

export interface ReviewRow {
  id: string;
  attempt_id: string;
  user_id: string;
  grade_id: string | null;
  criterion_id: CriterionId;
  reason: string;
  state: ReviewState;
  owner: string | null;
  resolution: string | null;
  original_scores: Record<string, number> | null;
  corrected_scores: Record<string, { from: number; to: number }> | null;
  certificate_action: CertificateAction;
  resolved_at: string | null;
  resolved_by: string | null;
  email_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

const criterionName = (id: CriterionId): string => CRITERIA.find((c) => c.id === id)?.name ?? id;

/** The learner-facing view. The operator's own notes on the row stay out of it apart from the resolution they wrote to be read. */
export const reviewSummary = (row: ReviewRow): ReviewSummary => ({
  id: row.id,
  criterion_id: row.criterion_id,
  criterion_name: criterionName(row.criterion_id),
  state: row.state,
  reason: row.reason,
  resolution: row.resolution,
  created_at: row.created_at,
  resolved_at: row.resolved_at,
});

/** The newest review on one of this learner's attempts, whatever its state. */
export async function loadOwnedReview(attemptId: string, userId: string): Promise<ReviewRow | null> {
  const { data, error } = await supabaseAdmin
    .from('course_review_requests')
    .select(REVIEW_COLUMNS)
    .eq('attempt_id', attemptId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`review load failed: ${error.message}`);
  return (data as ReviewRow | null) ?? null;
}

export type CreateReviewOutcome =
  | { outcome: 'created'; review: ReviewRow }
  | { outcome: 'not_found' | 'not_reviewable' | 'review_open' };

/** Open a review through the SQL function, then read the row back for the caller. */
export async function createReview(args: {
  attemptId: string;
  userId: string;
  criterionId: CriterionId;
  reason: string;
  gradeId: string | null;
  originalScores: Record<string, number>;
}): Promise<CreateReviewOutcome> {
  const { data, error } = await supabaseAdmin.rpc('create_course_review', {
    p_attempt: args.attemptId,
    p_user: args.userId,
    p_criterion: args.criterionId,
    p_reason: args.reason,
    p_grade: args.gradeId,
    p_original: args.originalScores,
  });
  if (error) throw new Error(`review create failed: ${error.message}`);
  const result = data as { outcome: CreateReviewOutcome['outcome']; review_id?: string };
  if (result.outcome !== 'created') return { outcome: result.outcome };
  const { data: row, error: loadError } = await supabaseAdmin
    .from('course_review_requests')
    .select(REVIEW_COLUMNS)
    .eq('id', result.review_id ?? '')
    .single();
  if (loadError) throw new Error(`review load failed: ${loadError.message}`);
  return { outcome: 'created', review: row as ReviewRow };
}

/** Sets email_sent_at where it is null; true when this call set it. */
export async function markReviewEmailSent(reviewId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('course_review_requests')
    .update({ email_sent_at: new Date().toISOString() })
    .eq('id', reviewId)
    .is('email_sent_at', null)
    .select('id');
  if (error) throw new Error(`review email claim failed: ${error.message}`);
  return (data ?? []).length === 1;
}
```

- [ ] **Step 2: Write the email and its failing test**

Create `src/lib/server/course/__tests__/reviewEmail.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send } };
  }),
}));

import { notifyLearnerOfReview, reviewReceivedEmail } from '../reviewEmail';

const config = { apiKey: 'key', from: 'Course <course@example.com>' };
const notice = { reviewId: 'rev-1', userId: 'user-1', assessmentUrl: 'https://example.com/course/learn/assessment/' };
const deps = (email: string | null, claimed: boolean) => ({ emailFor: vi.fn(async () => email), markSent: vi.fn(async () => claimed) });

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ error: null });
});

describe('reviewReceivedEmail', () => {
  it('names no criterion, no score and no quote', () => {
    const mail = reviewReceivedEmail({ assessmentUrl: notice.assessmentUrl });
    expect(mail.subject).toBe('We received your review request');
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain(notice.assessmentUrl);
      expect(body).not.toMatch(/score|criterion|passed|not yet|total/i);
    }
  });
});

describe('notifyLearnerOfReview', () => {
  it('claims the send, looks up the address, and sends once with the review as the key', async () => {
    const d = deps('learner@example.com', true);
    expect(await notifyLearnerOfReview(config, notice, d)).toBe(true);
    expect(d.markSent).toHaveBeenCalledWith('rev-1');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ to: 'learner@example.com', subject: 'We received your review request' });
    expect(send.mock.calls[0][1]).toEqual({ idempotencyKey: 'course-review-received/rev-1' });
  });
  it('sends nothing when the claim says it was already sent', async () => {
    const d = deps('learner@example.com', false);
    expect(await notifyLearnerOfReview(config, notice, d)).toBe(false);
    expect(d.emailFor).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run src/lib/server/course/__tests__/reviewEmail.test.ts`
Expected: FAIL, the module cannot be found.

Create `src/lib/server/course/reviewEmail.ts`:

```ts
import { courseMail, sendClaimedEmail, type CourseEmailConfig, type CourseMail } from './courseEmail';

/**
 * "We received your review request": an acknowledgement, nothing more. It
 * names no criterion and no score, because the result itself never puts one
 * in an inbox and a review is about a score. Built on the same claim-then-send
 * skeleton as the result and certificate emails.
 */

export interface ReviewNotice {
  reviewId: string;
  userId: string;
  assessmentUrl: string;
}

export interface ReviewNoticeDeps {
  emailFor(userId: string): Promise<string | null>;
  markSent(reviewId: string): Promise<boolean>;
}

export function reviewReceivedEmail(opts: { assessmentUrl: string }): CourseMail {
  return courseMail({
    subject: 'We received your review request',
    intro: 'Someone will read your assessment again and reply on your assessment page. You do not need to do anything while you wait.',
    button: { href: opts.assessmentUrl, label: 'Open your assessment' },
    footer: 'Sent because this address asked for a second look at an assessment on solutionseeking.com.',
  });
}

/** Once per review: the sent-at column is claimed first, and only the claim that won sends. Never throws. */
export function notifyLearnerOfReview(config: CourseEmailConfig, notice: ReviewNotice, deps: ReviewNoticeDeps): Promise<boolean> {
  return sendClaimedEmail(config, {
    label: `review ${notice.reviewId}: received email`,
    key: `course-review-received/${notice.reviewId}`,
    claim: () => deps.markSent(notice.reviewId),
    to: () => deps.emailFor(notice.userId),
    mail: reviewReceivedEmail({ assessmentUrl: notice.assessmentUrl }),
  });
}
```

Run: `npx vitest run src/lib/server/course/__tests__/reviewEmail.test.ts`
Expected: PASS.

- [ ] **Step 3: Add the route action**

In `src/pages/api/course/assessment.ts`:

1. Extend `ACTIONS` to `['start', 'save', 'advance', 'submit', 'status', 'list', 'review'] as const`.
2. Add the imports:

```ts
import { serverEnv } from '../../../lib/server/env';
import { isCriterionId, normalizeReviewReason } from '../../../lib/course/reviewRules';
import { createReview, loadOwnedReview, markReviewEmailSent, reviewSummary } from '../../../lib/server/course/reviews';
import { notifyLearnerOfReview } from '../../../lib/server/course/reviewEmail';
import { certificateOrigin } from '../../../lib/server/course/certificates';
```

3. Add `case 'review': return await review(auth.user, body, origin);` to the switch, beside `list`.
4. In `statusFor`, add `row ? loadOwnedReview(row.id, user.id) : Promise.resolve(null)` as a sixth element of the `Promise.all` bound as `reviewRow`, and set `review: reviewRow ? reviewSummary(reviewRow) : null,` beside `certificate:`.
5. Add the handler beside `list`:

```ts
/**
 * Ask for a second look at one criterion. One open request per attempt, which
 * the database enforces; the request stores the grader's scores as they stood,
 * so a resolution can say what moved. The acknowledgement email is sent after
 * the row exists and never blocks the answer.
 */
async function review(user: User, body: Record<string, unknown>, origin: string): Promise<Response> {
  const attemptId = str(body.attempt_id);
  if (!UUID_RE.test(attemptId)) return bad('attempt_id');
  const criterionId = str(body.criterion_id);
  if (!isCriterionId(criterionId)) return bad('criterion_id');
  const reason = normalizeReviewReason(str(body.reason));
  if (!reason) return bad('reason');

  const row = await attempts.loadOwnedAttempt(attemptId, user.id);
  if (!row) return privateJson({ error: 'not_found' }, 404);
  if (!row.grade_id) return privateJson({ error: 'not_reviewable' }, 409);
  const grade = await attempts.loadGrade(row.grade_id);
  const originalScores: Record<string, number> = {};
  for (const c of grade?.criteria ?? []) originalScores[c.criterion_id] = c.score;

  const outcome = await createReview({
    attemptId: row.id,
    userId: user.id,
    criterionId,
    reason,
    gradeId: row.grade_id,
    originalScores,
  });
  if (outcome.outcome === 'not_found') return privateJson({ error: 'not_found' }, 404);
  if (outcome.outcome === 'not_reviewable') return privateJson({ error: 'not_reviewable' }, 409);
  if (outcome.outcome === 'review_open') return privateJson({ error: 'review_open' }, 409);

  await notifyLearnerOfReview(
    { apiKey: serverEnv('RESEND_API_KEY'), from: serverEnv('EMAIL_FROM') },
    { reviewId: outcome.review.id, userId: user.id, assessmentUrl: `${certificateOrigin(origin)}/course/learn/assessment/` },
    {
      emailFor: async (userId) => {
        const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (error) console.error(`review ${outcome.review.id}: learner lookup failed`, error);
        return data.user?.email ?? null;
      },
      markSent: (id) => markReviewEmailSent(id),
    }
  );

  return privateJson(await statusFor(user, row));
}
```

If `supabaseAdmin` is not already imported in this file, add `import { supabaseAdmin } from '../../../lib/server/supabaseAdmin';` beside the other server imports.

- [ ] **Step 4: Add the client call and its copy**

In `src/lib/courseClient.ts`:

1. Extend `AssessmentAction` with `| 'review'`.
2. Extend the type re-export line with `ReviewSummary` (keep it alphabetical).
3. In `courseErrorMessage`, before `case 'assessment_unavailable':`, add:

```ts
    case 'review_open':
      return 'You already have a review request open on this attempt. We will reply on this page.';
    case 'not_reviewable':
      return 'This attempt has no result to review yet.';
```

4. After `listAttempts`, add:

```ts
/** Ask for a second look at one criterion of a finished attempt. */
export const requestReview = (accessToken: string, attemptId: string, criterionId: string, reason: string): Promise<AssessmentStatus> =>
  postAssessment(accessToken, { action: 'review', attempt_id: attemptId, criterion_id: criterionId, reason });
```

- [ ] **Step 5: Check and walk it**

Run: `npm run check && npm test`
Expected: 0 errors; every test green.

With the dev server on 4321, mint a bearer in the same call and walk it. The learner has a graded attempt; read its id from the status:

```bash
ANON=$(npx supabase status -o env | grep '^ANON_KEY=' | cut -d= -f2- | tr -d '"')
tok() { curl -s "http://127.0.0.1:55321/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H "Content-Type: application/json" -d "{\"email\":\"$1\",\"password\":\"course-test-password-1\"}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).access_token))'; }
LEARNER=$(tok course-learner@example.com)
A=http://localhost:4321/api/course/assessment
ATT=$(curl -s $A -H "Authorization: Bearer $LEARNER" -H 'Content-Type: application/json' -d '{"action":"status"}' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).attempt.id))')
R='{"action":"review","attempt_id":"'$ATT'","criterion_id":"wisdom_principles","reason":"The grader said forgiveness was missing, but my second paragraph says I stopped looking for who to blame and I think that is the same thing."}'
curl -s $A -H "Authorization: Bearer $LEARNER" -H 'Content-Type: application/json' -d "$R" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).review)))'   # the review, state open, criterion named
curl -s $A -H "Authorization: Bearer $LEARNER" -H 'Content-Type: application/json' -d "$R" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).error))'                       # review_open
curl -s $A -H "Authorization: Bearer $LEARNER" -H 'Content-Type: application/json' -d '{"action":"review","attempt_id":"'$ATT'","criterion_id":"made_up","reason":"'"$(printf 'a%.0s' $(seq 1 40))"'"}'                # bad_request, field criterion_id
curl -s $A -H "Authorization: Bearer $LEARNER" -H 'Content-Type: application/json' -d '{"action":"review","attempt_id":"'$ATT'","criterion_id":"solution_quality","reason":"too short"}'                                # bad_request, field reason
curl -s $A -H "Authorization: Bearer $LEARNER" -H 'Content-Type: application/json' -d '{"action":"review","attempt_id":"00000000-0000-0000-0000-000000000000","criterion_id":"solution_quality","reason":"'"$(printf 'a%.0s' $(seq 1 40))"'"}'   # not_found, 404
curl -s $A -H "Authorization: Bearer $LEARNER" -H 'Content-Type: application/json' -d '{"action":"status"}' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).review)))'   # the same review comes back on a plain status
```

The dev server log should show the review email reporting that it was not sent, because Resend is not configured locally. That is the expected local outcome. Confirm the claim column is still null, since the configuration check runs before the claim:

```bash
docker exec -i supabase_db_SolutionSeekingSystem psql -U postgres -d postgres -At -c "select state, criterion_id, email_sent_at is null as not_claimed, original_scores from public.course_review_requests;"
```

- [ ] **Step 6: CRLF and commit**

Run: `unix2dos -q src/lib/server/course/reviews.ts src/lib/server/course/reviewEmail.ts src/lib/server/course/__tests__/reviewEmail.test.ts`

```bash
git add src/lib/server/course/reviews.ts src/lib/server/course/reviewEmail.ts src/lib/server/course/__tests__/reviewEmail.test.ts src/pages/api/course/assessment.ts src/lib/courseClient.ts
git commit -m "Let a learner ask for a second look at one criterion"
```

---

### Task 3: The request form and the review state on the assessment page

**Files:**
- Modify: `src/components/react/AssessmentView.tsx`
- Modify: `src/lib/analytics.ts` (`review_requested`)

**Interfaces:**
- Consumes: Task 2's `requestReview`; `ReviewSummary`; `CRITERIA` from `src/data/certification.ts`; the island's existing `Result`, `ErrorLine`, `messageFor` and busy handling.
- Produces: the `ReviewPanel` section under a result; the analytics member `{ event: 'review_requested' }`.

- [ ] **Step 1: Register the event**

In `src/lib/analytics.ts`, after the `certificate_issued` member of `AnalyticsEvent`, add:

```ts
  /** The learner asked for a second look at a criterion (once per request; the server refuses a second open one). */
  | { event: 'review_requested' }
```

- [ ] **Step 2: Add the panel to the island**

In `src/components/react/AssessmentView.tsx`:

1. Add `requestReview` and `type ReviewSummary` to the imports from `'../../lib/courseClient'`, and `import { CRITERIA } from '../../data/certification';`.
2. Change the `Result` signature to take the review and a handler:

```tsx
function Result({
  result,
  awardsEnabled,
  certificate,
  review,
  busy,
  error,
  onRequestReview,
}: {
  result: NonNullable<AssessmentStatus['result']>;
  awardsEnabled: boolean;
  certificate: CertificateSummary | null;
  review: ReviewSummary | null;
  busy: boolean;
  error: string | null;
  onRequestReview: (criterionId: string, reason: string) => void;
}) {
```

3. Inside `Result`, after the `result.criteria.map(...)` block and before the closing `</section>`, render the panel:

```tsx
      <ReviewPanel review={review} busy={busy} error={error} onRequestReview={onRequestReview} />
```

4. Add the panel component beside `Criterion`:

```tsx
/**
 * Asking for a second look. One request per attempt, so the form is replaced
 * by its own state once there is one: what was asked, and the answer when it
 * arrives. The criterion list is the published rubric, so a learner can only
 * point at something the result actually scored.
 */
function ReviewPanel({
  review,
  busy,
  error,
  onRequestReview,
}: {
  review: ReviewSummary | null;
  busy: boolean;
  error: string | null;
  onRequestReview: (criterionId: string, reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [criterionId, setCriterionId] = useState<string>(CRITERIA[0].id);
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  if (review) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-heading text-xl font-bold text-ink-800">Your review request</h2>
        <p className="mt-2 text-slate-700">
          You asked us to look again at {review.criterion_name} on {dateOf(review.created_at)}.
        </p>
        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">{review.reason}</p>
        {review.state === 'open' ? (
          <p className="mt-3 text-slate-700">Somebody is reading it. The answer appears here, and nothing about your result changes while you wait.</p>
        ) : (
          <>
            <p className="mt-4 font-semibold text-ink-800">Our answer</p>
            <p className="mt-1 whitespace-pre-wrap text-slate-700">{review.resolution}</p>
            <p className="mt-3 text-sm text-slate-500">
              Answered on {review.resolved_at ? dateOf(review.resolved_at) : ''}. Your result above is the one that stands.
            </p>
          </>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="font-heading text-xl font-bold text-ink-800">Think a criterion was scored wrongly?</h2>
      <p className="mt-2 text-slate-700">Tell us which one and why, and somebody will read your response again. You can ask once per attempt.</p>
      {!open && (
        <button type="button" className="btn-secondary mt-4" onClick={() => setOpen(true)}>
          Ask for a second look
        </button>
      )}
      {open && (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            const clean = reason.replace(/\s+/g, ' ').trim();
            if (clean.length < REVIEW_REASON_MIN) {
              setProblem('Say a little more about what you think was missed, so somebody can look at the right thing.');
              return;
            }
            setProblem(null);
            onRequestReview(criterionId, clean);
          }}
        >
          <label className="block text-sm font-semibold text-slate-700">
            Criterion
            <select
              value={criterionId}
              onChange={(e) => setCriterionId(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 font-normal"
            >
              {CRITERIA.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-4 block text-sm font-semibold text-slate-700">
            What was missed
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={REVIEW_REASON_MAX}
              rows={5}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 font-normal"
            />
          </label>
          {problem && <ErrorLine text={problem} />}
          {error && <ErrorLine text={error} />}
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Sending…' : 'Send the request'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
```

5. Add `import { REVIEW_REASON_MAX, REVIEW_REASON_MIN } from '../../lib/course/reviewRules';` beside the other course imports, and a `dateOf` helper beside `timeOf` if the file has none:

```tsx
const dateOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
```

6. Add the request handler beside the other actions in the component body:

```tsx
  const askForReview = useCallback(
    async (criterionId: string, reason: string) => {
      if (!token || !attempt || busy) return;
      setBusy(true);
      setActionError(null);
      try {
        setStatus(await requestReview(token, attempt.id, criterionId, reason));
        track({ event: 'review_requested' });
      } catch (err) {
        setActionError(messageFor(err));
      } finally {
        setBusy(false);
      }
    },
    [token, attempt, busy]
  );
```

Use whatever the file's existing state setter for the status is named; if the component holds the status in a differently named piece of state, set that instead and keep the shape identical to the other actions.

7. At both `<Result ... />` call sites, pass the new props: `review={status.review} busy={busy} error={actionError} onRequestReview={askForReview}`. On the read-only branch the panel is still correct, because a review belongs to the attempt being viewed.

- [ ] **Step 3: Check, test and walk in the browser**

Run: `npm run check && npm test`
Expected: 0 errors; every test green.

With the dev server on 4321, sign in as `course-learner@example.com` (password `course-test-password-1`) and open `/course/learn/assessment/`. The account has a graded attempt with a review already on it from Task 2, so the panel shows that request and its open state. To see the form instead, clear the review first:

```bash
docker exec -i supabase_db_SolutionSeekingSystem psql -U postgres -d postgres -c "delete from public.course_review_requests;"
```

Then reload and check: the form opens, a short reason is refused in the browser before any request is made, a full one sends and the panel switches to the request's own state, and asking again is impossible because the form is gone. Leave one open review behind for Task 4.

- [ ] **Step 4: CRLF and commit**

```bash
git add src/components/react/AssessmentView.tsx src/lib/analytics.ts
git commit -m "Let a learner ask for a second look from the result page"
```

---

### Task 4: The operator's review queue

**Files:**
- Create: `src/lib/server/course/adminReviews.ts`
- Modify: `src/pages/api/admin/course.ts` (`?view=reviews`; `resolve_review`)
- Modify: `src/components/react/AdminView.tsx` (the Reviews tab)

**Interfaces:**
- Consumes: Task 1's SQL and rules; `REVIEW_COLUMNS`, `ReviewRow` from `reviews.ts`; `resolveEmails` from `adminEnrollment.ts`; `decide` from `decision.ts`; `loadOwnedAttempt` is not usable here, so this module reads the attempt by id with the service role; `CRITERIA` from `src/data/certification.ts`.
- Produces: `listReviewsForAdmin()`, `resolveReview(args)`; the admin view `?view=reviews` and the action `resolve_review`; the Reviews tab.

The controller has left one open review on the learner's graded attempt (Task 3), so the queue has a row.

- [ ] **Step 1: Write the admin module**

Create `src/lib/server/course/adminReviews.ts`:

```ts
import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '../supabaseAdmin';
import { CRITERIA, type CriterionId } from '../../../data/certification';
import { applyReviewCorrections, correctedScoreMap } from '../../course/reviewRules';
import { decide } from './decision';
import { resolveEmails } from './adminEnrollment';
import { REVIEW_COLUMNS, type ReviewRow } from './reviews';
import type { AdminReviewView, CapApplied, CertificateAction, ReviewCorrections, ValidatedGrade } from '../../course/assessmentTypes';

/**
 * The operator's side of reviews: the queue behind ?view=reviews and the one
 * action that resolves a request. Resolving rebuilds the grade with the
 * operator's corrections, runs decide() over it so the caps and the pass rule
 * stay in the one module that owns them, and hands the finished grade to
 * resolve_course_review, which persists it at the next generation and points
 * the attempt at it. The grade under review is never edited.
 */

const LIMIT = 100;
const criterionName = (id: CriterionId): string => CRITERIA.find((c) => c.id === id)?.name ?? id;

/** The full grade, including the coverage the learner-facing loader leaves out, because decide() needs it to reapply caps. */
const ADMIN_GRADE_COLUMNS = 'id, rubric_version, criteria, coverage, misconceptions, caps_applied, total, passed, decision' as const;

interface AdminGradeRow {
  id: string;
  rubric_version: string;
  criteria: ValidatedGrade['criteria'];
  coverage: { principles: ValidatedGrade['principles']; tools: ValidatedGrade['tools'] };
  misconceptions: ValidatedGrade['material_misconceptions'];
  caps_applied: CapApplied[];
  total: number | string;
  passed: boolean;
}

/** Open requests first, newest first within each state. */
export async function listReviewsForAdmin(): Promise<AdminReviewView[]> {
  const { data, error } = await supabaseAdmin
    .from('course_review_requests')
    .select(REVIEW_COLUMNS)
    .order('state', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(LIMIT);
  if (error) throw new Error(`review list failed: ${error.message}`);
  const rows = (data ?? []) as ReviewRow[];
  if (!rows.length) return [];

  const emails = await resolveEmails(rows.map((r) => r.user_id));
  const gradeIds = [...new Set(rows.map((r) => r.grade_id).filter((id): id is string => id !== null))];
  const grades = new Map<string, AdminGradeRow>();
  if (gradeIds.length) {
    const { data: gradeRows, error: gradeError } = await supabaseAdmin.from('course_grades').select(ADMIN_GRADE_COLUMNS).in('id', gradeIds);
    if (gradeError) throw new Error(`review grade load failed: ${gradeError.message}`);
    for (const g of (gradeRows ?? []) as AdminGradeRow[]) grades.set(g.id, g);
  }

  const attemptIds = [...new Set(rows.map((r) => r.attempt_id))];
  const { data: attemptRows, error: attemptError } = await supabaseAdmin
    .from('course_assessment_attempts')
    .select('id, user_id, certification_version, snapshot_public')
    .in('id', attemptIds);
  if (attemptError) throw new Error(`review attempt load failed: ${attemptError.message}`);
  const attempts = new Map((attemptRows ?? []).map((a) => [a.id as string, a]));

  const { data: responseRows, error: responseError } = await supabaseAdmin
    .from('course_assessment_responses')
    .select('attempt_id, prompt_id, text')
    .in('attempt_id', attemptIds);
  if (responseError) throw new Error(`review response load failed: ${responseError.message}`);

  const { data: certRows, error: certError } = await supabaseAdmin
    .from('course_certificates')
    .select('id, serial, user_id, certification_version, status')
    .in('user_id', [...new Set(rows.map((r) => r.user_id))]);
  if (certError) throw new Error(`review certificate load failed: ${certError.message}`);

  return rows.map((r) => {
    const attempt = attempts.get(r.attempt_id) as { snapshot_public?: { stages: { title: string; prompts: { prompt_id: string }[] }[] }; certification_version?: string } | undefined;
    const labels = new Map<string, string>();
    for (const stage of attempt?.snapshot_public?.stages ?? []) {
      stage.prompts.forEach((p, i) => labels.set(p.prompt_id, `${stage.title}, question ${i + 1}`));
    }
    const grade = r.grade_id ? grades.get(r.grade_id) : undefined;
    const certificate = (certRows ?? []).find((c) => c.user_id === r.user_id && c.certification_version === attempt?.certification_version);
    return {
      id: r.id,
      attempt_id: r.attempt_id,
      user_id: r.user_id,
      email: emails.get(r.user_id) ?? null,
      state: r.state,
      criterion_id: r.criterion_id,
      criterion_name: criterionName(r.criterion_id),
      reason: r.reason,
      created_at: r.created_at,
      resolved_at: r.resolved_at,
      owner: r.owner,
      resolution: r.resolution,
      certificate_action: r.certificate_action,
      grade: grade
        ? {
            id: grade.id,
            total: Number(grade.total),
            passed: grade.passed,
            rubric_version: grade.rubric_version,
            criteria: grade.criteria,
            principles: grade.coverage?.principles ?? [],
            tools: grade.coverage?.tools ?? [],
            misconceptions: grade.misconceptions ?? [],
            caps_applied: grade.caps_applied ?? [],
          }
        : null,
      responses: (responseRows ?? [])
        .filter((x) => x.attempt_id === r.attempt_id)
        .map((x) => ({ prompt_id: x.prompt_id as string, prompt_label: labels.get(x.prompt_id as string) ?? 'Response', text: x.text as string })),
      certificate: certificate ? { id: certificate.id as string, serial: certificate.serial as string, status: certificate.status as 'active' | 'revoked' } : null,
    };
  });
}

export type ResolveOutcome =
  | { ok: true; gradeId: string; passed: boolean; certificate: CertificateAction }
  | { ok: false; error: 'not_found' | 'already_resolved' | 'no_grade' };

/**
 * Resolve one request. The corrected grade is rebuilt here and decided here;
 * the SQL function only persists what this returned, which is the same split
 * the grading worker uses.
 */
export async function resolveReview(args: {
  reviewId: string;
  admin: User;
  resolution: string;
  corrections: ReviewCorrections;
  certificateAction: CertificateAction;
}): Promise<ResolveOutcome> {
  const { data, error } = await supabaseAdmin.from('course_review_requests').select(REVIEW_COLUMNS).eq('id', args.reviewId).maybeSingle();
  if (error) throw new Error(`review load failed: ${error.message}`);
  const row = data as ReviewRow | null;
  if (!row) return { ok: false, error: 'not_found' };
  if (row.state === 'resolved') return { ok: false, error: 'already_resolved' };
  if (!row.grade_id) return { ok: false, error: 'no_grade' };

  const { data: gradeData, error: gradeError } = await supabaseAdmin.from('course_grades').select(ADMIN_GRADE_COLUMNS).eq('id', row.grade_id).single();
  if (gradeError) throw new Error(`review grade load failed: ${gradeError.message}`);
  const stored = gradeData as AdminGradeRow;
  const before: ValidatedGrade = {
    attempt_id: row.attempt_id,
    rubric_version: stored.rubric_version,
    criteria: stored.criteria,
    principles: stored.coverage?.principles ?? [],
    tools: stored.coverage?.tools ?? [],
    material_misconceptions: stored.misconceptions ?? [],
  };
  const after = applyReviewCorrections(before, args.corrections);
  const decision = decide(after);

  const { data: result, error: rpcError } = await supabaseAdmin.rpc('resolve_course_review', {
    p_review: args.reviewId,
    p_admin: args.admin.id,
    p_owner: args.admin.email ?? null,
    p_resolution: args.resolution,
    p_grade: {
      rubric_version: after.rubric_version,
      criteria: after.criteria,
      coverage: { principles: after.principles, tools: after.tools },
      misconceptions: after.material_misconceptions,
      caps_applied: decision.caps_applied,
      decision,
    },
    p_corrected: correctedScoreMap(before, after),
    p_certificate_action: args.certificateAction,
  });
  if (rpcError) throw new Error(`review resolve failed: ${rpcError.message}`);
  const outcome = result as { outcome: string; grade_id?: string; passed?: boolean; certificate?: CertificateAction };
  if (outcome.outcome === 'not_found') return { ok: false, error: 'not_found' };
  if (outcome.outcome === 'already_resolved') return { ok: false, error: 'already_resolved' };
  return { ok: true, gradeId: outcome.grade_id ?? '', passed: outcome.passed ?? false, certificate: outcome.certificate ?? 'none' };
}
```

- [ ] **Step 2: Extend the admin route**

In `src/pages/api/admin/course.ts`:

1. Add `import { listReviewsForAdmin, resolveReview } from '../../../lib/server/course/adminReviews';` and `import { isCriterionId } from '../../../lib/course/reviewRules';`.
2. Add to `MESSAGES`: `already_resolved: 'That review has already been answered.'` and `no_grade: 'That request points at no grade, so there is nothing to correct.'`.
3. In `GET`, before the grading fallthrough, add:

```ts
  if (view === 'reviews') {
    try {
      return adminJson({ rows: await listReviewsForAdmin() });
    } catch (err) {
      console.error('admin review list failed', err);
      return adminJson({ error: 'server_error' }, 500);
    }
  }
```

4. In `POST`, before the final `deny('invalid', 400)`, add:

```ts
  if (action === 'resolve_review') {
    const reviewId = typeof body?.review_id === 'string' ? body.review_id : '';
    const resolution = typeof body?.resolution === 'string' ? body.resolution.trim() : '';
    const certificateAction = typeof body?.certificate_action === 'string' ? body.certificate_action : 'none';
    if (!UUID_RE.test(reviewId) || !resolution || resolution.length > 2000) return deny('invalid', 400);
    if (!['none', 'issue', 'revoke'].includes(certificateAction)) return deny('invalid', 400);

    const raw = isRecord(body?.corrections) ? body.corrections : {};
    const scores: Record<string, number> = {};
    for (const [id, value] of Object.entries(isRecord(raw.scores) ? raw.scores : {})) {
      if (!isCriterionId(id) || !Number.isInteger(value) || (value as number) < 0 || (value as number) > 4) return deny('invalid', 400);
      scores[id] = value as number;
    }
    const list = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);
    const indices = (value: unknown): number[] => (Array.isArray(value) ? value.filter((v): v is number => Number.isInteger(v) && v >= 0) : []);
    const corrections = {
      scores,
      principles: list(raw.principles),
      tools: list(raw.tools),
      misconceptions: indices(raw.misconceptions),
    } as Parameters<typeof resolveReview>[0]['corrections'];

    try {
      const outcome = await resolveReview({ reviewId, admin, resolution, corrections, certificateAction: certificateAction as 'none' | 'issue' | 'revoke' });
      if (!outcome.ok) return deny(outcome.error, outcome.error === 'not_found' ? 404 : 409);
      console.log('admin action', admin.email, 'resolve_review', reviewId, outcome.passed ? 'passed' : 'not passed', outcome.certificate);
      return adminJson({ ok: true, passed: outcome.passed, certificate: outcome.certificate });
    } catch (err) {
      console.error('admin resolve_review failed', err);
      return adminJson({ error: 'server_error' }, 500);
    }
  }
```

If `isRecord` does not exist in this file, add `const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);` beside the other helpers.

Update the route's header comment so it names the reviews view and the action.

- [ ] **Step 3: Add the Reviews tab**

In `src/components/react/AdminView.tsx`:

1. Add `'reviews'` to the `Tab` union and `{ id: 'reviews', label: 'Reviews', count: reviews?.filter((r) => r.state === 'open').length }` to the `tabs` array after the `grading` entry.
2. Add `const [reviews, setReviews] = useState<AdminReviewRow[] | null>(null);` beside the other tab state.
3. Add a `loadTab` branch: `} else if (which === 'reviews') { const d = await call('course?view=reviews'); if (d) setReviews(d.rows);`.
4. Render it beside the other tabs:

```tsx
      {tab === 'reviews' && (
        <ReviewsTab
          rows={reviews}
          act={(body) => call('course', body)}
          reload={() => loadTab('reviews')}
          notify={setNotice}
          warn={setError}
        />
      )}
```

5. Add the row type and the component beside `CertificatesTab`:

```tsx
interface AdminReviewRow {
  id: string;
  attempt_id: string;
  user_id: string;
  email: string | null;
  state: 'open' | 'resolved';
  criterion_id: string;
  criterion_name: string;
  reason: string;
  created_at: string;
  resolved_at: string | null;
  owner: string | null;
  resolution: string | null;
  certificate_action: 'none' | 'issue' | 'revoke';
  grade: {
    id: string;
    total: number;
    passed: boolean;
    rubric_version: string;
    criteria: { criterion_id: string; score: number; reason: string; evidence: { prompt_id: string; exact_quote: string }[] }[];
    principles: { id: string; coverage: string }[];
    tools: { id: string; coverage: string }[];
    misconceptions: { criterion_id: string; description: string }[];
    caps_applied: { criterion_id: string; cause: string; detail: string; from: number; to: number }[];
  } | null;
  responses: { prompt_id: string; prompt_label: string; text: string }[];
  certificate: { id: string; serial: string; status: 'active' | 'revoked' } | null;
}

/**
 * The review queue. Open requests first. Each one opens into what judging it
 * needs: the learner's words, the grader's score and quotes for the criterion
 * they named, the findings that capped it, and their whole response. Resolving
 * corrects scores, withdraws findings the grader got wrong, and says what
 * should happen to a certificate.
 */
function ReviewsTab({
  rows,
  act,
  reload,
  notify,
  warn,
}: {
  rows: AdminReviewRow[] | null;
  act: (body: Record<string, unknown>) => Promise<{ ok?: boolean; passed?: boolean; certificate?: string } | null>;
  reload: () => Promise<void>;
  notify: (text: string) => void;
  warn: (text: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [resolution, setResolution] = useState('');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [withdrawn, setWithdrawn] = useState<{ principles: string[]; tools: string[]; misconceptions: number[] }>({ principles: [], tools: [], misconceptions: [] });
  const [certificateAction, setCertificateAction] = useState<'none' | 'issue' | 'revoke'>('none');
  const [busy, setBusy] = useState(false);

  const openRow = (row: AdminReviewRow) => {
    setOpenId(row.id === openId ? null : row.id);
    setResolution('');
    setScores({});
    setWithdrawn({ principles: [], tools: [], misconceptions: [] });
    setCertificateAction('none');
  };

  const toggle = (kind: 'principles' | 'tools', id: string) =>
    setWithdrawn((w) => ({ ...w, [kind]: w[kind].includes(id) ? w[kind].filter((x) => x !== id) : [...w[kind], id] }));
  const toggleMisconception = (index: number) =>
    setWithdrawn((w) => ({ ...w, misconceptions: w.misconceptions.includes(index) ? w.misconceptions.filter((x) => x !== index) : [...w.misconceptions, index] }));

  const resolve = async (row: AdminReviewRow) => {
    if (!resolution.trim()) {
      warn('Write the answer the learner will read. It is the whole of what they get back.');
      return;
    }
    setBusy(true);
    const d = await act({
      action: 'resolve_review',
      review_id: row.id,
      resolution: resolution.trim(),
      certificate_action: certificateAction,
      corrections: { scores, principles: withdrawn.principles, tools: withdrawn.tools, misconceptions: withdrawn.misconceptions },
    });
    if (d) notify(`Answered. The attempt now reads ${d.passed ? 'passed' : 'not yet'}${d.certificate && d.certificate !== 'none' ? `, certificate ${d.certificate}d` : ''}.`);
    await reload();
    setOpenId(null);
    setBusy(false);
  };

  if (!rows) return <p className="text-slate-500">Loading…</p>;
  if (!rows.length) return <p className="rounded-2xl border border-slate-100 bg-white p-6 text-slate-500 shadow-card">No review requests.</p>;

  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <section key={r.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
          <div className="flex flex-wrap items-baseline gap-3">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.state === 'open' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{r.state}</span>
            <span className="font-semibold text-ink-800">{r.criterion_name}</span>
            <Learner email={r.email} userId={r.user_id} />
            <span className="text-xs text-slate-400">
              {date(r.created_at)} {time(r.created_at)}
            </span>
            {r.grade && <span className="text-xs text-slate-400">scored {r.grade.total.toFixed(1)}, {r.grade.passed ? 'passed' : 'not yet'}</span>}
          </div>
          <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">{r.reason}</p>

          {r.state === 'resolved' && (
            <div className="mt-3 text-sm text-slate-600">
              <p className="whitespace-pre-wrap">{r.resolution}</p>
              <p className="mt-1 text-xs text-slate-400">
                Answered by {r.owner ?? 'an admin'} on {date(r.resolved_at)}
                {r.certificate_action !== 'none' ? `, certificate ${r.certificate_action}d` : ''}
              </p>
            </div>
          )}

          {r.state === 'open' && (
            <button type="button" className="btn-secondary mt-4 py-2 text-xs" onClick={() => openRow(r)}>
              {openId === r.id ? 'Close' : 'Read and answer'}
            </button>
          )}

          {openId === r.id && r.grade && (
            <div className="mt-5 space-y-5 border-t border-slate-100 pt-5">
              <div>
                <h3 className="text-sm font-semibold text-ink-800">What the grader said</h3>
                <ul className="mt-2 space-y-2 text-sm text-slate-600">
                  {r.grade.criteria.map((c) => (
                    <li key={c.criterion_id} className={c.criterion_id === r.criterion_id ? 'rounded-xl bg-amber-50 px-3 py-2' : ''}>
                      <span className="font-semibold text-ink-800">{c.criterion_id}</span> scored {c.score}. {c.reason}
                      {c.evidence.map((e, i) => (
                        <span key={i} className="mt-1 block text-xs italic text-slate-500">“{e.exact_quote}”</span>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-ink-800">Corrected scores</h3>
                <div className="mt-2 flex flex-wrap gap-3">
                  {r.grade.criteria.map((c) => (
                    <label key={c.criterion_id} className="text-xs text-slate-600">
                      {c.criterion_id}
                      <input
                        type="number"
                        min={0}
                        max={4}
                        defaultValue={c.score}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          setScores((s) => (next === c.score ? Object.fromEntries(Object.entries(s).filter(([k]) => k !== c.criterion_id)) : { ...s, [c.criterion_id]: next }));
                        }}
                        className="mt-1 block w-16 rounded-xl border border-slate-200 px-2 py-1"
                      />
                    </label>
                  ))}
                </div>
              </div>

              {(r.grade.principles.some((p) => p.coverage === 'missing' || p.coverage === 'misapplied') ||
                r.grade.tools.some((t) => t.coverage === 'missing' || t.coverage === 'misapplied') ||
                r.grade.misconceptions.length > 0) && (
                <div>
                  <h3 className="text-sm font-semibold text-ink-800">Findings that capped a score</h3>
                  <p className="text-xs text-slate-500">Tick anything the grader got wrong. Withdrawing a finding lifts the cap it caused.</p>
                  <div className="mt-2 space-y-1 text-sm text-slate-600">
                    {r.grade.principles
                      .filter((p) => p.coverage === 'missing' || p.coverage === 'misapplied')
                      .map((p) => (
                        <label key={p.id} className="flex items-center gap-2">
                          <input type="checkbox" checked={withdrawn.principles.includes(p.id)} onChange={() => toggle('principles', p.id)} />
                          {p.id}: {p.coverage}
                        </label>
                      ))}
                    {r.grade.tools
                      .filter((t) => t.coverage === 'missing' || t.coverage === 'misapplied')
                      .map((t) => (
                        <label key={t.id} className="flex items-center gap-2">
                          <input type="checkbox" checked={withdrawn.tools.includes(t.id)} onChange={() => toggle('tools', t.id)} />
                          {t.id}: {t.coverage}
                        </label>
                      ))}
                    {r.grade.misconceptions.map((m, i) => (
                      <label key={i} className="flex items-center gap-2">
                        <input type="checkbox" checked={withdrawn.misconceptions.includes(i)} onChange={() => toggleMisconception(i)} />
                        {m.criterion_id}: {m.description}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <details>
                <summary className="cursor-pointer text-sm font-semibold text-ink-800">The learner's whole response</summary>
                <div className="mt-2 space-y-3">
                  {r.responses.map((p) => (
                    <div key={p.prompt_id}>
                      <p className="text-xs font-semibold text-slate-500">{p.prompt_label}</p>
                      <p className="whitespace-pre-wrap text-sm text-slate-600">{p.text}</p>
                    </div>
                  ))}
                </div>
              </details>

              <div>
                <label className="block text-sm font-semibold text-ink-800">
                  Your answer, which the learner reads
                  <textarea
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    maxLength={2000}
                    rows={4}
                    className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal"
                  />
                </label>
                <label className="mt-3 block text-xs font-semibold text-slate-600">
                  Certificate
                  <select
                    value={certificateAction}
                    onChange={(e) => setCertificateAction(e.target.value as 'none' | 'issue' | 'revoke')}
                    className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal"
                  >
                    <option value="none">Leave it as it is</option>
                    <option value="issue">Issue one</option>
                    <option value="revoke">Revoke the one they hold</option>
                  </select>
                  {r.certificate && (
                    <span className="ml-2 text-slate-400">
                      They hold {r.certificate.serial}, {r.certificate.status}.
                    </span>
                  )}
                </label>
                <button type="button" className="btn-primary mt-4 py-2 text-xs" disabled={busy} onClick={() => resolve(r)}>
                  {busy ? 'Saving…' : 'Answer and record a new grade'}
                </button>
              </div>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Check and walk it**

Run: `npm run check && npm test`
Expected: 0 errors; every test green.

With the dev server on 4321, mint an admin bearer in the same call:

```bash
ANON=$(npx supabase status -o env | grep '^ANON_KEY=' | cut -d= -f2- | tr -d '"')
ADMIN=$(curl -s "http://127.0.0.1:55321/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H "Content-Type: application/json" -d '{"email":"course-admin@example.com","password":"course-test-password-1"}' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).access_token))')
A=http://localhost:4321/api/admin/course
curl -s "$A?view=reviews" -H "Authorization: Bearer $ADMIN" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const r=j.rows[0];console.log("rows",j.rows.length,"state",r.state,"criterion",r.criterion_name,"grade total",r.grade?.total,"responses",r.responses.length,"email",r.email!==null)})'
REV=<the review id from that listing>
curl -s $A -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d "{\"action\":\"resolve_review\",\"review_id\":\"$REV\",\"resolution\":\"\",\"certificate_action\":\"none\"}"                                  # invalid, 400
curl -s $A -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d "{\"action\":\"resolve_review\",\"review_id\":\"$REV\",\"resolution\":\"Agreed, forgiveness was there.\",\"certificate_action\":\"none\",\"corrections\":{\"scores\":{\"wisdom_principles\":9}}}"   # invalid, 400, score out of range
curl -s $A -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d "{\"action\":\"resolve_review\",\"review_id\":\"$REV\",\"resolution\":\"Agreed. Your second paragraph does drop the search for a culprit, so the forgiveness finding was wrong and the cap it caused is lifted.\",\"certificate_action\":\"none\",\"corrections\":{\"scores\":{},\"principles\":[\"forgiveness\"],\"tools\":[],\"misconceptions\":[]}}"   # ok, with passed and certificate
curl -s $A -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d "{\"action\":\"resolve_review\",\"review_id\":\"$REV\",\"resolution\":\"again\",\"certificate_action\":\"none\"}"                                  # already_resolved, 409
LEARNER=$(curl -s "http://127.0.0.1:55321/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H "Content-Type: application/json" -d '{"email":"course-learner@example.com","password":"course-test-password-1"}' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).access_token))')
curl -s -o /dev/null -w "%{http_code}\n" $A -H "Authorization: Bearer $LEARNER" -H 'Content-Type: application/json' -d "{\"action\":\"resolve_review\",\"review_id\":\"$REV\",\"resolution\":\"x\"}"   # 403
```

Then read the database and confirm what the resolution did:

```bash
docker exec -i supabase_db_SolutionSeekingSystem psql -U postgres -d postgres -c "select generation, source, total, passed from public.course_grades order by generation;"
docker exec -i supabase_db_SolutionSeekingSystem psql -U postgres -d postgres -c "select state, owner, certificate_action, corrected_scores, resolved_by is not null as by_admin from public.course_review_requests;"
docker exec -i supabase_db_SolutionSeekingSystem psql -U postgres -d postgres -c "select a.state, g.generation as points_at from public.course_assessment_attempts a join public.course_grades g on g.id = a.grade_id where a.user_id = (select id from auth.users where email = 'course-learner@example.com');"
```

Expected: two grades, the second `review` at generation two with a higher total, the first untouched; the review resolved with the admin's address as owner; the attempt pointing at the new grade.

Finally, in a browser as the admin, open `/admin`, Reviews: the tab shows the resolved request with its answer, and the count badge is gone.

- [ ] **Step 5: CRLF and commit**

Run: `unix2dos -q src/lib/server/course/adminReviews.ts`

```bash
git add src/lib/server/course/adminReviews.ts src/pages/api/admin/course.ts src/components/react/AdminView.tsx
git commit -m "Give the admin area a review queue that records a corrected grade"
```

---

### Task 5: Docs, the browser pass and the visual record

**Files:**
- Modify: `docs/architecture.md`, `docs/deployment.md`, `docs/status.md`, `docs/change-checklist.md`, `docs/features/course/README.md`
- Create: screenshots under `docs/features/course/`

- [ ] **Step 1: Architecture and checklist**

`docs/architecture.md`: extend the `/api/course/assessment` row to name the `review` action, and the `/api/admin/course` row to name the review queue. Name `0033` where the migrations are listed.

`docs/change-checklist.md`: one bullet in the course section saying a grade is never edited, so anything that changes an outcome inserts a new grade at the next generation and repoints the attempt, and that the rubric stays in `decision.ts` rather than being restated in SQL.

- [ ] **Step 2: Deployment**

In `docs/deployment.md`:

1. Add `0033_course_reviews.sql` to the migrations paragraph and to the `proname` expected list, and say it must be applied before the deploy that carries this work, because the assessment status route reads the review table on every action.
2. A "Reviews from /admin" subsection after the certificates one: what the queue shows, that open requests sort first, what resolving does (a new grade at the next generation, the attempt repointed, the old grade untouched), that corrections are scores plus withdrawn findings and that withdrawing a finding lifts the cap it caused, that the certificate action here ignores `COURSE_AWARDS_ENABLED` because a person has read the response, and that resolving is final in the same way revoking is.
3. A paragraph on the review email in the shape of the other two: sent once per review through `email_sent_at` and the key `course-review-received/<id>`, what an empty or set column means for support.
4. Add `review_requested` to the event registration list.

- [ ] **Step 3: Status**

In `docs/status.md`: update the date line and the current phase row, and record 3c as code complete with its plan link and a two-sentence summary. Keep 3d as what remains.

- [ ] **Step 4: The browser pass and the screenshots**

With the local stack, capture at 1280 unless named otherwise and save under `docs/features/course/`:

- `assessment-review-form-1280.png`: the request form open under a result, criterion chosen and a reason typed.
- `assessment-review-open-390.png`: the learner's own view of an open request at 390 wide.
- `assessment-review-answered-1280.png`: the same panel once resolved, showing the answer.
- `admin-reviews-queue-1280.png`: the queue with one open request.
- `admin-review-answering-1280.png`: a request opened for answering, showing the grader's findings and the correction controls.

To get each state, delete and recreate the review with local SQL and the learner's API, as Tasks 2 and 3 did. Add a captioned row per screenshot to `docs/features/course/README.md` in the table's voice: what the shot shows, then something true about why it behaves that way.

- [ ] **Step 5: Gates and commit**

Run the dash audit over the added lines, `npm test`, `npm run check`, and `PUBLIC_COURSE_STATUS=hidden npm run build` with the dist scan ok.

```bash
git add docs/
git commit -m "Document review requests and add their visual record"
```

---

## Notes for the controller

- **Before Task 2, produce a graded attempt for the learner.** The learner account needs an attempt with a grade to argue with, and it must not be a perfect score, or there is nothing to dispute. Add `course-learner@example.com` to `ADMIN_EMAILS` in `.env.local` so the account is eligible with one lesson published, restart the dev server, and run the t11 walk helper in `thin` mode, which submits deliberately weak responses. That costs one real grade, about thirty cents, and produces a `needs_revision` result with coverage findings the review form can point at. Then remove the learner from `ADMIN_EMAILS` again and restart, so Task 4's check that a non-admin bearer is refused still holds.
- The local fixtures from 3b are two certificates, both active. Task 4's certificate action is exercised against whichever the learner holds; leave the admin's alone.
- **Local emails** log that they were not sent and return false, and the claim column stays null because the configuration check runs first. That is the expected local outcome.
- **At the close:** restore `.env.local` to `ADMIN_EMAILS=course-admin@example.com`, and confirm `git status` shows nothing untracked under `src/`.
- Review each task with the global constraints as the lens; the whole-branch review goes to the most capable model. The likely places for a Critical are the resolution's grade rebuild (a corrected grade that loses a field silently changes a score), the admin route's validation of `corrections` (an unchecked index or criterion id reaches `decide()`), and whether a resolved review can still be resolved again by a second request in flight.

## Execution record (2026-09-13 to 2026-09-14)

Executed with subagent-driven development on branch `course-phase3c` from `main` after PR #22: Tasks 1 to 5 in nine commits from `53c141b` to `72bd1ab`, then the whole-branch review on Opus and one fix wave (`1228631`). Three of the five task reviews found something real, and the whole-branch review found three more that no task review could have seen, two of them written into this plan line for line. No grade was bought: the plan budgeted about thirty cents for a thin attempt the learner could argue with, and reading the fixtures showed four graded attempts already sitting in the local database.

Amendments the reviews and the run forced on this plan:

- `normalizeReviewReason` counts Unicode codepoints, not JavaScript's `.length`. The plan measured in UTF-16 code units while the check constraint the module exists to satisfy uses `char_length`, which counts characters. Nine emoji after a short word passed the guard at twenty-one and violated the constraint at twelve, and `create_course_review` handles only `unique_violation`, so it escaped as an uncaught error.
- The request form calls `normalizeReviewReason` instead of hand copying one of its three rules. The plan's guard checked length only, so a reason of digits with no letters, or one carrying a pasted invisible character, passed the form, came back 400 and rendered "Something went wrong. Please try again." Nothing had gone wrong and trying again never worked.
- `resolve_course_review` refuses to issue a certificate for an attempt that did not pass. The plan's branch never consulted the decision, so an operator could mint a credential on a failing attempt and the reactivation path repointed an existing one at it. `issue_course_certificate` in `0032` has always refused this; the review path was the way around it.
- `resolve_course_review` also refuses a correction that takes an attempt below the pass line while an active certificate stands, unless the operator chose to revoke. Otherwise a resolution records a failing result beside a live credential and the operator is never asked.
- Both refusals return before the grade insert, so a refused resolution leaves nothing behind.
- `resolve_course_review`'s issue branch reactivates a revoked certificate rather than finding the row, doing nothing and reporting success. Without it the sequence the revoke and issue pair exists for, an operator undoing their own mistaken revocation, could not be done through the queue at all.
- `create_course_review` takes the grade id from the attempt row it already holds locked, rather than from its caller. The parameter is gone from the signature. A review created while an operator was resolving another one recorded a superseded grade, and resolving it then discarded the corrections in between with nothing flagging it.
- A cleared corrected-score box means unchanged rather than zero. `Number('')` is zero, so deleting a digit in order to retype it sent a zero while the box rendered blank.
- A refused resolution leaves the panel, the answer, the scores, the withdrawn findings and the certificate choice in place. The plan reloaded and closed regardless of outcome, so a mistyped score cost the operator an answer they only get one chance to write.
- The result page says something when a failing result sits beside an active certificate. All four of the plan's certificate sentences were gated on passing, so that state rendered nothing at all.
- The admin's responses query orders by stage and prompt. Without it the operator read the learner's answer in whatever order the database returned, which in this fixture data is genuinely scrambled.
- `RESOLUTION_MAX` is shared and counted in codepoints, rather than the literal `2000` written into both the route and the island and measured in code units.
- Two defects in the plan's own code, caught by implementers: the `review()` handler did not compile against its own `CreateReviewOutcome` type, because TypeScript will not peel one literal off a grouped union member through a positive comparison; and `course_assessment_responses` has no `text` column, so the admin view returned 500 on its first request until it was pointed at `response_text`.
- The plan's verification walk was rewritten, because it was written against fixtures that do not exist. Withdrawing a coverage finding on the learner's grade is a no-op, since every principle is applied and every criterion is at 4, and the admin's weak grade carries caps that are inert because the raw scores already sit at or below the cap value.

Verification beyond the gates: the walk's numbers were derived from the constants before dispatch and asserted rather than observed, so `wisdom_principles` dropped from 4 to 2 had to land on 90.000 with the attempt failing on the per-criterion floor rather than the total, and raising a score from 0 to 4 with its coverage findings still standing had to come back capped at 25.000 and not 35.000. Reviewers built their own variants of the same trap and got 38.750 where trusting the operator's number would have given 46.250. Three concurrent review requests on one attempt produced one success and two refusals with one row; two concurrent resolutions produced one success, one `already_resolved`, and one new generation. The grade-id race was reproduced with two psql sessions holding a real row lock. Twenty-four adversarial corrections payloads produced no 5xx. The reason bound was proved at the codepoint boundary in both directions against `char_length`. Gates on the final tree: `npm run check` clean with the guard at eighteen worker-reachable modules, 270 tests, and a production build green with the dist scan ok.

Carried forward:

1. `service_role` holds update and delete on `course_grades`, despite `0031` granting only select and insert and calling the table append only. The schema's default ACL gives `service_role` full rights on anything `postgres` creates, so the grant list is not what enforces it. Append only holds because no code path issues an update or a delete. This affects every server-write-only table and is in `docs/deployment.md` to be checked on the hosted project and decided deliberately, rather than patched on one table here.
2. `original_scores` and `corrected_scores` are recorded on every review and shown nowhere. Since resolving is final, an operator auditing a past answer has to read the database by hand.
3. The queue's payload carries every learner response for up to a hundred rows whether or not the operator expands them.
4. The `review` action has no rate limit, unlike `start` and `submit`. The partial unique index caps the abuse at one email per graded attempt.
5. A corrected grade keeps the grader's per-criterion prose, so a lowered score can sit beside a reason that praises the answer. Nothing marks a criterion as corrected by a person.
6. The operator cannot see the corrected total or pass before committing the resolution. The two refusals above tell them when their certificate choice disagrees with the decision, which is the case that matters, but a preview would be better.
7. A learner gets one request per attempt from the page, while the route accepts a second once the first is resolved. The asymmetry is deliberate and documented in `docs/deployment.md`.

## Handoff

After the merge, in this order:

1. Apply `0033` to the hosted project before the deploy carries it, then run the `proname` check and `npx supabase db advisors --linked`.
2. Fast-forward `course-beta` and let the branch deploy build.
3. On the branch deploy, as the alias learner: ask for a review on the graded attempt, and confirm the acknowledgement email arrives and `email_sent_at` is set.
4. As the admin: answer it with a correction, and confirm the learner's page shows the answer, the attempt reads the new outcome, and both grades exist with the first untouched.
5. Production stays `hidden` and `COURSE_AWARDS_ENABLED` stays `false` until 3d.

Then 3d: the grader benchmark and the release gate, which needs David's rated examples first.
