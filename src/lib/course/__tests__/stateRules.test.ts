import { describe, expect, it } from 'vitest';
import { deriveCourseState, type StateInput, type StateLesson, type StateModule } from '../stateRules';
import { newProgressRow, type ProgressRow } from '../progressRules';

const T = (minute: number) => new Date(Date.UTC(2026, 8, 10, 10, minute)).toISOString();

/** Three modules: m01 (v01 v02, two checks), m02 (v03 v04, two checks), m09 (v39 orientation, v40 plan, no checks). */
const lessons: StateLesson[] = [
  { id: 'v01', module: 'm01', kind: 'standard', status: 'published', seq: 1 },
  { id: 'v02', module: 'm01', kind: 'standard', status: 'published', seq: 2 },
  { id: 'v03', module: 'm02', kind: 'standard', status: 'published', seq: 3 },
  { id: 'v04', module: 'm02', kind: 'standard', status: 'draft', seq: 4 },
  { id: 'v39', module: 'm09', kind: 'orientation', status: 'published', seq: 5 },
  { id: 'v40', module: 'm09', kind: 'plan', status: 'published', seq: 6 },
];
const modules: StateModule[] = [
  { id: 'm01', checkIds: ['m01-c1', 'm01-c2'] },
  { id: 'm02', checkIds: ['m02-c1', 'm02-c2'] },
  { id: 'm09', checkIds: [] },
];

function done(id: string, kind: 'standard' | 'orientation' | 'plan', openedMinute: number): ProgressRow {
  const row = newProgressRow(id, 1, new Date(Date.UTC(2026, 8, 10, 10, openedMinute)));
  return {
    ...row,
    studied_at: row.first_opened_at,
    practice_state: kind === 'standard' ? 'in_site' : 'none',
    response_text: kind === 'orientation' ? '' : 'answer',
    model_revealed_at: kind === 'standard' ? row.first_opened_at : null,
    acknowledged_at: row.first_opened_at,
    completed_at: row.first_opened_at,
  };
}

function input(rows: ProgressRow[], attempts: StateInput['attempts'] = []): StateInput {
  return { lessons, modules, rows, attempts, orientationLessonId: 'v39', planLessonId: 'v40', assessmentModuleId: 'm09', assessment: { latestState: null, anySubmitted: false }, certificationVersion: '1' };
}

describe('resume pointer', () => {
  it('starts at the first published lesson', () => {
    expect(deriveCourseState(input([])).resume_lesson_id).toBe('v01');
  });
  it('returns to the most recently opened lesson while it is incomplete', () => {
    const rows = [newProgressRow('v03', 1, new Date(T(5))), newProgressRow('v01', 1, new Date(T(1)))];
    expect(deriveCourseState(input(rows)).resume_lesson_id).toBe('v03');
  });
  it('moves to the first incomplete published lesson after a completed one', () => {
    expect(deriveCourseState(input([done('v01', 'standard', 1)])).resume_lesson_id).toBe('v02');
  });
  it('skips unpublished lessons and wraps to the first incomplete overall', () => {
    const rows = [done('v03', 'standard', 9), done('v39', 'orientation', 8), done('v40', 'plan', 7)];
    expect(deriveCourseState(input(rows)).resume_lesson_id).toBe('v01');
  });
  it('is null when every published lesson is complete', () => {
    const rows = [done('v01', 'standard', 1), done('v02', 'standard', 2), done('v03', 'standard', 3), done('v39', 'orientation', 4), done('v40', 'plan', 5)];
    expect(deriveCourseState(input(rows)).resume_lesson_id).toBeNull();
  });
});

