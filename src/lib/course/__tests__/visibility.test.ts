import { describe, expect, it } from 'vitest';
import { hasShell, isLearnerVisible, isVisibleTo } from '../visibility';

describe('lesson visibility', () => {
  it('shows learners only published lessons', () => {
    expect(isLearnerVisible({ status: 'published' })).toBe(true);
    expect(isLearnerVisible({ status: 'staged' })).toBe(false);
    expect(isLearnerVisible({ status: 'draft' })).toBe(false);
  });

  it('gives staged and published lessons a URL', () => {
    expect(hasShell({ status: 'staged' })).toBe(true);
    expect(hasShell({ status: 'published' })).toBe(true);
    expect(hasShell({ status: 'captioned' })).toBe(false);
  });

  it('lets an admin preview a staged lesson, and nobody preview a draft', () => {
    expect(isVisibleTo({ status: 'staged' }, true)).toBe(true);
    expect(isVisibleTo({ status: 'staged' }, false)).toBe(false);
    expect(isVisibleTo({ status: 'draft' }, true)).toBe(false);
  });
});
