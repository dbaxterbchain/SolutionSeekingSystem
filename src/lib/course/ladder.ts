import { LESSON_STATUSES, type LessonStatus } from './types';
import type { CourseStatus } from './status';
import { gatesMissing, type Catalog } from './validate';

export { gatesMissing };

/** The rung above `status`, or null at the top. */
export const nextStatus = (status: LessonStatus): LessonStatus | null =>
  LESSON_STATUSES[LESSON_STATUSES.indexOf(status) + 1] ?? null;

export interface LadderRow {
  id: string;
  seq: number;
  module: string;
  title: string;
  status: LessonStatus;
  next: LessonStatus | null;
  /** What `next` still needs. Empty when the lesson could move up today, or is published. */
  missing: string[];
  videoPlaceholder: boolean;
}

/** One row per lesson in chain order. The catalog is valid by construction, so `missing` is about the next rung only. */
export function ladderReport(catalog: Catalog, courseStatus: CourseStatus): LadderRow[] {
  return catalog.lessons.map((l) => {
    const next = nextStatus(l.status);
    return {
      id: l.id,
      seq: l.seq,
      module: l.module,
      title: l.title,
      status: l.status,
      next,
      missing: next ? gatesMissing(l, next, { courseStatus }) : [],
      videoPlaceholder: l.videoPlaceholder,
    };
  });
}
