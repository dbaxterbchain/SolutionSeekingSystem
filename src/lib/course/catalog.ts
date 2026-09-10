import { getCollection } from 'astro:content';
import { COURSE, COURSE_STATUS } from '../../data/course';
import { assertLaunchSettings } from './copy';
import { validateCatalog, type Catalog } from './validate';

/**
 * The ONLY way a page, endpoint, or OG route reads the course collections.
 * Reads all three, runs every cross-file rule, and throws at build time on a
 * violation (the same way src/lib/demoExcerpt.ts guards the home page quote).
 * Memoised per process; in dev it re-reads so content edits show up.
 */
let cached: Promise<Catalog> | null = null;

export function getCourseCatalog(): Promise<Catalog> {
  if (cached && !import.meta.env.DEV) return cached;
  cached = load().catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}

async function load(): Promise<Catalog> {
  // Runs before any collection is read, so an `open` build fails on a missing
  // launch setting regardless of which pages the build happens to touch.
  assertLaunchSettings();

  const [lessons, modules, worksheets] = await Promise.all([
    getCollection('courseLessons'),
    getCollection('courseModules'),
    getCollection('courseWorksheets'),
  ]);
  const catalog = validateCatalog({
    lessons: lessons.map((entry) => ({ id: entry.id, ...entry.data, body: entry.body ?? '' })),
    modules: modules.map((entry) => ({ id: entry.id, ...entry.data })),
    worksheets: worksheets.map((entry) => ({
      id: entry.id,
      ...entry.data,
      body: entry.body ?? '',
    })),
    courseStatus: COURSE_STATUS,
    plan: COURSE.plan,
    previewLessonId: COURSE.previewLessonId,
    orientationLessonId: COURSE.orientationLessonId,
    planLessonId: COURSE.planLessonId,
  });
  console.log(catalog.summary);
  return catalog;
}
