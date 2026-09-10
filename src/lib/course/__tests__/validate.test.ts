import { describe, expect, it } from 'vitest';
import { validateCatalog } from '../validate';
import { PUBLISHED_FIELDS, buildInput, check, withLesson, withModule } from './fixtures';

describe('validateCatalog', () => {
  it('accepts a valid draft catalog and derives sequence, order and minutes', () => {
    const catalog = validateCatalog(buildInput());
    expect(catalog.lessons).toHaveLength(40);
    expect(catalog.modules).toHaveLength(9);
    expect(catalog.byId.v04).toMatchObject({
      seq: 4,
      order: 1,
      moduleOrder: 2,
      prevId: 'v03',
      nextId: 'v05',
    });
    expect(catalog.byId.v40.nextId).toBeNull();
    expect(catalog.modules[1].lessonIds).toEqual(['v04', 'v05', 'v06', 'v07', 'v08', 'v09', 'v10']);
    expect(catalog.modules[1].minutes).toBe(35);
    expect(catalog.summary).toBe(
      'course catalog: 40 lessons, 9 modules, 0 published, 0 staged, 0 minutes published'
    );
  });

  it('reports every failure at once, with the lesson id', () => {
    const input = withLesson(withLesson(buildInput(), 'v04', { next: 'v06' }), 'v10', {
      module: 'm01',
    });
    expect(() => validateCatalog(input)).toThrow(/v05/);
    expect(() => validateCatalog(input)).toThrow(/v10/);
  });

  it('rejects a broken next chain', () => {
    expect(() => validateCatalog(withLesson(buildInput(), 'v04', { next: 'v06' }))).toThrow(
      /v05 is not reachable/
    );
    expect(() => validateCatalog(withLesson(buildInput(), 'v39', { next: undefined }))).toThrow(
      /must end at v40/
    );
  });

  it('rejects a missing or extra lesson', () => {
    const input = buildInput();
    expect(() =>
      validateCatalog({ ...input, lessons: input.lessons.filter((l) => l.id !== 'v40') })
    ).toThrow(/Missing lesson file for v40/);
  });

  it('rejects an extra lesson id instead of crashing on the position check', () => {
    const input = buildInput();
    const v41 = {
      ...input.lessons.find((l) => l.id === 'v40')!,
      id: 'v41',
      title: 'Lesson 41',
      kind: 'standard' as const,
    };
    const withExtra = {
      ...input,
      lessons: [...input.lessons.map((l) => (l.id === 'v40' ? { ...l, next: 'v41' } : l)), v41],
    };
    expect(() => validateCatalog(withExtra)).toThrow(/Unexpected lesson id "v41"/);
    let message = '';
    try {
      validateCatalog(withExtra);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toMatch(/Not a lesson id|Not a module id/);
  });

  it('rejects an extra module id instead of crashing on the chain check', () => {
    const input = buildInput();
    const m10 = {
      ...input.modules.find((m) => m.id === 'm09')!,
      id: 'm10',
      title: 'Module 10',
      worksheet: 'w-m10',
      checks: [check(), check()],
    };
    const w10 = {
      ...input.worksheets.find((w) => w.id === 'w-m09')!,
      id: 'w-m10',
      title: 'Worksheet 10',
      module: 'm10',
    };
    const withExtra = {
      ...input,
      modules: [...input.modules, m10],
      worksheets: [...input.worksheets, w10],
      lessons: input.lessons.map((l) => (l.id === 'v40' ? { ...l, module: 'm10' } : l)),
    };
    expect(() => validateCatalog(withExtra)).toThrow(/Unexpected module id "m10"/);
    let message = '';
    try {
      validateCatalog(withExtra);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toMatch(/Not a lesson id|Not a module id/);
  });

  it('rejects modules with the wrong number of checks', () => {
    expect(() => validateCatalog(withModule(buildInput(), 'm01', { checks: [] }))).toThrow(
      /m01: expected 2 checks, found 0/
    );
  });

  it('requires modules to be contiguous and ascending along the chain', () => {
    expect(() => validateCatalog(withLesson(buildInput(), 'v04', { module: 'm03' }))).toThrow(
      /ascend|contiguous/
    );
  });

  it('requires exactly one preview lesson, and it must be v05', () => {
    expect(() => validateCatalog(withLesson(buildInput(), 'v06', { preview: true }))).toThrow(
      /Exactly one lesson must have preview: true/
    );
    const moved = withLesson(withLesson(buildInput(), 'v05', { preview: false }), 'v06', {
      preview: true,
    });
    expect(() => validateCatalog(moved)).toThrow(/preview lesson must be v05/);
  });

  it('pins kinds to v39 and v40', () => {
    expect(() => validateCatalog(withLesson(buildInput(), 'v39', { kind: 'standard' }))).toThrow(
      /v39: kind must be "orientation"/
    );
    expect(() => validateCatalog(withLesson(buildInput(), 'v04', { kind: 'plan' }))).toThrow(
      /v04: kind must be "standard"/
    );
  });

  it('gates approved on the prose sections and the copy approval', () => {
    const input = withLesson(buildInput(), 'v04', { status: 'approved' });
    expect(() => validateCatalog(input)).toThrow(/v04 \(approved\): Outcome is empty/);
    expect(() => validateCatalog(input)).toThrow(/approvals.copy is required/);
  });

  it('gates published on the video, transcript and approvals', () => {
    const noTranscript = withLesson(buildInput(), 'v04', {
      ...PUBLISHED_FIELDS,
      body: PUBLISHED_FIELDS.body!.replace('Spoken words.', ''),
    });
    expect(() => validateCatalog(noTranscript)).toThrow(/Transcript is empty/);
    expect(() =>
      validateCatalog(withLesson(buildInput(), 'v04', { ...PUBLISHED_FIELDS, streamUid: null }))
    ).toThrow(/streamUid is required/);
    const catalog = validateCatalog(withLesson(buildInput(), 'v04', PUBLISHED_FIELDS));
    expect(catalog.summary).toBe(
      'course catalog: 40 lessons, 9 modules, 1 published, 0 staged, 8 minutes published'
    );
  });

  it('lets a placeholder video publish without a transcript, but never while open', () => {
    const placeholder = withLesson(buildInput(), 'v04', {
      ...PUBLISHED_FIELDS,
      videoPlaceholder: true,
      approvals: { copy: '2026-09-12 DB' },
      body: PUBLISHED_FIELDS.body!.replace('Spoken words.', ''),
    });
    expect(() => validateCatalog(placeholder)).not.toThrow();
    expect(() => validateCatalog({ ...placeholder, courseStatus: 'open' })).toThrow(
      /placeholder video cannot ship/
    );
  });

  it('requires the preview lesson to be published once the course is public', () => {
    expect(() => validateCatalog({ ...buildInput(), courseStatus: 'preview' })).toThrow(
      /preview lesson must be published/
    );
  });

  it('rejects em dashes anywhere in a body', () => {
    const dashed = withLesson(buildInput(), 'v04', {
      body: buildInput().lessons[3].body.replace('## Transcript', '## Transcript\nA — B'),
    });
    expect(() => validateCatalog(dashed)).toThrow(/v04: no em dashes/);
  });

  it('rejects a worksheet that does not match its module', () => {
    expect(() => validateCatalog(withLesson(buildInput(), 'v04', { worksheet: 'w-m03' }))).toThrow(
      /v04: worksheet must be w-m02/
    );
  });
});
