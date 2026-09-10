import {
  LESSON_ID_RE,
  WORKSHEET_ID_RE,
  hasBannedCopy,
  lessonId,
  lessonNumber,
  moduleId,
  moduleNumber,
  worksheetIdFor,
} from './ids';
import { parseLessonSections, type LessonSections } from './lessonSections';
import type { CourseStatus } from './status';
import {
  LESSON_STATUSES,
  type LessonInput,
  type LessonKind,
  type LessonStatus,
  type ModuleInput,
  type WorksheetInput,
} from './types';

/**
 * Every cross-file rule for the course content, in one pure function. The
 * catalog module feeds it the collections; the tests feed it fixtures. It
 * throws one Error listing every failure, so an author fixes a batch at once.
 */

export interface CatalogInput {
  lessons: LessonInput[];
  modules: ModuleInput[];
  worksheets: WorksheetInput[];
  courseStatus: CourseStatus;
  plan: { modules: number; lessons: number };
  previewLessonId: string;
  orientationLessonId: string;
  planLessonId: string;
}

export interface CatalogLesson extends LessonInput {
  /** 1-based position in the whole course. */
  seq: number;
  /** 1-based position within its module. */
  order: number;
  moduleOrder: number;
  prevId: string | null;
  nextId: string | null;
  sections: LessonSections;
}

export interface CatalogModule {
  id: string;
  order: number;
  title: string;
  summary: string;
  worksheet: string;
  lessonIds: string[];
  /** Sum of the lessons' durationMin. Derived, never typed. */
  minutes: number;
  checks: ModuleInput['checks'];
}

export interface Catalog {
  modules: CatalogModule[];
  lessons: CatalogLesson[];
  byId: Record<string, CatalogLesson>;
  worksheets: WorksheetInput[];
  /** One line for the build log: the release manifest in miniature. */
  summary: string;
}

const rank = (status: LessonStatus): number => LESSON_STATUSES.indexOf(status);

