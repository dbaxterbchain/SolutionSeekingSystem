import { describe, expect, it } from 'vitest';
import { CRITERION_IDS, PRINCIPLE_IDS, TOOL_IDS } from '../../../../data/certification';
import type { ValidatedGrade } from '../../../course/assessmentTypes';
import type { GradeOutcome } from '../grader';
import { runGradingJob, type ClaimResult, type GradingJobStore, type JobContext } from '../gradingJob';
import { hashSubmission } from '../submissionHash';

const responses = [
  { prompt_id: 'a1', stage: 0, response_text: 'First answer about the account and the feelings.' },
  { prompt_id: 'b1', stage: 1, response_text: 'Second answer about good faith.' },
];
function context(over: Partial<JobContext['attempt']> = {}): JobContext {
  return {
    attempt: {
      id: 'att-1',
      user_id: 'user-1',
      form_id: 'sample-p0',
      form_version: 1,
      rubric_version: '1',
      prompt_version: '1',
      submission_hash: hashSubmission(responses.map((r) => ({ prompt_id: r.prompt_id, text: r.response_text }))),
      snapshot_public: { form_id: 'sample-p0', version: 1, stage_count: 2, stages: [] },
      snapshot_private: {
        form_id: 'sample-p0',
        version: 1,
        coverage: { principles: {} as never, tools: {} as never },
        reference_responses: [],
        scoring_anchors: [],
        notes: null,
        allowed_lessons: [{ id: 'v04', title: 'Introspection' }],
        source_pack_sha256: 'f'.repeat(64),
        rubric_version: '1',
        prompt_version: '1',
      },
      ...over,
    },
    responses,
    sourcePack: { sha256: 'f'.repeat(64), body: 'Source.' },
  };
}
const validGrade: ValidatedGrade = {
  attempt_id: 'att-1',
  rubric_version: '1',
  criteria: CRITERION_IDS.map((id) => ({ criterion_id: id, score: 4, reason: 'Good.', evidence_status: 'found', evidence: [{ prompt_id: 'a1', exact_quote: 'the account and the feelings' }], revision_lesson_ids: [] })),
  principles: PRINCIPLE_IDS.map((id) => ({ id, coverage: 'applied', evidence: [] })),
  tools: TOOL_IDS.map((id) => ({ id, coverage: 'applied', evidence: [] })),
  material_misconceptions: [],
};
const okOutcome: GradeOutcome = { ok: true, raw: '{}', grade: validGrade, usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, calls: 1 }, model: 'claude-opus-5', warnings: [], corrected: false };

function fakeStore(opts: { claim?: ClaimResult; context?: JobContext | null; finalize?: 'finalized' | 'stale'; fail?: 'requeued' | 'failed' | 'stale' } = {}) {
  const calls: { name: string; args: unknown }[] = [];
  const store: GradingJobStore = {
    async claim(jobId, worker, lease) {
      calls.push({ name: 'claim', args: { jobId, worker, lease } });
      return opts.claim ?? { outcome: 'claimed', lockToken: 'tok-1', attemptId: 'att-1', generation: 1, attempts: 1 };
    },
    async loadContext(attemptId) {
      calls.push({ name: 'loadContext', args: attemptId });
      return opts.context === undefined ? context() : opts.context;
    },
    async finalize(args) {
      calls.push({ name: 'finalize', args });
      return opts.finalize ?? 'finalized';
    },
    async fail(args) {
      calls.push({ name: 'fail', args });
      return opts.fail ?? (args.retryable ? 'requeued' : 'failed');
    },
    async markResultEmailSent(jobId) {
      calls.push({ name: 'markResultEmailSent', args: jobId });
      return true;
    },
    async certificateForAttempt(attemptId) {
      calls.push({ name: 'certificateForAttempt', args: attemptId });
      return null;
    },
    async markCertificateEmailSent(certificateId) {
      calls.push({ name: 'markCertificateEmailSent', args: certificateId });
      return true;
    },
  };
  return { calls, store };
}
const settings = { model: 'claude-opus-5', awardsEnabled: false };
const grader = (outcome: GradeOutcome | Error) => {
  const seen: unknown[] = [];
  const grade = async (input: unknown, ctx: unknown) => {
    seen.push({ input, ctx });
    if (outcome instanceof Error) throw outcome;
    return outcome;
  };
  return { seen, grade };
};

