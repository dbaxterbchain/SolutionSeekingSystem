# Course Phase 2: Content System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the course everything it needs to take David's lesson copy and Bradley's recordings module by module: module checks that count toward completion, an admin preview of staged lessons, a content ladder that says what each lesson still needs, the free preview lesson page, and a resources page.

**Architecture:** The same shape as Phase 1. Prerendered shells under `/course/learn/` carry public metadata only; React islands fetch everything a learner pays for from `/api/course/*` with the bearer token; pure rules live in `src/lib/course/` with unit tests and their bindings in `src/lib/server/course/`. The module checks reuse the `course_check_attempts` table from `0030` and the `checks_complete` rule already in `stateRules.ts`; nothing in the database changes. The free preview page renders the one `preview: true` lesson at build time through the same `LessonSections` renderer the island uses.

**Tech Stack:** Astro 5 (static-first, `@astrojs/netlify`), React islands, Supabase (service role, server-write-only tables), vitest, the existing `courseClient.ts` helpers.

**Spec:** `docs/superpowers/specs/2026-09-09-paid-video-course-design.md`, sections "Content model and authoring format", "API contract" (the `check` row), "Progress rules" (module completion), "Routes" (`/course/preview/`), "Public surfaces and touchpoints" and "Phase 2: content system". The handoff at the end of `docs/superpowers/plans/2026-09-10-course-phase1e-admin-wiring-docs-ship.md` names what Phase 2 consumes.

## Global Constraints

Copied from the spec and the house rules. Every task's requirements include this section.

- **Nothing we publish reads as though a machine wrote it.** No em dashes or en dashes anywhere in copy, comments, docs or commit messages; fix the sentence, never the character. No counted-pair headings, no list where every item opens the same way, no "delve", no "It's not just X, it's Y". Never type a price or a lesson or module count in prose; derive it.
- **Line endings.** Every file in this repo is CRLF. A new file is converted with `unix2dos -q <file>` after writing. An existing file is edited with the Edit tool only; `sed -i` strips the CR.
- **Answer keys never leave the server.** `ModuleCheck.answer` is read only in `src/lib/server/course/content.ts` and `src/pages/api/course/check.ts`. No API response, island prop, shell prop or built HTML carries it. The `PublicCurriculum` type stays the only course shape a shell may pass to an island; it structurally cannot carry checks.
- **No lesson prose in HTML** except on the free preview page, which is public by design. Learner shells (`/course/learn/**`) carry titles, outcomes and the curriculum only, and pass `noindex` to `BaseLayout`.
- **Every `/api/course/*` response goes through `privateJson`** (`src/lib/server/auth.ts`), which sets `Cache-Control: no-store`. Learner routes gate with `requireEnrolled(request)`; admin routes with `requireAdmin(request)`. Hand-rolled validation with regexes and `typeof`; no Zod outside `astro:content`. Error codes are snake_case.
- **Registration touchpoints** (`docs/change-checklist.md`): a new page needs an OG entry in `src/pages/og/[...route].ts` (learner pages too, since a shared link still fetches the card), the sitemap filter in `astro.config.mjs` already excludes `/course/learn` and includes `/course/*` only when the course is public, and `docs/status.md` changes in the same commit as anything that changes scope or status.
- **Tests.** vitest covers `src/lib/course/__tests__/**` and `src/lib/server/course/__tests__/**` only. Pure modules get tests; islands, shells and API routes are verified with `npm run check`, `npm run build`, curl and the browser. `npm run check` runs `astro check` plus the private-content guard; `npm run build` runs the dist-leak scan. Both must stay green after every task.
- **Commits.** One commit per task unless the task says otherwise, message in the house voice. The `git commit` lines in the tasks show the title only; every commit also carries a body sentence when the title needs one and ends with the trailer for the model that wrote it: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`, `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` or `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **Never** run `npx supabase db push` or `npx supabase db reset`, print `.env` or `.env.local` values, echo a key or a token, commit a secret, or edit `supabase/migrations/0030_course.sql` or `0031_course_assessment.sql` (both are applied to the hosted project now and are frozen). No migration is needed for this plan.
- **Content files are David's.** A task may edit a lesson file only for a verification step that the task names, and restores it with `git checkout -- <file>` before committing. No task changes lesson copy, module checks or worksheet bodies.
- **Branch.** Work happens on `course-phase2`, branched from `main` after PR #17. Production stays `hidden`; the `course-beta` branch deploy runs `preview`.

## Shapes in place

The tasks consume these as they are. File paths are exact; read the file before relying on a detail this list omits.

