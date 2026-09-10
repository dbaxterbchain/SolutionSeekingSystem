import type { APIRoute } from 'astro';
import { privateJson } from '../../../lib/server/auth';
import { requireAdmin } from '../../../lib/server/adminAuth';
import { requireEnrolled } from '../../../lib/server/course/enrollment';
import { getLessonForLearner } from '../../../lib/server/course/content';
import { getPlayback } from '../../../lib/server/course/stream';
import { loadProgress } from '../../../lib/server/course/progress';
import { LESSON_ID_RE } from '../../../lib/course/ids';
import { learnerSections, neighbour, videoUidFor } from '../../../lib/course/lessonView';
import { progressView } from '../../../lib/course/progressRules';
import { COURSE } from '../../../data/course';

export const prerender = false;

/**
 * One lesson for an enrolled learner: the five learner-facing sections, the
 * signed video, neighbours and their progress. The model response is never
 * here; POST /api/course/progress with reveal_model returns it. An admin may
 * add ?preview=1 to open a staged lesson without being enrolled.
 */
export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const id = url.searchParams.get('id') ?? '';
  if (!LESSON_ID_RE.test(id)) return privateJson({ error: 'bad_request', field: 'id' }, 400);

  let userId: string;
  let adminPreview = false;
  if (url.searchParams.get('preview') === '1') {
    const admin = await requireAdmin(request);
    if (!admin) return privateJson({ error: 'forbidden' }, 403);
    userId = admin.id;
    adminPreview = true;
  } else {
    const auth = await requireEnrolled(request);
    if ('error' in auth) return privateJson({ error: auth.error, reason: auth.reason }, auth.status);
    userId = auth.user.id;
  }

  const found = await getLessonForLearner(id, adminPreview);
  if (!found) return privateJson({ error: 'not_found' }, 404);
  const { lesson, module, prev, next } = found;

  const uid = videoUidFor(lesson, COURSE.placeholderStreamUid);
  const [video, row] = await Promise.all([
    uid ? getPlayback(uid) : Promise.resolve(null),
    loadProgress(userId, id).catch((err) => {
      console.error('course lesson progress read failed', err);
      return null;
    }),
  ]);

  return privateJson({
    lesson: {
      id: lesson.id,
      title: lesson.title,
      kind: lesson.kind,
      module_id: module.id,
      module_title: module.title,
      module_order: module.order,
      order: lesson.order,
      content_version: lesson.contentVersion,
      duration_min: lesson.durationMin,
      status: lesson.status,
      video_placeholder: !lesson.streamUid && lesson.videoPlaceholder,
      worksheet_id: lesson.worksheet,
      has_exercise: lesson.sections.exercise.trim() !== '',
      has_model_response: lesson.kind === 'standard' && lesson.sections.modelResponse.trim() !== '',
      sections: learnerSections(lesson.sections),
      prev: neighbour(prev, adminPreview),
      next: neighbour(next, adminPreview),
    },
    video,
    video_unavailable: Boolean(uid) && video === null,
    progress: row ? progressView(row) : null,
  });
};
