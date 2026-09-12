import { describe, expect, it } from 'vitest';
import type { SnapshotPublic } from '../assessmentForm';
import type { AttemptState } from '../assessmentTypes';
import {
  MAX_EXPOSURES_PER_FORM,
  certificationStatus,
  chooseForm,
  promptStage,
  stageProblems,
  summarizeAttempts,
  viewForLearner,
  type AttemptRecord,
  type ResponseRecord,
} from '../assessmentRules';

const snapshot: SnapshotPublic = {
  form_id: 'sample-p0',
  version: 1,
  stage_count: 3,
  stages: [
    { id: 'part-a', part: 'A', title: 'Understand', intro: 'Intro A', reveal: null, lock_on_advance: true, prompts: [
      { prompt_id: 'a1', text: 'Prompt A1', required: true, min_chars: 10, max_chars: 100 },
      { prompt_id: 'a2', text: 'Prompt A2', required: false, min_chars: 10, max_chars: 100 },
    ] },
    { id: 'part-b', part: 'B', title: 'New information', intro: null, reveal: 'REVEAL-B secret', lock_on_advance: true, prompts: [
      { prompt_id: 'b1', text: 'PROMPT-B1 secret', required: true, min_chars: 10, max_chars: 100 },
    ] },
    { id: 'part-c', part: 'C', title: 'Later', intro: null, reveal: 'REVEAL-C secret', lock_on_advance: false, prompts: [
      { prompt_id: 'c1', text: 'PROMPT-C1 secret', required: true, min_chars: 10, max_chars: 100 },
    ] },
  ],
};
const attempt = (current_stage: number, over: Partial<AttemptRecord> = {}): AttemptRecord => ({
  id: 'att-1', state: 'draft', form_id: 'sample-p0', form_version: 1, certification_version: '1',
  current_stage, stage_count: 3, snapshot_public: snapshot, submitted_at: null, finalized_at: null, created_at: '2026-09-10T00:00:00Z', ...over,
});
const row = (prompt_id: string, stage: number, response_text = '', over: Partial<ResponseRecord> = {}): ResponseRecord => ({ prompt_id, stage, response_text, revision: 0, locked_at: null, ...over });

describe('viewForLearner', () => {
  it('shows stage 0 only while the attempt is on stage 0, with nothing from later stages', () => {
    const view = viewForLearner(attempt(0), [row('a1', 0, 'typed', { revision: 2 })]);
    expect(view.stages).toHaveLength(1);
    expect(view.stages[0].prompts.map((p) => p.prompt_id)).toEqual(['a1', 'a2']);
    expect(view.stages[0].prompts[0].response).toEqual({ text: 'typed', revision: 2, locked: false });
    expect(view.stages[0].prompts[1].response).toEqual({ text: '', revision: 0, locked: false });
    expect(JSON.stringify(view)).not.toContain('secret');
  });

  it('adds the next stage with its reveal once it opens, and marks locked rows', () => {
    const view = viewForLearner(attempt(1), [row('a1', 0, 'typed', { locked_at: '2026-09-10T01:00:00Z' })]);
    expect(view.stages).toHaveLength(2);
    expect(view.stages[1].reveal).toBe('REVEAL-B secret');
    expect(view.stages[1].prompts[0].text).toBe('PROMPT-B1 secret');
    expect(view.stages[0].prompts[0].response.locked).toBe(true);
    expect(JSON.stringify(view)).not.toContain('REVEAL-C');
  });

  it('never exceeds the stage count', () => {
    expect(viewForLearner(attempt(9), []).stages).toHaveLength(3);
  });
});

describe('stageProblems', () => {
  const stage = snapshot.stages[0];
  it('reports an empty required prompt and ignores an empty optional one', () => {
    expect(stageProblems(stage, [])).toEqual([{ prompt_id: 'a1', problem: 'required' }]);
    expect(stageProblems(stage, [row('a1', 0, '   ')])).toEqual([{ prompt_id: 'a1', problem: 'required' }]);
  });
  it('reports too short and too long, on optional prompts too', () => {
    expect(stageProblems(stage, [row('a1', 0, 'short'), row('a2', 0, 'x'.repeat(101))])).toEqual([
      { prompt_id: 'a1', problem: 'too_short' },
      { prompt_id: 'a2', problem: 'too_long' },
    ]);
  });
  it('is empty when every prompt is within bounds', () => {
    expect(stageProblems(stage, [row('a1', 0, 'long enough text')])).toEqual([]);
  });
});

describe('promptStage', () => {
  it('finds the stage of a prompt and null for an unknown one', () => {
    expect(promptStage(snapshot, 'b1')).toBe(1);
    expect(promptStage(snapshot, 'zz')).toBeNull();
  });
});

describe('chooseForm', () => {
  const forms = [
    { form_id: 'form-b', order: 2, status: 'active' as const },
    { form_id: 'form-a', order: 1, status: 'active' as const },
    { form_id: 'sample-p0', order: 0, status: 'sample' as const },
    { form_id: 'old', order: 0, status: 'retired' as const },
  ];
  it('picks the lowest order active form and never a retired one', () => {
    expect(chooseForm(forms, {}, false)?.form_id).toBe('form-a');
  });
  it('includes the sample form only when allowed', () => {
    expect(chooseForm(forms, {}, true)?.form_id).toBe('sample-p0');
  });
  it('skips forms the learner has already seen', () => {
    expect(MAX_EXPOSURES_PER_FORM).toBe(1);
    expect(chooseForm(forms, { 'form-a': 1 }, false)?.form_id).toBe('form-b');
    expect(chooseForm(forms, { 'form-a': 1, 'form-b': 1 }, false)).toBeNull();
  });
});

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
  const form = (form_id: string, order: number, status: 'active' | 'sample' = 'active') => ({ form_id, order, status });
  it('takes the lowest order among equally exposed forms', () => {
    expect(chooseForm([form('form-b', 2), form('form-a', 1)], {}, false)?.form_id).toBe('form-a');
    expect(chooseForm([form('form-b', 2), form('form-a', 1)], { 'form-a': 1 }, false)?.form_id).toBe('form-b');
  });
  it('never assigns a sample form unless allowed', () => {
    expect(chooseForm([form('sample-p0', 0, 'sample')], {}, false)).toBeNull();
    expect(chooseForm([form('sample-p0', 0, 'sample')], {}, true)?.form_id).toBe('sample-p0');
  });
});

describe('certificationStatus', () => {
  it('maps the latest attempt state', () => {
    expect(certificationStatus(null)).toBe('none');
    expect(certificationStatus('draft')).toBe('in_progress');
    expect(certificationStatus('submitted')).toBe('submitted');
    expect(certificationStatus('grading')).toBe('submitted');
    expect(certificationStatus('passed')).toBe('passed');
    expect(certificationStatus('needs_revision')).toBe('needs_revision');
    expect(certificationStatus('grading_error')).toBe('grading_error');
  });
});
