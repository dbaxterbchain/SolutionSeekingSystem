import type { APIRoute } from 'astro';
import type { User } from '@supabase/supabase-js';
import { COURSE } from '../../../data/course';
import { CRITERIA, PASS_TOTAL } from '../../../data/certification';
import { privateJson } from '../../../lib/server/auth';
import { isAdminUser } from '../../../lib/server/adminAuth';
import { clientIp, isRateLimited } from '../../../lib/server/rateLimit';
import { requireEnrolled } from '../../../lib/server/course/enrollment';
import { computeCourseState } from '../../../lib/server/course/state';
import { loadForms, sampleFormsAllowed } from '../../../lib/server/course/forms';
import { ensureSourcePack } from '../../../lib/server/course/sourcePack';
import { PROMPT_VERSION, RUBRIC_VERSION } from '../../../lib/server/course/rubric';
import { hashSubmission } from '../../../lib/server/course/submissionHash';
import { awardsEnabled, triggerGradingWorker } from '../../../lib/server/course/workerTrigger';
import * as attempts from '../../../lib/server/course/attempts';
import { loadOwnedCertificate } from '../../../lib/server/course/certificates';
import { getCourseCatalog } from '../../../lib/course/catalog';
import { certificateSummary } from '../../../lib/course/certificateRules';
import { courseCopy } from '../../../lib/course/copy';
import { isLearnerVisible } from '../../../lib/course/visibility';
import { RESPONSE_MAX_CHARS, privateSnapshot, publicSnapshot } from '../../../lib/course/assessmentForm';
import { chooseForm, promptStage, stageProblems, summarizeAttempts, viewForLearner } from '../../../lib/course/assessmentRules';
import { OPEN_ATTEMPT_STATES, type AssessmentHistory, type AssessmentStatus, type CriterionFeedback, type EligibilityReason, type ResultView } from '../../../lib/course/assessmentTypes';

export const prerender = false;

/**
 * The staged final assessment. One route, six actions, every response
 * no-store, every attempt read scoped to the caller so ids cannot be probed.
 * The view a learner gets is always built by viewForLearner: stages up to the
 * one they are on, nothing beyond it.
 */
const ACTIONS = ['start', 'save', 'advance', 'submit', 'status', 'list'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST_KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;
const NO_FORMS_MESSAGE = 'Every assessment form has been used on a previous attempt. Write to course support for the next step.';

const bad = (field: string) => privateJson({ error: 'bad_request', field }, 400);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const auth = await requireEnrolled(request);
  if ('error' in auth) return privateJson({ error: auth.error, reason: auth.reason }, auth.status);

  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const action = str(body.action);
  if (!(ACTIONS as readonly string[]).includes(action)) return bad('action');
  const ip = clientIp(request, clientAddress);
  const origin = new URL(request.url).origin;

  try {
    switch (action) {
      case 'start':
        return await start(auth.user, ip);
      case 'save':
        return await save(auth.user, body);
      case 'advance':
        return await advance(auth.user, body);
      case 'submit':
        return await submit(auth.user, body, ip, origin);
      case 'status':
        return await status(auth.user, body);
      case 'list':
        return await list(auth.user);
      default:
        return bad('action');
    }
  } catch (err) {
    console.error('course assessment failed', err);
    return privateJson({ error: 'assessment_unavailable' }, 503);
  }
};

async function eligibility(user: User, row: attempts.AttemptRow | null): Promise<{ eligible: boolean; reason: EligibilityReason }> {
  if (row && OPEN_ATTEMPT_STATES.includes(row.state)) return { eligible: false, reason: 'open_attempt' };
  const summary = await attempts.loadAssessmentSummary(user.id);
  if (summary.passedCurrent) return { eligible: false, reason: 'already_passed' };
  // Admins walk the assessment before every module is published (the same
  // exemption admin preview and admin-only checkout already make).
  if (isAdminUser(user)) return { eligible: true, reason: 'ready' };
  const state = await computeCourseState(user.id);
  return state.assessment_eligible ? { eligible: true, reason: 'ready' } : { eligible: false, reason: 'modules_incomplete' };
}

