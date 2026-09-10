import { describe, expect, it } from 'vitest';
import { publicCurriculum } from '../curriculum';
import { validateCatalog } from '../validate';
import { PUBLISHED_FIELDS, buildInput, withLesson } from './fixtures';

describe('publicCurriculum', () => {
  it('carries only titles, order, status and minutes', () => {
    const catalog = validateCatalog(withLesson(buildInput(), 'v04', PUBLISHED_FIELDS));
    const curriculum = publicCurriculum(catalog);
    expect(curriculum.modules).toHaveLength(9);
    expect(curriculum.totalLessons).toBe(40);
    expect(curriculum.modules[1]).toMatchObject({ id: 'm02', order: 2, title: 'Module 2' });
    expect(curriculum.modules[1].lessons[0]).toEqual({
      id: 'v04',
      title: 'Lesson 4',
      order: 1,
      seq: 4,
      status: 'published',
      durationMin: 8,
    });
    // No check answers, bodies, or stream ids can leak through this shape.
    expect(JSON.stringify(curriculum)).not.toMatch(/answer|Spoken words|5d5bc37f/);
  });
});
