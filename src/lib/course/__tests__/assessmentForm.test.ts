import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRINCIPLE_IDS, TOOL_IDS } from '../../../data/certification';
import {
  FORM_PRIVATE_MARKER,
  checkForm,
  deriveCoverageMap,
  privateSnapshot,
  publicSnapshot,
  type AssessmentForm,
} from '../assessmentForm';

const SAMPLE_URL = new URL('../../../content/course/assessment-forms/sample-p0.json', import.meta.url);
const sample = (): AssessmentForm => JSON.parse(readFileSync(SAMPLE_URL, 'utf8')) as AssessmentForm;

describe('sample form', () => {
  it('passes every cross-field rule', () => {
    expect(checkForm(sample())).toEqual([]);
  });

  it('covers all twelve principles and four tools', () => {
    const map = deriveCoverageMap(sample());
    for (const id of PRINCIPLE_IDS) expect(map.principles[id].length, id).toBeGreaterThan(0);
    for (const id of TOOL_IDS) expect(map.tools[id].length, id).toBeGreaterThan(0);
  });

  it('is a sample that carries the private marker', () => {
    const form = sample();
    expect(form.status).toBe('sample');
    expect(form.private_marker).toBe(FORM_PRIVATE_MARKER);
  });
});

describe('checkForm', () => {
  it('rejects a duplicate prompt id', () => {
    const form = sample();
    form.stages[1].prompts[0].prompt_id = form.stages[0].prompts[0].prompt_id;
    expect(checkForm(form).join('\n')).toMatch(/duplicate prompt id/);
  });

  it('rejects a reveal on the first stage', () => {
    const form = sample();
    form.stages[0].reveal = 'Nothing should be revealed before the learner starts.';
    expect(checkForm(form).join('\n')).toMatch(/first stage cannot have a reveal/);
  });

  it('rejects a reveal whose previous stage does not lock', () => {
    const form = sample();
    form.stages[0].lock_on_advance = false;
    expect(checkForm(form).join('\n')).toMatch(/requires the previous stage to lock/);
  });

  it('rejects parts out of order', () => {
    const form = sample();
    form.stages[0].part = 'B';
    form.stages[1].part = 'A';
    expect(checkForm(form).join('\n')).toMatch(/parts must run A, B, C in order/);
  });

  it('rejects a form that leaves a principle uncovered', () => {
    const form = sample();
    for (const stage of form.stages) for (const p of stage.prompts) p.principle_ids = p.principle_ids.filter((id) => id !== 'patience');
    expect(checkForm(form).join('\n')).toMatch(/principle patience is covered by no prompt/);
  });

  it('rejects a required prompt with no reference response', () => {
    const form = sample();
    const id = form.stages[0].prompts[0].prompt_id;
    form.reference_responses = form.reference_responses.filter((r) => r.prompt_id !== id);
    expect(checkForm(form).join('\n')).toMatch(new RegExp(`prompt ${id}: a required prompt needs a reference response`));
  });

  it('rejects an em dash anywhere a learner or the grader might read it', () => {
    const form = sample();
    form.reference_responses[0].text = 'A dash — in a reference response.';
    expect(checkForm(form).join('\n')).toMatch(/reference response .*: no em dashes/);
  });

  it('rejects a lesson id that is not a lesson id', () => {
    const form = sample();
    form.lesson_ids.push('m01');
    expect(checkForm(form).join('\n')).toMatch(/lesson id m01: not a lesson id/);
  });
});

describe('snapshots', () => {
  it('the public snapshot carries stages and prompts only', () => {
    const snap = publicSnapshot(sample());
    expect(snap.stage_count).toBe(3);
    expect(Object.keys(snap).sort()).toEqual(['form_id', 'stage_count', 'stages', 'version']);
    for (const stage of snap.stages) {
      expect(Object.keys(stage).sort()).toEqual(['id', 'intro', 'lock_on_advance', 'part', 'prompts', 'reveal', 'title']);
      for (const p of stage.prompts) expect(Object.keys(p).sort()).toEqual(['max_chars', 'min_chars', 'prompt_id', 'required', 'text']);
    }
    expect(snap.stages[0].reveal).toBeNull();
    expect(snap.stages[1].reveal).toBeTruthy();
  });

  it('the private snapshot carries what only the grader needs', () => {
    const snap = privateSnapshot(sample(), {
      allowedLessons: [{ id: 'v04', title: 'Introspection' }],
      sourcePackSha256: 'a'.repeat(64),
      rubricVersion: '1',
      promptVersion: '1',
    });
    expect(snap.reference_responses.length).toBeGreaterThan(0);
    expect(snap.allowed_lessons).toEqual([{ id: 'v04', title: 'Introspection' }]);
    expect(snap.coverage.tools['one-on-ones'].length).toBeGreaterThan(0);
    expect(snap.source_pack_sha256).toBe('a'.repeat(64));
    expect(snap).not.toHaveProperty('stages');
  });
});
