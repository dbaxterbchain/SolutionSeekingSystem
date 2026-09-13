import { describe, expect, it } from 'vitest';
import { DISPLAY_NAME_MAX, SHARE_TOKEN_RE, certificateRecord, certificateShareUrl, certificateSummary, normalizeDisplayName } from '../certificateRules';

const token = 'a'.repeat(32);
const row = {
  id: 'c1',
  serial: 'SSS-2026-00001',
  certification_version: '1',
  display_name: 'Ada Lovelace',
  name_confirmed_at: '2026-09-12T10:00:00Z',
  issued_at: '2026-09-12T09:00:00Z',
  status: 'active' as const,
  revoked_at: null,
  share_token: token,
  share_active: true,
};

describe('normalizeDisplayName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeDisplayName('  Ada   Lovelace ')).toBe('Ada Lovelace');
  });
  it('keeps hyphens, apostrophes and accents', () => {
    expect(normalizeDisplayName("Zoë O'Brien-Núñez")).toBe("Zoë O'Brien-Núñez");
  });
  it('refuses empty, overlong, letterless and unprintable names', () => {
    expect(normalizeDisplayName('   ')).toBeNull();
    expect(normalizeDisplayName('a'.repeat(DISPLAY_NAME_MAX + 1))).toBeNull();
    expect(normalizeDisplayName('a'.repeat(DISPLAY_NAME_MAX))).toHaveLength(DISPLAY_NAME_MAX);
    expect(normalizeDisplayName('12345')).toBeNull();
    expect(normalizeDisplayName('Ada' + String.fromCharCode(7) + 'Lovelace')).toBeNull();
    expect(normalizeDisplayName('Ada ' + String.fromCharCode(0x2014) + ' Lovelace')).toBeNull();
    expect(normalizeDisplayName('<Ada>')).toBeNull();
  });
});

describe('share tokens and urls', () => {
  it('accepts 32 base64url characters and nothing else', () => {
    expect(SHARE_TOKEN_RE.test('A-Za-z0-9_-'.padEnd(32, 'x'))).toBe(true);
    expect(SHARE_TOKEN_RE.test('x'.repeat(31))).toBe(false);
    expect(SHARE_TOKEN_RE.test('x'.repeat(31) + '=')).toBe(false);
    expect(SHARE_TOKEN_RE.test('x'.repeat(31) + '/')).toBe(false);
  });
  it('joins the origin and the verify path without a double slash', () => {
    expect(certificateShareUrl('https://solutionseeking.com/', 'tok')).toBe('https://solutionseeking.com/course/verify/tok/');
    expect(certificateShareUrl('http://localhost:4321', 'tok')).toBe('http://localhost:4321/course/verify/tok/');
  });
});

describe('views', () => {
  it('summarises whether the name is confirmed', () => {
    expect(certificateSummary(row)).toEqual({ id: 'c1', serial: 'SSS-2026-00001', status: 'active', name_confirmed: true, issued_at: row.issued_at });
    expect(certificateSummary({ ...row, name_confirmed_at: null }).name_confirmed).toBe(false);
  });
  it('carries the share url only while sharing is on, and never the bare token', () => {
    expect(certificateRecord(row, 'https://example.com').share_url).toBe(`https://example.com/course/verify/${token}/`);
    const off = certificateRecord({ ...row, share_active: false }, 'https://example.com');
    expect(off.share_url).toBeNull();
    expect(JSON.stringify(off)).not.toContain(token);
    expect(Object.keys(off)).not.toContain('share_token');
  });
});
