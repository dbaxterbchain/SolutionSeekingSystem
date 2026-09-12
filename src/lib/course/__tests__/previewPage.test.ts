import { describe, expect, it } from 'vitest';
import { previewPageAvailable, previewPlayback } from '../previewPage';

const lesson = { status: 'published' as const, streamUid: 'a'.repeat(32), videoPlaceholder: false };

describe('previewPageAvailable', () => {
  it('needs a public course and a published preview lesson', () => {
    expect(previewPageAvailable('preview', lesson)).toBe(true);
    expect(previewPageAvailable('open', lesson)).toBe(true);
    expect(previewPageAvailable('hidden', lesson)).toBe(false);
    expect(previewPageAvailable('preview', { ...lesson, status: 'staged' })).toBe(false);
  });
});

describe('previewPlayback', () => {
  it('embeds the lesson video unsigned, with the uid in the token position', () => {
    const p = previewPlayback(lesson, 'code123');
    expect(p?.embedUrl).toBe(
      `https://customer-code123.cloudflarestream.com/${'a'.repeat(32)}/iframe?preload=metadata&defaultTextTrack=en&primaryColor=%235271FF&poster=${encodeURIComponent(
        `https://customer-code123.cloudflarestream.com/${'a'.repeat(32)}/thumbnails/thumbnail.jpg?time=2s`
      )}`
    );
    expect(p?.posterUrl).toContain(`/${'a'.repeat(32)}/thumbnails/thumbnail.jpg`);
  });
  it('has no player while the lesson is on the stand-in clip or has no video', () => {
    expect(previewPlayback({ ...lesson, videoPlaceholder: true, streamUid: null }, 'code123')).toBeNull();
    expect(previewPlayback({ ...lesson, streamUid: null }, 'code123')).toBeNull();
  });
});
