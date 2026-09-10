import { describe, expect, it } from 'vitest';
import { REUSE_MARGIN_SECONDS, TOKEN_TTL_SECONDS, embedUrl, posterUrl, shouldReuse } from '../streamUrls';

const NOW = new Date('2026-09-10T12:00:00Z');
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

describe('shouldReuse', () => {
  it('reuses a token that has more than the margin left, and mints otherwise', () => {
    expect(shouldReuse(at(REUSE_MARGIN_SECONDS + 1), NOW)).toBe(true);
    expect(shouldReuse(at(REUSE_MARGIN_SECONDS), NOW)).toBe(false);
    expect(shouldReuse(at(-10), NOW)).toBe(false);
  });
  it('keeps the ttl above the margin', () => {
    expect(TOKEN_TTL_SECONDS).toBeGreaterThan(REUSE_MARGIN_SECONDS * 2);
  });
});

describe('stream urls', () => {
  it('builds the iframe url from the customer code and the token, with the poster encoded', () => {
    const url = embedUrl('abc123', 'tok.en');
    expect(url.startsWith('https://customer-abc123.cloudflarestream.com/tok.en/iframe?')).toBe(true);
    expect(url).toContain('preload=metadata');
    expect(url).toContain('defaultTextTrack=en');
    expect(url).toContain('primaryColor=%235271FF');
    expect(url).toContain(`poster=${encodeURIComponent(posterUrl('abc123', 'tok.en'))}`);
    expect(url).not.toContain('autoplay');
  });
  it('builds the poster from the same token', () => {
    expect(posterUrl('abc123', 'tok.en')).toBe(
      'https://customer-abc123.cloudflarestream.com/tok.en/thumbnails/thumbnail.jpg?time=2s'
    );
  });
});