export function validateCatalog(input: CatalogInput): Catalog {
  const errors: string[] = [];
  const err = (message: string) => errors.push(message);
  const { lessons, modules, worksheets } = input;

  // Ids and counts.
  const expectedLessonIds = Array.from({ length: input.plan.lessons }, (_, i) => lessonId(i + 1));
  const lastLessonId = expectedLessonIds[expectedLessonIds.length - 1];
  const byId = new Map(lessons.map((l) => [l.id, l]));
  for (const id of expectedLessonIds) if (!byId.has(id)) err(`Missing lesson file for ${id}`);
  for (const l of lessons) {
    if (!LESSON_ID_RE.test(l.id) || lessonNumber(l.id) > input.plan.lessons) {
      err(`Unexpected lesson id "${l.id}" (expected v01..${lastLessonId})`);
    }
  }

  const expectedModuleIds = Array.from({ length: input.plan.modules }, (_, i) => moduleId(i + 1));
  const moduleById = new Map(modules.map((m) => [m.id, m]));
  for (const id of expectedModuleIds) if (!moduleById.has(id)) err(`Missing module file for ${id}`);
  for (const m of modules) {
    if (!expectedModuleIds.includes(m.id)) err(`Unexpected module id "${m.id}"`);
  }

  const worksheetById = new Map(worksheets.map((w) => [w.id, w]));
  for (const mid of expectedModuleIds) {
    if (!worksheetById.has(worksheetIdFor(mid))) {
      err(`Missing worksheet file ${worksheetIdFor(mid)} for module ${mid}`);
    }
  }
  for (const w of worksheets) {
    if (!WORKSHEET_ID_RE.test(w.id)) err(`Unexpected worksheet id "${w.id}"`);
    else if (w.module !== w.id.slice(2)) {
      err(`Worksheet ${w.id} must belong to module ${w.id.slice(2)} (module: ${w.module})`);
    }
    if (hasBannedCopy(w.title) || hasBannedCopy(w.body)) {
      err(`Worksheet ${w.id}: no em dashes, en dashes, or {{tokens}}`);
    }
  }

  for (const m of modules) {
    if (!expectedModuleIds.includes(m.id)) continue;
    if (m.worksheet !== worksheetIdFor(m.id)) {
      err(`Module ${m.id}: worksheet must be ${worksheetIdFor(m.id)} (got ${m.worksheet})`);
    }
    const expectedChecks = moduleNumber(m.id) === input.plan.modules ? 0 : 2;
    if (m.checks.length !== expectedChecks) {
      err(`Module ${m.id}: expected ${expectedChecks} checks, found ${m.checks.length}`);
    }
  }

  // The suggested order is a chain of `next` from v01. It must visit every
  // lesson exactly once, in id order, and end at the last lesson.
  const orderedIds: string[] = [];
  {
    const visited = new Set<string>();
    let cursor: string | undefined = 'v01';
    while (cursor) {
      if (visited.has(cursor)) {
        err(`Lesson chain loops back to ${cursor}`);
        break;
      }
      const lesson = byId.get(cursor);
      if (!lesson) {
        err(`Lesson chain points at missing lesson ${cursor}`);
        break;
      }
      visited.add(cursor);
      orderedIds.push(cursor);
      cursor = lesson.next;
    }
    const last = orderedIds[orderedIds.length - 1];
    if (last !== lastLessonId) {
      err(
        orderedIds.length === 0
          ? `Lesson chain must end at ${lastLessonId} (the chain is empty: v01 is missing)`
          : `Lesson chain must end at ${lastLessonId} (ends at ${last})`
      );
    }
    for (const l of lessons) {
      if (!visited.has(l.id)) err(`Lesson ${l.id} is not reachable from v01 via "next"`);
    }
    // Only the first mismatch is reported: one broken link shifts every
    // following position, so reporting all of them just repeats one problem.
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      if (id !== expectedLessonIds[i]) {
        err(`Lesson chain position ${i + 1} should be ${expectedLessonIds[i]} (found ${id})`);
        break;
      }
    }
  }

  // Modules along the chain: ascending, contiguous, non-empty.
  const moduleLessons = new Map<string, string[]>();
  let lastModuleNumber = 0;
  for (const id of orderedIds) {
    const lesson = byId.get(id);
    if (!lesson) continue;
    if (!expectedModuleIds.includes(lesson.module)) {
      err(`Lesson ${id}: unknown module ${lesson.module}`);
      continue;
    }
    const n = moduleNumber(lesson.module);
    if (n < lastModuleNumber) {
      err(
        `Lesson ${id} belongs to ${lesson.module} but follows a lesson from ${moduleId(lastModuleNumber)}; ` +
          'modules must ascend along the chain'
      );
    } else if (n > lastModuleNumber) {
      if (moduleLessons.has(lesson.module)) {
        err(`Module ${lesson.module} appears twice in the chain (its lessons must be contiguous)`);
      }
      lastModuleNumber = n;
    }
    const list = moduleLessons.get(lesson.module) ?? [];
    list.push(id);
    moduleLessons.set(lesson.module, list);
  }
  for (const m of modules) {
    if (expectedModuleIds.includes(m.id) && !moduleLessons.get(m.id)?.length) {
      err(`Module ${m.id} has no lessons`);
    }
  }

  // Per-lesson rules.
  const previews = lessons.filter((l) => l.preview);
  if (previews.length !== 1) {
    err(`Exactly one lesson must have preview: true (found ${previews.length})`);
  } else if (previews[0].id !== input.previewLessonId) {
    err(`The preview lesson must be ${input.previewLessonId} (found ${previews[0].id})`);
  }

  const parsed = new Map<string, LessonSections>();
  for (const l of lessons) {
    const where = `Lesson ${l.id}`;
    const expectedKind: LessonKind =
      l.id === input.orientationLessonId
        ? 'orientation'
        : l.id === input.planLessonId
          ? 'plan'
          : 'standard';
    if (l.kind !== expectedKind) err(`${where}: kind must be "${expectedKind}"`);

    const module = moduleById.get(l.module);
    if (module && l.worksheet !== module.worksheet) {
      err(`${where}: worksheet must be ${module.worksheet} (its module's)`);
    }
    if (hasBannedCopy(l.title) || hasBannedCopy(l.body)) {
      err(`${where}: no em dashes, en dashes, or {{tokens}} in the title or body`);
    }

    const result = parseLessonSections(l.body);
    if (!result.ok) {
      err(`${where}: ${result.error}`);
      continue;
    }
    parsed.set(l.id, result.sections);

    const s = result.sections;
    const r = rank(l.status);
    const need = (condition: boolean, message: string) => {
      if (!condition) err(`${where} (${l.status}): ${message}`);
    };
    if (r >= rank('approved')) {
      need(s.outcome.length > 0, 'Outcome is empty');
      need(s.keyPoints.length > 0, 'Key points is empty');
      if (l.kind !== 'orientation') need(s.exercise.length > 0, 'Exercise is empty');
      if (l.kind === 'standard') {
        need(s.modelResponse.length > 0, 'Model response is empty');
        need(s.selfReview.length > 0, 'Self-review is empty');
      }
      need(Boolean(l.approvals.copy), 'approvals.copy is required');
    }
    if (r >= rank('edited')) {
      need(l.streamUid !== null, 'streamUid is required');
      need(l.durationMin >= 1, 'durationMin must be at least 1');
      if (!l.videoPlaceholder) need(Boolean(l.approvals.edit), 'approvals.edit is required');
    }
    if (r >= rank('captioned') && !l.videoPlaceholder) {
      need(s.transcript.length > 0, 'Transcript is empty');
      need(Boolean(l.approvals.captions), 'approvals.captions is required');
    }
    if (l.videoPlaceholder && input.courseStatus === 'open' && r >= rank('staged')) {
      err(`${where}: a placeholder video cannot ship while the course is open for sale`);
    }
    // The free lesson has to exist before anything is sold. A preview build
    // only shows the course as coming soon, so it may run before V05 is filmed.
    if (l.preview && input.courseStatus === 'open') {
      need(l.status === 'published', 'the preview lesson must be published once the course is open');
      need(
        !l.videoPlaceholder,
        'the preview lesson cannot use a placeholder video once the course is open'
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Course content validation failed (${errors.length}):\n- ${errors.join('\n- ')}`
    );
  }

  // Build the catalog.
  const catalogModules: CatalogModule[] = expectedModuleIds.map((id) => {
    const m = moduleById.get(id)!;
    const ids = moduleLessons.get(id) ?? [];
    return {
      id,
      order: moduleNumber(id),
      title: m.title,
      summary: m.summary,
      worksheet: m.worksheet,
      lessonIds: ids,
      minutes: ids.reduce((sum, lid) => sum + byId.get(lid)!.durationMin, 0),
      checks: m.checks,
    };
  });
  const catalogLessons: CatalogLesson[] = orderedIds.map((id, i) => {
    const l = byId.get(id)!;
    const siblings = moduleLessons.get(l.module) ?? [];
    return {
      ...l,
      seq: i + 1,
      order: siblings.indexOf(id) + 1,
      moduleOrder: moduleNumber(l.module),
      prevId: orderedIds[i - 1] ?? null,
      nextId: orderedIds[i + 1] ?? null,
      sections: parsed.get(id)!,
    };
  });
  const published = catalogLessons.filter((l) => l.status === 'published');
  const staged = catalogLessons.filter((l) => l.status === 'staged');
  const summary =
    `course catalog: ${catalogLessons.length} lessons, ${catalogModules.length} modules, ` +
    `${published.length} published, ${staged.length} staged, ` +
    `${published.reduce((sum, l) => sum + l.durationMin, 0)} minutes published`;

  return {
    modules: catalogModules,
    lessons: catalogLessons,
    byId: Object.fromEntries(catalogLessons.map((l) => [l.id, l])),
    worksheets,
    summary,
  };
}
