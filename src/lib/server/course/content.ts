import { getCourseCatalog } from '../../course/catalog';
import type { CatalogLesson, CatalogModule } from '../../course/validate';
import type { WorksheetInput } from '../../course/types';
import { isVisibleTo } from '../../course/visibility';

/**
 * Server-side reads of the course catalog for the API routes. Astro-only:
 * the catalog reads astro:content. Checks and answer keys are read here too
 * when Phase 2 adds the module checks.
 */

export interface LessonWithModule {
  lesson: CatalogLesson;
  module: CatalogModule;
  prev: CatalogLesson | undefined;
  next: CatalogLesson | undefined;
}

/** A lesson the caller may see, or null (draft, unknown, or staged without an admin preview). */
export async function getLessonForLearner(id: string, adminPreview: boolean): Promise<LessonWithModule | null> {
  const catalog = await getCourseCatalog();
  const lesson = catalog.byId[id];
  if (!lesson || !isVisibleTo(lesson, adminPreview)) return null;
  return {
    lesson,
    module: catalog.modules[lesson.moduleOrder - 1],
    prev: lesson.prevId ? catalog.byId[lesson.prevId] : undefined,
    next: lesson.nextId ? catalog.byId[lesson.nextId] : undefined,
  };
}

export async function getWorksheet(id: string): Promise<WorksheetInput | null> {
  const catalog = await getCourseCatalog();
  return catalog.worksheets.find((w) => w.id === id) ?? null;
}
