import type { APIRoute } from 'astro';
import { privateJson } from '../../../lib/server/auth';
import { requireEnrolled } from '../../../lib/server/course/enrollment';
import { computeCourseState } from '../../../lib/server/course/state';

export const prerender = false;

/** The learner's place in the course: per-lesson flags, module completion and the resume pointer. */
export const GET: APIRoute = async ({ request }) => {
  const auth = await requireEnrolled(request);
  if ('error' in auth) return privateJson({ error: auth.error, reason: auth.reason }, auth.status);
  try {
    return privateJson(await computeCourseState(auth.user.id));
  } catch (err) {
    console.error('course state failed', err);
    return privateJson({ error: 'progress_unavailable' }, 503);
  }
};
