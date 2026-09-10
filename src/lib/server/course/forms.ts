import { getCollection } from 'astro:content';
import type { AssessmentForm } from '../../course/assessmentForm';
import { serverEnv } from '../env';

/**
 * The ONLY importer of the assessmentForms collection; the lint in
 * scripts/check-private-content.mjs fails the build on a second one. Astro
 * only (reads astro:content), so the grading worker never sees a form file:
 * it reads the snapshot frozen into the attempt.
 */
let cached: Promise<AssessmentForm[]> | null = null;

export function loadForms(): Promise<AssessmentForm[]> {
  if (cached && !import.meta.env.DEV) return cached;
  cached = getCollection('assessmentForms')
    .then((entries) => entries.map((entry) => entry.data as unknown as AssessmentForm))
    .catch((err) => {
      cached = null;
      throw err;
    });
  return cached;
}

/** The sample form may be assigned under astro dev and wherever COURSE_SAMPLE_FORMS is exactly "true" (the course-beta context). */
export function sampleFormsAllowed(): boolean {
  return import.meta.env.DEV || serverEnv('COURSE_SAMPLE_FORMS') === 'true';
}