async function resultView(grade: attempts.GradeRow, row: attempts.AttemptRow): Promise<ResultView> {
  const catalog = await getCourseCatalog();
  const labels = new Map<string, string>();
  for (const stage of row.snapshot_public.stages) stage.prompts.forEach((p, i) => labels.set(p.prompt_id, `${stage.title}, question ${i + 1}`));
  const flagged = new Set(grade.misconceptions.map((m) => m.criterion_id));
  const criteria: CriterionFeedback[] = CRITERIA.map((c) => {
    const v = grade.criteria.find((x) => x.criterion_id === c.id);
    const score = v?.score ?? 0;
    return {
      criterion_id: c.id,
      name: c.name,
      weight: c.weight,
      score,
      effective_score: grade.decision.effective?.[c.id] ?? score,
      // A criterion the grade never mentioned reads the same as one with no
      // evidence: unanswered. Anything else would show a 0 as though it had been
      // looked at and found wanting.
      status: flagged.has(c.id) ? 'misconception' : !v || v.evidence_status === 'none' ? 'unanswered' : 'answered',
      reason: v?.reason ?? '',
      evidence: (v?.evidence ?? []).map((e) => ({ prompt_id: e.prompt_id, prompt_label: labels.get(e.prompt_id) ?? 'Your response', quote: e.exact_quote })),
      revision_lessons: (v?.revision_lesson_ids ?? []).map((id) => {
        const lesson = catalog.byId[id];
        return { id, title: lesson?.title ?? id, href: lesson && isLearnerVisible(lesson) ? `/course/learn/lessons/${id}/` : null };
      }),
    };
  });
  return {
    total: Number(grade.total),
    pass_total: PASS_TOTAL,
    passed: grade.passed,
    criteria,
    caps_applied: grade.caps_applied,
    misconceptions: grade.misconceptions.map((m) => ({ criterion_id: m.criterion_id, description: m.description })),
    graded_at: grade.created_at,
  };
}

async function statusFor(user: User, row: attempts.AttemptRow | null): Promise<AssessmentStatus> {
  const [responses, job, grade, elig, certificate] = await Promise.all([
    row ? attempts.loadResponses(row.id) : Promise.resolve([]),
    row ? attempts.loadLatestJob(row.id) : Promise.resolve(null),
    row?.grade_id ? attempts.loadGrade(row.grade_id) : Promise.resolve(null),
    eligibility(user, row),
    loadOwnedCertificate(user.id),
  ]);
  return {
    attempt: row ? viewForLearner(row, responses) : null,
    job: job ? { id: job.id, state: job.state, generation: job.generation, attempts: job.attempts, error_category: job.error_category, updated_at: job.updated_at } : null,
    result: row && grade ? await resultView(grade, row) : null,
    awards_enabled: awardsEnabled(),
    certificate: certificate ? certificateSummary(certificate) : null,
    eligibility: elig,
    support_contact: courseCopy('{{support_contact}}'),
  };
}

