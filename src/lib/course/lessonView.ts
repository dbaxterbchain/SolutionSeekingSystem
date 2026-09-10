import type { LessonSections } from './lessonSections';
import type { LessonStatus } from './types';
import { isVisibleTo } from './visibility';

/** The pure pieces of the lesson payload, so the split "what a learner may see" is testable. */

export interface LearnerSections {
  outcome: string;
  key_points: string;
  exercise: string;
  self_review: string;
  transcript: string;
}

/** Everything except the model response, which only the reveal action returns. */
export const learnerSections = (s: LessonSections): LearnerSections => ({
  outcome: s.outcome,
  key_points: s.keyPoints,
  exercise: s.exercise,
  self_review: s.selfReview,
  transcript: s.transcript,
});

/** The video to play: the lesson's own, else the stand-in clip for placeholder lessons, else none. */
export const videoUidFor = (
  lesson: { streamUid: string | null; videoPlaceholder: boolean },
  placeholderUid: string | null
): string | null => lesson.streamUid ?? (lesson.videoPlaceholder ? placeholderUid : null);

export interface Neighbour {
  id: string;
  title: string;
  available: boolean;
}

/** A prev or next link. Unavailable lessons are named so the island can say "coming soon". */
export const neighbour = (
  lesson: { id: string; title: string; status: LessonStatus } | undefined,
  adminPreview: boolean
): Neighbour | null =>
  lesson ? { id: lesson.id, title: lesson.title, available: isVisibleTo(lesson, adminPreview) } : null;
