import { describe, expect, it } from 'vitest';
import { validateCatalog } from '../validate';
import { FULL_BODY, PUBLISHED_FIELDS, buildInput, check, withLesson, withModule } from './fixtures';

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

    // One broken link shifts every later position; only the first is reported.
    let message = '';
    try {
      validateCatalog(withLesson(buildInput(), 'v04', { next: 'v06' }));
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message.match(/should be/g)).toHaveLength(1);
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

  it('lets a placeholder lesson publish with no video of its own', () => {
    const input = withLesson(buildInput(), 'v04', {
      ...PUBLISHED_FIELDS,
      videoPlaceholder: true,
      streamUid: null,
      approvals: { copy: '2026-09-09 DB' },
    });
    expect(() => validateCatalog(input)).not.toThrow();
  });

  it('requires the preview lesson to be published once the course is open, not for a preview build', () => {
    expect(() => validateCatalog({ ...buildInput(), courseStatus: 'preview' })).not.toThrow();
    expect(() => validateCatalog({ ...buildInput(), courseStatus: 'open' })).toThrow(
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

  it('gates edited on streamUid, durationMin, and approvals.edit', () => {
    const base = {
      status: 'edited' as const,
      body: FULL_BODY,
      streamUid: '5d5bc37ffcf54c9b82e996823bffbb81',
      durationMin: 8,
      approvals: { copy: '2026-09-12 DB', edit: '2026-09-20 BC' },
    };
    expect(() =>
      validateCatalog(withLesson(buildInput(), 'v04', { ...base, streamUid: null }))
    ).toThrow(/streamUid is required/);
    expect(() =>
      validateCatalog(withLesson(buildInput(), 'v04', { ...base, durationMin: 0 }))
    ).toThrow(/durationMin must be at least 1/);
    expect(() =>
      validateCatalog(
        withLesson(buildInput(), 'v04', { ...base, approvals: { copy: '2026-09-12 DB' } })
      )
    ).toThrow(/approvals.edit is required/);
  });

  it('gates captioned on approvals.captions when the transcript is present', () => {
    const input = withLesson(buildInput(), 'v04', {
      status: 'captioned',
      body: FULL_BODY,
      streamUid: '5d5bc37ffcf54c9b82e996823bffbb81',
      durationMin: 8,
      approvals: { copy: '2026-09-12 DB', edit: '2026-09-20 BC' },
    });
    expect(() => validateCatalog(input)).toThrow(/approvals.captions is required/);
  });

  it('lets v39 (orientation) pass approved with an empty exercise, model response, and self-review', () => {
    const body = [
      '## Outcome',
      'Outcome text.',
      '',
      '## Key points',
      '- One point.',
      '',
      '## Exercise',
      '',
      '## Model response',
      '',
      '## Self-review',
      '',
      '## Transcript',
      '',
    ].join('\n');
    const input = withLesson(buildInput(), 'v39', {
      status: 'approved',
      body,
      approvals: { copy: '2026-09-12 DB' },
    });
    expect(() => validateCatalog(input)).not.toThrow();
  });

  it('lets v40 (plan) pass approved with an empty model response and self-review, but still requires the exercise', () => {
    const bodyWithExercise = [
      '## Outcome',
      'Outcome text.',
      '',
      '## Key points',
      '- One point.',
      '',
      '## Exercise',
      'Write your plan.',
      '',
      '## Model response',
      '',
      '## Self-review',
      '',
      '## Transcript',
      '',
    ].join('\n');
    const passing = withLesson(buildInput(), 'v40', {
      status: 'approved',
      body: bodyWithExercise,
      approvals: { copy: '2026-09-12 DB' },
    });
    expect(() => validateCatalog(passing)).not.toThrow();

    const withoutExercise = withLesson(buildInput(), 'v40', {
      status: 'approved',
      body: bodyWithExercise.replace('Write your plan.', ''),
      approvals: { copy: '2026-09-12 DB' },
    });
    expect(() => validateCatalog(withoutExercise)).toThrow(/Exercise is empty/);
  });

  it('lets a placeholder-video lesson pass edited without approvals.edit', () => {
    const input = withLesson(buildInput(), 'v04', {
      status: 'edited',
      body: FULL_BODY,
      streamUid: '5d5bc37ffcf54c9b82e996823bffbb81',
      durationMin: 8,
      videoPlaceholder: true,
      approvals: { copy: '2026-09-12 DB' },
    });
    expect(() => validateCatalog(input)).not.toThrow();
  });

  it('rejects a placeholder video on the preview lesson once the course is open', () => {
    const input = withLesson({ ...buildInput(), courseStatus: 'open' }, 'v05', {
      ...PUBLISHED_FIELDS,
      videoPlaceholder: true,
    });
    expect(() => validateCatalog(input)).toThrow(
      /the preview lesson cannot use a placeholder video once the course is open/
    );
  });

  it('validates a published preview lesson when the course is open', () => {
    const input = withLesson({ ...buildInput(), courseStatus: 'open' }, 'v05', PUBLISHED_FIELDS);
    expect(() => validateCatalog(input)).not.toThrow();
  });
});