- `src/lib/course/types.ts`: `ModuleCheck { question; choices: [string, string]; answer: 1 | 2; explanation }`, `ModuleInput { id; title; summary; worksheet; checks: ModuleCheck[] }`, `LessonInput` (id, title, module, kind, next?, worksheet, streamUid, durationMin, status, contentVersion, preview, videoPlaceholder, approvals { copy?; edit?; captions? }, body), `LessonStatus` in ladder order `LESSON_STATUSES = ['draft','approved','filmed','edited','captioned','staged','published']`, `LessonKind = 'standard' | 'orientation' | 'plan'`.
- `src/lib/course/ids.ts`: `LESSON_ID_RE`, `MODULE_ID_RE = /^m0[1-9]$/`, `WORKSHEET_ID_RE`, `STREAM_UID_RE`, `checkId(moduleId, n) => \`${moduleId}-c${n}\`` (1-based), `moduleNumber(id)`, `hasBannedCopy(s)`.
- `src/lib/course/validate.ts`: `validateCatalog(input: CatalogInput): Catalog`; `CatalogModule { id; order; title; summary; worksheet; lessonIds; minutes; checks }`; `CatalogLesson extends LessonInput { seq; order; moduleOrder; prevId; nextId; sections: LessonSections }`; `Catalog { modules; lessons; byId; worksheets; summary }`. The status-ladder gates are inline `need(...)` calls around lines 232 to 268 (approved: five sections and `approvals.copy`; edited: `streamUid` unless placeholder, `durationMin >= 1`, `approvals.edit` unless placeholder; captioned: transcript and `approvals.captions` unless placeholder; plus the `open`-only refusals of placeholders and an unpublished preview lesson). `rank(status)` is the index into `LESSON_STATUSES`.
- `src/lib/course/catalog.ts`: `getCourseCatalog(): Promise<Catalog>` (Astro-only, memoised per build). `src/lib/course/curriculum.ts`: `publicCurriculum(catalog): PublicCurriculum` with `modules[] { id; order; title; summary; minutes; lessons[] { id; title; order; seq; status; durationMin } }`, `totalLessons`, `totalMinutes`.
- `src/lib/course/lessonSections.ts`: `parseLessonSections(body)` and `LessonSections { outcome; keyPoints; exercise; modelResponse; selfReview; transcript }`. `src/lib/course/lessonView.ts`: `learnerSections(sections)` (drops the model response), `videoUidFor(lesson, placeholderUid)`, `neighbour(lesson, adminPreview)`.
- `src/lib/course/visibility.ts`: `isLearnerVisible` (published), `hasShell` (staged or published), `isVisibleTo(lesson, adminPreview)`.
- `src/lib/course/stateRules.ts`: `deriveCourseState(input)` already computes per module `{ complete; lessons_published; lessons_completed; checks_complete }`, where `checks_complete` is true when every `checkIds` entry has a correct attempt in `input.attempts` (`CheckAttemptLite { module_id; check_id; correct }`). `src/lib/server/course/state.ts`: `computeCourseState(userId): Promise<CourseStateView>` builds the input from the catalog, `loadAllProgress` and `loadCheckAttempts` (correct attempts only).
- `src/lib/server/course/progress.ts`: `loadProgress`, `loadAllProgress`, `saveProgress`, `loadCheckAttempts(userId)`; every function throws with a prefix on a database error and the routes answer 503. Inserts follow `supabaseAdmin.from(table).insert({...}).select(...).single()`.
- `src/lib/server/course/content.ts`: `getLessonForLearner(id, adminPreview)` returning `{ lesson; module; prev; next }`, `getWorksheet(id)`. Its header says checks and answer keys are read here when Phase 2 adds them.
- `src/lib/server/course/enrollment.ts`: `requireEnrolled(request)` returns `{ user }` or `{ error; status; reason? }`. `src/lib/server/adminAuth.ts`: `requireAdmin(request)`, `adminJson(body, status)`, `isAdminUser(user)`.
- `src/pages/api/course/worksheet.ts` is the template for a GET learner route; `src/pages/api/course/progress.ts` for a POST one (it answers 404 for a lesson that is not published, because an admin preview reads but never writes).
- `src/pages/api/course/lesson.ts`: `?preview=1` requires an admin and then opens staged lessons; the payload's `prev` and `next` come from `neighbour(l, adminPreview)` and carry `available`.
- `src/lib/courseClient.ts`: `CourseActionError(code, status, message?, extra?)`, `courseErrorMessage(code)`, `getJson<T>(token, path)`, `throwFor(res, data)`, `postProgress(token, body)`, `fetchLesson(token, id, preview = false)`, `fetchCourseState(token)`, `fetchWorksheet(token, id)`, types `LessonPayload`, `ProgressResponse { progress; lesson_completed; module_completed; next_lesson_id; model_response? }`, `CourseStateView` (mirrors the server view, with `modules[id].checks_complete`), `WorksheetPayload`.
- `src/components/react/WorksheetView.tsx` is the template for a small learner island: `useSession()`, the sign-in note with `accountLink({ next })`, the `CourseActionError` mapping, `Markdown` from `./chat/Markdown`. `src/pages/course/learn/worksheets/[id].astro` is the template for a learner shell with `getStaticPaths` over the catalog.
- `src/components/react/CourseDashboard.tsx`: the module cards are the `<ol className="mt-10 grid gap-4 md:grid-cols-2">` near line 281, one `<li>` per `props.curriculum.modules`, each lesson row showing `Coming soon`, `Done`, `In progress` or nothing from `courseState?.lessons[l.id]`. `courseState` is the `CourseStateView`.
- `src/components/react/LessonNav.tsx`: the drawer, one `<li>` per module with the same lesson rows (lines 84 to 112). `src/components/react/LessonView.tsx`: `complete()` near line 231 tracks `lesson_completed` and, when `res.module_completed`, `module_completed`; the neighbour links are near lines 454 to 466; the worksheet link near line 299; `fetchLesson` is called without the preview flag today.
- `src/components/react/LessonSections.tsx`: `LessonSections({ sections: { id; title; markdown }[] })`, the one renderer for lesson prose; its docblock already names the public preview page as its second caller. `src/components/react/StreamPlayer.tsx`: the iframe with no autoplay and captions on; the free page uses a plain Astro iframe with the same attributes rather than the island.
- `src/lib/course/streamUrls.ts`: `embedUrl(customerCode, token)` and `posterUrl(customerCode, token)`; for an unsigned video the UID takes the token's place.
- `src/lib/server/course/stream.ts`: `getPlayback(uid)` reads `CLOUDFLARE_STREAM_CUSTOMER_CODE`, `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_STREAM_API_TOKEN` through `serverEnv`.
- `src/data/course.ts`: `COURSE` (id, title, presenter, previewLessonId `v05`, orientationLessonId `v39`, planLessonId `v40`, `placeholderStreamUid` set to the stand-in clip), `COURSE_STATUS`, `COURSE_TOKENS` (`support_contact` is set), `courseCopy('{{support_contact}}')` in `src/lib/course/copy.ts`.
- `src/pages/course/index.astro`: returns a 404 `Response` when hidden, calls `assertLaunchSettings()`, renders `PageHero`, `CourseSalesCta` and `CourseSyllabus`. `src/pages/og/[...route].ts`: `courseLessonPages` and `courseWorksheetPages` are built from the catalog; the `course` and `course/certification` entries are gated on `COURSE_STATUS !== 'hidden'`; `course/learn` and `course/learn/assessment` are always present.
- `src/lib/analytics.ts`: the event union carries `course_viewed`, `enrollment_ready`, `lesson_completed { lesson_id; module_id; content_version }`, `module_completed { module_id }`; `CTA_LOCATIONS` already includes `course_preview` and `course_dashboard`. `track(event)` is the only entry point.
- `src/components/react/AdminView.tsx`: `type Tab = 'feedback' | 'orgs' | 'subscribers' | 'enquiries' | 'grading' | 'enrollments'`, `loadTab(which)` calls `call('course?view=grading')` and `call('course?view=enrollments')`, the `tabs` array near line 221 renders the buttons. `src/pages/api/admin/course.ts`: `GET` switches on `?view=` (`enrollments`, `grading`, else `deny('invalid', 400)`), `POST` on `action`.
- Local test setup: the local Supabase stack on 127.0.0.1:55321 with `course-admin@example.com` (admin, enrolled) and `course-learner@example.com` (enrolled), password `course-test-password-1`; `.env.local` holds `ADMIN_EMAILS=course-admin@example.com`; the dev server starts on port 4327; a bearer token comes from the password grant against the local auth (`scratchpad/t11/tok.sh <email> <outfile>` in the controller's scratch, or the same curl by hand). Only V04 is published, so module `m02` has one published lesson and two checks; every other module has none published.

## Rulings

1. **Module checks live on a module page**, `/course/learn/modules/[id]/` for `m01` to `m08`, not inside a lesson. A learner who finished a module's lessons before its checks existed needs somewhere to come back to, and the dashboard card, the drawer and the module's lessons all link there. Module 9 has no checks and no page.
2. **Every answer is recorded and retrying is allowed.** A check is complete once it has one correct attempt (the rule `stateRules.ts` already implements); the explanation is shown after any answer; the correct choice is never sent, so a wrong answer reveals nothing but the explanation the author wrote. Module completion stays `lessons complete and checks complete`, as built.
3. **The free preview page exists only when the course is public and the preview lesson is published.** A published preview lesson still carrying the stand-in clip renders without a player and with the honest "being filmed" note, because the stand-in clip is signed and the free page embeds without a token. The page is a 404 that writes nothing to `dist/` in every other case, like the sales page.
4. **The Stream customer code becomes a data constant** (`COURSE.streamCustomerCode`), because the free page needs it at build time and the value is public (it is in every embed URL). `stream.ts` prefers the env var and falls back to the constant, so nothing on the hosted stack changes.
5. **The admin preview in the lesson island is read-only.** With `?preview=1` an admin reads a staged lesson through the existing API path; the island shows a banner naming the status and renders no progress action, because the progress route refuses unpublished lessons by design.
6. **The content ladder is a pure report over a valid catalog**, shown in `/admin` as a Content tab. It answers "what does this lesson still need to move up one rung", which is the question David and Bradley will ask forty times. The validator's gate checks are extracted into one function so the report and the build cannot disagree.
7. **The resources page is a prerendered shell with public data only** (worksheet titles and links, the free guide, the practice tools, support). The worksheet pages gate themselves.
8. **Content import is not a task in this plan.** Lessons are published module by module by editing content files; the tooling and the runbook are the deliverables. Production is `hidden`, so a published lesson reaches enrolled pilots and nobody else.

---

### Task 1: Check rules (pure) and their tests

**Files:**
- Create: `src/lib/course/checkRules.ts`
- Test: `src/lib/course/__tests__/checkRules.test.ts`

**Interfaces:**
- Consumes: `ModuleCheck` from `types.ts`; `checkId` from `ids.ts`.
- Produces: `CHECK_MODULE_ID_RE`, `CHECK_ID_RE`, `PublicCheck`, `publicChecks(moduleId, checks)`, `CheckAnswer`, `parseCheckAnswer(body)`, `findCheck(moduleId, checks, id)`, `gradeCheck(check, choice)`. Task 2 and Task 3 use every one of them.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/course/__tests__/checkRules.test.ts
import { describe, expect, it } from 'vitest';
import { findCheck, gradeCheck, parseCheckAnswer, publicChecks } from '../checkRules';
import type { ModuleCheck } from '../types';

const checks: ModuleCheck[] = [
  { question: 'First?', choices: ['No', 'Yes'], answer: 2, explanation: 'Because yes.' },
  { question: 'Second?', choices: ['Yes', 'No'], answer: 1, explanation: 'Because the first.' },
];

describe('publicChecks', () => {
  it('numbers the checks from one and strips the answer and the explanation', () => {
    const out = publicChecks('m02', checks);
    expect(out.map((c) => c.id)).toEqual(['m02-c1', 'm02-c2']);
    expect(out[0]).toEqual({ id: 'm02-c1', question: 'First?', choices: ['No', 'Yes'] });
    expect(JSON.stringify(out)).not.toContain('answer');
    expect(JSON.stringify(out)).not.toContain('Because');
  });
});

describe('parseCheckAnswer', () => {
  it('accepts a well-formed answer', () => {
    expect(parseCheckAnswer({ module_id: 'm02', check_id: 'm02-c1', choice: 2 })).toEqual({
      ok: true,
      value: { module_id: 'm02', check_id: 'm02-c1', choice: 2 },
    });
  });
  it.each([
    [{ module_id: 'm09', check_id: 'm09-c1', choice: 1 }, 'module_id'],
    [{ module_id: 'm02', check_id: 'm03-c1', choice: 1 }, 'check_id'],
    [{ module_id: 'm02', check_id: 'm02-c1', choice: 3 }, 'choice'],
    [{ module_id: 'm02', check_id: 'm02-c1', choice: '2' }, 'choice'],
    [{ check_id: 'm02-c1', choice: 1 }, 'module_id'],
    [null, 'module_id'],
  ])('rejects %j naming %s', (body, field) => {
    expect(parseCheckAnswer(body)).toEqual({ ok: false, field });
  });
});

describe('findCheck', () => {
  it('finds a check by its numbered id', () => {
    expect(findCheck('m02', checks, 'm02-c2')).toEqual({ index: 1, check: checks[1] });
  });
  it('returns null for a number the module does not have or another module', () => {
    expect(findCheck('m02', checks, 'm02-c3')).toBeNull();
    expect(findCheck('m02', checks, 'm03-c1')).toBeNull();
  });
});

describe('gradeCheck', () => {
  it('compares the choice with the key and returns the explanation either way', () => {
    expect(gradeCheck(checks[0], 2)).toEqual({ correct: true, explanation: 'Because yes.' });
    expect(gradeCheck(checks[0], 1)).toEqual({ correct: false, explanation: 'Because yes.' });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/lib/course/__tests__/checkRules.test.ts`
Expected: FAIL, the module `../checkRules` cannot be resolved.

- [ ] **Step 3: Write the module**

```ts
// src/lib/course/checkRules.ts
import type { ModuleCheck } from './types';
import { checkId } from './ids';

/**
 * The module-check rules, pure and shared by the API route and the island's
 * types. A check reaches the browser as its id, question and two choices; the
 * key and the explanation stay on the server until an answer is graded.
 */

/** Modules that carry checks. Module 9 holds the orientation and the plan, no checks. */
export const CHECK_MODULE_ID_RE = /^m0[1-8]$/;
/** `m02-c1`: the module id, then the 1-based check number. */
export const CHECK_ID_RE = /^m0[1-8]-c[1-9]$/;

export interface PublicCheck {
  id: string;
  question: string;
  choices: [string, string];
}

export const publicChecks = (moduleId: string, checks: ModuleCheck[]): PublicCheck[] =>
  checks.map((c, i) => ({ id: checkId(moduleId, i + 1), question: c.question, choices: c.choices }));

export interface CheckAnswer {
  module_id: string;
  check_id: string;
  choice: 1 | 2;
}

export type ParsedCheckAnswer = { ok: true; value: CheckAnswer } | { ok: false; field: string };

/** The POST body, validated by hand. The first bad field is named, in the order a reader would fix them. */
export function parseCheckAnswer(body: unknown): ParsedCheckAnswer {
  const b = (body ?? {}) as Record<string, unknown>;
  const moduleId = b.module_id;
  if (typeof moduleId !== 'string' || !CHECK_MODULE_ID_RE.test(moduleId)) return { ok: false, field: 'module_id' };
  const id = b.check_id;
  if (typeof id !== 'string' || !CHECK_ID_RE.test(id) || !id.startsWith(`${moduleId}-c`)) {
    return { ok: false, field: 'check_id' };
  }
  const choice = b.choice;
  if (choice !== 1 && choice !== 2) return { ok: false, field: 'choice' };
  return { ok: true, value: { module_id: moduleId, check_id: id, choice } };
}

/** The check a well-formed id names, or null when the module has no check with that number. */
export function findCheck(
  moduleId: string,
  checks: ModuleCheck[],
  id: string
): { index: number; check: ModuleCheck } | null {
  const index = checks.findIndex((_, i) => checkId(moduleId, i + 1) === id);
  return index === -1 ? null : { index, check: checks[index] };
}

export interface CheckVerdict {
  correct: boolean;
  explanation: string;
}

export const gradeCheck = (check: ModuleCheck, choice: 1 | 2): CheckVerdict => ({
  correct: check.answer === choice,
  explanation: check.explanation,
});
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/lib/course/__tests__/checkRules.test.ts`
Expected: PASS, 8 tests. Then `npm test` for the whole suite (210 tests before this task, plus these).

- [ ] **Step 5: Convert line endings and commit**

```bash
unix2dos -q src/lib/course/checkRules.ts src/lib/course/__tests__/checkRules.test.ts
git add src/lib/course/checkRules.ts src/lib/course/__tests__/checkRules.test.ts
git commit -m "Add the module check rules"
```

---

### Task 2: The check store, `GET/POST /api/course/check`, and the client calls

**Files:**
- Modify: `src/lib/server/course/content.ts` (add `getModuleForLearner`; update the docblock)
- Modify: `src/lib/server/course/progress.ts` (add `loadCheckHistory`, `recordCheckAttempt`)
- Create: `src/pages/api/course/check.ts`
- Modify: `src/lib/courseClient.ts` (add `ModuleChecksPayload`, `CheckAnswerResponse`, `fetchModuleChecks`, `answerCheck`, a shared `postJson`)

**Interfaces:**
- Consumes: Task 1; `computeCourseState` from `state.ts`; `requireEnrolled`; `privateJson`; `getCourseCatalog`.
- Produces: `GET /api/course/check?module_id=m02` → `ModuleChecksPayload`; `POST /api/course/check` with `{ module_id, check_id, choice }` → `CheckAnswerResponse`; `fetchModuleChecks(token, moduleId)`, `answerCheck(token, body)`. Task 3 consumes all of it.

- [ ] **Step 1: Add the server reads and writes**

In `content.ts`, replace the docblock sentence "Checks and answer keys are read here too when Phase 2 adds the module checks." with "The module checks are read here too, key included; only the check route may call `getModuleForLearner`, and it strips the key before answering." Then add:

```ts
export interface ModuleWithLessons {
  module: CatalogModule;
  lessons: CatalogLesson[];
}

/** A module with checks, with its lessons in order, or null for an unknown id or module 9. */
export async function getModuleForLearner(id: string): Promise<ModuleWithLessons | null> {
  const catalog = await getCourseCatalog();
  const module = catalog.modules.find((m) => m.id === id);
  if (!module || module.checks.length === 0) return null;
  return { module, lessons: module.lessonIds.map((lid) => catalog.byId[lid]) };
}
```

In `progress.ts` add, after `loadCheckAttempts`:

```ts
export interface CheckAttemptRow {
  check_id: string;
  choice: 1 | 2;
  correct: boolean;
  created_at: string;
}

/** Every attempt on one module, newest first. The island shows the count and whether a check is done. */
export async function loadCheckHistory(userId: string, moduleId: string): Promise<CheckAttemptRow[]> {
  const { data, error } = await supabaseAdmin
    .from('course_check_attempts')
    .select('check_id, choice, correct, created_at')
    .eq('user_id', userId)
    .eq('course_id', COURSE.id)
    .eq('module_id', moduleId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`course_check_attempts read failed: ${error.message}`);
  return (data as CheckAttemptRow[]) ?? [];
}

/** Append-only. The table has no update grant for anyone, so a recorded answer is never rewritten. */
export async function recordCheckAttempt(
  userId: string,
  moduleId: string,
  checkId: string,
  choice: 1 | 2,
  correct: boolean
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('course_check_attempts')
    .insert({ user_id: userId, course_id: COURSE.id, module_id: moduleId, check_id: checkId, choice, correct });
  if (error) throw new Error(`course_check_attempts insert failed: ${error.message}`);
}
```

- [ ] **Step 2: Write the route**

```ts
// src/pages/api/course/check.ts
import type { APIRoute } from 'astro';
import { privateJson } from '../../../lib/server/auth';
import { requireEnrolled } from '../../../lib/server/course/enrollment';
import { getModuleForLearner } from '../../../lib/server/course/content';
import { loadCheckHistory, recordCheckAttempt } from '../../../lib/server/course/progress';
import { computeCourseState } from '../../../lib/server/course/state';
import { CHECK_MODULE_ID_RE, findCheck, gradeCheck, parseCheckAnswer, publicChecks } from '../../../lib/course/checkRules';

export const prerender = false;

/**
 * A module's checks for an enrolled learner. GET serves the questions and
 * the learner's standing on each; POST records one answer and returns the
 * verdict with the author's explanation. The key never leaves this file.
 */

/** What the island sees of one check: the question, the choices, and how the learner stands. */
interface CheckStanding {
  id: string;
  question: string;
  choices: [string, string];
  attempts: number;
  answered_correctly: boolean;
  last_choice: 1 | 2 | null;
}

async function standing(userId: string, moduleId: string, checks: ReturnType<typeof publicChecks>) {
  const history = await loadCheckHistory(userId, moduleId);
  return checks.map<CheckStanding>((c) => {
    const rows = history.filter((h) => h.check_id === c.id);
    return {
      ...c,
      attempts: rows.length,
      answered_correctly: rows.some((r) => r.correct),
      last_choice: rows[0]?.choice ?? null,
    };
  });
}

export const GET: APIRoute = async ({ request }) => {
  const moduleId = new URL(request.url).searchParams.get('module_id') ?? '';
  if (!CHECK_MODULE_ID_RE.test(moduleId)) return privateJson({ error: 'bad_request', field: 'module_id' }, 400);
  const auth = await requireEnrolled(request);
  if ('error' in auth) return privateJson({ error: auth.error, reason: auth.reason }, auth.status);
  const found = await getModuleForLearner(moduleId);
  if (!found) return privateJson({ error: 'not_found' }, 404);
  try {
    const [checks, state] = await Promise.all([
      standing(auth.user.id, moduleId, publicChecks(moduleId, found.module.checks)),
      computeCourseState(auth.user.id),
    ]);
    const m = state.modules[moduleId];
    return privateJson({
      module: { id: found.module.id, title: found.module.title, order: found.module.order },
      checks,
      lessons_complete: m.lessons_published > 0 && m.lessons_completed === m.lessons_published,
      module_complete: m.complete,
    });
  } catch (err) {
    console.error('course check read failed', err);
    return privateJson({ error: 'progress_unavailable' }, 503);
  }
};

export const POST: APIRoute = async ({ request }) => {
  const parsed = parseCheckAnswer(await request.json().catch(() => null));
  if (!parsed.ok) return privateJson({ error: 'bad_request', field: parsed.field }, 400);
  const auth = await requireEnrolled(request);
  if ('error' in auth) return privateJson({ error: auth.error, reason: auth.reason }, auth.status);
  const { module_id, check_id, choice } = parsed.value;
  const found = await getModuleForLearner(module_id);
  const hit = found ? findCheck(module_id, found.module.checks, check_id) : null;
  if (!found || !hit) return privateJson({ error: 'not_found' }, 404);
  const verdict = gradeCheck(hit.check, choice);
  try {
    await recordCheckAttempt(auth.user.id, module_id, check_id, choice, verdict.correct);
    const state = await computeCourseState(auth.user.id);
    return privateJson({
      correct: verdict.correct,
      explanation: verdict.explanation,
      check_complete: verdict.correct || state.modules[module_id].checks_complete,
      module_complete: state.modules[module_id].complete,
    });
  } catch (err) {
    console.error('course check write failed', err);
    return privateJson({ error: 'progress_unavailable' }, 503);
  }
};
```

Note the order in `POST`: the body is validated before the enrollment check so a malformed request costs no database read, which matches `progress.ts`. `check_complete` is true when this answer was correct or an earlier one was.

- [ ] **Step 3: Add the client calls**

In `courseClient.ts`, after `WorksheetPayload`:

```ts
export interface CheckStandingView {
  id: string;
  question: string;
  choices: [string, string];
  attempts: number;
  answered_correctly: boolean;
  last_choice: 1 | 2 | null;
}
export interface ModuleChecksPayload {
  module: { id: string; title: string; order: number };
  checks: CheckStandingView[];
  lessons_complete: boolean;
  module_complete: boolean;
}
export interface CheckAnswerResponse {
  correct: boolean;
  explanation: string;
  check_complete: boolean;
  module_complete: boolean;
}
```

After `getJson`, add a POST twin and use it for the new call (leave `postProgress` as it is):

```ts
/** POST JSON with the bearer; throws CourseActionError with the server's code (or network_error). */
async function postJson<T>(accessToken: string, path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new CourseActionError('network_error', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throwFor(res, data);
  return data as T;
}

export const fetchModuleChecks = (accessToken: string, moduleId: string): Promise<ModuleChecksPayload> =>
  getJson(accessToken, `/api/course/check?module_id=${encodeURIComponent(moduleId)}`);
export const answerCheck = (
  accessToken: string,
  body: { module_id: string; check_id: string; choice: 1 | 2 }
): Promise<CheckAnswerResponse> => postJson(accessToken, '/api/course/check', body);
```

- [ ] **Step 4: Verify with curl against the dev server**

Start `npm run dev` (port 4327), take a bearer for `course-learner@example.com` from the local auth, and run, with `T` the token:

```bash
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:4327/api/course/check?module_id=m02"            # 401, no bearer
curl -s -H "Authorization: Bearer $T" "http://localhost:4327/api/course/check?module_id=m09"                # 400 bad_request module_id
curl -s -H "Authorization: Bearer $T" "http://localhost:4327/api/course/check?module_id=m02"                # 200: two checks, attempts 0, no "answer" or "explanation" key anywhere
curl -s -X POST -H "Authorization: Bearer $T" -H 'content-type: application/json' -d '{"module_id":"m02","check_id":"m02-c1","choice":2}' http://localhost:4327/api/course/check   # 200 correct false, the explanation, check_complete false
curl -s -X POST -H "Authorization: Bearer $T" -H 'content-type: application/json' -d '{"module_id":"m02","check_id":"m02-c1","choice":1}' http://localhost:4327/api/course/check   # 200 correct true, check_complete true
curl -s -X POST -H "Authorization: Bearer $T" -H 'content-type: application/json' -d '{"module_id":"m02","check_id":"m02-c3","choice":1}' http://localhost:4327/api/course/check   # 404 not_found
curl -s -X POST -H "Authorization: Bearer $T" -H 'content-type: application/json' -d '{"module_id":"m02","check_id":"m02-c2","choice":3}' http://localhost:4327/api/course/check   # 400 bad_request choice
```

Then `GET` again: `m02-c1` shows `attempts: 2`, `answered_correctly: true`, `last_choice: 1`. Confirm the two rows in the local database: `docker exec -i supabase_db_SolutionSeekingSystem psql -U postgres -d postgres -c "select module_id, check_id, choice, correct from public.course_check_attempts order by created_at"`. The `Cache-Control: no-store` header is on every response (`curl -sI` shows it through `privateJson`).

- [ ] **Step 5: Gates and commit**

Run: `npm run check` (0 errors, the private-content guard ok) and `npm test`.

```bash
unix2dos -q src/pages/api/course/check.ts
git add src/lib/server/course/content.ts src/lib/server/course/progress.ts src/pages/api/course/check.ts src/lib/courseClient.ts
git commit -m "Serve and grade the module checks"
```

---

### Task 3: The module page, the `ModuleCheck` island, and the links to it

**Files:**
- Create: `src/pages/course/learn/modules/[id].astro`
- Create: `src/components/react/ModuleCheck.tsx`
- Modify: `src/components/react/CourseDashboard.tsx` (a "Module check" row per module with checks)
- Modify: `src/components/react/LessonNav.tsx` (the same row in the drawer)
- Modify: `src/components/react/LessonView.tsx` (a link to the module check on the completion panel)
- Modify: `src/pages/og/[...route].ts` (entries for the eight module pages)

**Interfaces:**
- Consumes: Task 2's client calls and payload types; `PublicCurriculum`; `CourseStateView.modules[id].checks_complete`; `track` from `analytics.ts`.
- Produces: the route `/course/learn/modules/m01` to `m08`.

- [ ] **Step 1: The shell**

```astro
---
// src/pages/course/learn/modules/[id].astro
import BaseLayout from '../../../../layouts/BaseLayout.astro';
import ModuleCheck from '../../../../components/react/ModuleCheck.tsx';
import { getCourseCatalog } from '../../../../lib/course/catalog';
import { publicCurriculum } from '../../../../lib/course/curriculum';

/**
 * One module's page: its lessons, its worksheet, and the module check. The
 * shell carries public metadata only; the questions come from /api/course/check
 * inside the island. Module 9 has no checks and no page.
 */
export async function getStaticPaths() {
  const catalog = await getCourseCatalog();
  const curriculum = publicCurriculum(catalog);
  return catalog.modules
    .filter((m) => m.checks.length > 0)
    .map((m) => ({
      params: { id: m.id },
      props: { module: curriculum.modules.find((c) => c.id === m.id)!, worksheetId: m.worksheet },
    }));
}

const { module, worksheetId } = Astro.props;
---

<BaseLayout title={`Module ${module.order}: ${module.title}`} description={module.summary} noindex>
  <div class="container-page py-10">
    <p class="eyebrow">Module {module.order}</p>
    <h1 class="mt-3 text-3xl font-extrabold tracking-tight text-ink-800 sm:text-4xl">{module.title}</h1>
    <p class="mt-4 max-w-prose text-lg leading-relaxed text-slate-600">{module.summary}</p>
    <section class="mt-8 max-w-2xl">
      <h2 class="font-heading text-lg font-bold text-ink-800">Lessons</h2>
      <ul class="mt-3 space-y-1.5 text-sm">
        {module.lessons.map((l) => (
          <li class="flex items-baseline justify-between gap-3">
            {l.status === 'published' ? (
              <a href={`/course/learn/lessons/${l.id}`} class="font-medium text-brand-700 hover:underline">{l.title}</a>
            ) : (
              <span class="text-slate-500">{l.title}</span>
            )}
            {l.status !== 'published' && <span class="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">Coming soon</span>}
          </li>
        ))}
      </ul>
      <p class="mt-4 text-sm">
        <a href={`/course/learn/worksheets/${worksheetId}`} class="font-semibold text-brand-700 hover:underline">Module {module.order} worksheet</a>
      </p>
    </section>
    <section class="mt-10 max-w-2xl">
      <h2 class="font-heading text-lg font-bold text-ink-800">Module check</h2>
      <p class="mt-2 text-slate-600">Two quick questions. The module counts as complete once every lesson is done and both are answered correctly. You can try again.</p>
      <div class="mt-5">
        <ModuleCheck client:load moduleId={module.id} />
      </div>
    </section>
  </div>
</BaseLayout>
```

- [ ] **Step 2: The island**

```tsx
// src/components/react/ModuleCheck.tsx
import { useEffect, useState } from 'react';
import { useSession } from '../../lib/useSession';
import { accountLink } from '../../lib/accountLink';
import { track } from '../../lib/analytics';
import {
  answerCheck,
  CourseActionError,
  courseErrorMessage,
  fetchModuleChecks,
  type CheckAnswerResponse,
  type ModuleChecksPayload,
} from '../../lib/courseClient';

/**
 * The module check. Each question is two choices and a button; the verdict
 * and the author's explanation come back from the server, which is the only
 * place the key lives. Answering again after a wrong pick is allowed.
 */
export default function ModuleCheck({ moduleId }: { moduleId: string }) {
  const { session, user, loading } = useSession();
  const [data, setData] = useState<ModuleChecksPayload | null>(null);
  const [error, setError] = useState<CourseActionError | null>(null);
  const [picks, setPicks] = useState<Record<string, 1 | 2>>({});
  const [verdicts, setVerdicts] = useState<Record<string, CheckAnswerResponse>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !session) return;
    fetchModuleChecks(session.access_token, moduleId)
      .then(setData)
      .catch((err) => setError(err instanceof CourseActionError ? err : new CourseActionError('request_failed', 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.id, moduleId]);

  if (loading) return <p className="text-slate-500">Loading the check…</p>;
  if (!session || user?.is_anonymous) {
    return (
      <p className="text-slate-700">
        Sign in to take this check.{' '}
        <a href={accountLink({ next: window.location.pathname })} className="font-semibold text-brand-700 underline">
          Sign in
        </a>
      </p>
    );
  }
  if (error) {
    const message =
      error.code === 'enrollment_required'
        ? 'This check is for enrolled learners.'
        : error.code === 'not_found'
          ? 'This module has no check.'
          : courseErrorMessage(error.code);
    return (
      <p className="text-slate-700">
        {message}{' '}
        <a href="/course/learn/" className="font-semibold text-brand-700 underline">
          Go to your course
        </a>
      </p>
    );
  }
  if (!data) return <p className="text-slate-500">Loading the check…</p>;

  const submit = async (checkId: string) => {
    const choice = picks[checkId];
    if (!choice || !session) return;
    setBusy(checkId);
    try {
      const res = await answerCheck(session.access_token, { module_id: moduleId, check_id: checkId, choice });
      setVerdicts((v) => ({ ...v, [checkId]: res }));
      setData((d) =>
        d && {
          ...d,
          checks: d.checks.map((c) =>
            c.id === checkId ? { ...c, attempts: c.attempts + 1, answered_correctly: c.answered_correctly || res.correct, last_choice: choice } : c
          ),
          module_complete: res.module_complete,
        }
      );
      if (res.module_complete && !data.module_complete) track({ event: 'module_completed', module_id: moduleId });
    } catch (err) {
      setError(err instanceof CourseActionError ? err : new CourseActionError('request_failed', 0));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {data.checks.map((c, i) => {
        const verdict = verdicts[c.id];
        const done = c.answered_correctly;
        return (
          <fieldset key={c.id} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-card">
            <legend className="sr-only">Question {i + 1}</legend>
            <p className="eyebrow">Question {i + 1}{done ? '. Done' : ''}</p>
            <p className="mt-2 font-semibold text-ink-800">{c.question}</p>
            <div className="mt-4 space-y-2">
              {c.choices.map((label, j) => {
                const value = (j + 1) as 1 | 2;
                return (
                  <label key={value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm hover:border-brand-300">
                    <input
                      type="radio"
                      name={c.id}
                      value={value}
                      checked={picks[c.id] === value}
                      onChange={() => setPicks((p) => ({ ...p, [c.id]: value }))}
                      className="mt-1"
                    />
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => void submit(c.id)}
              disabled={!picks[c.id] || busy === c.id}
              className="btn-primary mt-4 disabled:opacity-60"
            >
              {busy === c.id ? 'Checking…' : verdict && !verdict.correct ? 'Try again' : 'Check my answer'}
            </button>
            {verdict && (
              <div
                role="status"
                className={`mt-4 rounded-xl px-4 py-3 text-sm ${verdict.correct ? 'border border-emerald-100 bg-emerald-50 text-emerald-900' : 'border border-amber-100 bg-amber-50 text-amber-900'}`}
              >
                <p className="font-semibold">{verdict.correct ? 'Correct.' : 'Not yet.'}</p>
                <p className="mt-1">{verdict.explanation}</p>
              </div>
            )}
          </fieldset>
        );
      })}
      {data.module_complete ? (
        <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-6 py-4 text-emerald-900">
          Module {data.module.order} is complete.{' '}
          <a href="/course/learn/" className="font-semibold underline">
            Back to your course
          </a>
        </p>
      ) : (
        !data.lessons_complete && (
          <p className="text-sm text-slate-500">You can answer now. The module counts as complete once every lesson is done as well.</p>
        )
      )}
    </div>
  );
}
```

- [ ] **Step 3: The links**

The curriculum does not say which modules have checks (it cannot carry them), so both islands use the rule the catalog enforces: every module except the one holding the orientation lesson. Add to `src/lib/course/curriculum.ts`:

```ts
/** Modules 1 to 8 carry a check; the module holding the orientation lesson does not. */
export const moduleHasCheck = (module: { lessons: { id: string }[] }, orientationLessonId: string): boolean =>
  !module.lessons.some((l) => l.id === orientationLessonId);
```

In `CourseDashboard.tsx`, import it with `COURSE` from `../../data/course`, and inside each module card's `<ul>` after the lesson rows add:

```tsx
{moduleHasCheck(m, COURSE.orientationLessonId) && (
  <li className="flex items-baseline justify-between gap-3 border-t border-slate-100 pt-1.5">
    <a href={`/course/learn/modules/${m.id}`} className="font-medium text-brand-700 hover:underline">
      Module check
    </a>
    <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">
      {courseState?.modules[m.id]?.checks_complete ? 'Done' : ''}
    </span>
  </li>
)}
```

In `LessonNav.tsx`, the same row with the same helper after the lesson rows, with `state?.modules[m.id]?.checks_complete` for the mark.

In `LessonView.tsx`, on the completion panel (the block rendered when `done || completedNow`, near line 451, beside the neighbour links), add for lessons with `payload.lesson.module_order <= 8`:

```tsx
<a href={`/course/learn/modules/${lesson.module_id}`} className="btn-secondary">
  Module {lesson.module_order} check
</a>
```

In `src/pages/og/[...route].ts`, beside `courseWorksheetPages`:

```ts
const courseModulePages = Object.fromEntries(
  courseCatalog.modules
    .filter((m) => m.checks.length > 0)
    .map((m) => [`course/learn/modules/${m.id}`, { title: `Module ${m.order}: ${m.title}`, description: m.summary }])
);
```

and spread it into the pages map next to the other two.

- [ ] **Step 4: Verify**

`npm run check`, then `npm run build` (hidden mode). Confirm:

```bash
ls dist/course/learn/modules/            # m01 to m08, no m09
grep -c "needs checking" dist/course/learn/modules/m02/index.html   # 0: the question text is not in the shell
ls dist/og/course/learn/modules/m02.png  # the card exists
```

Then in the browser against the dev server, signed in as `course-learner@example.com`: `/course/learn/modules/m02` lists V04 as a link and the others as Coming soon, the two questions load, a wrong pick shows "Not yet" and the explanation with a Try again button, a right pick shows "Correct." and marks the question Done, and the dashboard's Module 2 card shows "Module check · Done" once both are right. Complete V04 as well and the card's module completes (the state's `modules.m02.complete` is true in `/api/course/state`). The drawer on the lesson page shows the Module check row. `/course/learn/modules/m09` is a 404.

- [ ] **Step 5: Commit**

```bash
unix2dos -q "src/pages/course/learn/modules/[id].astro" src/components/react/ModuleCheck.tsx
git add "src/pages/course/learn/modules/[id].astro" src/components/react/ModuleCheck.tsx src/components/react/CourseDashboard.tsx src/components/react/LessonNav.tsx src/components/react/LessonView.tsx src/lib/course/curriculum.ts "src/pages/og/[...route].ts"
git commit -m "Add the module page with its check, and link to it from the dashboard, the drawer and the lesson"
```

---

### Task 4: The admin preview inside the lesson island

**Files:**
- Modify: `src/components/react/LessonView.tsx`

**Interfaces:**
- Consumes: `fetchLesson(token, id, preview)`, the lesson API's `?preview=1` path and `neighbour(l, adminPreview)` (both from 1c), `LessonPayload.lesson.status`.
- Produces: `/course/learn/lessons/<staged id>?preview=1` opens for an admin, read-only.

- [ ] **Step 1: Read the flag and pass it through**

The shell is prerendered and the island renders once on the server, so the flag is never read during render (a render that differs between server and client is a hydration mismatch). Read it inside the effect that fetches the lesson, and keep it in state for the markup:

```tsx
const [preview, setPreview] = useState(false);
// inside the existing effect, before the fetch:
const wantsPreview = new URLSearchParams(window.location.search).get('preview') === '1';
setPreview(wantsPreview);
fetchLesson(token, lessonId, wantsPreview) ...
``` When `preview` is true and the payload's `lesson.status !== 'published'`, render a banner above the video, and render the practice section in read-only form: no Studied, Practiced, Reveal, Acknowledge or Complete buttons, a `readOnly` textarea with no autosave, and the model response section replaced by the sentence "The model response is shown to learners after they practise." (an admin can read it in the content file). Neighbour links keep `?preview=1` when `preview` is true.

Banner:

```tsx
{preview && payload.lesson.status !== 'published' && (
  <p className="mb-6 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
    Admin preview of a {payload.lesson.status} lesson. Nothing you do here is recorded.
  </p>
)}
```

A non-admin with `?preview=1` gets the API's 403 `forbidden`; map it in the island to "This lesson is not published yet." with the link back to the course.

- [ ] **Step 2: Verify with a staged lesson**

Temporarily edit `src/content/course/lessons/v04.md` to `status: staged` (it meets every gate). Restart the dev server. As `course-learner@example.com`: `/course/learn/lessons/v04` says the lesson is not available (the API's 404), and `?preview=1` says it is not published yet (403). As `course-admin@example.com` with `?preview=1`: the banner names "staged", the video and the sections render, no action buttons exist, and the drawer shows V04 as Coming soon. Then `git checkout -- src/content/course/lessons/v04.md`.

- [ ] **Step 3: Gates and commit**

`npm run check`, `npm test`.

```bash
git add src/components/react/LessonView.tsx
git commit -m "Let an admin read a staged lesson in place"
```

---

### Task 5: The content ladder in `/admin`

**Files:**
- Modify: `src/lib/course/validate.ts` (extract `gatesMissing`)
- Create: `src/lib/course/ladder.ts`
- Test: `src/lib/course/__tests__/ladder.test.ts` (and `validate.test.ts` keeps passing)
- Modify: `src/pages/api/admin/course.ts` (`?view=content`)
- Modify: `src/components/react/AdminView.tsx` (a Content tab)

**Interfaces:**
- Consumes: `LESSON_STATUSES`, `Catalog`, `parseLessonSections`, `adminJson`, `requireAdmin`, `getCourseCatalog`, `COURSE_STATUS`.
- Produces: `gatesMissing(lesson, target, ctx)`, `nextStatus(status)`, `ladderReport(catalog, courseStatus)`, `GET /api/admin/course?view=content` → `{ rows: LadderRow[] }`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/course/__tests__/ladder.test.ts
import { describe, expect, it } from 'vitest';
import { gatesMissing, ladderReport, nextStatus } from '../ladder';
import { validateCatalog } from '../validate';
import { buildInput, withLesson } from './fixtures';

describe('nextStatus', () => {
  it('walks the ladder and stops at published', () => {
    expect(nextStatus('draft')).toBe('approved');
    expect(nextStatus('staged')).toBe('published');
    expect(nextStatus('published')).toBeNull();
  });
});

describe('gatesMissing', () => {
  const full = {
    outcome: 'o', keyPoints: 'k', exercise: 'e', modelResponse: 'm', selfReview: 's', transcript: 't',
  };
  const base = {
    kind: 'standard' as const, streamUid: null, durationMin: 0, videoPlaceholder: false, preview: false, approvals: {},
  };
  it('names what a draft needs to be approved', () => {
    expect(gatesMissing({ ...base, sections: { ...full, exercise: '' } }, 'approved', { courseStatus: 'hidden' })).toEqual([
      'Exercise is empty',
      'approvals.copy is required',
    ]);
  });
  it('is cumulative, so published asks for everything below it', () => {
    const missing = gatesMissing({ ...base, sections: full, approvals: { copy: '2026-09-01 DB' } }, 'published', { courseStatus: 'hidden' });
    expect(missing).toEqual(['streamUid is required', 'durationMin must be at least 1', 'approvals.edit is required', 'approvals.captions is required']);
  });
  it('lets a placeholder-video lesson skip the video gates while the course is not open', () => {
    const missing = gatesMissing(
      { ...base, videoPlaceholder: true, durationMin: 5, sections: full, approvals: { copy: '2026-09-01 DB' } },
      'published',
      { courseStatus: 'preview' }
    );
    expect(missing).toEqual([]);
  });
  it('refuses a placeholder at staged or above once the course is open', () => {
    const missing = gatesMissing(
      { ...base, videoPlaceholder: true, durationMin: 5, sections: full, approvals: { copy: '2026-09-01 DB' } },
      'staged',
      { courseStatus: 'open' }
    );
    expect(missing).toContain('a placeholder video cannot ship while the course is open for sale');
  });
});

describe('ladderReport', () => {
  it('lists every lesson in chain order with its next rung and what that rung still needs', () => {
    const catalog = validateCatalog(withLesson(buildInput(), 'v10', { status: 'draft', approvals: {} }));
    const rows = ladderReport(catalog, 'hidden');
    expect(rows).toHaveLength(40);
    expect(rows.map((r) => r.seq)).toEqual(rows.map((_, i) => i + 1));
    const published = rows.filter((r) => r.status === 'published');
    expect(published.every((r) => r.next === null && r.missing.length === 0)).toBe(true);
    const draft = rows.find((r) => r.id === 'v10');
    expect(draft?.next).toBe('approved');
    expect(draft?.missing).toContain('approvals.copy is required');
  });
});
```

`buildInput()` and `withLesson(input, id, overrides)` are the fixture helpers `validate.test.ts` already uses; do not add a second fixture builder.

- [ ] **Step 2: Extract the gates and write the ladder**

In `validate.ts`, move the per-lesson `need(...)` checks for approved, edited, captioned, the `open` placeholder refusal and the preview-lesson checks into an exported function that returns messages instead of calling `err`:

```ts
export interface GateLesson {
  kind: LessonKind;
  streamUid: string | null;
  durationMin: number;
  videoPlaceholder: boolean;
  preview: boolean;
  approvals: LessonApprovals;
  sections: LessonSections;
}

/**
 * The status ladder's gates. What `target` requires that `lesson` does not
 * yet have, in the order a reader would fix them, cumulative from the bottom
 * of the ladder. Used by the validator against a lesson's own status and by
 * the ladder report against the next status up.
 */
export function gatesMissing(lesson: GateLesson, target: LessonStatus, ctx: { courseStatus: CourseStatus }): string[] {
  const missing: string[] = [];
  const need = (condition: boolean, message: string) => {
    if (!condition) missing.push(message);
  };
  const r = rank(target);
  const s = lesson.sections;
  if (r >= rank('approved')) {
    need(s.outcome.length > 0, 'Outcome is empty');
    need(s.keyPoints.length > 0, 'Key points is empty');
    if (lesson.kind !== 'orientation') need(s.exercise.length > 0, 'Exercise is empty');
    if (lesson.kind === 'standard') {
      need(s.modelResponse.length > 0, 'Model response is empty');
      need(s.selfReview.length > 0, 'Self-review is empty');
    }
    need(Boolean(lesson.approvals.copy), 'approvals.copy is required');
  }
  if (r >= rank('edited')) {
    if (!lesson.videoPlaceholder) need(lesson.streamUid !== null, 'streamUid is required');
    need(lesson.durationMin >= 1, 'durationMin must be at least 1');
    if (!lesson.videoPlaceholder) need(Boolean(lesson.approvals.edit), 'approvals.edit is required');
  }
  if (r >= rank('captioned') && !lesson.videoPlaceholder) {
    need(s.transcript.length > 0, 'Transcript is empty');
    need(Boolean(lesson.approvals.captions), 'approvals.captions is required');
  }
  if (lesson.videoPlaceholder && ctx.courseStatus === 'open' && r >= rank('staged')) {
    missing.push('a placeholder video cannot ship while the course is open for sale');
  }
  if (lesson.preview && ctx.courseStatus === 'open') {
    need(r >= rank('published'), 'the preview lesson must be published once the course is open');
    need(!lesson.videoPlaceholder, 'the preview lesson cannot use a placeholder video once the course is open');
  }
  return missing;
}
```

The validator's loop becomes:

```ts
for (const message of gatesMissing({ ...l, sections: s }, l.status, { courseStatus: input.courseStatus })) {
  err(`${where} (${l.status}): ${message}`);
}
```

Keep the existing messages byte for byte so `validate.test.ts` still passes; the one wording change is that the preview-lesson check now reads `r >= rank('published')` rather than `l.status === 'published'`, which is the same test for a lesson's own status. `ladder.ts` re-exports `gatesMissing` from `validate.ts` and adds:

```ts
// src/lib/course/ladder.ts
import { LESSON_STATUSES, type LessonStatus } from './types';
import type { CourseStatus } from './status';
import { gatesMissing, type Catalog } from './validate';

export { gatesMissing };

/** The rung above `status`, or null at the top. */
export const nextStatus = (status: LessonStatus): LessonStatus | null =>
  LESSON_STATUSES[LESSON_STATUSES.indexOf(status) + 1] ?? null;

export interface LadderRow {
  id: string;
  seq: number;
  module: string;
  title: string;
  status: LessonStatus;
  next: LessonStatus | null;
  /** What `next` still needs. Empty when the lesson could move up today, or is published. */
  missing: string[];
  videoPlaceholder: boolean;
}

/** One row per lesson in chain order. The catalog is valid by construction, so `missing` is about the next rung only. */
export function ladderReport(catalog: Catalog, courseStatus: CourseStatus): LadderRow[] {
  return catalog.lessons.map((l) => {
    const next = nextStatus(l.status);
    return {
      id: l.id,
      seq: l.seq,
      module: l.module,
      title: l.title,
      status: l.status,
      next,
      missing: next ? gatesMissing(l, next, { courseStatus }) : [],
      videoPlaceholder: l.videoPlaceholder,
    };
  });
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run src/lib/course/__tests__/ladder.test.ts src/lib/course/__tests__/validate.test.ts`
Expected: PASS for both files.

- [ ] **Step 4: The admin view**

In `src/pages/api/admin/course.ts` `GET`, before the `grading` branch:

```ts
if (view === 'content') {
  try {
    const catalog = await getCourseCatalog();
    return adminJson({ rows: ladderReport(catalog, COURSE_STATUS), summary: catalog.summary });
  } catch (err) {
    console.error('admin content ladder failed', err);
    return adminJson({ error: 'server_error' }, 500);
  }
}
```

In `AdminView.tsx`: add `'content'` to `Tab`, a `content` state `{ rows: LadderRow[]; summary: string } | null` (define `LadderRow` locally with the same fields; the admin view does not import from `src/lib/course`), `loadTab` calls `call('course?view=content')`, the tab button reads `Content`, and a `ContentTab` renders the summary line and a table with columns Lesson (`seq`, `id`, `title`), Module, Status, Next, Still needs (the `missing` list joined with "; ", or "ready to move up" when empty and `next` is not null, or blank when published). A lesson on the stand-in clip shows "stand-in clip" under Status. Read-only.

- [ ] **Step 5: Verify**

`npm run check`, `npm test`. In the browser as `course-admin@example.com`, `/admin` → Content shows 40 rows, V04 published with nothing needed, V05 draft with "Outcome is empty; Key points is empty; Exercise is empty; Model response is empty; Self-review is empty; approvals.copy is required". As `course-learner@example.com`, `/api/admin/course?view=content` is 403.

- [ ] **Step 6: Commit**

```bash
unix2dos -q src/lib/course/ladder.ts src/lib/course/__tests__/ladder.test.ts
git add src/lib/course/validate.ts src/lib/course/ladder.ts src/lib/course/__tests__/ladder.test.ts src/pages/api/admin/course.ts src/components/react/AdminView.tsx
git commit -m "Show every lesson's next rung and what it still needs in the admin area"
```

---

### Task 6: The free preview lesson page

**Files:**
- Modify: `src/data/course.ts` (`streamCustomerCode`)
- Modify: `src/lib/server/course/stream.ts` (fall back to the constant)
- Create: `src/lib/course/previewPage.ts`
- Test: `src/lib/course/__tests__/previewPage.test.ts`
- Create: `src/pages/course/preview.astro`
- Create: `src/components/react/PreviewLesson.tsx`
- Modify: `src/lib/analytics.ts` (`course_preview_started`)
- Modify: `src/pages/course/index.astro` (the "Watch a free lesson" link when the page exists)
- Modify: `src/pages/og/[...route].ts` (`course/preview`, gated)

**Interfaces:**
- Consumes: `COURSE`, `COURSE_STATUS`, `getCourseCatalog`, `LessonSections` (the React renderer, used without a client directive so it renders to static HTML), `embedUrl` and `posterUrl` from `streamUrls.ts`, `track`.
- Produces: `previewPageAvailable(status, lesson)`, `previewPlayback(lesson, customerCode)`, the route `/course/preview/`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/course/__tests__/previewPage.test.ts
import { describe, expect, it } from 'vitest';
import { previewPageAvailable, previewPlayback } from '../previewPage';

const lesson = { status: 'published' as const, streamUid: 'a'.repeat(32), videoPlaceholder: false };

describe('previewPageAvailable', () => {
  it('needs a public course and a published preview lesson', () => {
    expect(previewPageAvailable('preview', lesson)).toBe(true);
    expect(previewPageAvailable('open', lesson)).toBe(true);
    expect(previewPageAvailable('hidden', lesson)).toBe(false);
    expect(previewPageAvailable('preview', { ...lesson, status: 'staged' })).toBe(false);
  });
});

describe('previewPlayback', () => {
  it('embeds the lesson video unsigned, with the uid in the token position', () => {
    const p = previewPlayback(lesson, 'code123');
    expect(p?.embedUrl).toBe(`https://customer-code123.cloudflarestream.com/${'a'.repeat(32)}/iframe?preload=metadata&defaultTextTrack=en&primaryColor=%235271FF`);
    expect(p?.posterUrl).toContain(`/${'a'.repeat(32)}/thumbnails/thumbnail.jpg`);
  });
  it('has no player while the lesson is on the stand-in clip or has no video', () => {
    expect(previewPlayback({ ...lesson, videoPlaceholder: true, streamUid: null }, 'code123')).toBeNull();
    expect(previewPlayback({ ...lesson, streamUid: null }, 'code123')).toBeNull();
  });
});
```

Adjust the expected embed URL to whatever `embedUrl` in `streamUrls.ts` produces today (read it); the test asserts the helper is reused, not a second URL format.

- [ ] **Step 2: Write the module and the data constant**

```ts
// src/lib/course/previewPage.ts
import type { CourseStatus } from './status';
import type { LessonStatus } from './types';
import { embedUrl, posterUrl } from './streamUrls';

interface PreviewLesson {
  status: LessonStatus;
  streamUid: string | null;
  videoPlaceholder: boolean;
}

/** The free page exists only when the course is public and the free lesson is published. */
export const previewPageAvailable = (status: CourseStatus, lesson: PreviewLesson): boolean =>
  status !== 'hidden' && lesson.status === 'published';

/**
 * The free lesson plays unsigned: the video's own uid takes the token's place
 * in the same URLs the signed player uses. The stand-in clip is signed, so a
 * preview lesson still on it has no player and the page says so.
 */
export const previewPlayback = (lesson: PreviewLesson, customerCode: string): { embedUrl: string; posterUrl: string } | null =>
  lesson.streamUid && !lesson.videoPlaceholder
    ? { embedUrl: embedUrl(customerCode, lesson.streamUid), posterUrl: posterUrl(customerCode, lesson.streamUid) }
    : null;
```

In `src/data/course.ts`, after `placeholderStreamUid`:

```ts
  /**
   * The `<code>` in customer-<code>.cloudflarestream.com. Public (it is in
   * every embed URL); the free preview page needs it at build time, and the
   * server prefers CLOUDFLARE_STREAM_CUSTOMER_CODE when that is set.
   */
  streamCustomerCode: 'vpmefi3w70uzhyft',
```

In `stream.ts`: `customerCode: serverEnv('CLOUDFLARE_STREAM_CUSTOMER_CODE') || COURSE.streamCustomerCode` (import `COURSE`).

- [ ] **Step 3: The page and the island**

Add to the analytics union: `| { event: 'course_preview_started'; lesson_id: string }`.

```tsx
// src/components/react/PreviewLesson.tsx
import { useEffect, useState } from 'react';
import { track } from '../../lib/analytics';
import LessonSections from './LessonSections';

/**
 * The free lesson's exercise: the model response is revealed on request, so
 * a visitor practises before reading it, the way an enrolled learner does.
 * Fires course_preview_started once on mount.
 */
export default function PreviewLesson({ lessonId, modelResponse }: { lessonId: string; modelResponse: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    track({ event: 'course_preview_started', lesson_id: lessonId });
  }, [lessonId]);
  if (modelResponse.trim() === '') return null;
  return (
    <div className="mt-6">
      {shown ? (
        <LessonSections sections={[{ id: 'model-response', title: 'A model response', markdown: modelResponse }]} />
      ) : (
        <button type="button" onClick={() => setShown(true)} className="btn-secondary">
          Show a model response
        </button>
      )}
    </div>
  );
}
```

```astro
---
// src/pages/course/preview.astro
import BaseLayout from '../../layouts/BaseLayout.astro';
import PageHero from '../../components/PageHero.astro';
import LessonSections from '../../components/react/LessonSections.tsx';
import PreviewLesson from '../../components/react/PreviewLesson.tsx';
import { breadcrumbs } from '../../lib/schema';
import { COURSE, COURSE_STATUS } from '../../data/course';
import { getCourseCatalog } from '../../lib/course/catalog';
import { previewPageAvailable, previewPlayback } from '../../lib/course/previewPage';

/**
 * The one free lesson, rendered at build time. This is the only page where
 * lesson prose is in HTML, and it is the lesson David chose for exactly that.
 * It is a 404 that writes nothing while the course is hidden or the lesson
 * is not yet published.
 */
const catalog = await getCourseCatalog();
const lesson = catalog.byId[COURSE.previewLessonId];
if (!previewPageAvailable(COURSE_STATUS, lesson)) return new Response(null, { status: 404 });
const module = catalog.modules[lesson.moduleOrder - 1];
const playback = previewPlayback(lesson, COURSE.streamCustomerCode);
const s = lesson.sections;
const title = `Free lesson: ${lesson.title}`;
---

<BaseLayout title={title} description={s.outcome} jsonLd={[breadcrumbs([{ name: 'Video course', url: '/course' }, { name: 'Free lesson', url: '/course/preview' }])]}>
  <PageHero eyebrow={`From module ${module.order}, ${module.title}`} title={lesson.title} intro={s.outcome} />
  <div class="container-page py-10">
    <div class="max-w-3xl">
      {playback ? (
        <div class="aspect-video overflow-hidden rounded-2xl bg-ink-900">
          <iframe src={playback.embedUrl} title={lesson.title} allow="accelerometer; gyroscope; encrypted-media; picture-in-picture" allowfullscreen class="h-full w-full"></iframe>
        </div>
      ) : (
        <p class="rounded-2xl border border-slate-100 bg-white px-6 py-5 text-slate-600 shadow-card">This lesson's video is being filmed. The lesson itself is ready to read and practise now.</p>
      )}
      <div class="prose-page mt-10">
        <LessonSections sections={[{ id: 'key-points', title: 'Key points', markdown: s.keyPoints }, { id: 'exercise', title: 'Exercise', markdown: s.exercise }]} />
        <PreviewLesson client:load lessonId={lesson.id} modelResponse={s.modelResponse} />
        <LessonSections sections={[{ id: 'self-review', title: 'Self-review', markdown: s.selfReview }]} />
        {s.transcript.trim() !== '' && (
          <details class="mt-8"><summary class="cursor-pointer font-semibold text-ink-800">Transcript</summary>
            <LessonSections sections={[{ id: 'transcript', title: '', markdown: s.transcript }]} />
          </details>
        )}
      </div>
      <div class="mt-12 rounded-2xl border border-brand-100 bg-brand-50 p-8">
        <h2 class="font-heading text-xl font-bold text-ink-800">This is one lesson of the full course.</h2>
        <a href="/course" class="btn-primary mt-4" data-track-cta="course_preview">About the full course</a>
      </div>
    </div>
  </div>
</BaseLayout>
```

Use the layout's real prop names for the JSON-LD and the hero (read `BaseLayout.astro` and `PageHero.astro`; the sales page shows both in use). `iframe` attributes match `StreamPlayer.tsx` minus anything autoplay-related.

On the sales page, when `previewPageAvailable(COURSE_STATUS, catalog.byId[COURSE.previewLessonId])`, render a link near the hero's call to action: `<a href="/course/preview" class="btn-secondary" data-track-cta="course_hero">Watch a free lesson</a>` (`course_hero` is an existing location). In `og/[...route].ts`, add `'course/preview': { title: 'A free lesson from the Complete Solution Seeking course', description: ... }` inside the same status-gated block as `course`, and additionally only when the page is available (import `previewPageAvailable`).

- [ ] **Step 4: Verify with a temporarily published preview lesson**

Run `npm test` for the new tests first. Then, locally only, edit `src/content/course/lessons/v05.md`: `status: published`, `videoPlaceholder: true`, `durationMin: 5`, `approvals: { copy: "2026-09-11 DB" }`, and one short sentence in each of Outcome, Key points, Exercise, Model response and Self-review (the transcript may stay empty on a placeholder). Build in preview mode (`PUBLIC_COURSE_STATUS=preview npm run build`, with the placeholder `PUBLIC_SUPABASE_*` variables the other preview builds used). Confirm:

```bash
test -f dist/course/preview/index.html && echo page built
grep -c "being filmed" dist/course/preview/index.html          # 1: no player on the stand-in clip
grep -c "Watch a free lesson" dist/course/index.html            # 1
grep -c "/course/preview" dist/sitemap-0.xml                    # 1
ls dist/og/course/preview.png
```

Then set `videoPlaceholder: false` and `streamUid: 0123456789abcdef0123456789abcdef` and rebuild: the page carries `customer-vpmefi3w70uzhyft.cloudflarestream.com/0123456789abcdef0123456789abcdef/iframe`. Then a hidden build: no `dist/course/preview/`. Finally `git checkout -- src/content/course/lessons/v05.md` and rebuild hidden to leave `dist/` as production has it. The dist-leak scan passes throughout (it guards assessment content, not the free lesson).

- [ ] **Step 5: Commit**

```bash
unix2dos -q src/lib/course/previewPage.ts src/lib/course/__tests__/previewPage.test.ts src/pages/course/preview.astro src/components/react/PreviewLesson.tsx
git add src/data/course.ts src/lib/server/course/stream.ts src/lib/course/previewPage.ts src/lib/course/__tests__/previewPage.test.ts src/pages/course/preview.astro src/components/react/PreviewLesson.tsx src/lib/analytics.ts src/pages/course/index.astro "src/pages/og/[...route].ts"
git commit -m "Build the free lesson page once the preview lesson is published"
```

---

### Task 7: The resources page

**Files:**
- Create: `src/pages/course/learn/resources.astro`
- Modify: `src/components/react/CourseDashboard.tsx` (a link under the header)
- Modify: `src/pages/og/[...route].ts` (`course/learn/resources`)

**Interfaces:**
- Consumes: `getCourseCatalog` (worksheet titles and modules), `COURSE_STATUS`, `courseCopy('{{support_contact}}')`.
- Produces: `/course/learn/resources/`, `noindex`.

- [ ] **Step 1: The page**

A prerendered shell with public data only: an intro line; "Worksheets", one link per worksheet to `/course/learn/worksheets/<id>` labelled "Module N, <module title>"; "The guide", linking `/guide` and the PDF at `/solution-seeking-complete-guide.pdf`; "Practice tools", the three free tools under `/practice/`; "The certification", linking `/course/certification` only when `COURSE_STATUS !== 'hidden'`, otherwise a sentence that the final assessment opens from the dashboard once modules 1 to 8 and the orientation are complete; "Support", the support contact as a mailto. `BaseLayout` with `noindex`. No island: the worksheet pages gate themselves and nothing here is paid content.

- [ ] **Step 2: The links and the card**

In `CourseDashboard.tsx`, under the header's resume block, a small line: `<a href="/course/learn/resources/" className="text-sm font-semibold text-brand-700 hover:underline">Worksheets and resources</a>`. In `og/[...route].ts`, an always-present entry `'course/learn/resources': { title: 'Course resources', description: 'Worksheets, the guide and support for the Complete Solution Seeking course.' }`.

- [ ] **Step 3: Verify and commit**

`npm run check`, `npm run build` (hidden): `dist/course/learn/resources/index.html` exists with nine worksheet links, carries `noindex`, and is absent from `dist/sitemap-0.xml`; `dist/og/course/learn/resources.png` exists.

```bash
unix2dos -q src/pages/course/learn/resources.astro
git add src/pages/course/learn/resources.astro src/components/react/CourseDashboard.tsx "src/pages/og/[...route].ts"
git commit -m "Add the course resources page"
```

---

### Task 8: Docs, the import runbook, and the visual record (controller)

**Files:**
- Modify: `docs/content-guide.md` (the check endpoint exists; the module page; the ladder; the admin preview; the free page)
- Modify: `docs/course-production.md` (a "The import loop" section: paste sections → approved → package → edited and captioned → staged → David watches with captions on → published; the Content tab names the missing gate; publish module by module; production stays hidden so a published lesson reaches enrolled pilots only)
- Modify: `docs/architecture.md` (routes: `/course/preview`, `/course/learn/modules/:id`, `/course/learn/resources`, `/api/course/check`, `?view=content`)
- Modify: `docs/status.md` (a Phase 2 entry in the course block; the "Phases 2 to 4" paragraph updated)
- Modify: `docs/deployment.md` (one sentence under Cloudflare Stream: the customer code also lives in `src/data/course.ts` for the free page; the env var wins when set)
- Modify: `docs/change-checklist.md` if a new touchpoint appeared (the module pages need OG entries like the worksheets: say so)
- Modify: `docs/features/course/README.md` and add PNGs

This task is the controller's, after Tasks 1 to 7 are reviewed: run the dev server, sign in as the learner and as the admin, and capture at 1280 and 390:

- `course-dashboard-modules-1280.png`: the dashboard with Module 2 showing the check row Done.
- `module-check-explanation-390.png`: a wrong answer's "Not yet" panel with the explanation and the Try again button.
- `module-check-complete-1280.png`: the module page after both checks are right.
- `staged-lesson-admin-preview-1280.png`: V04 temporarily staged, opened by the admin with `?preview=1` and the banner (restore the file afterwards).
- `admin-content-ladder-1280.png`: the Content tab.
- `course-resources-390.png`: the resources page.
- `preview-v05-mobile.png` waits for V05 to be published for real; the README says so rather than showing a page with placeholder copy.

Write the captions in the README's existing voice (one row per shot, no two captions opening the same way), commit with `docs/status.md`, and run the whole gate set once more: `npm run check`, `npm test`, a hidden build and a preview build, both with the dist scan ok.

---

## Notes for the controller

- Dispatch Tasks 1 and 2 to one implementer if the model is fast enough to hold both; they share one interface and the second cannot be verified without the first's tests passing. Tasks 3, 4, 5, 6 and 7 each get a fresh implementer. Task 8 is the controller's.
- The dev server reloads fully when a server file changes, so no implementer edits server files during the controller's browser pass.
- The local `course_check_attempts` table is empty at the start; the curl steps in Task 2 write the first rows. `delete from public.course_check_attempts` resets them between runs.
- No hosted step is needed for this plan. When the branch merges, production picks up the check route and the module pages while staying hidden; the `course-beta` branch deploy is where David can try the checks with his own enrollment.
- The Stream customer code constant duplicates a Netlify value on purpose; the ruling above says why. If the code ever changes, both places change.

## Execution record (2026-09-11 to 2026-09-12)

Executed with subagent-driven development on branch `course-phase2` from `main` after PR #17: Tasks 1 to 7 in seven commits from `ef3f3a5` to `5467cd9` (Tasks 1 and 2 to one implementer, as the controller notes allowed), the controller's browser pass and docs (Task 8, `35491e0`), a whole-branch review and one fix wave (`9c20c21`). Task reviews were clean for Tasks 1, 2, 6 and 7; Task 3 took one fix round (a stale closure could track `module_completed` twice, and a failed answer replaced the whole island with the load-error dead end); Task 4 took one fix round (the seeding effect and the mount `open` action keyed on the URL flag rather than the fetched lesson's status, and the `reveal_model` refetch posted during a locked preview); Task 5's one finding was ruled rather than fixed. Amendments the reviews forced on this plan, now in the code:

- `check_complete`, `attempts` and `last_choice` left the check payload: the island derives Done from the verdict and the module flag, so the fields and the second history read they needed were trimmed rather than surfaced, and `loadCheckHistory` is bounded to two hundred rows.
- A check answered correctly is read-only afterwards. Retrying is for a wrong answer; an open button on a correct one was an unbounded write path into `course_check_attempts` that every state read would have paid for.
- The check answers have a machine guard, as the assessment forms do: `check-private-content.mjs` allows `getModuleForLearner` in two files only, and `check-dist-leak.mjs` scans the built output for every module check's explanation.
- The placeholder-while-open validator message now carries the status suffix every other gate message carries, since the loop that wraps them is uniform and nothing matched the old wording.
- The free lesson page is deliberately absent from `llms.txt` and has no `.md` variant: the spec keeps lesson prose out of the machine-readable surfaces, and the free lesson is still lesson prose.
- The 403 for a non-admin with `?preview=1` reads as a note about the preview link rather than a false claim about the lesson's status, and a locked preview does not link to the module check.
- The module shell's intro no longer types a question count; the ladder's preview-lesson gate keeps no rank floor, with a comment saying why.

Browser verification (Task 8) on the local stack as the enrolled admin account: a wrong answer with its explanation and the Try again button at 390px, both questions Done on the module page, the dashboard's Module check row marked Done and its resources link, the resources page at 390px, the Content tab listing V04 as published on the stand-in clip and V05 as a draft with its six gates, and V04 temporarily staged and opened with `?preview=1` (banner, read-only response box, no actions), then restored. Screenshots are in `docs/features/course/`. Gates on the final tree: `npm run check` clean, 230 tests, a preview build and a hidden build with the dist scan ok.

Carried forward:

1. `PublicCurriculum.modules[]` should carry `hasCheck`; today four places encode "module 9 has no check" and agree only because the validator pins two checks per study module.
2. `LessonView.tsx` grew again and carries about ten preview conditionals; hoisting the preview mode into a hook or splitting the read-only render path should precede any Phase 3 change to that file.
3. `CheckStanding` in the check route duplicates `CheckStandingView` in the client; a shared type would remove it.
4. `loadCheckHistory` is bounded by module, so a learner who drives more than two hundred attempts into one module through the API after a correct answer could see that check unmarked on the module page; module completion itself reads the unbounded correct-only query and stays right. A per-check bound or a separate correct-only read closes it.
5. Small copy and markup items left as they are: the Content tab's Lesson column runs the id into the title, `resources.astro` carries doubled spaces from the spacer pattern, the resources page's certification fallback says "orientation lesson", and `preview.astro` reads the catalog before its availability check (memoised, as the OG route does).
6. Module completion counts published lessons only, so publishing a module's last lesson last keeps the assessment from unlocking early; the import loop says so.
7. The free lesson page has no screenshot until V05 is published for real.

## Handoff

Phase 3 (the certification journey) consumes the assessment data path as 1d and 1e left it, plus nothing from this plan except the module pages' `module_completed` event, which makes `assessment_eligible` reachable once every study module is published and completed. The content itself arrives through the import loop this plan documents: David's lesson copy and module check explanations, Bradley's masters and captions, published module by module with the Content tab naming each lesson's next gate. Phase 3's first task should read the "Certificates, verification, reviews, emails, admin" section of the spec and the 1e plan's handoff paragraph.
