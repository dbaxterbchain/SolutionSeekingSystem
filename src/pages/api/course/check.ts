import type { APIRoute } from 'astro';
import { privateJson } from '../../../lib/server/auth';
import { requireEnrolled } from '../../../lib/server/course/enrollment';
import { getModuleForLearner } from '../../../lib/server/course/content';
import { loadCheckHistory, recordCheckAttempt } from '../../../lib/server/course/progress';
import { computeCourseState } from '../../../lib/server/course/state';
import { CHECK_MODULE_ID_RE, findCheck, gradeCheck, parseCheckAnswer, publicChecks } from '../../../lib/course/checkRules';

export const prerender = false;

/**
 * A module's checks for an enrolled learner. GET serves the questions and
 * the learner's standing on each; POST records one answer and returns the
 * verdict with the author's explanation. The key never leaves this file.
 */

/** What the island sees of one check: the question, the choices, and how the learner stands. */
interface CheckStanding {
  id: string;
  question: string;
  choices: [string, string];
  attempts: number;
  answered_correctly: boolean;
  last_choice: 1 | 2 | null;
}

async function standing(userId: string, moduleId: string, checks: ReturnType<typeof publicChecks>) {
  const history = await loadCheckHistory(userId, moduleId);
  return checks.map<CheckStanding>((c) => {
    const rows = history.filter((h) => h.check_id === c.id);
    return {
      ...c,
      attempts: rows.length,
      answered_correctly: rows.some((r) => r.correct),
      last_choice: rows[0]?.choice ?? null,
    };
  });
}

export const GET: APIRoute = async ({ request }) => {
  const moduleId = new URL(request.url).searchParams.get('module_id') ?? '';
  if (!CHECK_MODULE_ID_RE.test(moduleId)) return privateJson({ error: 'bad_request', field: 'module_id' }, 400);
  const auth = await requireEnrolled(request);
  if ('error' in auth) return privateJson({ error: auth.error, reason: auth.reason }, auth.status);
  const found = await getModuleForLearner(moduleId);
  if (!found) return privateJson({ error: 'not_found' }, 404);
  try {
    const [checks, state] = await Promise.all([
      standing(auth.user.id, moduleId, publicChecks(moduleId, found.module.checks)),
      computeCourseState(auth.user.id),
    ]);
    const m = state.modules[moduleId];
    return privateJson({
      module: { id: found.module.id, title: found.module.title, order: found.module.order },
      checks,
      lessons_complete: m.lessons_published > 0 && m.lessons_completed === m.lessons_published,
      module_complete: m.complete,
    });
  } catch (err) {
    console.error('course check read failed', err);
    return privateJson({ error: 'progress_unavailable' }, 503);
  }
};

export const POST: APIRoute = async ({ request }) => {
  const parsed = parseCheckAnswer(await request.json().catch(() => null));
  if (!parsed.ok) return privateJson({ error: 'bad_request', field: parsed.field }, 400);
  const auth = await requireEnrolled(request);
  if ('error' in auth) return privateJson({ error: auth.error, reason: auth.reason }, auth.status);
  const { module_id, check_id, choice } = parsed.value;
  const found = await getModuleForLearner(module_id);
  const hit = found ? findCheck(module_id, found.module.checks, check_id) : null;
  if (!found || !hit) return privateJson({ error: 'not_found' }, 404);
  const verdict = gradeCheck(hit.check, choice);
  try {
    await recordCheckAttempt(auth.user.id, module_id, check_id, choice, verdict.correct);
    const [history, state] = await Promise.all([
      loadCheckHistory(auth.user.id, module_id),
      computeCourseState(auth.user.id),
    ]);
    return privateJson({
      correct: verdict.correct,
      explanation: verdict.explanation,
      check_complete: verdict.correct || history.some((r) => r.check_id === check_id && r.correct),
      module_complete: state.modules[module_id].complete,
    });
  } catch (err) {
    console.error('course check write failed', err);
    return privateJson({ error: 'progress_unavailable' }, 503);
  }
};
