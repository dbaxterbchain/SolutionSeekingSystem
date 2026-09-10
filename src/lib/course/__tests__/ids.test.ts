import { describe, expect, it } from 'vitest';
import {
  APPROVAL_RE,
  LESSON_ID_RE,
  MODULE_ID_RE,
  STREAM_UID_RE,
  WORKSHEET_ID_RE,
  hasBannedCopy,
  lessonId,
  lessonNumber,
  moduleId,
  moduleNumber,
  worksheetIdFor,
} from '../ids';

describe('course ids', () => {
  it('accepts v01..v40 and nothing else', () => {
    expect(LESSON_ID_RE.test('v01')).toBe(true);
    expect(LESSON_ID_RE.test('v40')).toBe(true);
    expect(LESSON_ID_RE.test('v00')).toBe(false);
    expect(LESSON_ID_RE.test('v41')).toBe(false);
    expect(LESSON_ID_RE.test('V04')).toBe(false);
  });

  it('converts between lesson ids and numbers', () => {
    expect(lessonNumber('v04')).toBe(4);
    expect(lessonId(4)).toBe('v04');
    expect(lessonId(40)).toBe('v40');
    expect(() => lessonNumber('x1')).toThrow();
    expect(() => lessonId(41)).toThrow();
  });

  it('converts between module ids and numbers, and derives worksheet ids', () => {
    expect(MODULE_ID_RE.test('m09')).toBe(true);
    expect(MODULE_ID_RE.test('m10')).toBe(false);
    expect(moduleNumber('m02')).toBe(2);
    expect(moduleId(2)).toBe('m02');
    expect(worksheetIdFor('m02')).toBe('w-m02');
    expect(WORKSHEET_ID_RE.test('w-m02')).toBe(true);
  });

  it('recognises stream uids and approval stamps', () => {
    expect(STREAM_UID_RE.test('5d5bc37ffcf54c9b82e996823bffbb81')).toBe(true);
    expect(STREAM_UID_RE.test('not-a-uid')).toBe(false);
    expect(APPROVAL_RE.test('2026-09-12 DB')).toBe(true);
    expect(APPROVAL_RE.test('12/09/2026 DB')).toBe(false);
  });

  it('flags em dashes, en dashes and unresolved tokens', () => {
    expect(hasBannedCopy('plain text')).toBe(false);
    expect(hasBannedCopy('a — b')).toBe(true);
    expect(hasBannedCopy('10–12 hours')).toBe(true);
    expect(hasBannedCopy('{{course_price}}')).toBe(true);
  });
});
