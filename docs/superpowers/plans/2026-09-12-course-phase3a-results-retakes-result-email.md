# Course Phase 3a: Results, Retakes and the Result Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the learner's side of the assessment loop: a history of attempts, a read-only view of any earlier attempt, an honest retake path after a not-yet result, and the email that tells a learner their result is ready.

**Architecture:** Phase 3 is four sub-plans: **3a** (this one), **3b** certificates and the verify page, **3c** review requests, the review queue and regrades, **3d** the grader benchmark and the release gate. 3a adds one action to `POST /api/course/assessment` (`list`), extends the assessment island, and adds a worker-shared email module in the shape of `gradingAlert.ts`, sent from the two places a grading job finishes (the Netlify worker and the dev server's inline run). No migration: `course_grading_jobs.result_email_sent_at` already exists in `0031`.

**Tech Stack:** Astro 5 (static-first, `@astrojs/netlify`), React islands, Supabase service role, the Resend SDK, vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-paid-video-course-design.md`, sections "Attempt lifecycle" (the `list` row and the confirmation copy), "Grading job execution" (the result email keyed `course-result/<job>-<generation>`), "Certificates, verification, reviews, emails, admin" (the email rules: neutral subject, no outcome, no scores, links land on sign-in pages), "Phase 3: certification journey" (retake flow: least-exposed form, exposure history, the honest "no further forms" state). The 1d plan's carried items 6 and 8 (`docs/superpowers/plans/2026-09-10-course-phase1d-assessment-data-path.md`) are picked up here.

## Global Constraints

- **Nothing we publish reads as though a machine wrote it.** No em dashes or en dashes anywhere in copy, comments, docs or commit messages; fix the sentence, never the character. No counted-pair headings, no list where every item opens the same way, no "delve", no "It's not just X, it's Y". Never type a price or a lesson, module or attempt count into prose; derive it.
- **Line endings.** Every file is CRLF. New files get `unix2dos -q <file>`; existing files are edited with the Edit tool only, never `sed -i`.
- **Learner data stays scoped.** Every attempt read is `where id = $1 and user_id = $2` (or by user id); misses are 404, so ids are not probeable. `snapshot_private` is never selected outside `jobStore.ts` and the admin route.
- **Every `/api/course/*` response goes through `privateJson`**; the assessment route gates with `requireEnrolled`; hand-rolled validation; snake_case error codes.
- **The email rules.** Subject "Your assessment result is ready"; no outcome, no score, no quote and no answer in the subject or body; the link lands on the assessment page, which asks for sign-in; one email per job and generation, keyed `course-result/<job>-<generation>`, with `result_email_sent_at` as the guard beyond Resend's 24 h idempotency window.
- **Worker-shared modules** (`gradingJob.ts`, `jobStore.ts`, `grader.ts`, `gradingAlert.ts` and the new `resultEmail.ts`) import nothing from `astro:content`, `src/lib/server/env.ts`, `supabaseAdmin.ts`, `rateLimit.ts`, `src/data/course.ts` or `import.meta.env`; `scripts/check-private-content.mjs` enforces it. The Netlify function reads its configuration with `Netlify.env.get`; the dev path reads it with `serverEnv`.
- **Tests.** vitest under `src/lib/course/__tests__/**` and `src/lib/server/course/__tests__/**`; pure rules and the email module get tests; the island and the route are verified with curl, the build and the browser. `npm run check` and `npm test` green before every commit; `npm run build` (hidden mode) green with the dist scan ok before the last one.
- **Commits.** One per task, house voice, ending with the trailer for the model that wrote it: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`, `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` or `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. The `git commit` lines below show the title only.
- **Never** run `npx supabase db push` or `npx supabase db reset`, print `.env` or `.env.local` values, echo a key or token, commit a secret, or edit `0030_course.sql` or `0031_course_assessment.sql` (both applied to the hosted project and frozen). No migration is needed.
- **Spend.** A grade under `astro dev` with `COURSE_GRADER_MODE` unset calls the real model (about thirty cents). Implementers do not submit assessments; the controller's scratch walk creates the attempts the browser pass needs.
- **Branch.** `course-phase3a` from `main` after PR #18.

## Shapes in place

- `src/lib/course/assessmentTypes.ts`: `ATTEMPT_STATES`, `AttemptState`, `OPEN_ATTEMPT_STATES`, `AttemptView`, `JobView`, `ResultView`, `EligibilityReason = 'ready' | 'modules_incomplete' | 'already_passed' | 'open_attempt'`, `AssessmentStatus { attempt; job; result; awards_enabled; certificate: null; eligibility: { eligible; reason }; support_contact }`.
- `src/lib/course/assessmentRules.ts`: `viewForLearner`, `stageProblems`, `MAX_EXPOSURES_PER_FORM = 1`, `chooseForm(forms, exposures, allowSample)` (least exposed, then lowest `order`; `sample` forms only when allowed), `certificationStatus(latest)`.
- `src/lib/server/course/attempts.ts`: `ATTEMPT_COLUMNS` (never `snapshot_private`), `AttemptRow`, `GradeRow { id; criteria; misconceptions; caps_applied; total; passed; decision; created_at }`, `loadOwnedAttempt(id, userId)`, `loadLatestAttempt(userId)`, `loadOpenAttempt(userId)`, `loadAssessmentSummary(userId)`, `countExposures(userId)`, `loadGrade(gradeId)`, `loadLatestJob(attemptId)`. Every function throws with a prefix on a database error; the route answers 503 `assessment_unavailable`.
- `src/pages/api/course/assessment.ts`: `POST` switches on `action` (`start`, `save`, `advance`, `submit`, `status`); `statusFor(user, row)` builds `AssessmentStatus`; `eligibility(user, row)`; `status` accepts an optional `attempt_id` and returns that owned attempt's status; `start` hands back an open attempt before charging the rate limit, else assigns the least-exposed form and answers `no_forms_available` with `NO_FORMS_MESSAGE` when none is left.
- `src/lib/courseClient.ts`: `AssessmentAction = 'start' | 'save' | 'advance' | 'submit' | 'status'`, `postAssessment<T>(token, body)`, `startAssessment`, `fetchAssessmentStatus(token, attemptId?)`, `saveAssessmentResponse`, `advanceAssessment`, `submitAssessment`, `courseErrorMessage(code)`, `CourseActionError`.
- `src/components/react/AssessmentView.tsx` (655 lines): `useSession`, `useDialog().confirm` for the stage-lock and submit confirmations, `load()` fetching the latest status, an interval poll while `submitted` or `grading`, one-time `grade_ready` and `grading_error` events for an attempt the page itself watched, `Intro` (eligibility copy and Start), `Stages`, `Prompt`, the grading-in-progress and grading-error sections, `Result` and `Criterion`. The conflict branch at save keeps the server text and revision in `draft.conflict` and `resolveConflict(promptId, keepMine)` applies the choice.
- `src/pages/course/learn/assessment.astro`: the shell, `noindex`, passes `certificationTitle` and `supportContact`.
- `src/components/react/CourseDashboard.tsx`: `certificationCopy(state)` switches on `state.certification.status` (`none`, `in_progress`, `submitted`, `passed`, `needs_revision`, `grading_error`).
- `src/lib/server/course/gradingJob.ts`: `JobContext { attempt: { id; form_id; form_version; rubric_version; prompt_version; submission_hash; snapshot_public; snapshot_private }; responses; sourcePack }`, `ClaimResult` (`claimed` carries `lockToken`, `attemptId`, `generation`, `attempts`), `GradingJobStore { claim; loadContext; finalize; fail }`, `RunOutcome` (`finalized { passed }`, `unavailable | stale`, `exhausted {...}`, `requeued | failed {...}`), `runGradingJob({ jobId, worker, store, grade, settings })`.
- `src/lib/server/course/jobStore.ts`: `supabaseJobStore(client)` implementing the store over `rpc('claim_course_grading_job')`, three selects and `rpc('finalize_course_grade')` / `rpc('fail_course_grading_job')`.
- `src/lib/server/course/__tests__/gradingJob.test.ts`: `fakeStore(opts)` returns a `GradingJobStore` recording calls; adding a method to the interface means adding it there.
- `src/lib/server/course/gradingAlert.ts`: the worker-shared email pattern (Resend SDK only; `AlertConfig { apiKey; from; to }`; the send never throws; idempotency key per run). `src/lib/server/course/__tests__/gradingAlert.test.ts` shows how the SDK is mocked.
- `netlify/functions/course-grade.mts`: `env(name)`, `adminOrigin()` (`DEPLOY_PRIME_URL` outside production, else `URL`), the `runGradingJob` call, the alert on `failed` or `exhausted`. `src/lib/server/course/workerTrigger.ts`: the inline dev path with the same alert, `workerOrigin(origin)`.
- `supabase/migrations/0031_course_assessment.sql`: `course_grading_jobs.result_email_sent_at timestamptz` (nullable, unused so far); `course_assessment_attempts` carries `grade_id`, `submitted_at`, `finalized_at`, `created_at`, `certification_version`, `form_id`.
- Local test setup: the local Supabase stack; `course-admin@example.com` (admin, enrolled) and `course-learner@example.com` (enrolled), password `course-test-password-1`; the dev server binds 4321 now; `.env.local` holds `ADMIN_EMAILS=course-admin@example.com`; a bearer comes from the password grant against `http://127.0.0.1:55321` with the anon key from `npx supabase status -o env` (never printed); `docker exec -i supabase_db_SolutionSeekingSystem psql -U postgres -d postgres -c "..."` for SQL; Resend is not configured locally, so every email path logs "not sent" and returns false, which is the expected local outcome.

## Rulings

1. **A past attempt is read-only.** `?attempt=<id>` on the assessment page shows that attempt's result (or its grading-error state); it never renders the stages for editing. The current attempt is always the plain page. Cost if wrong: a learner cannot reopen a draft from history, which the plain page already does.
2. **History labels attempts by sequence and date, never by form id.** "Attempt 2, 12 September 2026" says everything a learner needs; `sample-p0` and `form-a` are internal names. Cost if wrong: a support conversation has to translate.
3. **The retake button appears only when the latest attempt is `needs_revision` and the server says the learner is eligible.** It calls the existing `start`; a `no_forms_available` answer shows the server's honest message in place. Cost if wrong: a learner with no form left sees the message one click later than they might.
4. **The result email carries no support address**, only the link to the assessment page, which shows support on the grading-error path and nothing else needs it. The worker cannot import `src/data/course.ts` (where the support contact lives) and a new environment variable for one line is not worth carrying. Cost if wrong: one more sentence later.
5. **Claim, then send.** The store sets `result_email_sent_at` where it is null and reports whether it did; only a successful claim sends. A send that then fails is logged and not retried: the result is on the page and the dashboard already says it is ready. Cost if wrong: one learner misses one email after a Resend outage.
6. **No server-side `grade_ready` analytics event.** The client fires it when the learner sees the result, and the email is the server-side notification; a server event would need the learner's client id stored at submit for a number nobody reads. Cost if wrong: a Phase 4 task adds it.
7. **The 1d conflict note stays as designed.** After a revision conflict the island waits for the learner to choose a version rather than retrying; retrying silently would pick a side. The conflict buttons are busy-gated in Task 2 because a double click there could apply both choices.

---

### Task 1: Attempt history rules, the `list` action and the client call

**Files:**
- Modify: `src/lib/course/assessmentTypes.ts` (add `AttemptSummary`, `AssessmentHistory`)
- Modify: `src/lib/course/assessmentRules.ts` (add `summarizeAttempts`)
- Modify: `src/lib/server/course/attempts.ts` (add `loadAttemptHistory`)
- Modify: `src/pages/api/course/assessment.ts` (add `list`)
- Modify: `src/lib/courseClient.ts` (add `'list'` and `listAttempts`)
- Test: `src/lib/course/__tests__/assessmentRules.test.ts` (extend)

**Interfaces:**
- Consumes: `AttemptState`, `ATTEMPT_COLUMNS`, `GradeRow`, `privateJson`, `postAssessment`.
- Produces: `AttemptSummary { id; state; certification_version; sequence; created_at; submitted_at; finalized_at; passed: boolean | null; total: number | null }`, `AssessmentHistory { attempts: AttemptSummary[] }` (newest first), `summarizeAttempts(rows)`, `loadAttemptHistory(userId)`, `POST { action: 'list' }` → `AssessmentHistory`, `listAttempts(token)`. Task 2 consumes all of it.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/course/__tests__/assessmentRules.test.ts` (read the file first and follow its import style):

```ts
describe('summarizeAttempts', () => {
  const row = (id: string, created: string, state: AttemptState, grade: { passed: boolean; total: number } | null, finalized: string | null) => ({
    id,
    state,
    certification_version: '1',
    created_at: created,
    submitted_at: finalized ? created : null,
    finalized_at: finalized,
    grade,
  });
  it('numbers attempts from the oldest and lists them newest first', () => {
    const out = summarizeAttempts([
      row('b', '2026-09-12T10:00:00Z', 'needs_revision', { passed: false, total: 72.5 }, '2026-09-12T10:10:00Z'),
      row('a', '2026-09-11T10:00:00Z', 'passed', { passed: true, total: 91 }, '2026-09-11T10:10:00Z'),
      row('c', '2026-09-13T10:00:00Z', 'draft', null, null),
    ]);
    expect(out.map((a) => [a.id, a.sequence])).toEqual([['c', 3], ['b', 2], ['a', 1]]);
    expect(out[1]).toMatchObject({ state: 'needs_revision', passed: false, total: 72.5 });
    expect(out[2]).toMatchObject({ state: 'passed', passed: true, total: 91 });
  });
  it('carries no outcome for an attempt that has no grade yet', () => {
    const [only] = summarizeAttempts([row('a', '2026-09-11T10:00:00Z', 'grading', null, null)]);
    expect(only.passed).toBeNull();
    expect(only.total).toBeNull();
  });
});

describe('chooseForm tie-break', () => {
  const form = (form_id: string, order: number, status: 'active' | 'sample' = 'active') => ({ form_id, order, status, certification_version: '1' });
  it('takes the lowest order among equally exposed forms', () => {
    expect(chooseForm([form('form-b', 2), form('form-a', 1)], {}, false)?.form_id).toBe('form-a');
    expect(chooseForm([form('form-b', 2), form('form-a', 1)], { 'form-a': 1 }, false)?.form_id).toBe('form-b');
  });
  it('never assigns a sample form unless allowed', () => {
    expect(chooseForm([form('sample-p0', 0, 'sample')], {}, false)).toBeNull();
    expect(chooseForm([form('sample-p0', 0, 'sample')], {}, true)?.form_id).toBe('sample-p0');
  });
});
```

Adjust the `form(...)` helper to the real `AssignableForm` fields (read the interface); the assertions stand.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/lib/course/__tests__/assessmentRules.test.ts`
Expected: FAIL, `summarizeAttempts` is not exported (the `chooseForm` cases may already pass; keep them, they were the 1d gap).

- [ ] **Step 3: The types and the rule**

In `assessmentTypes.ts`, after `AssessmentStatus`:

```ts
/** One row of a learner's attempt history. Outcome fields are null until a grade exists. */
export interface AttemptSummary {
  id: string;
  state: AttemptState;
  certification_version: string;
  /** 1-based, counted from the learner's first attempt. */
  sequence: number;
  created_at: string;
  submitted_at: string | null;
  finalized_at: string | null;
  passed: boolean | null;
  total: number | null;
}
export interface AssessmentHistory {
  attempts: AttemptSummary[];
}
```

In `assessmentRules.ts`:

```ts
export interface HistoryRow {
  id: string;
  state: AttemptState;
  certification_version: string;
  created_at: string;
  submitted_at: string | null;
  finalized_at: string | null;
  grade: { passed: boolean; total: number } | null;
}

/** Newest first, numbered from the oldest, so "Attempt 2" stays "Attempt 2" after a third one starts. */
export function summarizeAttempts(rows: HistoryRow[]): AttemptSummary[] {
  const oldestFirst = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return oldestFirst
    .map((r, i) => ({
      id: r.id,
      state: r.state,
      certification_version: r.certification_version,
      sequence: i + 1,
      created_at: r.created_at,
      submitted_at: r.submitted_at,
      finalized_at: r.finalized_at,
      passed: r.grade ? r.grade.passed : null,
      total: r.grade ? r.grade.total : null,
    }))
    .reverse();
}
```

- [ ] **Step 4: The store read and the action**

In `attempts.ts`:

```ts
/** Every attempt with its grade's outcome, for the history list. Two reads: the rows, then the grades they point at. */
export async function loadAttemptHistory(userId: string): Promise<HistoryRow[]> {
  const { data, error } = await supabaseAdmin
    .from('course_assessment_attempts')
    .select('id, state, certification_version, created_at, submitted_at, finalized_at, grade_id')
    .eq('user_id', userId)
    .eq('course_id', COURSE.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(`attempt history failed: ${error.message}`);
  const rows = data ?? [];
  const gradeIds = rows.map((r) => r.grade_id).filter((id): id is string => typeof id === 'string');
  const grades = new Map<string, { passed: boolean; total: number }>();
  if (gradeIds.length > 0) {
    const { data: gradeRows, error: gradeError } = await supabaseAdmin.from('course_grades').select('id, passed, total').in('id', gradeIds);
    if (gradeError) throw new Error(`grade history failed: ${gradeError.message}`);
    for (const g of gradeRows ?? []) grades.set(g.id, { passed: g.passed, total: Number(g.total) });
  }
  return rows.map((r) => ({
    id: r.id,
    state: r.state as AttemptState,
    certification_version: r.certification_version,
    created_at: r.created_at,
    submitted_at: r.submitted_at,
    finalized_at: r.finalized_at,
    grade: r.grade_id ? grades.get(r.grade_id) ?? null : null,
  }));
}
```

In `assessment.ts`, add `case 'list': return privateJson({ attempts: summarizeAttempts(await attempts.loadAttemptHistory(user.id)) });` beside the other cases (inside the same try that answers 503 on a thrown store error). In `courseClient.ts`: `AssessmentAction` gains `'list'`; `export const listAttempts = (accessToken: string): Promise<AssessmentHistory> => postAssessment(accessToken, { action: 'list' });` and re-export `AttemptSummary` and `AssessmentHistory` in the type export line.

- [ ] **Step 5: Run the tests and verify the action**

Run: `npx vitest run src/lib/course/__tests__/assessmentRules.test.ts` then `npm test`. Then with the dev server and a bearer for `course-admin@example.com`:

```bash
curl -s -X POST -H "Authorization: Bearer $T" -H 'content-type: application/json' -d '{"action":"list"}' http://localhost:4321/api/course/assessment
```

Expected: `{"attempts":[...]}` newest first with `sequence` counting up from the oldest; a learner with no attempts gets `{"attempts":[]}`; no bearer gets 401; the response carries `Cache-Control: no-store`.

- [ ] **Step 6: Gates and commit**

`npm run check`, `npm test`.

```bash
git add src/lib/course/assessmentTypes.ts src/lib/course/assessmentRules.ts src/lib/server/course/attempts.ts src/pages/api/course/assessment.ts src/lib/courseClient.ts src/lib/course/__tests__/assessmentRules.test.ts
git commit -m "List a learner's assessment attempts"
```

---

### Task 2: History, a read-only earlier attempt, and the retake path in the island

**Files:**
- Modify: `src/components/react/AssessmentView.tsx`
- Modify: `src/components/react/CourseDashboard.tsx` (only if `certificationCopy` for `needs_revision` does not already say a retake is possible)

**Interfaces:**
- Consumes: `listAttempts`, `fetchAssessmentStatus(token, attemptId)`, `startAssessment`, `courseErrorMessage`, `AttemptSummary`.
- Produces: `/course/learn/assessment/?attempt=<id>` (read-only), the "Your attempts" section, the retake panel.

- [ ] **Step 1: Read the flag in the fetch effect, never during render**

The shell is prerendered and the island renders once on the server, so `?attempt=` is read inside the effect that loads the status (the pattern `LessonView.tsx` uses for `?preview=1`) and kept in state as `viewingId: string | null`. `load()` calls `fetchAssessmentStatus(token, viewingId ?? undefined)`. A `not_found` for a bad or foreign id shows "That attempt is not available." with a link to the plain page.

- [ ] **Step 2: The read-only view**

When `viewingId` is set: render a line at the top, "You are looking at an earlier attempt.", with a link "Back to your assessment" to `/course/learn/assessment/`; render `Result` when the attempt is `passed` or `needs_revision`, the grading-error section when `grading_error`, the grading-in-progress section when `submitted` or `grading`, and for a `draft` the sentence "This attempt is still in progress." with the same link; never `Stages`, never `Intro`, never the retake panel, and no polling. The one-time events stay tied to `sawOpenFor`, which a read-only view never sets.

- [ ] **Step 3: The history section**

After the status loads (and after `start` or a submit changes it), fetch `listAttempts(token)` into `history` state. Render `AttemptHistory` below the main content whenever there is more than one attempt or the latest one is finished:

```tsx
function AttemptHistory({ attempts, currentId }: { attempts: AttemptSummary[]; currentId: string | null }) {
  const outcome = (a: AttemptSummary): string =>
    a.state === 'passed' ? 'Passed' : a.state === 'needs_revision' ? 'Not yet' : a.state === 'grading_error' ? 'Grading problem' : a.state === 'draft' ? 'In progress' : 'Being graded';
  const finished = (a: AttemptSummary) => a.state === 'passed' || a.state === 'needs_revision' || a.state === 'grading_error';
  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="font-heading text-xl font-bold text-ink-800">Your attempts</h2>
      <ul className="mt-3 divide-y divide-slate-100">
        {attempts.map((a) => (
          <li key={a.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
            <span>
              {finished(a) && a.id !== currentId ? (
                <a href={`/course/learn/assessment/?attempt=${a.id}`} className="font-medium text-brand-700 hover:underline">
                  Attempt {a.sequence}
                </a>
              ) : (
                <span className="font-medium text-ink-800">Attempt {a.sequence}</span>
              )}
              <span className="text-slate-500">, {new Date(a.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">{outcome(a)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

The current attempt is named, not linked, so the list never links to the page it is on.

- [ ] **Step 4: The retake panel**

When `viewingId` is null, the latest attempt is `needs_revision` and `status.eligibility.eligible` is true, render after `Result`:

```tsx
<section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
  <h2 className="font-heading text-xl font-bold text-ink-800">Start again when you are ready</h2>
  <p className="mt-2 text-slate-700">A new attempt uses a different scenario where one is available. Your earlier result stays in your history, and the lessons named above are the ones worth revisiting first.</p>
  <button type="button" className="btn-primary mt-4" disabled={busy} onClick={onRetake}>{busy ? 'Starting…' : 'Start a new attempt'}</button>
  {retakeError && <ErrorLine text={retakeError} />}
</section>
```

`onRetake` calls `startAssessment(token)`; on success it replaces `status` (the new draft renders `Stages`) and refreshes the history; a `CourseActionError` with code `no_forms_available` shows the server's `message` (the honest "every form has been used" sentence) in `retakeError`, any other code shows `courseErrorMessage(code)`. When `status.eligibility.reason` is `already_passed`, no panel. The `Intro` keeps its own Start button for a learner with no attempt yet.

- [ ] **Step 5: Busy-gate the conflict buttons**

In `Prompt`, the "Use the other version" and "Keep mine" buttons get `disabled={busy}` where `busy` is the island's action flag, so a double click cannot apply both choices (the 1d carried item). No other change to the conflict path.

- [ ] **Step 6: The dashboard**

Read `certificationCopy` in `CourseDashboard.tsx` for the `needs_revision` case. If its body does not already say the learner can start again, make it: `{ body: 'Not yet. Your feedback is ready, and you can start a new attempt when you are ready.', linkLabel: 'See your feedback' }`. If it already says so, leave the file untouched.

- [ ] **Step 7: Verify**

`npm run check`. With the dev server as `course-admin@example.com`, whose latest local attempt the controller has left at `needs_revision`: the page shows the result, the retake panel and "Your attempts"; an earlier finished attempt in the list opens `?attempt=<id>` read-only with the "earlier attempt" line and no stages; `?attempt=00000000-0000-0000-0000-000000000000` shows the not-available line; the retake button either starts a new draft (when a form is left) or shows the honest no-forms message. Do not submit any attempt you start. If the Playwright tools are not available to you, verify `list` and `status` with curl and say the browser walk is left to the controller.

- [ ] **Step 8: Commit**

```bash
git add src/components/react/AssessmentView.tsx src/components/react/CourseDashboard.tsx
git commit -m "Show a learner's attempt history, an earlier result, and the way to start again"
```

---

### Task 3: The result email module (worker-shared) and its tests

**Files:**
- Create: `src/lib/server/course/resultEmail.ts`
- Test: `src/lib/server/course/__tests__/resultEmail.test.ts`

**Interfaces:**
- Consumes: the Resend SDK only (worker-shared: no other project import).
- Produces: `ResultEmailConfig { apiKey; from }`, `resultReadyEmail({ assessmentUrl })`, `notifyLearnerOfResult(config, notice, deps)` where `notice = { jobId; generation; userId; assessmentUrl }` and `deps = { emailFor(userId): Promise<string | null>; markSent(jobId): Promise<boolean> }`. Task 4 consumes it from both call sites.

- [ ] **Step 1: Write the failing tests**

Follow `gradingAlert.test.ts` for how `resend` is mocked (read it first; use the same `vi.mock` shape):

```ts
// src/lib/server/course/__tests__/resultEmail.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
vi.mock('resend', () => ({ Resend: vi.fn(() => ({ emails: { send } })) }));

import { notifyLearnerOfResult, resultReadyEmail } from '../resultEmail';

const config = { apiKey: 'key', from: 'Course <course@example.com>' };
const notice = { jobId: 'job-1', generation: 1, userId: 'user-1', assessmentUrl: 'https://example.com/course/learn/assessment/' };
const deps = (email: string | null, claimed: boolean) => ({ emailFor: vi.fn(async () => email), markSent: vi.fn(async () => claimed) });

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ error: null });
});

describe('resultReadyEmail', () => {
  it('names no outcome, no score and no quote', () => {
    const mail = resultReadyEmail({ assessmentUrl: notice.assessmentUrl });
    expect(mail.subject).toBe('Your assessment result is ready');
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain(notice.assessmentUrl);
      expect(body).not.toMatch(/pass|score|not yet|total|criterion/i);
    }
  });
});

describe('notifyLearnerOfResult', () => {
  it('claims the send, looks up the address, and sends once with the job and generation as the key', async () => {
    const d = deps('learner@example.com', true);
    expect(await notifyLearnerOfResult(config, notice, d)).toBe(true);
    expect(d.markSent).toHaveBeenCalledWith('job-1');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ to: 'learner@example.com', subject: 'Your assessment result is ready' });
    expect(send.mock.calls[0][1]).toEqual({ idempotencyKey: 'course-result/job-1-1' });
  });
  it('sends nothing when the claim says it was already sent', async () => {
    const d = deps('learner@example.com', false);
    expect(await notifyLearnerOfResult(config, notice, d)).toBe(false);
    expect(d.emailFor).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
  it('sends nothing without configuration or without an address, and never throws', async () => {
    expect(await notifyLearnerOfResult({ apiKey: '', from: '' }, notice, deps('learner@example.com', true))).toBe(false);
    expect(await notifyLearnerOfResult(config, notice, deps(null, true))).toBe(false);
    send.mockRejectedValueOnce(new Error('network'));
    expect(await notifyLearnerOfResult(config, notice, deps('learner@example.com', true))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/lib/server/course/__tests__/resultEmail.test.ts`
Expected: FAIL, the module cannot be resolved.

- [ ] **Step 3: Write the module**

```ts
// src/lib/server/course/resultEmail.ts
import { Resend } from 'resend';

/**
 * The learner's "your result is ready" email. It names no outcome, no score
 * and no quote: the result lives on the assessment page behind sign-in, and
 * an email is not a place for it. Worker-shared, like gradingAlert.ts: the
 * Netlify function and the dev server both call it with configuration they
 * read themselves, and it imports only the Resend SDK.
 */

export interface ResultEmailConfig {
  apiKey: string;
  from: string;
}

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

const BRAND = '#5271FF';
const INK = '#16276B';

export function resultReadyEmail(opts: { assessmentUrl: string }): { subject: string; text: string; html: string } {
  const subject = 'Your assessment result is ready';
  const text = [
    subject,
    '',
    'The grader has finished with your final assessment. Sign in to read the feedback on each criterion and the lessons it points to.',
    '',
    `Open your assessment: ${opts.assessmentUrl}`,
    '',
    'Beanchain Coffee LLC',
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#1e293b;line-height:1.5;">
<h1 style="margin:0 0 12px;font-size:22px;color:${INK};">${subject}</h1>
<p style="margin:0 0 20px;">The grader has finished with your final assessment. Sign in to read the feedback on each criterion and the lessons it points to.</p>
<p style="margin:0 0 24px;"><a href="${opts.assessmentUrl}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:${BRAND};color:#ffffff;font-weight:600;text-decoration:none;">Open your assessment</a></p>
<p style="margin:0;font-size:13px;color:#64748b;">Sent because this address took the final assessment on solutionseeking.com.</p>
</body></html>`;
  return { subject, text, html };
}

/**
 * Claim first, then send: the sent-at column is the guard that outlives
 * Resend's idempotency window, and the key covers a worker that reports the
 * same run twice inside it. A send that fails after the claim is logged and
 * not retried; the result is already on the page. Never throws.
 */
export async function notifyLearnerOfResult(config: ResultEmailConfig, notice: ResultNotice, deps: ResultNoticeDeps): Promise<boolean> {
  if (!config.apiKey || !config.from) {
    console.error(`grading job ${notice.jobId}: result email not sent (RESEND_API_KEY or EMAIL_FROM unset)`);
    return false;
  }
  try {
    if (!(await deps.markSent(notice.jobId))) return false;
    const to = await deps.emailFor(notice.userId);
    if (!to) {
      console.error(`grading job ${notice.jobId}: result email not sent (the account has no email address)`);
      return false;
    }
    const mail = resultReadyEmail({ assessmentUrl: notice.assessmentUrl });
    const { error } = await new Resend(config.apiKey).emails.send(
      { from: config.from, to, subject: mail.subject, text: mail.text, html: mail.html },
      { idempotencyKey: `course-result/${notice.jobId}-${notice.generation}` }
    );
    if (error) {
      console.error(`grading job ${notice.jobId}: result email rejected`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`grading job ${notice.jobId}: result email failed`, err);
    return false;
  }
}
```

The brand colours are repeated here on purpose: `email.ts` imports the env helper, which a worker-shared module may not.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/lib/server/course/__tests__/resultEmail.test.ts`, then `npm run check` (the private-content guard must count the new module among the worker-reachable ones once Task 4 imports it; here it only needs to pass).

- [ ] **Step 5: Convert and commit**

```bash
unix2dos -q src/lib/server/course/resultEmail.ts src/lib/server/course/__tests__/resultEmail.test.ts
git add src/lib/server/course/resultEmail.ts src/lib/server/course/__tests__/resultEmail.test.ts
git commit -m "Write the result-ready email"
```

---

### Task 4: Send the result email from both places a grade finishes

**Files:**
- Modify: `src/lib/server/course/gradingJob.ts` (`JobContext.attempt.user_id`, `RunOutcome.finalized` fields, the store method)
- Modify: `src/lib/server/course/jobStore.ts` (select `user_id`, add `markResultEmailSent`)
- Modify: `src/lib/server/course/__tests__/gradingJob.test.ts` (the fake store, the finalized outcome)
- Modify: `netlify/functions/course-grade.mts`
- Modify: `src/lib/server/course/workerTrigger.ts`

**Interfaces:**
- Consumes: Task 3.
- Produces: `RunOutcome` `finalized { passed; attemptId; userId; generation }`; `GradingJobStore.markResultEmailSent(jobId): Promise<boolean>`.

- [ ] **Step 1: Extend the store contract and the outcome**

In `gradingJob.ts`: `JobContext.attempt` gains `user_id: string`; `GradingJobStore` gains `markResultEmailSent(jobId: string): Promise<boolean>` with the docblock "Sets result_email_sent_at where it is null; true when this call set it."; the `finalized` variant becomes `{ outcome: 'finalized'; passed: boolean; attemptId: string; userId: string; generation: number }` and the return at the end of `runGradingJob` fills them from `claim.attemptId`, `ctx.attempt.user_id` and `claim.generation`.

In `jobStore.ts`: `loadContext` selects `user_id` as well and copies it into the context; add:

```ts
async markResultEmailSent(jobId): Promise<boolean> {
  const { data, error } = await client
    .from('course_grading_jobs')
    .update({ result_email_sent_at: new Date().toISOString() })
    .eq('id', jobId)
    .is('result_email_sent_at', null)
    .select('id');
  if (error) throw new Error(`result email claim failed: ${error.message}`);
  return (data ?? []).length === 1;
},
```

In `gradingJob.test.ts`: `fakeStore` gains `async markResultEmailSent(jobId) { calls.push({ name: 'markResultEmailSent', args: jobId }); return true; }`, the context fixture gains `user_id: 'user-1'`, and the finalized assertion becomes `toEqual({ outcome: 'finalized', passed: true, attemptId: 'att-1', userId: 'user-1', generation: 1 })` (match the fixture's real values).

- [ ] **Step 2: The two call sites**

In `course-grade.mts`, after the alert block:

```ts
if (outcome.outcome === 'finalized') {
  await notifyLearnerOfResult(
    { apiKey: env('RESEND_API_KEY'), from: env('EMAIL_FROM') },
    { jobId, generation: outcome.generation, userId: outcome.userId, assessmentUrl: `${adminOrigin()}/course/learn/assessment/` },
    {
      emailFor: async (userId) => (await supabase.auth.admin.getUserById(userId)).data.user?.email ?? null,
      markSent: (id) => store.markResultEmailSent(id),
    }
  );
}
```

where `store` is the `supabaseJobStore(supabase)` already built for `runGradingJob` (hoist it into a `const`). Rename `adminOrigin` to `deployOrigin` since it now serves two links, and update its docblock and both uses. In `workerTrigger.ts`'s inline path, the same call inside the `.then`, with `serverEnv('RESEND_API_KEY')`, `serverEnv('EMAIL_FROM')`, `supabaseAdmin.auth.admin.getUserById`, the store built there, and `${workerOrigin(args.origin) || args.origin}/course/learn/assessment/`; the `.then` handles the failure alert first and the result email otherwise (an outcome is one or the other).

- [ ] **Step 3: Verify**

`npm test` (the job tests and the email tests), `npm run check` (the private-content guard now counts `resultEmail.ts` among the worker-reachable modules and must report ok: it imports only `resend`). Then the local proof without spending: with the dev server running and the admin's latest attempt already graded, run in the database

```sql
update public.course_grading_jobs set result_email_sent_at = null where attempt_id = '<that attempt id>';
```

and call `kick_job` from `/admin` → Grading on that job (or POST the admin action with an admin bearer): the job is `succeeded`, so the claim answers `unavailable` and nothing is sent; that proves the wiring compiles and the path is reached only on `finalized`. The real send is proven on the `course-beta` deploy in the controller's ship step: one graded attempt there produces one email at the learner's address and sets `result_email_sent_at`; a second `kick_job` sends nothing.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/course/gradingJob.ts src/lib/server/course/jobStore.ts src/lib/server/course/__tests__/gradingJob.test.ts netlify/functions/course-grade.mts src/lib/server/course/workerTrigger.ts
git commit -m "Tell the learner by email when a grade is ready"
```

---

### Task 5: Docs, the browser pass and the visual record (controller)

**Files:**
- Modify: `docs/deployment.md` (the "Grading, the sweeper and the admin queue" section: the result email, its key, the sent-at guard, what an operator does when a learner says no email came)
- Modify: `docs/architecture.md` (the assessment route's actions now include `list`)
- Modify: `docs/status.md` (a Phase 3 block under the course initiative: 3a done, 3b to 3d listed)
- Modify: `docs/features/course/README.md` and add `assessment-history-1280.png`, `assessment-retake-390.png`, `assessment-earlier-attempt-1280.png`

Before the pass, the controller creates what the screenshots need on the local stack: a `needs_revision` attempt for `course-admin@example.com` (the scratch walk in `thin` mode, one real grade), and leaves an earlier finished attempt in the history. Capture at 1280 and 390, write the captions in the README's voice with varied openers, and run the gate set once more: `npm run check`, `npm test`, a hidden build with the dist scan ok.

---

## Notes for the controller

- Tasks 1 and 3 are transcription with tests and take the cheap tier; Tasks 2 and 4 touch several files and take the standard tier. Task 5 is the controller's.
- Task 2's browser verification needs a `needs_revision` attempt on the local stack. If none exists when Task 2 is dispatched, the implementer verifies with curl and the controller finishes the check in Task 5.
- The ship step for 3a is small: nothing new in the environment (Resend is already in Functions scope), no migration. After the merge, the controller proves the email once on the `course-beta` deploy.

## Execution record (2026-09-12)

Executed with subagent-driven development on branch `course-phase3a` from `main` after PR #18: Tasks 1 to 4 in five commits from `114069e` to `05a83fe`, the controller's screenshots and docs (Task 5, `948d7b2`), a whole-branch review and one fix wave (`746aac4`). Task reviews were clean for Tasks 1, 3 and 4; Task 2 took one fix round (the read-only grading-in-progress copy promised polling the view does not do). The whole-branch review found what no task review could: after a successful retake the island's per-prompt refs and drafts, keyed by prompt id, still held the previous attempt's values because prompt ids repeat across forms, so the new attempt showed the old answers and could not advance without a reload; the local walk had only ever reached the no-forms branch because both local forms were already exposed. Amendments the reviews and the run forced on this plan:

- The island resets its per-prompt state whenever the attempt id changes, before seeding; polls of the same attempt keep the merge behaviour. The history passes its newest row as the current attempt in both modes, and refreshes on attempt transitions rather than on every poll tick. `isAttemptFinished` in `assessmentRules.ts` replaces three spellings of the finished states.
- The result email's draft copy named a criterion while the plan's own test forbids the word; the copy was reworded and the test kept.
- The Resend mock in the email test is `vi.fn().mockImplementation(function () {...})`, since an arrow-returning `vi.fn` is not constructible under this vitest.
- A two-attempt history cannot exist locally with one sample form and one exposure per learner, so the controller used untracked local copies of the sample form (`sample-p1.json` and `sample-p2.json`, never committed, deleted at the end) to grade two not-yet attempts for the admin account and to walk a successful retake.

Browser verification (Task 5) on the local stack as the enrolled admin account: the not-yet result with the retake panel and the history (the current attempt named, the earlier one linked), the earlier attempt opened read-only with its own lower total, the not-available line for an unknown id, the retake button answering with the no-forms sentence, and after the fix wave a successful retake into a fresh empty draft that saves and locks its first stage without a conflict. Screenshots are in `docs/features/course/`. Gates on the final tree: `npm run check` clean with the guard at sixteen worker-reachable modules, 238 tests, a hidden build with the dist scan ok. The real email is proven on the `course-beta` deploy after the merge.

Carried forward:

1. `AssessmentView.tsx` is about 820 lines; 3c adds the review request form there and should split the read-only branch or the result rendering first. The per-prompt refs could carry the attempt id in their keys, which is the structurally safe form of the reset the fix wave added.
2. The grading-error and grading-in-progress blocks are duplicated between the live and read-only branches.
3. The read-only status response reports `eligibility` for the viewed attempt, not the learner's latest; harmless while the retake gate keys on the view mode, and 3c's review form on that view must not read it.
4. On a branch deploy the learner's email link points at the branch host, which the pilot needs; after launch, the learner link should come from `URL` while the admin link keeps `deployOrigin()`, so a Kick from the branch admin cannot email a real learner a preview address.
5. `resultEmail.ts` interpolates the assessment URL without an escape helper (the URL is caller-built) and the already-sent short-circuit logs nothing by design. 3b's certificate email and 3c's review email should share one claim-then-send skeleton with this module rather than copy it; the spec names the module `courseEmail.ts`, and the split into `resultEmail.ts` is recorded here.

## Handoff

3b (certificates and verification) consumes `AssessmentStatus.certificate` (still `null` here), the `finalized` outcome's `userId` and `attemptId` for the certificate-ready email in the same module shape, and the history list, which will link a passed attempt to its certificate. 3c (reviews and regrades) consumes the read-only attempt view, where the review request form will live. 3d (the benchmark) consumes nothing from 3a.
