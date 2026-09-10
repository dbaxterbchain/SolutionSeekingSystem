import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { CRITERION_IDS, PRINCIPLE_IDS, TOOL_IDS } from '../../../../data/certification';
import type { SnapshotPrivate } from '../../../course/assessmentForm';
import { DEFAULT_MAX_TOKENS, RETRY_MAX_TOKENS, categorizeError, gradeAttempt, type GraderClient } from '../grader';
import type { ValidationContext } from '../gradeValidation';
import type { GradingInput } from '../promptBuilder';

const formPrivate: SnapshotPrivate = {
  form_id: 'sample-p0',
  version: 1,
  coverage: {
    principles: Object.fromEntries(PRINCIPLE_IDS.map((id) => [id, ['a1']])) as SnapshotPrivate['coverage']['principles'],
    tools: Object.fromEntries(TOOL_IDS.map((id) => [id, ['a1']])) as SnapshotPrivate['coverage']['tools'],
  },
  reference_responses: [],
  scoring_anchors: [],
  notes: null,
  allowed_lessons: [{ id: 'v04', title: 'Introspection' }],
  source_pack_sha256: 'f'.repeat(64),
  rubric_version: '1',
  prompt_version: '1',
};
const input: GradingInput = {
  attemptId: 'att-1',
  formId: 'sample-p0',
  formVersion: 1,
  rubricVersion: '1',
  promptVersion: '1',
  sourcePack: { sha256: 'f'.repeat(64), body: 'Source.' },
  formPrivate,
  responses: [{ prompt_id: 'a1', stage: 0, text: 'I would separate the account from my feelings first.' }],
};
const ctx: ValidationContext = { attemptId: 'att-1', rubricVersion: '1', responses: [{ prompt_id: 'a1', text: input.responses[0].text }], allowedLessonIds: ['v04'] };

const goodGrade = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    attempt_id: 'att-1',
    rubric_version: '1',
    criteria: CRITERION_IDS.map((id) => ({ criterion_id: id, score: 4, reason: 'Applied with a clear reason.', evidence_status: 'found', evidence: [{ prompt_id: 'a1', exact_quote: 'separate the account from my feelings' }], revision_lesson_ids: [] })),
    principles: PRINCIPLE_IDS.map((id) => ({ id, coverage: 'applied', evidence: [] })),
    tools: TOOL_IDS.map((id) => ({ id, coverage: 'applied', evidence: [] })),
    material_misconceptions: [],
    ...over,
  });

function message(text: string, over: Record<string, unknown> = {}): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5',
    content: [{ type: 'text', text, citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 90 },
    ...over,
  } as unknown as Anthropic.Message;
}

function fakeClient(replies: Array<Anthropic.Message | Error>) {
  const calls: Anthropic.MessageStreamParams[] = [];
  const client: GraderClient = {
    messages: {
      stream(params) {
        calls.push(params);
        return {
          async finalMessage() {
            const next = replies.shift();
            if (!next) throw new Error('no reply queued');
            if (next instanceof Error) throw next;
            return next;
          },
        };
      },
    },
  };
  return { calls, client };
}
const settings = { model: 'claude-opus-5' };

