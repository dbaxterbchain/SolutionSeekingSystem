import type { SnapshotPrivate, SnapshotPublic } from '../../course/assessmentForm';
import type { ErrorCategory } from '../../course/assessmentTypes';
import { decide } from './decision';
import type { GradeOutcome } from './grader';
import type { ValidationContext } from './gradeValidation';
import type { GradingInput } from './promptBuilder';
import { hashSubmission } from './submissionHash';

/**
 * One run of one grading job: claim the lease, load the frozen attempt,
 * prove the submission is what was submitted, grade, decide, and finalize or
 * fail with the lock token the claim issued. Every write goes through the
 * store, and the store's SQL functions refuse a stale token, so a worker that
 * outlived its lease can never produce a second grade.
 *
 * Worker-shared: imports nothing from Astro, the env helper or the admin
 * client. The Netlify function and the dev server's inline mode both compose
 * it with a real store and a real grader (scripts/check-private-content.mjs
 * enforces the import closure).
 */

export interface JobContext {
  attempt: {
    id: string;
    form_id: string;
    form_version: number;
    rubric_version: string;
    prompt_version: string;
    submission_hash: string | null;
    snapshot_public: SnapshotPublic;
    snapshot_private: SnapshotPrivate;
  };
  /** Ordered by stage, then by prompt order within the public snapshot. */
  responses: { prompt_id: string; stage: number; response_text: string }[];
  sourcePack: { sha256: string; body: string };
}
export type ClaimResult =
  | { outcome: 'claimed'; lockToken: string; attemptId: string; generation: number; attempts: number }
  /** The budget was already spent, so the claim retired the job. A real failure: an alert follows. */
  | { outcome: 'exhausted'; attemptId: string; error: string; attempts: number }
  | { outcome: 'unavailable' };
export interface GradingJobStore {
  claim(jobId: string, worker: string, leaseSeconds: number): Promise<ClaimResult>;
  loadContext(attemptId: string): Promise<JobContext | null>;
  finalize(args: {
    jobId: string;
    lockToken: string;
    raw: string;
    usage: unknown;
    validated: unknown;
    decision: unknown;
    model: string;
    promptVersion: string;
    rubricVersion: string;
    awardsEnabled: boolean;
  }): Promise<'finalized' | 'stale'>;
  fail(args: { jobId: string; lockToken: string; category: ErrorCategory; error: string; retryable: boolean }): Promise<'requeued' | 'failed' | 'stale'>;
}
export interface RunSettings {
  model: string;
  awardsEnabled: boolean;
  leaseSeconds?: number;
}
export type Grader = (input: GradingInput, ctx: ValidationContext) => Promise<GradeOutcome>;
export type RunOutcome =
  | { outcome: 'finalized'; passed: boolean }
  | { outcome: 'unavailable' | 'stale' }
  | { outcome: 'exhausted'; attemptId: string; error: string; attempts: number }
  /**
   * `lockToken` is the token this run held, spent by the time the outcome is
   * read (fail_course_grading_job clears it). It is carried because it is the
   * one value that differs for every run of a job, which is what the failure
   * alert needs to key on: `attempts` restarts at zero when an admin retries,
   * so two failures of the same job would otherwise look like one.
   */
  | {
      outcome: 'requeued' | 'failed';
      category: ErrorCategory;
      attemptId: string;
      error: string;
      attempts: number;
      lockToken: string;
    };
/**
 * Longer than the grader's own budget (GRADER_BUDGET_MS, 720 seconds) and
 * shorter than the Netlify background limit of 900 seconds, so a worker still
 * holds its lease when it finishes and the function is never killed holding
 * one. The sweeper mirrors this number, and so does the SQL default.
 */
export const DEFAULT_LEASE_SECONDS = 840;

