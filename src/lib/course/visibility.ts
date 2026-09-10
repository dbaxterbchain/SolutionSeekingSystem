import type { LessonStatus } from './types';

type WithStatus = { status: LessonStatus };

/** Enrolled learners see published lessons only. */
export const isLearnerVisible = (lesson: WithStatus): boolean => lesson.status === 'published';

/** Staged and published lessons get a prerendered shell (a URL); drafts have none. */
export const hasShell = (lesson: WithStatus): boolean =>
  lesson.status === 'staged' || lesson.status === 'published';

/** An admin previewing (`?preview=1` + requireAdmin) may also open staged lessons. */
export const isVisibleTo = (lesson: WithStatus, adminPreview: boolean): boolean =>
  isLearnerVisible(lesson) || (adminPreview && lesson.status === 'staged');
