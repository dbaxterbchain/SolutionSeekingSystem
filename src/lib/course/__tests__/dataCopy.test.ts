import { describe, expect, it } from 'vitest';
import * as certification from '../../../data/certification';
import * as course from '../../../data/course';
import { hasBannedCopy } from '../ids';

/**
 * Walks every exported value recursively, collecting every string found.
 * Strings are checked; arrays and plain objects are recursed into; functions
 * and nulls are skipped (a null token value is a launch decision still to be
 * made, not copy to check).
 */
function collectStrings(value: unknown, out: string[] = []): string[] {
  if (value === null || typeof value === 'function') return out;
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return out;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, out);
    return out;
  }
  return out;
}

describe('course and certification data copy', () => {
  it('has no banned copy anywhere in src/data/course.ts or src/data/certification.ts', () => {
    const strings = [...collectStrings(course), ...collectStrings(certification)];

    // Guards against the walk silently finding nothing (a passing empty walk
    // would prove nothing about the actual copy).
    expect(strings.length).toBeGreaterThanOrEqual(20);

    for (const s of strings) {
      expect(hasBannedCopy(s)).toBe(false);
    }
  });
});
