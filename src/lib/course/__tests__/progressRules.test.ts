import { describe, expect, it } from 'vitest';
import {
  PROGRESS_ACTIONS,
  RESPONSE_MAX,
  applyAction,
  hasPractice,
  missingForComplete,
  newProgressRow,
  progressView,
  type ProgressRow,
} from '../progressRules';

const T0 = new Date('2026-09-10T10:00:00Z');
const T1 = new Date('2026-09-10T10:05:00Z');
const T2 = new Date('2026-09-10T10:10:00Z');

const fresh = () => newProgressRow('v04', 1, T0);

/** Run a sequence of actions and return the final row. */
function run(kind: 'standard' | 'orientation' | 'plan', steps: Array<[string, Record<string, unknown>?]>, hasExercise = true): ProgressRow {
  let row = fresh();
  for (const [action, input] of steps) {
    const result = applyAction(row, kind, hasExercise, action, input ?? {}, T1);
    if (!result.ok) throw new Error(`${action} failed: ${result.error}`);
    row = result.row;
  }
  return row;
}

describe('newProgressRow', () => {
  it('starts empty with the content version and both opened timestamps', () => {
    expect(fresh()).toEqual({
      lesson_id: 'v04', content_version: 1, studied_at: null, practice_state: 'none', response_text: '',
      previous_response_text: null, model_revealed_at: null, acknowledged_at: null, completed_at: null,
      revision: 0, first_opened_at: T0.toISOString(), last_opened_at: T0.toISOString(),
    });
  });
});

describe('open and studied', () => {
  it('open moves last_opened_at only', () => {
    const r = applyAction(fresh(), 'standard', true, 'open', {}, T1);
    expect(r.ok && r.row.last_opened_at).toBe(T1.toISOString());
    expect(r.ok && r.row.first_opened_at).toBe(T0.toISOString());
    expect(r.ok && r.row.revision).toBe(0);
  });
  it('studied is recorded once and never moves', () => {
    const once = run('standard', [['studied']]);
    expect(once.studied_at).toBe(T1.toISOString());
    const again = applyAction(once, 'standard', true, 'studied', {}, T2);
    expect(again.ok && again.row.studied_at).toBe(T1.toISOString());
    expect(again.ok).toBe(true);
    expect(again.ok && again.changed === false).toBe(true);
  });
});

describe('save_response', () => {
  it('is a compare-and-set on the revision and marks in-site practice', () => {
    const r = applyAction(fresh(), 'standard', true, 'save_response', { text: 'my answer', expected_revision: 0 }, T1);
    expect(r.ok && r.row).toMatchObject({ response_text: 'my answer', revision: 1, practice_state: 'in_site', previous_response_text: null });
  });
  it('rejects a stale revision with the server copy', () => {
    const row = run('standard', [['save_response', { text: 'first', expected_revision: 0 }]]);
    const r = applyAction(row, 'standard', true, 'save_response', { text: 'second tab', expected_revision: 0 }, T2);
    expect(r).toMatchObject({ ok: false, status: 409, error: 'revision_conflict', extra: { server: { text: 'first', revision: 1 } } });
  });
  it('keeps the server text as the previous version when asked', () => {
    const row = run('standard', [['save_response', { text: 'first', expected_revision: 0 }]]);
    const r = applyAction(row, 'standard', true, 'save_response', { text: 'mine', expected_revision: 1, keep_previous: true }, T2);
    expect(r.ok && r.row).toMatchObject({ response_text: 'mine', previous_response_text: 'first', revision: 2 });
  });
  it('rejects a missing text, a non-integer revision, and an over-long response', () => {
    expect(applyAction(fresh(), 'standard', true, 'save_response', { expected_revision: 0 }, T1)).toMatchObject({ ok: false, status: 400, error: 'bad_request' });
    expect(applyAction(fresh(), 'standard', true, 'save_response', { text: 'x', expected_revision: '0' }, T1)).toMatchObject({ ok: false, status: 400, error: 'bad_request' });
    expect(applyAction(fresh(), 'standard', true, 'save_response', { text: 'x'.repeat(RESPONSE_MAX + 1), expected_revision: 0 }, T1)).toMatchObject({ ok: false, status: 400, error: 'too_long' });
  });
  it('a blank save keeps the practice state and still bumps the revision', () => {
    const row = run('standard', [['save_response', { text: 'draft', expected_revision: 0 }]]);
    const r = applyAction(row, 'standard', true, 'save_response', { text: '   ', expected_revision: 1 }, T2);
    expect(r.ok && r.row).toMatchObject({ response_text: '   ', practice_state: 'in_site', revision: 2 });
  });
  it('refuses a response on a lesson without an exercise', () => {
    expect(applyAction(fresh(), 'orientation', false, 'save_response', { text: 'x', expected_revision: 0 }, T1)).toMatchObject({ ok: false, status: 400, error: 'no_exercise' });
  });
  it('keep_previous does not store an empty previous version', () => {
    const r = applyAction(fresh(), 'standard', true, 'save_response', { text: 'first', expected_revision: 0, keep_previous: true }, T1);
    expect(r.ok && r.row.previous_response_text).toBeNull();
  });
});

