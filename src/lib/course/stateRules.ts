import { lessonComplete, type ProgressRow } from './progressRules';
import type { LessonKind, LessonStatus } from './types';

/**
 * The learner's place in the course, derived at read time from at most 40
 * progress rows and the check attempts. Nothing here is stored: there is no
 * course_state table to drift.
 */

export interface StateLesson {
  id: string;
  module: string;
  kind: LessonKind;
  status: LessonStatus;
  /** Position in the chain, 1-based. */
  seq: number;
}

export interface StateModule {
  id: string;
  checkIds: string[];
}

export interface CheckAttemptLite {
  module_id: string;
  check_id: string;
  correct: boolean;
}

export interface StateInput {
  lessons: StateLesson[];
  modules: StateModule[];
  rows: ProgressRow[];
  attempts: CheckAttemptLite[];
  orientationLessonId: string;
  planLessonId: string;
  assessmentSubmitted: boolean;
  certificationVersion: string;
}

export interface LessonStateView {
  completed: boolean;
  studied: boolean;
  practice_state: string;
  model_revealed: boolean;
  acknowledged: boolean;
  last_opened_at: string;
}

export interface ModuleStateView {
  complete: boolean;
  lessons_published: number;
  lessons_completed: number;
  checks_complete: boolean;
}

export interface CourseStateView {
  lessons: Record<string, LessonStateView>;
  modules: Record<string, ModuleStateView>;
  resume_lesson_id: string | null;
  assessment_eligible: boolean;
  plan_complete: boolean;
  course_complete: boolean;
  certification: { version: string; status: 'none' };
}

export function deriveCourseState(input: StateInput): CourseStateView {
  const published = [...input.lessons]
    .filter((l) => l.status === 'published')
    .sort((a, b) => a.seq - b.seq);
  const byId = new Map(published.map((l) => [l.id, l]));
  const rowFor = new Map(input.rows.map((r) => [r.lesson_id, r]));

  const isComplete = (id: string): boolean => {
    const lesson = byId.get(id);
    const row = rowFor.get(id);
    return Boolean(lesson && row && lessonComplete(row, lesson.kind));
  };

  const lessons: Record<string, LessonStateView> = {};
  for (const l of published) {
    const row = rowFor.get(l.id);
    if (!row) continue;
    lessons[l.id] = {
      completed: isComplete(l.id),
      studied: Boolean(row.studied_at),
      practice_state: row.practice_state,
      model_revealed: Boolean(row.model_revealed_at),
      acknowledged: Boolean(row.acknowledged_at),
      last_opened_at: row.last_opened_at,
    };
  }

  const correct = new Set(input.attempts.filter((a) => a.correct).map((a) => `${a.module_id}:${a.check_id}`));
  const modules: Record<string, ModuleStateView> = {};
  for (const m of input.modules) {
    const own = published.filter((l) => l.module === m.id);
    const completed = own.filter((l) => isComplete(l.id)).length;
    const checksComplete = m.checkIds.every((c) => correct.has(`${m.id}:${c}`));
    modules[m.id] = {
      complete: own.length > 0 && completed === own.length && checksComplete,
      lessons_published: own.length,
      lessons_completed: completed,
      checks_complete: checksComplete,
    };
  }

  // Resume: the most recently opened lesson while it is incomplete, else the
  // first incomplete lesson after it, else the first incomplete overall.
  let resume: string | null = null;
  const opened = published
    .filter((l) => rowFor.has(l.id))
    .sort((a, b) => rowFor.get(b.id)!.last_opened_at.localeCompare(rowFor.get(a.id)!.last_opened_at));
  const latest = opened[0];
  if (latest && !isComplete(latest.id)) {
    resume = latest.id;
  } else {
    const after = latest ? published.filter((l) => l.seq > latest.seq) : published;
    resume = after.find((l) => !isComplete(l.id))?.id ?? published.find((l) => !isComplete(l.id))?.id ?? null;
  }

  const studyModules = input.modules.filter((m) => m.id !== 'm09');
  const assessmentEligible =
    studyModules.length > 0 && studyModules.every((m) => modules[m.id]?.complete) && isComplete(input.orientationLessonId);
  const planComplete = isComplete(input.planLessonId);
  const courseComplete =
    published.length === input.lessons.length &&
    published.every((l) => isComplete(l.id)) &&
    input.assessmentSubmitted &&
    planComplete;

  return {
    lessons,
    modules,
    resume_lesson_id: resume,
    assessment_eligible: assessmentEligible,
    plan_complete: planComplete,
    course_complete: courseComplete,
    certification: { version: input.certificationVersion, status: 'none' },
  };
}
