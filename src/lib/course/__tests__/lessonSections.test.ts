import { describe, expect, it } from 'vitest';
import { LESSON_SECTION_HEADINGS, parseLessonSections } from '../lessonSections';

const body = [
  '## Outcome',
  'Tell one thing apart from another.',
  '',
  '## Key points',
  '- First point.',
  '- Second point.',
  '',
  '### A sub-heading is fine inside a section',
  '',
  '## Exercise',
  'Try it.',
  '',
  '## Model response',
  'Observation: something happened.',
  '',
  '## Self-review',
  '- I checked.',
  '',
  '## Transcript',
  'Welcome back.',
  '',
].join('\n');

describe('parseLessonSections', () => {
  it('names the six headings in order', () => {
    expect([...LESSON_SECTION_HEADINGS]).toEqual([
      'Outcome',
      'Key points',
      'Exercise',
      'Model response',
      'Self-review',
      'Transcript',
    ]);
  });

  it('splits a well-formed body into trimmed sections', () => {
    const result = parseLessonSections(body);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sections.outcome).toBe('Tell one thing apart from another.');
    expect(result.sections.keyPoints).toContain('### A sub-heading is fine inside a section');
    expect(result.sections.transcript).toBe('Welcome back.');
  });

  it('accepts empty sections (a stub lesson) and Windows line endings', () => {
    const stub = LESSON_SECTION_HEADINGS.map((h) => `## ${h}\r\n`).join('\r\n');
    const result = parseLessonSections(stub);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sections.outcome).toBe('');
    expect(result.sections.transcript).toBe('');
  });

  it('rejects a missing heading, naming what was found', () => {
    const result = parseLessonSections(body.replace('## Self-review\n', ''));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Self-review/);
    expect(result.error).toMatch(/Found:/);
  });

  it('rejects headings out of order', () => {
    const swapped = body
      .replace('## Exercise', '## TEMP')
      .replace('## Model response', '## Exercise')
      .replace('## TEMP', '## Model response');
    expect(parseLessonSections(swapped).ok).toBe(false);
  });

  it('rejects an extra top-level heading', () => {
    expect(parseLessonSections(body + '\n## Notes\nextra\n').ok).toBe(false);
  });

  it('rejects text before the first heading', () => {
    const result = parseLessonSections('Intro paragraph.\n\n' + body);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/before the first/);
  });
});
