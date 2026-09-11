import { describe, expect, it } from 'vitest';
import { CRITERION_IDS, PRINCIPLE_IDS, TOOL_IDS } from '../../../../data/certification';
import { normalizeForQuote, sanitizeReason, validateGradeOutput, type ValidationContext } from '../gradeValidation';

const ctx: ValidationContext = {
  attemptId: 'att-1',
  rubricVersion: '1',
  responses: [
    { prompt_id: 'a1', text: 'I would separate the "account" from my feelings & my assumptions.  Then ask questions.' },
    { prompt_id: 'a2', text: 'With Jordan I would ask what happened from your side, and say it back to check.' },
  ],
  allowedLessonIds: ['v04', 'v12'],
};

function good(): Record<string, unknown> {
  return {
    attempt_id: 'att-1',
    rubric_version: '1',
    criteria: CRITERION_IDS.map((id) => ({
      criterion_id: id,
      score: 3,
      reason: 'Separated the account from the feelings and named assumptions.',
      evidence_status: 'found',
      evidence: [{ prompt_id: 'a1', exact_quote: 'separate the "account" from my feelings' }],
      revision_lesson_ids: [],
    })),
    principles: PRINCIPLE_IDS.map((id) => ({ id, coverage: 'applied', evidence: [] })),
    tools: TOOL_IDS.map((id) => ({ id, coverage: 'applied', evidence: [] })),
    material_misconceptions: [],
  };
}
const errorsOf = (raw: unknown, opts?: { sanitizeReasons?: boolean }) => {
  const r = validateGradeOutput(raw, ctx, opts);
  return r.ok ? [] : r.errors;
};

describe('validateGradeOutput', () => {
  it('accepts a well-formed grade', () => {
    const r = validateGradeOutput(good(), ctx);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.grade.criteria).toHaveLength(6);
      expect(r.grade.principles).toHaveLength(12);
      expect(r.warnings).toEqual([]);
    }
  });

  it('rejects a quote that is not verbatim', () => {
    const raw = good();
    (raw.criteria as any[])[0].evidence = [{ prompt_id: 'a1', exact_quote: 'separate the story from my feelings' }];
    expect(errorsOf(raw).join('\n')).toMatch(/not verbatim/);
  });

  it('accepts curly quotes, collapsed whitespace and XML-escaped text', () => {
    const raw = good();
    (raw.criteria as any[])[0].evidence = [{ prompt_id: 'a1', exact_quote: 'separate the “account” from my feelings &amp; my assumptions. Then' }];
    expect(errorsOf(raw)).toEqual([]);
  });

  it('rejects a lesson outside the allowed list', () => {
    const raw = good();
    (raw.criteria as any[])[0].revision_lesson_ids = ['v40'];
    expect(errorsOf(raw).join('\n')).toMatch(/revision lesson v40 is not in the allowed list/);
  });

  it('rejects a duplicate and a missing criterion', () => {
    const raw = good();
    (raw.criteria as any[])[1] = { ...(raw.criteria as any[])[0] };
    const errors = errorsOf(raw).join('\n');
    expect(errors).toMatch(/appears twice/);
    expect(errors).toMatch(/is missing/);
  });

  it('rejects an extra top-level key', () => {
    const raw = { ...good(), commentary: 'nice work' };
    expect(errorsOf(raw).join('\n')).toMatch(/top-level keys must be exactly/);
  });

  it('rejects a mismatched attempt id', () => {
    expect(errorsOf({ ...good(), attempt_id: 'other' }).join('\n')).toMatch(/attempt_id does not match/);
  });

  it('flags an em dash in a reason, and sanitizes it on the second pass', () => {
    const raw = good();
    (raw.criteria as any[])[0].reason = 'Named the feelings — but not the assumptions.';
    expect(errorsOf(raw).join('\n')).toMatch(/no em dashes/);
    const r = validateGradeOutput(raw, ctx, { sanitizeReasons: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.grade.criteria[0].reason).toBe('Named the feelings. but not the assumptions.');
      expect(r.warnings[0]).toMatch(/dash replaced/);
    }
  });

  it('rejects evidence_status none with quotes, and found without', () => {
    const raw = good();
    (raw.criteria as any[])[0].evidence_status = 'none';
    expect(errorsOf(raw).join('\n')).toMatch(/none requires an empty evidence list/);
    const raw2 = good();
    (raw2.criteria as any[])[0].evidence = [];
    expect(errorsOf(raw2).join('\n')).toMatch(/found requires at least one quote/);
  });

  it('rejects a too-short quote, an unknown prompt and an out-of-range score', () => {
    const raw = good();
    (raw.criteria as any[])[0].evidence = [{ prompt_id: 'a1', exact_quote: 'ask' }];
    (raw.criteria as any[])[1].evidence = [{ prompt_id: 'zz', exact_quote: 'separate the "account"' }];
    (raw.criteria as any[])[2].score = 5;
    const errors = errorsOf(raw).join('\n');
    expect(errors).toMatch(/8 to 400 characters/);
    expect(errors).toMatch(/unknown prompt_id zz/);
    expect(errors).toMatch(/score must be an integer from 0 to 4/);
  });

  it('rejects an unknown coverage value and a misconception without a quote', () => {
    const raw = good();
    (raw.principles as any[])[0].coverage = 'excellent';
    raw.material_misconceptions = [{ criterion_id: 'solution_quality', description: 'Treated the proposal as agreed.', evidence: [] }];
    const errors = errorsOf(raw).join('\n');
    expect(errors).toMatch(/coverage must be one of/);
    expect(errors).toMatch(/needs at least one quote/);
  });

  it('rejects anything that is not an object', () => {
    expect(errorsOf('{"attempt_id": "att-1"}')).toEqual(['output is not a JSON object']);
  });
});

describe('helpers', () => {
  it('normalizeForQuote unescapes, straightens quotes and collapses whitespace', () => {
    expect(normalizeForQuote('  a ‘b’  &amp; “c”\n')).toBe('a \'b\' & "c"');
  });

  it('sanitizeReason turns a dash into a full stop', () => {
    expect(sanitizeReason('Clear account — vague assumptions')).toBe('Clear account. vague assumptions');
    expect(sanitizeReason('One {{token}} here')).toBe('One token here');
  });
});
