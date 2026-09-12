import type { LessonStatus } from './types';
import type { Catalog } from './validate';

/**
 * The only course shape a prerendered shell may pass to a React island. It is
 * public metadata (the sales page lists the same titles) and structurally
 * cannot carry check answers, lesson bodies, or stream ids.
 */
export interface PublicCurriculumLesson {
  id: string;
  title: string;
  order: number;
  seq: number;
  status: LessonStatus;
  durationMin: number;
}

export interface PublicCurriculumModule {
  id: string;
  order: number;
  title: string;
  summary: string;
  minutes: number;
  lessons: PublicCurriculumLesson[];
}

export interface PublicCurriculum {
  modules: PublicCurriculumModule[];
  totalLessons: number;
  totalMinutes: number;
}

export function publicCurriculum(catalog: Catalog): PublicCurriculum {
  const modules = catalog.modules.map((m) => ({
    id: m.id,
    order: m.order,
    title: m.title,
    summary: m.summary,
    minutes: m.minutes,
    lessons: m.lessonIds.map((id) => {
      const l = catalog.byId[id];
      return {
        id: l.id,
        title: l.title,
        order: l.order,
        seq: l.seq,
        status: l.status,
        durationMin: l.durationMin,
      };
    }),
  }));
  return {
    modules,
    totalLessons: catalog.lessons.length,
    totalMinutes: modules.reduce((sum, m) => sum + m.minutes, 0),
  };
}

/** Modules 1 to 8 carry a check; the module holding the orientation lesson does not. */
export const moduleHasCheck = (module: { lessons: { id: string }[] }, orientationLessonId: string): boolean =>
  !module.lessons.some((l) => l.id === orientationLessonId);
