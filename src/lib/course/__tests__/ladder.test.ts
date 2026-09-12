import { describe, expect, it } from 'vitest';
import { gatesMissing, ladderReport, nextStatus } from '../ladder';
import { validateCatalog } from '../validate';
import { buildInput, withLesson } from './fixtures';

describe('nextStatus', () => {
  it('walks the ladder and stops at published', () => {
    expect(nextStatus('draft')).toBe('approved');
    expect(nextStatus('staged')).toBe('published');
    expect(nextStatus('published')).toBeNull();
  });
});

describe('gatesMissing', () => {
  const full = {
    outcome: 'o', keyPoints: 'k', exercise: 'e', modelResponse: 'm', selfReview: 's', transcript: 't',
  };
  const base = {
    kind: 'standard' as const, streamUid: null, durationMin: 0, videoPlaceholder: false, preview: false, approvals: {},
  };
  it('names what a draft needs to be approved', () => {
    expect(gatesMissing({ ...base, sections: { ...full, exercise: '' } }, 'approved', { courseStatus: 'hidden' })).toEqual([
      'Exercise is empty',
      'approvals.copy is required',
    ]);
  });
  it('is cumulative, so published asks for everything below it', () => {
    const missing = gatesMissing({ ...base, sections: full, approvals: { copy: '2026-09-01 DB' } }, 'published', { courseStatus: 'hidden' });
    expect(missing).toEqual(['streamUid is required', 'durationMin must be at least 1', 'approvals.edit is required', 'approvals.captions is required']);
  });
  it('lets a placeholder-video lesson skip the video gates while the course is not open', () => {
    const missing = gatesMissing(
      { ...base, videoPlaceholder: true, durationMin: 5, sections: full, approvals: { copy: '2026-09-01 DB' } },
      'published',
      { courseStatus: 'preview' }
    );
    expect(missing).toEqual([]);
  });
  it('refuses a placeholder at staged or above once the course is open', () => {
    const missing = gatesMissing(
      { ...base, videoPlaceholder: true, durationMin: 5, sections: full, approvals: { copy: '2026-09-01 DB' } },
      'staged',
      { courseStatus: 'open' }
    );
    expect(missing).toContain('a placeholder video cannot ship while the course is open for sale');
  });
});

describe('ladderReport', () => {
  it('lists every lesson in chain order with its next rung and what that rung still needs', () => {
    const catalog = validateCatalog(withLesson(buildInput(), 'v10', { status: 'draft', approvals: {} }));
    const rows = ladderReport(catalog, 'hidden');
    expect(rows).toHaveLength(40);
    expect(rows.map((r) => r.seq)).toEqual(rows.map((_, i) => i + 1));
    const published = rows.filter((r) => r.status === 'published');
    expect(published.every((r) => r.next === null && r.missing.length === 0)).toBe(true);
    const draft = rows.find((r) => r.id === 'v10');
    expect(draft?.next).toBe('approved');
    expect(draft?.missing).toContain('approvals.copy is required');
  });
});
