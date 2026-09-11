import { describe, expect, it } from 'vitest';
import type { SnapshotPublic } from '../assessmentForm';
import {
  MAX_EXPOSURES_PER_FORM,
  certificationStatus,
  chooseForm,
  promptStage,
  stageProblems,
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
