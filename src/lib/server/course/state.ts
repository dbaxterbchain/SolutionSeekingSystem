import { getCourseCatalog } from '../../course/catalog';
import { checkId } from '../../course/ids';
import { deriveCourseState, type CourseStateView } from '../../course/stateRules';
import { COURSE } from '../../../data/course';
import { loadAllProgress, loadCheckAttempts } from './progress';

/** The dashboard state for one learner, derived from the catalog and their rows. Astro-only (reads the catalog). */
export async function computeCourseState(userId: string): Promise<CourseStateView> {
  const [catalog, rows, attempts] = await Promise.all([getCourseCatalog(), loadAllProgress(userId), loadCheckAttempts(userId)]);
  return deriveCourseState({
    lessons: catalog.lessons.map((l) => ({ id: l.id, module: l.module, kind: l.kind, status: l.status, seq: l.seq })),
    modules: catalog.modules.map((m) => ({ id: m.id, checkIds: m.checks.map((_, i) => checkId(m.id, i + 1)) })),
    rows,
    attempts,
    orientationLessonId: COURSE.orientationLessonId,
    planLessonId: COURSE.planLessonId,
    assessmentModuleId: catalog.byId[COURSE.orientationLessonId].module,
    // Sub-plan 1d Task 7 reads the attempts table here; until then no attempt exists.
    assessment: { latestState: null, anySubmitted: false },
    certificationVersion: COURSE.certificationVersion,
  });
}