export async function runGradingJob(args: {
  jobId: string;
  worker: string;
  store: GradingJobStore;
  grade: Grader;
  settings: RunSettings;
  log?: (message: string, extra?: unknown) => void;
}): Promise<RunOutcome> {
  const { jobId, worker, store, grade, settings } = args;
  const log = args.log ?? ((message: string, extra?: unknown) => console.log(message, extra ?? ''));

  const claim = await store.claim(jobId, worker, settings.leaseSeconds ?? DEFAULT_LEASE_SECONDS);
  // Exhausted is handed back whole rather than as a bare outcome: the claim has
  // just retired the job and left the learner on grading_error, so the caller
  // needs the attempt and the last error to alert an operator.
  if (claim.outcome === 'exhausted') {
    log(`grading job ${jobId}: exhausted`, claim.error);
    return { outcome: 'exhausted', attemptId: claim.attemptId, error: claim.error, attempts: claim.attempts };
  }
  if (claim.outcome !== 'claimed') {
    log(`grading job ${jobId}: ${claim.outcome}`);
    return { outcome: claim.outcome };
  }
  const fail = async (category: ErrorCategory, error: string, retryable: boolean): Promise<RunOutcome> => {
    const result = await store.fail({ jobId, lockToken: claim.lockToken, category, error, retryable });
    log(`grading job ${jobId}: ${category} (${result})`, error);
    return result === 'stale'
      ? { outcome: 'stale' }
      : { outcome: result, category, attemptId: claim.attemptId, error, attempts: claim.attempts, lockToken: claim.lockToken };
  };

  let ctx: JobContext | null;
  try {
    ctx = await store.loadContext(claim.attemptId);
  } catch (err) {
    return fail('internal', `context load failed: ${(err as Error).message}`, true);
  }
  if (!ctx) return fail('internal', 'attempt context missing', false);

  const rows = ctx.responses.map((r) => ({ prompt_id: r.prompt_id, text: r.response_text }));
  if (hashSubmission(rows) !== ctx.attempt.submission_hash) {
    return fail('integrity', 'submission hash does not match the stored responses', false);
  }

  const input: GradingInput = {
    attemptId: ctx.attempt.id,
    formId: ctx.attempt.form_id,
    formVersion: ctx.attempt.form_version,
    rubricVersion: ctx.attempt.rubric_version,
    promptVersion: ctx.attempt.prompt_version,
    sourcePack: ctx.sourcePack,
    formPrivate: ctx.attempt.snapshot_private,
    responses: ctx.responses.map((r) => ({ prompt_id: r.prompt_id, stage: r.stage, text: r.response_text })),
  };
  const validation: ValidationContext = {
    attemptId: ctx.attempt.id,
    rubricVersion: ctx.attempt.rubric_version,
    responses: rows,
    allowedLessonIds: ctx.attempt.snapshot_private.allowed_lessons.map((l) => l.id),
  };

  let outcome: GradeOutcome;
  try {
    outcome = await grade(input, validation);
  } catch (err) {
    return fail('internal', `grader threw: ${(err as Error).message}`, false);
  }
  if (!outcome.ok) return fail(outcome.category, outcome.message, outcome.retryable);
  for (const warning of outcome.warnings) log(`grading job ${jobId}: ${warning}`);

  const decision = decide(outcome.grade);
  const result = await store.finalize({
    jobId,
    lockToken: claim.lockToken,
    raw: outcome.raw,
    usage: outcome.usage,
    validated: outcome.grade,
    decision,
    model: outcome.model,
    promptVersion: ctx.attempt.prompt_version,
    rubricVersion: ctx.attempt.rubric_version,
    awardsEnabled: settings.awardsEnabled,
  });
  if (result === 'stale') {
    log(`grading job ${jobId}: finalize was stale; another worker finished it`);
    return { outcome: 'stale' };
  }
  log(`grading job ${jobId}: finalized (${decision.passed ? 'passed' : 'needs revision'}, total ${decision.total})`);
  return { outcome: 'finalized', passed: decision.passed };
}
