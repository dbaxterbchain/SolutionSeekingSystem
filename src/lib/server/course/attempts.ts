import { supabaseAdmin } from '../supabaseAdmin';
import { COURSE } from '../../../data/course';
import type { SnapshotPrivate, SnapshotPublic } from '../../course/assessmentForm';
import type { AttemptRecord, HistoryRow, ResponseRecord } from '../../course/assessmentRules';
import {
  OPEN_ATTEMPT_STATES,
  type AttemptState,
  type CapApplied,
  type Decision,
  type ErrorCategory,
  type JobState,
  type ValidatedCriterion,
  type ValidatedMisconception,
} from '../../course/assessmentTypes';

/** Never snapshot_private: that column is read by jobStore.ts and the admin route only. */
const ATTEMPT_COLUMNS =
  'id, state, form_id, form_version, certification_version, current_stage, stage_count, snapshot_public, submitted_at, submit_request_key, finalized_at, grade_id, created_at' as const;
const RESPONSE_COLUMNS = 'prompt_id, stage, response_text, revision, locked_at' as const;
const JOB_COLUMNS = 'id, state, generation, attempts, error_category, updated_at' as const;
const GRADE_COLUMNS = 'id, criteria, misconceptions, caps_applied, total, passed, decision, created_at' as const;

export interface AttemptRow extends AttemptRecord {
  submit_request_key: string | null;
  grade_id: string | null;
}
export interface JobRow {
  id: string;
  state: JobState;
  generation: number;
  attempts: number;
  error_category: ErrorCategory | null;
  updated_at: string;
}
export interface GradeRow {
  id: string;
  criteria: ValidatedCriterion[];
  misconceptions: ValidatedMisconception[];
  caps_applied: CapApplied[];
  total: number | string;
  passed: boolean;
  decision: Decision;
  created_at: string;
}

const asAttempt = (row: Record<string, unknown>): AttemptRow => ({ ...(row as unknown as AttemptRow), snapshot_public: row.snapshot_public as SnapshotPublic });

export async function loadOwnedAttempt(id: string, userId: string): Promise<AttemptRow | null> {
  const { data, error } = await supabaseAdmin.from('course_assessment_attempts').select(ATTEMPT_COLUMNS).eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`attempt load failed: ${error.message}`);
  return data ? asAttempt(data) : null;
}

export async function loadLatestAttempt(userId: string): Promise<AttemptRow | null> {
  const { data, error } = await supabaseAdmin
    .from('course_assessment_attempts')
    .select(ATTEMPT_COLUMNS)
    .eq('user_id', userId)
    .eq('course_id', COURSE.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`attempt load failed: ${error.message}`);
  return data ? asAttempt(data) : null;
}

export async function loadOpenAttempt(userId: string): Promise<AttemptRow | null> {
  const { data, error } = await supabaseAdmin
    .from('course_assessment_attempts')
    .select(ATTEMPT_COLUMNS)
    .eq('user_id', userId)
    .eq('course_id', COURSE.id)
    .in('state', [...OPEN_ATTEMPT_STATES])
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`attempt load failed: ${error.message}`);
  return data ? asAttempt(data) : null;
}

/** What the dashboard state and the eligibility rule need, in one read. */
export async function loadAssessmentSummary(userId: string): Promise<{ latestState: AttemptState | null; anySubmitted: boolean; passedCurrent: boolean }> {
  const { data, error } = await supabaseAdmin
    .from('course_assessment_attempts')
    .select('state, submitted_at, certification_version')
    .eq('user_id', userId)
    .eq('course_id', COURSE.id)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`attempt summary failed: ${error.message}`);
  const rows = data ?? [];
  return {
    latestState: (rows[0]?.state as AttemptState | undefined) ?? null,
    anySubmitted: rows.some((r) => r.submitted_at !== null),
    passedCurrent: rows.some((r) => r.state === 'passed' && r.certification_version === COURSE.certificationVersion),
  };
}

/** How many attempts this learner has had on each form. */
export async function countExposures(userId: string): Promise<Record<string, number>> {
  const { data, error } = await supabaseAdmin.from('course_assessment_attempts').select('form_id').eq('user_id', userId).eq('course_id', COURSE.id);
  if (error) throw new Error(`exposure count failed: ${error.message}`);
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[r.form_id] = (out[r.form_id] ?? 0) + 1;
  return out;
}