describe('modules', () => {
  it('needs every published lesson complete and every check answered correctly at least once', () => {
    const rows = [done('v01', 'standard', 1), done('v02', 'standard', 2)];
    const noChecks = deriveCourseState(input(rows)).modules.m01;
    expect(noChecks).toEqual({ complete: false, lessons_published: 2, lessons_completed: 2, checks_complete: false });
    const oneRight = deriveCourseState(input(rows, [
      { module_id: 'm01', check_id: 'm01-c1', correct: false },
      { module_id: 'm01', check_id: 'm01-c1', correct: true },
    ])).modules.m01;
    expect(oneRight.checks_complete).toBe(false);
    const bothRight = deriveCourseState(input(rows, [
      { module_id: 'm01', check_id: 'm01-c1', correct: true },
      { module_id: 'm01', check_id: 'm01-c2', correct: true },
    ])).modules.m01;
    expect(bothRight).toMatchObject({ complete: true, checks_complete: true });
  });
  it('counts only published lessons, and a module with none published is not complete', () => {
    const state = deriveCourseState(input([done('v03', 'standard', 1)], [
      { module_id: 'm02', check_id: 'm02-c1', correct: true },
      { module_id: 'm02', check_id: 'm02-c2', correct: true },
    ]));
    expect(state.modules.m02).toMatchObject({ complete: true, lessons_published: 1, lessons_completed: 1 });
    const empty = deriveCourseState({ ...input([]), lessons: lessons.map((l) => (l.module === 'm09' ? { ...l, status: 'draft' as const } : l)) });
    expect(empty.modules.m09.complete).toBe(false);
  });
});

describe('eligibility and completion', () => {
  const allChecks: StateInput['attempts'] = [
    { module_id: 'm01', check_id: 'm01-c1', correct: true }, { module_id: 'm01', check_id: 'm01-c2', correct: true },
    { module_id: 'm02', check_id: 'm02-c1', correct: true }, { module_id: 'm02', check_id: 'm02-c2', correct: true },
  ];
  it('assessment eligibility needs the study modules and the orientation lesson', () => {
    const rows = [done('v01', 'standard', 1), done('v02', 'standard', 2), done('v03', 'standard', 3)];
    expect(deriveCourseState(input(rows, allChecks)).assessment_eligible).toBe(false);
    expect(deriveCourseState(input([...rows, done('v39', 'orientation', 4)], allChecks)).assessment_eligible).toBe(true);
  });
  it('course completion needs everything, the submitted assessment, and the plan lesson', () => {
    const rows = [done('v01', 'standard', 1), done('v02', 'standard', 2), done('v03', 'standard', 3), done('v39', 'orientation', 4), done('v40', 'plan', 5)];
    const notYet = deriveCourseState({ ...input(rows, allChecks), lessons: lessons.filter((l) => l.status === 'published') });
    expect(notYet.plan_complete).toBe(true);
    expect(notYet.course_complete).toBe(false);
    const complete = deriveCourseState({ ...input(rows, allChecks), lessons: lessons.filter((l) => l.status === 'published'), assessment: { latestState: 'passed', anySubmitted: true } });
    expect(complete.course_complete).toBe(true);
  });
  it('a lesson that is not published never counts, even with a complete row', () => {
    const state = deriveCourseState(input([done('v04', 'standard', 1)]));
    expect(state.lessons.v04).toBeUndefined();
    expect(state.certification).toEqual({ version: '1', status: 'none' });
  });
  it('reports the certification status from the latest attempt', () => {
    const rows: ProgressRow[] = [];
    expect(deriveCourseState({ ...input(rows, []), assessment: { latestState: 'grading', anySubmitted: true } }).certification.status).toBe('submitted');
    expect(deriveCourseState({ ...input(rows, []), assessment: { latestState: 'draft', anySubmitted: false } }).certification.status).toBe('in_progress');
  });
  it('reports a lesson row with its flags', () => {
    const row = newProgressRow('v01', 1, new Date(T(1)));
    const state = deriveCourseState(input([{ ...row, studied_at: row.first_opened_at, practice_state: 'in_site', response_text: 'x' }]));
    expect(state.lessons.v01).toEqual({
      completed: false, studied: true, practice_state: 'in_site', model_revealed: false, acknowledged: false, last_opened_at: row.last_opened_at,
    });
  });
});