describe('runGradingJob', () => {
  it('claims, grades, decides and finalizes with the lock token', async () => {
    const { calls, store } = fakeStore();
    const g = grader(okOutcome);
    const r = await runGradingJob({ jobId: 'job-1', worker: 'w1', store, grade: g.grade, settings, log: () => {} });
    expect(r).toEqual({ outcome: 'finalized', passed: true, attemptId: 'att-1', userId: 'user-1', generation: 1 });
    expect(calls.map((c) => c.name)).toEqual(['claim', 'loadContext', 'finalize']);
    const fin = calls[2].args as Record<string, unknown>;
    expect(fin.lockToken).toBe('tok-1');
    expect((fin.decision as { total: number }).total).toBe(100);
    expect(fin.awardsEnabled).toBe(false);
    expect(fin.model).toBe('claude-opus-5');
    const seen = g.seen[0] as { input: { attemptId: string; responses: unknown[] }; ctx: { allowedLessonIds: string[] } };
    expect(seen.input.attemptId).toBe('att-1');
    expect(seen.input.responses).toHaveLength(2);
    expect(seen.ctx.allowedLessonIds).toEqual(['v04']);
  });

  it('does nothing when the claim is unavailable', async () => {
    const { calls, store } = fakeStore({ claim: { outcome: 'unavailable' } });
    const g = grader(okOutcome);
    expect(await runGradingJob({ jobId: 'job-1', worker: 'w1', store, grade: g.grade, settings, log: () => {} })).toEqual({ outcome: 'unavailable' });
    expect(calls.map((c) => c.name)).toEqual(['claim']);
    expect(g.seen).toHaveLength(0);
  });

  it('hands an exhausted claim back whole, so the caller can alert an operator', async () => {
    const { calls, store } = fakeStore({ claim: { outcome: 'exhausted', attemptId: 'att-1', error: 'upstream said no', attempts: 3 } });
    const g = grader(okOutcome);
    expect(await runGradingJob({ jobId: 'job-1', worker: 'w1', store, grade: g.grade, settings, log: () => {} })).toEqual({
      outcome: 'exhausted',
      attemptId: 'att-1',
      error: 'upstream said no',
      attempts: 3,
    });
    expect(calls.map((c) => c.name)).toEqual(['claim']);
    expect(g.seen).toHaveLength(0);
  });

  it('fails with integrity, not retryable, when the stored hash does not match', async () => {
    const { calls, store } = fakeStore({ context: context({ submission_hash: 'deadbeef' }) });
    const g = grader(okOutcome);
    const r = await runGradingJob({ jobId: 'job-1', worker: 'w1', store, grade: g.grade, settings, log: () => {} });
    // The lock token rides along because the failure alert keys on it.
    expect(r).toMatchObject({ outcome: 'failed', category: 'integrity', attemptId: 'att-1', lockToken: 'tok-1' });
    expect(calls[2]).toMatchObject({ name: 'fail', args: { category: 'integrity', retryable: false, lockToken: 'tok-1' } });
    expect(g.seen).toHaveLength(0);
  });

  it('passes a grader failure through to fail with its category', async () => {
    const { calls, store } = fakeStore();
    const g = grader({ ok: false, category: 'rate_limited', retryable: true, message: 'slow down', raw: null, usage: okOutcome.ok ? okOutcome.usage : (undefined as never) });
    const r = await runGradingJob({ jobId: 'job-1', worker: 'w1', store, grade: g.grade, settings, log: () => {} });
    expect(r).toMatchObject({ outcome: 'requeued', category: 'rate_limited' });
    expect(calls[2]).toMatchObject({ name: 'fail', args: { category: 'rate_limited', retryable: true, error: 'slow down' } });
  });

  it('turns a thrown grader into internal, not retryable, and carries the message', async () => {
    const { store } = fakeStore();
    const g = grader(new Error('kaboom'));
    // The alert email quotes this, so a failed outcome that dropped the message
    // would leave an operator with a job id and nothing to act on.
    expect(await runGradingJob({ jobId: 'job-1', worker: 'w1', store, grade: g.grade, settings, log: () => {} })).toMatchObject({
      outcome: 'failed',
      category: 'internal',
      error: 'grader threw: kaboom',
    });
  });

  it('reports stale when another worker finished first', async () => {
    const { store } = fakeStore({ finalize: 'stale' });
    const g = grader(okOutcome);
    expect(await runGradingJob({ jobId: 'job-1', worker: 'w1', store, grade: g.grade, settings, log: () => {} })).toEqual({ outcome: 'stale' });
  });

  it('fails internal, not retryable, when the attempt context is missing', async () => {
    const { calls, store } = fakeStore({ context: null });
    const g = grader(okOutcome);
    expect(await runGradingJob({ jobId: 'job-1', worker: 'w1', store, grade: g.grade, settings, log: () => {} })).toMatchObject({ outcome: 'failed', category: 'internal' });
    expect(calls[2]).toMatchObject({ name: 'fail', args: { retryable: false } });
  });
});