describe('practiced_offline', () => {
  it('moves none to offline and leaves in_site alone', () => {
    expect(run('standard', [['practiced_offline']]).practice_state).toBe('offline');
    expect(run('standard', [['save_response', { text: 'x', expected_revision: 0 }], ['practiced_offline']]).practice_state).toBe('in_site');
  });
  it('is refused without an exercise', () => {
    expect(applyAction(fresh(), 'orientation', false, 'practiced_offline', {}, T1)).toMatchObject({ ok: false, status: 400, error: 'no_exercise' });
  });
});

describe('reveal_model and acknowledge', () => {
  it('reveal needs an attempt first and then returns the reveal flag', () => {
    expect(applyAction(fresh(), 'standard', true, 'reveal_model', {}, T1)).toMatchObject({ ok: false, status: 409, error: 'practice_required' });
    const r = applyAction(run('standard', [['practiced_offline']]), 'standard', true, 'reveal_model', {}, T2);
    expect(r.ok && r.reveal).toBe(true);
    expect(r.ok && r.row.model_revealed_at).toBe(T2.toISOString());
  });
  it('a typed response also counts as an attempt', () => {
    const r = applyAction(run('standard', [['save_response', { text: 'my go', expected_revision: 0 }]]), 'standard', true, 'reveal_model', {}, T2);
    expect(r.ok).toBe(true);
  });
  it('orientation and plan lessons have no model response', () => {
    expect(applyAction(fresh(), 'orientation', false, 'reveal_model', {}, T1)).toMatchObject({ ok: false, status: 400, error: 'no_model_response' });
    expect(applyAction(fresh(), 'plan', true, 'reveal_model', {}, T1)).toMatchObject({ ok: false, status: 400, error: 'no_model_response' });
  });
  it('reveal is idempotent and keeps returning the reveal flag', () => {
    const revealed = run('standard', [['practiced_offline'], ['reveal_model']]);
    const again = applyAction(revealed, 'standard', true, 'reveal_model', {}, T2);
    expect(again.ok).toBe(true);
    expect(again.ok && again.reveal).toBe(true);
    expect(again.ok && again.changed).toBe(false);
  });
  it('acknowledge needs the reveal on standard lessons and studied elsewhere', () => {
    expect(applyAction(fresh(), 'standard', true, 'acknowledge', {}, T1)).toMatchObject({ ok: false, status: 409, error: 'reveal_required' });
    expect(applyAction(fresh(), 'orientation', false, 'acknowledge', {}, T1)).toMatchObject({ ok: false, status: 409, error: 'studied_required' });
    expect(run('orientation', [['studied'], ['acknowledge']], false).acknowledged_at).toBe(T1.toISOString());
  });
});

describe('complete', () => {
  it('names what is missing on a standard lesson', () => {
    expect(missingForComplete(fresh(), 'standard')).toEqual(['studied', 'practice', 'model', 'acknowledge']);
    const r = applyAction(fresh(), 'standard', true, 'complete', {}, T1);
    expect(r).toMatchObject({ ok: false, status: 409, error: 'incomplete', extra: { missing: ['studied', 'practice', 'model', 'acknowledge'] } });
  });
  it('completes a standard lesson after the full path', () => {
    const row = run('standard', [['studied'], ['save_response', { text: 'answer', expected_revision: 0 }], ['reveal_model'], ['acknowledge'], ['complete']]);
    expect(row.completed_at).toBe(T1.toISOString());
  });
  it('orientation needs studied and acknowledge only', () => {
    expect(missingForComplete(fresh(), 'orientation')).toEqual(['studied', 'acknowledge']);
  });
  it('plan needs studied, a written response and acknowledge', () => {
    expect(missingForComplete(fresh(), 'plan')).toEqual(['studied', 'response', 'acknowledge']);
    const row = run('plan', [
      ['studied'],
      ['save_response', { text: 'My continuing practice, week by week.', expected_revision: 0 }],
      ['acknowledge'],
      ['complete'],
    ]);
    expect(missingForComplete(row, 'plan')).toEqual([]);
    expect(row.completed_at).toBe(T1.toISOString());
  });
  it('completing twice keeps the first timestamp and reports no change', () => {
    const row = run('orientation', [['studied'], ['acknowledge'], ['complete']], false);
    const again = applyAction(row, 'orientation', false, 'complete', {}, T2);
    expect(again.ok && again.row.completed_at).toBe(T1.toISOString());
    expect(again.ok).toBe(true);
    expect(again.ok && again.changed === false).toBe(true);
  });
});

describe('unknown actions and the view', () => {
  it('rejects an unknown action', () => {
    expect(applyAction(fresh(), 'standard', true, 'delete', {}, T1)).toMatchObject({ ok: false, status: 400, error: 'bad_request', extra: { field: 'action' } });
  });
  it('every listed action has a branch', () => {
    for (const action of PROGRESS_ACTIONS) {
      const r = applyAction(fresh(), 'standard', true, action, { text: 'x', expected_revision: 0 }, T1);
      expect(r.ok || r.error !== 'bad_request' || r.extra?.field !== 'action').toBe(true);
    }
  });
  it('the view flattens timestamps to booleans and keeps the text', () => {
    expect(progressView(run('standard', [['studied'], ['save_response', { text: 'a', expected_revision: 0 }]]))).toEqual({
      lesson_id: 'v04', content_version: 1, studied: true, practice_state: 'in_site', response_text: 'a',
      previous_response_text: null, revision: 1, model_revealed: false, acknowledged: false, completed: false,
      completed_at: null, last_opened_at: T0.toISOString(),
    });
    expect(hasPractice(fresh())).toBe(false);
  });
});
