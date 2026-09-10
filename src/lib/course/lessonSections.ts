/**
 * A lesson body is six fixed "##" sections in a fixed order. The body is never
 * rendered whole: the enrolled lesson API returns these strings one by one,
 * and the public preview page renders the same component at build time. That
 * is how lesson prose stays out of public HTML while one renderer serves both.
 */
export const LESSON_SECTION_HEADINGS = [
  'Outcome',
  'Key points',
  'Exercise',
  'Model response',
  'Self-review',
  'Transcript',
] as const;

const SECTION_KEYS = [
  'outcome',
  'keyPoints',
  'exercise',
  'modelResponse',
  'selfReview',
  'transcript',
] as const;

export interface LessonSections {
  outcome: string;
  keyPoints: string;
  exercise: string;
  modelResponse: string;
  selfReview: string;
  transcript: string;
}

export type LessonSectionsResult =
  | { ok: true; sections: LessonSections }
  | { ok: false; error: string };

export function parseLessonSections(body: string): LessonSectionsResult {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const headings: { name: string; line: number }[] = [];
  lines.forEach((line, index) => {
    const match = /^## (.+?)\s*$/.exec(line);
    if (match) headings.push({ name: match[1], line: index });
  });

  const expected = [...LESSON_SECTION_HEADINGS];
  const found = headings.map((h) => h.name);
  const inOrder =
    found.length === expected.length && found.every((name, i) => name === expected[i]);
  if (!inOrder) {
    return {
      ok: false,
      error:
        `Expected exactly these "##" headings, in this order: ${expected.join(' | ')}. ` +
        `Found: ${found.join(' | ') || '(none)'}`,
    };
  }

  const preamble = lines.slice(0, headings[0].line).join('\n').trim();
  if (preamble) {
    return { ok: false, error: 'Text before the first "## Outcome" heading is not allowed' };
  }

  const sections = {} as Record<(typeof SECTION_KEYS)[number], string>;
  headings.forEach((heading, i) => {
    const end = i + 1 < headings.length ? headings[i + 1].line : lines.length;
    sections[SECTION_KEYS[i]] = lines.slice(heading.line + 1, end).join('\n').trim();
  });
  return { ok: true, sections };
}