export async function createAttempt(args: {
  userId: string;
  form: { form_id: string; version: number; certification_version: string };
  rubricVersion: string;
  promptVersion: string;
  sourcePackId: string;
  snapshotPublic: SnapshotPublic;
  snapshotPrivate: SnapshotPrivate;
}): Promise<string> {
  const prompts = args.snapshotPublic.stages.flatMap((s, stage) => s.prompts.map((p) => ({ prompt_id: p.prompt_id, stage })));
  const { data, error } = await supabaseAdmin.rpc('create_course_attempt', {
    p_user: args.userId,
    p_course: COURSE.id,
    p_form_id: args.form.form_id,
    p_form_version: args.form.version,
    p_certification_version: args.form.certification_version,
    p_rubric_version: args.rubricVersion,
    p_prompt_version: args.promptVersion,
    p_source_pack: args.sourcePackId,
    p_stage_count: args.snapshotPublic.stage_count,
    p_public: args.snapshotPublic,
    p_private: args.snapshotPrivate,
    p_prompts: prompts,
  });
  if (error) throw new Error(`attempt create failed: ${error.message}`);
  const r = data as { outcome: string; attempt_id: string };
  if (!r.attempt_id) throw new Error('attempt create returned no id');
  return r.attempt_id;
}

export async function loadResponses(attemptId: string): Promise<ResponseRecord[]> {
  const { data, error } = await supabaseAdmin.from('course_assessment_responses').select(RESPONSE_COLUMNS).eq('attempt_id', attemptId);
  if (error) throw new Error(`responses load failed: ${error.message}`);
  return (data ?? []) as ResponseRecord[];
}

/** Compare-and-set on the revision; a locked row never changes. */
export async function saveResponse(
  attemptId: string,
  promptId: string,
  text: string,
  expectedRevision: number
): Promise<{ saved: true; revision: number; saved_at: string } | { saved: false; locked: boolean; revision: number; text: string }> {
  const { data, error } = await supabaseAdmin
    .from('course_assessment_responses')
    .update({ response_text: text, revision: expectedRevision + 1 })
    .eq('attempt_id', attemptId)
    .eq('prompt_id', promptId)
    .eq('revision', expectedRevision)
    .is('locked_at', null)
    .select('revision, updated_at')
    .maybeSingle();
  if (error) throw new Error(`response save failed: ${error.message}`);
  if (data) return { saved: true, revision: data.revision, saved_at: data.updated_at };
  const current = await supabaseAdmin.from('course_assessment_responses').select(RESPONSE_COLUMNS).eq('attempt_id', attemptId).eq('prompt_id', promptId).maybeSingle();
  if (current.error) throw new Error(`response load failed: ${current.error.message}`);
  if (!current.data) return { saved: false, locked: false, revision: 0, text: '' };
  return { saved: false, locked: current.data.locked_at !== null, revision: current.data.revision, text: current.data.response_text };
}

export async function lockStage(attemptId: string, stage: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from('course_assessment_responses')
    .update({ locked_at: new Date().toISOString() })
    .eq('attempt_id', attemptId)
    .eq('stage', stage)
    .is('locked_at', null);
  if (error) throw new Error(`stage lock failed: ${error.message}`);
}

/** Moves current_stage forward by one, only from the stage the caller saw. */
export async function advanceAttempt(attemptId: string, fromStage: number): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('course_assessment_attempts')
    .update({ current_stage: fromStage + 1 })
    .eq('id', attemptId)
    .eq('current_stage', fromStage)
    .eq('state', 'draft')
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`attempt advance failed: ${error.message}`);
  return data !== null;
}

export async function submitAttempt(
  attemptId: string,
  userId: string,
  requestKey: string,
  hash: string
): Promise<{ outcome: 'created' | 'duplicate' | 'already_submitted' | 'not_found'; jobId: string | null }> {
  const { data, error } = await supabaseAdmin.rpc('submit_course_attempt', { p_attempt: attemptId, p_user: userId, p_request_key: requestKey, p_hash: hash });
  if (error) throw new Error(`attempt submit failed: ${error.message}`);
  const r = data as { outcome: 'created' | 'duplicate' | 'already_submitted' | 'not_found'; job_id: string | null };
  return { outcome: r.outcome, jobId: r.job_id ?? null };
}

export async function loadLatestJob(attemptId: string): Promise<JobRow | null> {
  const { data, error } = await supabaseAdmin.from('course_grading_jobs').select(JOB_COLUMNS).eq('attempt_id', attemptId).order('generation', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`job load failed: ${error.message}`);
  return (data as JobRow | null) ?? null;
}

export async function loadGrade(gradeId: string): Promise<GradeRow | null> {
  const { data, error } = await supabaseAdmin.from('course_grades').select(GRADE_COLUMNS).eq('id', gradeId).maybeSingle();
  if (error) throw new Error(`grade load failed: ${error.message}`);
  return (data as GradeRow | null) ?? null;
}

/** Every attempt with its grade's outcome, for the history list. Two reads: the rows, then the grades they point at. */
export async function loadAttemptHistory(userId: string): Promise<HistoryRow[]> {
  const { data, error } = await supabaseAdmin
    .from('course_assessment_attempts')
    .select('id, state, certification_version, created_at, submitted_at, finalized_at, grade_id')
    .eq('user_id', userId)
    .eq('course_id', COURSE.id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    // Far above what one exposure per form allows: a ceiling against a runaway
    // account, not a limit this history is ever expected to reach.
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
