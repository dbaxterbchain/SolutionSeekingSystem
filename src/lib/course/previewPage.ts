import type { CourseStatus } from './status';
import type { LessonStatus } from './types';
import { embedUrl, posterUrl } from './streamUrls';

interface PreviewLesson {
  status: LessonStatus;
  streamUid: string | null;
  videoPlaceholder: boolean;
}

/** The free page exists only when the course is public and the free lesson is published. */
export const previewPageAvailable = (status: CourseStatus, lesson: PreviewLesson): boolean =>
  status !== 'hidden' && lesson.status === 'published';

/**
 * The free lesson plays unsigned: the video's own uid takes the token's place
 * in the same URLs the signed player uses. The stand-in clip is signed, so a
 * preview lesson still on it has no player and the page says so.
 */
export const previewPlayback = (
  lesson: PreviewLesson,
  customerCode: string
): { embedUrl: string; posterUrl: string } | null =>
  lesson.streamUid && !lesson.videoPlaceholder
    ? { embedUrl: embedUrl(customerCode, lesson.streamUid), posterUrl: posterUrl(customerCode, lesson.streamUid) }
    : null;
