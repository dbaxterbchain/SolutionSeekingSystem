import type { APIRoute } from 'astro';
import { privateJson } from '../../../lib/server/auth';
import { requireEnrolled } from '../../../lib/server/course/enrollment';
import { getLessonForLearner } from '../../../lib/server/course/content';
import { loadProgress, saveProgress } from '../../../lib/server/course/progress';
import { computeCourseState } from '../../../lib/server/course/state';
import { LESSON_ID_RE } from '../../../lib/course/ids';
import { isLearnerVisible } from '../../../lib/course/visibility';
import { PROGRESS_ACTIONS, applyAction, newProgressRow, progressView } from '../../../lib/course/progressRules';

export const prerender = false;

/**
 * One learner action on one published lesson. The rules decide; this route
 * loads, applies, persists, and reports what changed. Nothing here resets.
 */
export const POST: APIRoute = async ({ request }) => {
  const auth = await requireEnrolled(request);
  if ('error' in auth) return privateJson({ error: auth.error, reason: auth.reason }, auth.status);

  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const lessonId = typeof body.lesson_id === 'string' ? body.lesson_id : '';
  if (!LESSON_ID_RE.test(lessonId)) return privateJson({ error: 'bad_request', field: 'lesson_id' }, 400);
  const action = typeof body.action === 'string' ? body.action : '';
  if (!(PROGRESS_ACTIONS as readonly string[]).includes(action)) {
    return privateJson({ error: 'bad_request', field: 'action' }, 400);
  }

  // Learners act on published lessons only; an admin preview reads but never writes.
  const found = await getLessonForLearner(lessonId, false);
  if (!found) return privateJson({ error: 'not_found' }, 404);
  const { lesson, next } = found;

  try {
    const now = new Date();
    const before = (await loadProgress(auth.user.id, lessonId)) ?? newProgressRow(lessonId, lesson.contentVersion, now);
    const result = applyAction(before, lesson.kind, lesson.sections.exercise.trim() !== '', action, body, now);
    if (!result.ok) return privateJson({ error: result.error, ...(result.extra ?? {}) }, result.status);

    const row = result.changed ? await saveProgress(auth.user.id, result.row) : before;

    // The database keeps the stored response when a concurrent save moved the
    // revision first (see course_progress_monotone). If what came back is not
    // what this save wrote, the learner has to choose, exactly as for a stale
    // expected_revision.
    if (action === 'save_response' && row.response_text !== result.row.response_text) {
      return privateJson(
        { error: 'revision_conflict', server: { text: row.response_text, revision: row.revision } },
        409
      );
    }

    const lessonCompleted = !before.completed_at && Boolean(row.completed_at);

    let moduleCompleted = false;
    if (lessonCompleted) {
      const state = await computeCourseState(auth.user.id);
      moduleCompleted = Boolean(state.modules[lesson.module]?.complete);
    }

    return privateJson({
      progress: progressView(row),
      lesson_completed: lessonCompleted,
      module_completed: moduleCompleted,
      next_lesson_id: next && isLearnerVisible(next) ? next.id : null,
      ...(result.reveal ? { model_response: lesson.sections.modelResponse } : {}),
    });
  } catch (err) {
    console.error('course progress failed', err);
    return privateJson({ error: 'progress_unavailable' }, 503);
  }
};
