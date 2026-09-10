import type { LessonKind } from './types';

/**
 * The rules of lesson progress, with no I/O. POST /api/course/progress loads a
 * row, applies one action here, and persists the result; the database trigger
 * refuses any regression the rules might miss. Every decision that decides
 * whether a lesson is complete lives in this file.
 */

export type PracticeState = 'none' | 'in_site' | 'offline';

export interface ProgressRow {
  lesson_id: string;
  content_version: number;
  studied_at: string | null;
  practice_state: PracticeState;
  response_text: string;
  previous_response_text: string | null;
  model_revealed_at: string | null;
  acknowledged_at: string | null;
  completed_at: string | null;
  revision: number;
  first_opened_at: string;
  last_opened_at: string;
}

/** What the browser is told. Timestamps become booleans except the two it renders. */
export interface ProgressView {
  lesson_id: string;
  content_version: number;
  studied: boolean;
  practice_state: PracticeState;
  response_text: string;
  previous_response_text: string | null;
  revision: number;
  model_revealed: boolean;
  acknowledged: boolean;
  completed: boolean;
  completed_at: string | null;
  last_opened_at: string;
}

export const PROGRESS_ACTIONS = [
  'open',
  'studied',
  'save_response',
  'practiced_offline',
  'reveal_model',
  'acknowledge',
  'complete',
] as const;
export type ProgressAction = (typeof PROGRESS_ACTIONS)[number];

/** Matches the check constraint on course_progress.response_text. */
export const RESPONSE_MAX = 20000;

export type MissingStep = 'studied' | 'practice' | 'model' | 'acknowledge' | 'response';

export type ActionResult =
  | { ok: true; row: ProgressRow; changed: boolean; reveal?: boolean }
  | { ok: false; status: 400 | 409; error: string; extra?: Record<string, unknown> };

export function newProgressRow(lessonId: string, contentVersion: number, now: Date): ProgressRow {
  const at = now.toISOString();
  return {
    lesson_id: lessonId,
    content_version: contentVersion,
    studied_at: null,
    practice_state: 'none',
    response_text: '',
    previous_response_text: null,
    model_revealed_at: null,
    acknowledged_at: null,
    completed_at: null,
    revision: 0,
    first_opened_at: at,
    last_opened_at: at,
  };
}

/** An attempt at the exercise: something typed, or the offline confirmation. */
export const hasPractice = (row: ProgressRow): boolean =>
  row.practice_state !== 'none' || row.response_text.trim() !== '';

/** What still stands between this row and completion, in the order the lesson presents them. */
export function missingForComplete(row: ProgressRow, kind: LessonKind): MissingStep[] {
  const missing: MissingStep[] = [];
  if (!row.studied_at) missing.push('studied');
  if (kind === 'standard') {
    if (!hasPractice(row)) missing.push('practice');
    if (!row.model_revealed_at) missing.push('model');
  }
  if (kind === 'plan' && row.response_text.trim() === '') missing.push('response');
  if (!row.acknowledged_at) missing.push('acknowledge');
  return missing;
}

export const lessonComplete = (row: ProgressRow, kind: LessonKind): boolean =>
  missingForComplete(row, kind).length === 0;

const fail = (status: 400 | 409, error: string, extra?: Record<string, unknown>): ActionResult => ({
  ok: false,
  status,
  error,
  ...(extra ? { extra } : {}),
});

/**
 * Apply one learner action. `hasExercise` comes from the lesson content (an
 * empty Exercise section means nothing to practice). Timestamps are set once
 * and never cleared; `revision` moves only on save_response.
 */
export function applyAction(
  row: ProgressRow,
  kind: LessonKind,
  hasExercise: boolean,
  action: string,
  input: Record<string, unknown>,
  now: Date
): ActionResult {
  const at = now.toISOString();
  const next: ProgressRow = { ...row };

  switch (action) {
    case 'open':
      next.last_opened_at = at;
      return { ok: true, row: next, changed: true };

    case 'studied':
      if (row.studied_at) return { ok: true, row, changed: false };
      next.studied_at = at;
      return { ok: true, row: next, changed: true };

    case 'save_response': {
      if (!hasExercise) return fail(400, 'no_exercise');
      const text = input.text;
      if (typeof text !== 'string') return fail(400, 'bad_request', { field: 'text' });
      if (text.length > RESPONSE_MAX) return fail(400, 'too_long', { max: RESPONSE_MAX });
      const expected = input.expected_revision;
      if (typeof expected !== 'number' || !Number.isInteger(expected)) {
        return fail(400, 'bad_request', { field: 'expected_revision' });
      }
      if (expected !== row.revision) {
        return fail(409, 'revision_conflict', { server: { text: row.response_text, revision: row.revision } });
      }
      if (input.keep_previous === true) next.previous_response_text = row.response_text;
      next.response_text = text;
      next.revision = row.revision + 1;
      if (text.trim() !== '') next.practice_state = 'in_site';
      return { ok: true, row: next, changed: true };
    }

    case 'practiced_offline':
      if (!hasExercise) return fail(400, 'no_exercise');
      if (row.practice_state !== 'none') return { ok: true, row, changed: false };
      next.practice_state = 'offline';
      return { ok: true, row: next, changed: true };

    case 'reveal_model':
      if (kind !== 'standard') return fail(400, 'no_model_response');
      if (!hasPractice(row)) return fail(409, 'practice_required');
      if (row.model_revealed_at) return { ok: true, row, changed: false, reveal: true };
      next.model_revealed_at = at;
      return { ok: true, row: next, changed: true, reveal: true };

    case 'acknowledge':
      if (kind === 'standard' && !row.model_revealed_at) return fail(409, 'reveal_required');
      if (kind !== 'standard' && !row.studied_at) return fail(409, 'studied_required');
      if (row.acknowledged_at) return { ok: true, row, changed: false };
      next.acknowledged_at = at;
      return { ok: true, row: next, changed: true };

    case 'complete': {
      if (row.completed_at) return { ok: true, row, changed: false };
      const missing = missingForComplete(row, kind);
      if (missing.length > 0) return fail(409, 'incomplete', { missing });
      next.completed_at = at;
      return { ok: true, row: next, changed: true };
    }

    default:
      return fail(400, 'bad_request', { field: 'action' });
  }
}

export function progressView(row: ProgressRow): ProgressView {
  return {
    lesson_id: row.lesson_id,
    content_version: row.content_version,
    studied: Boolean(row.studied_at),
    practice_state: row.practice_state,
    response_text: row.response_text,
    previous_response_text: row.previous_response_text,
    revision: row.revision,
    model_revealed: Boolean(row.model_revealed_at),
    acknowledged: Boolean(row.acknowledged_at),
    completed: Boolean(row.completed_at),
    completed_at: row.completed_at,
    last_opened_at: row.last_opened_at,
  };
}