async function start(user: User, ip: string | null): Promise<Response> {
  // Handing back the attempt the learner already has creates nothing, so it is
  // answered before the limit is charged. Only a fresh attempt is charged.
  const open = await attempts.loadOpenAttempt(user.id);
  if (open) return privateJson(await statusFor(user, open));
  if (await isRateLimited('course_start', ip, 10, 3600)) return privateJson({ error: 'rate_limited' }, 429);
  const elig = await eligibility(user, null);
  if (!elig.eligible) return privateJson({ error: 'not_eligible', reason: elig.reason }, 403);

  const [forms, exposures] = await Promise.all([loadForms(), attempts.countExposures(user.id)]);
  const form = chooseForm(forms.filter((f) => f.certification_version === COURSE.certificationVersion), exposures, sampleFormsAllowed());
  if (!form) return privateJson({ error: 'no_forms_available', message: NO_FORMS_MESSAGE }, 409);

  const [pack, catalog] = await Promise.all([ensureSourcePack(), getCourseCatalog()]);
  const allowedLessons = form.lesson_ids.map((id) => ({ id, title: catalog.byId[id]?.title ?? id }));
  const attemptId = await attempts.createAttempt({
    userId: user.id,
    form,
    rubricVersion: RUBRIC_VERSION,
    promptVersion: PROMPT_VERSION,
    sourcePackId: pack.id,
    snapshotPublic: publicSnapshot(form),
    snapshotPrivate: privateSnapshot(form, { allowedLessons, sourcePackSha256: pack.sha256, rubricVersion: RUBRIC_VERSION, promptVersion: PROMPT_VERSION }),
  });
  return privateJson(await statusFor(user, await attempts.loadOwnedAttempt(attemptId, user.id)));
}

async function save(user: User, body: Record<string, unknown>): Promise<Response> {
  const attemptId = str(body.attempt_id);
  if (!UUID_RE.test(attemptId)) return bad('attempt_id');
  const promptId = str(body.prompt_id);
  if (!promptId) return bad('prompt_id');
  if (typeof body.text !== 'string' || body.text.length > RESPONSE_MAX_CHARS) return bad('text');
  const expected = body.expected_revision;
  if (!Number.isInteger(expected) || (expected as number) < 0) return bad('expected_revision');

  const row = await attempts.loadOwnedAttempt(attemptId, user.id);
  if (!row) return privateJson({ error: 'not_found' }, 404);
  if (row.state !== 'draft') return privateJson({ error: 'already_submitted', state: row.state }, 409);
  const stage = promptStage(row.snapshot_public, promptId);
  if (stage === null || stage > row.current_stage) return bad('prompt_id');

  const result = await attempts.saveResponse(attemptId, promptId, body.text, expected as number);
  if (result.saved) return privateJson({ prompt_id: promptId, revision: result.revision, saved_at: result.saved_at });
  if (result.locked) return privateJson({ error: 'stage_locked' }, 409);
  return privateJson({ error: 'revision_conflict', prompt_id: promptId, revision: result.revision, text: result.text }, 409);
}

async function advance(user: User, body: Record<string, unknown>): Promise<Response> {
  const attemptId = str(body.attempt_id);
  if (!UUID_RE.test(attemptId)) return bad('attempt_id');
  const stage = body.stage;
  if (!Number.isInteger(stage) || (stage as number) < 0) return bad('stage');
  if (!isRecord(body.expected_revisions)) return bad('expected_revisions');
  const expected = body.expected_revisions;

  const row = await attempts.loadOwnedAttempt(attemptId, user.id);
  if (!row) return privateJson({ error: 'not_found' }, 404);
  if (row.state !== 'draft') return privateJson({ error: 'already_submitted', state: row.state }, 409);
  if (stage !== row.current_stage || row.current_stage >= row.stage_count - 1) {
    return privateJson({ error: 'stage_mismatch', current_stage: row.current_stage }, 409);
  }

  const responses = await attempts.loadResponses(attemptId);
  const snapshotStage = row.snapshot_public.stages[stage as number];
  for (const p of snapshotStage.prompts) {
    const r = responses.find((x) => x.prompt_id === p.prompt_id);
    const revision = r?.revision ?? 0;
    if (!Number.isInteger(expected[p.prompt_id])) return bad('expected_revisions');
    if (expected[p.prompt_id] !== revision) {
      return privateJson({ error: 'revision_conflict', prompt_id: p.prompt_id, revision, text: r?.response_text ?? '' }, 409);
    }
  }
  const problems = stageProblems(snapshotStage, responses);
  if (problems.length) return privateJson({ error: 'incomplete', fields: problems }, 422);

  // Locking before advancing is safe to repeat: lockStage only stamps rows that
  // are still unlocked, and a retry re-runs the checks above against the same
  // stage, so a client that lost the first response and sent it again either
  // advances or gets stage_mismatch, never a half-locked stage.
  if (snapshotStage.lock_on_advance) await attempts.lockStage(attemptId, stage as number);
  const moved = await attempts.advanceAttempt(attemptId, stage as number);
  const after = await attempts.loadOwnedAttempt(attemptId, user.id);
  if (!moved) return privateJson({ error: 'stage_mismatch', current_stage: after?.current_stage ?? stage }, 409);
  return privateJson(await statusFor(user, after));
}