describe('gradeAttempt', () => {
  it('returns a validated grade from one good reply, with the request shaped for structured output', async () => {
    const { calls, client } = fakeClient([message(goodGrade())]);
    const r = await gradeAttempt({ anthropic: client, input, ctx, settings });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.corrected).toBe(false);
      expect(r.grade.criteria).toHaveLength(6);
      expect(r.usage).toEqual({ input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 90, calls: 1 });
      expect(r.model).toBe('claude-opus-5');
    }
    expect(calls).toHaveLength(1);
    expect(calls[0].max_tokens).toBe(DEFAULT_MAX_TOKENS);
    expect(calls[0].output_config?.format?.type).toBe('json_schema');
    expect(calls[0].output_config?.effort).toBe('high');
    expect(Array.isArray(calls[0].system) && calls[0].system.length).toBe(3);
    expect('tools' in calls[0]).toBe(false);
    expect('thinking' in calls[0]).toBe(false);
  });

  it('runs one corrective turn on the same prefix when validation fails', async () => {
    const { calls, client } = fakeClient([message(goodGrade({ attempt_id: 'wrong' })), message(goodGrade())]);
    const r = await gradeAttempt({ anthropic: client, input, ctx, settings });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.corrected).toBe(true);
    expect(calls).toHaveLength(2);
    expect(JSON.stringify(calls[1].system)).toBe(JSON.stringify(calls[0].system));
    expect(calls[1].messages).toHaveLength(3);
    expect(calls[1].messages[1].role).toBe('assistant');
    expect(String(calls[1].messages[2].content)).toContain('attempt_id does not match');
  });

  it('sanitizes a dashed reason on the corrective pass and reports the warning', async () => {
    const dashed = goodGrade();
    const fixed = JSON.parse(goodGrade({ attempt_id: 'att-1' }));
    fixed.criteria[0].reason = 'Named the feelings — not the assumptions.';
    const { client } = fakeClient([message(goodGrade({ attempt_id: 'wrong' })), message(JSON.stringify(fixed))]);
    const r = await gradeAttempt({ anthropic: client, input, ctx, settings });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.grade.criteria[0].reason).toBe('Named the feelings. not the assumptions.');
      expect(r.warnings[0]).toMatch(/dash replaced/);
    }
    expect(dashed).toBeTruthy();
  });

  it('gives up after the corrective turn with invalid_output, retryable', async () => {
    const { client } = fakeClient([message('not json'), message('{"still": "wrong"}')]);
    const r = await gradeAttempt({ anthropic: client, input, ctx, settings });
    expect(r).toMatchObject({ ok: false, category: 'invalid_output', retryable: true });
  });

  it('maps a refusal', async () => {
    const { client } = fakeClient([message('', { stop_reason: 'refusal' })]);
    expect(await gradeAttempt({ anthropic: client, input, ctx, settings })).toMatchObject({ ok: false, category: 'refusal', retryable: false });
  });

  it('retries max_tokens once at the higher budget, then gives up', async () => {
    const { calls, client } = fakeClient([message('{', { stop_reason: 'max_tokens' }), message(goodGrade())]);
    const r = await gradeAttempt({ anthropic: client, input, ctx, settings });
    expect(r.ok).toBe(true);
    expect(calls[1].max_tokens).toBe(RETRY_MAX_TOKENS);

    const twice = fakeClient([message('{', { stop_reason: 'max_tokens' }), message('{', { stop_reason: 'max_tokens' })]);
    expect(await gradeAttempt({ anthropic: twice.client, input, ctx, settings })).toMatchObject({ ok: false, category: 'max_tokens', retryable: false });
  });

  it('maps SDK errors to categories', async () => {
    const cases: Array<[Error, string, boolean]> = [
      [new Anthropic.RateLimitError(429, { type: 'error' }, 'slow down', new Headers()), 'rate_limited', true],
      [new Anthropic.APIError(529, { type: 'error' }, 'overloaded', new Headers()), 'overloaded', true],
      [new Anthropic.InternalServerError(500, { type: 'error' }, 'boom', new Headers()), 'upstream', true],
      [new Anthropic.APIConnectionError({ message: 'socket hang up' }), 'upstream', true],
      [new Anthropic.BadRequestError(400, { type: 'error' }, 'bad schema', new Headers()), 'internal', false],
      [new Error('something else'), 'internal', false],
    ];
    for (const [err, category, retryable] of cases) {
      expect(categorizeError(err), err.message).toMatchObject({ category, retryable });
      const { client } = fakeClient([err]);
      expect(await gradeAttempt({ anthropic: client, input, ctx, settings }), err.message).toMatchObject({ ok: false, category, retryable });
    }
  });
});
