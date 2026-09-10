import { describe, expect, it } from 'vitest';
import { parseCourseStatus } from '../status';

describe('parseCourseStatus', () => {
  it('defaults to hidden', () => {
    expect(parseCourseStatus(undefined)).toBe('hidden');
    expect(parseCourseStatus('')).toBe('hidden');
    expect(parseCourseStatus('hidden')).toBe('hidden');
  });

  it('accepts preview and open', () => {
    expect(parseCourseStatus('preview')).toBe('preview');
    expect(parseCourseStatus('open')).toBe('open');
  });

  it('rejects anything else loudly', () => {
    expect(() => parseCourseStatus('live')).toThrow(/PUBLIC_COURSE_STATUS/);
  });
});