async function submit(user: User, body: Record<string, unknown>, ip: string | null, origin: string): Promise<Response> {
  const attemptId = str(body.attempt_id);
  if (!UUID_RE.test(attemptId)) return bad('attempt_id');
  const requestKey = str(body.request_key);
  if (!REQUEST_KEY_RE.test(requestKey)) return bad('request_key');

  const row = await attempts.loadOwnedAttempt(attemptId, user.id);
  if (!row) return privateJson({ error: 'not_found' }, 404);
  // A replay of a submit that already landed reads the attempt as it stands and
  // creates no work, so it is answered before the limit is charged. The path
  // below, which submits the attempt and queues a grading job, is charged.
  if (row.state !== 'draft') {
    if (row.submit_request_key === requestKey) return privateJson(await statusFor(user, row));
    return privateJson({ error: 'already_submitted', state: row.state }, 409);
  }
  if (await isRateLimited('course_submit', ip, 10, 3600)) return privateJson({ error: 'rate_limited' }, 429);
  if (row.current_stage !== row.stage_count - 1) return privateJson({ error: 'stage_mismatch', current_stage: row.current_stage }, 409);

  const responses = await attempts.loadResponses(attemptId);
  // Every unlocked prompt of every stage is checked, and only those: the learner
  // cannot act on a locked prompt, so a locked response must never block the
  // submit. It is graded as it stands, short or empty.
  const locked = new Set(responses.filter((r) => r.locked_at !== null).map((r) => r.prompt_id));
  const problems = row.snapshot_public.stages.flatMap((s) =>
    stageProblems({ ...s, prompts: s.prompts.filter((p) => !locked.has(p.prompt_id)) }, responses)
  );
  if (problems.length) return privateJson({ error: 'incomplete', fields: problems }, 422);

  const hash = hashSubmission(responses.map((r) => ({ prompt_id: r.prompt_id, text: r.response_text })));
  const result = await attempts.submitAttempt(attemptId, user.id, requestKey, hash);
  if (result.outcome === 'not_found') return privateJson({ error: 'not_found' }, 404);
  if (result.outcome === 'already_submitted') {
    const now = await attempts.loadOwnedAttempt(attemptId, user.id);
    return privateJson({ error: 'already_submitted', state: now?.state ?? 'submitted' }, 409);
  }
  if (result.outcome === 'created' && result.jobId) await triggerGradingWorker({ origin, jobId: result.jobId });
  return privateJson(await statusFor(user, await attempts.loadOwnedAttempt(attemptId, user.id)));
}

async function status(user: User, body: Record<string, unknown>): Promise<Response> {
  if (body.attempt_id !== undefined) {
    const attemptId = str(body.attempt_id);
    if (!UUID_RE.test(attemptId)) return bad('attempt_id');
    const row = await attempts.loadOwnedAttempt(attemptId, user.id);
    if (!row) return privateJson({ error: 'not_found' }, 404);
    return privateJson(await statusFor(user, row));
  }
  return privateJson(await statusFor(user, await attempts.loadLatestAttempt(user.id)));
}

async function list(user: User): Promise<Response> {
  const history: AssessmentHistory = { attempts: summarizeAttempts(await attempts.loadAttemptHistory(user.id)) };
  return privateJson(history);
}
