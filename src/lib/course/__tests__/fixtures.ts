import { lessonId, moduleId, worksheetIdFor } from '../ids';
import type { CatalogInput } from '../validate';
import type { LessonInput, ModuleCheck, ModuleInput, WorksheetInput } from '../types';

/** Lessons per module, from the course plan (3+7+9+6+3+5+2+3+2 = 40). */
export const MODULE_SIZES = [3, 7, 9, 6, 3, 5, 2, 3, 2];

export const FULL_BODY = [
  '## Outcome',
  'Outcome text.',
  '',
  '## Key points',
  '- One point.',
  '',
  '## Exercise',
  'Try this.',
  '',
  '## Model response',
  'A model.',
  '',
  '## Self-review',
  '- Checked.',
  '',
  '## Transcript',
  'Spoken words.',
  '',
].join('\n');

export const EMPTY_BODY = [
  '## Outcome',
  '## Key points',
  '## Exercise',
  '## Model response',
  '## Self-review',
  '## Transcript',
  '',
].join('\n\n');

export const check = (): ModuleCheck => ({
  question: 'Which is it?',
  choices: ['This one.', 'That one.'],
  answer: 1,
  explanation: 'Because this one.',
});

export const PUBLISHED_FIELDS: Partial<LessonInput> = {
  status: 'published',
  streamUid: '5d5bc37ffcf54c9b82e996823bffbb81',
  durationMin: 8,
  approvals: { copy: '2026-09-12 DB', edit: '2026-09-20 BC', captions: '2026-09-22 DB' },
  body: FULL_BODY,
};

/** A valid 40-lesson, 9-module draft catalog. Tests mutate one thing at a time. */
export function buildInput(overrides: Partial<CatalogInput> = {}): CatalogInput {
  const lessons: LessonInput[] = [];
  const modules: ModuleInput[] = [];
  const worksheets: WorksheetInput[] = [];
  let n = 0;
  MODULE_SIZES.forEach((size, mi) => {
    const mid = moduleId(mi + 1);
    modules.push({
      id: mid,
      title: `Module ${mi + 1}`,
      summary: 'What this module covers.',
      worksheet: worksheetIdFor(mid),
      checks: mi === MODULE_SIZES.length - 1 ? [] : [check(), check()],
    });
    worksheets.push({
      id: worksheetIdFor(mid),
      title: `Worksheet ${mi + 1}`,
      module: mid,
      body: 'Fill this in.',
    });
    for (let j = 0; j < size; j++) {
      n += 1;
      const id = lessonId(n);
      lessons.push({
        id,
        title: `Lesson ${n}`,
        module: mid,
        kind: id === 'v39' ? 'orientation' : id === 'v40' ? 'plan' : 'standard',
        next: n < 40 ? lessonId(n + 1) : undefined,
        worksheet: worksheetIdFor(mid),
        streamUid: null,
        durationMin: 5,
        status: 'draft',
        contentVersion: 1,
        preview: id === 'v05',
        videoPlaceholder: false,
        approvals: {},
        body: EMPTY_BODY,
      });
    }
  });
  return {
    lessons,
    modules,
    worksheets,
    courseStatus: 'hidden',
    plan: { modules: 9, lessons: 40 },
    previewLessonId: 'v05',
    orientationLessonId: 'v39',
    planLessonId: 'v40',
    ...overrides,
  };
}

export function withLesson(
  input: CatalogInput,
  id: string,
  patch: Partial<LessonInput>
): CatalogInput {
  return { ...input, lessons: input.lessons.map((l) => (l.id === id ? { ...l, ...patch } : l)) };
}

export function withModule(
  input: CatalogInput,
  id: string,
  patch: Partial<ModuleInput>
): CatalogInput {
  return { ...input, modules: input.modules.map((m) => (m.id === id ? { ...m, ...patch } : m)) };
}
