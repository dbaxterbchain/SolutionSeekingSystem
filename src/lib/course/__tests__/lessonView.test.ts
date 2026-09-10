import { describe, expect, it } from 'vitest';
import { learnerSections, neighbour, videoUidFor } from '../lessonView';

const sections = { outcome: 'o', keyPoints: 'k', exercise: 'e', modelResponse: 'SECRET', selfReview: 's', transcript: 't' };

describe('learnerSections', () => {
  it('never includes the model response and uses snake_case keys', () => {
    expect(learnerSections(sections)).toEqual({ outcome: 'o', key_points: 'k', exercise: 'e', self_review: 's', transcript: 't' });
    expect(JSON.stringify(learnerSections(sections))).not.toContain('SECRET');
  });
});

describe('videoUidFor', () => {
  it('prefers the lesson video, falls back to the placeholder clip for placeholder lessons, else nothing', () => {
    expect(videoUidFor({ streamUid: 'a'.repeat(32), videoPlaceholder: false }, 'p'.repeat(32))).toBe('a'.repeat(32));
    expect(videoUidFor({ streamUid: null, videoPlaceholder: true }, 'p'.repeat(32))).toBe('p'.repeat(32));
    expect(videoUidFor({ streamUid: null, videoPlaceholder: true }, null)).toBeNull();
    expect(videoUidFor({ streamUid: null, videoPlaceholder: false }, 'p'.repeat(32))).toBeNull();
  });
});

describe('neighbour', () => {
  it('links published lessons for learners and staged ones only for an admin preview', () => {
    expect(neighbour(undefined, false)).toBeNull();
    expect(neighbour({ id: 'v05', title: 'Five', status: 'published' }, false)).toEqual({ id: 'v05', title: 'Five', available: true });
    expect(neighbour({ id: 'v05', title: 'Five', status: 'staged' }, false)).toEqual({ id: 'v05', title: 'Five', available: false });
    expect(neighbour({ id: 'v05', title: 'Five', status: 'staged' }, true)).toEqual({ id: 'v05', title: 'Five', available: true });
    expect(neighbour({ id: 'v05', title: 'Five', status: 'draft' }, true)).toEqual({ id: 'v05', title: 'Five', available: false });
  });
});
