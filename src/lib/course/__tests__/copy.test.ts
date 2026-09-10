import { describe, expect, it } from 'vitest';
import { assertLaunchSettings, courseCopy } from '../copy';
import type { CourseToken } from '../../../data/course';

const full: Record<CourseToken, string> = {
  course_price: '$149',
  access_summary: 'Lifetime access, including updates.',
  refund_summary: 'Full refund within 14 days.',
  support_contact: 'hello@solutionseeking.com',
  review_target: 'five working days',
  retakes_summary: 'Retakes are included.',
  retention_summary: 'Responses are kept for 12 months.',
};

describe('courseCopy', () => {
  it('renders known tokens', () => {
    expect(courseCopy('Reach us at {{support_contact}}.', { status: 'hidden', tokens: full })).toBe(
      'Reach us at hello@solutionseeking.com.'
    );
  });

  it('throws on an unknown token, naming it', () => {
    expect(() => courseCopy('{{price}}', { status: 'open', tokens: full })).toThrow(/\{\{price\}\}/);
  });

  it('throws on a token that has no value yet', () => {
    const tokens = { ...full, access_summary: null };
    expect(() => courseCopy('{{access_summary}}', { status: 'open', tokens })).toThrow(
      /access_summary/
    );
  });

  it('throws on a malformed token left in the output', () => {
    expect(() => courseCopy('{{ Course_Price }}', { status: 'open', tokens: full })).toThrow(
      /unresolved/i
    );
  });

  it('refuses to render the price unless the course is open', () => {
    expect(() => courseCopy('{{course_price}}', { status: 'preview', tokens: full })).toThrow(
      /open/
    );
    expect(courseCopy('Get it for {{course_price}}', { status: 'open', tokens: full })).toBe(
      'Get it for $149'
    );
  });
});

describe('assertLaunchSettings', () => {
  const price = { priceLabel: '$149', priceAmount: '149.00', currency: 'USD' as const };

  it('is a no-op while the course is hidden or in preview', () => {
    expect(() =>
      assertLaunchSettings({ status: 'hidden', tokens: { ...full, refund_summary: null } })
    ).not.toThrow();
    expect(() =>
      assertLaunchSettings({ status: 'preview', tokens: { ...full, refund_summary: null } })
    ).not.toThrow();
  });

  it('lists every missing setting when the course is open', () => {
    expect(() =>
      assertLaunchSettings({
        status: 'open',
        tokens: { ...full, refund_summary: null, retention_summary: null },
        price: null,
        launchConfirmed: null,
      })
    ).toThrow(/refund_summary, retention_summary, course_price/);
  });

  it('requires the launch confirmation date', () => {
    expect(() =>
      assertLaunchSettings({ status: 'open', tokens: full, price, launchConfirmed: null })
    ).toThrow(/launchConfirmed/);
  });

  it('passes when everything is set', () => {
    expect(() =>
      assertLaunchSettings({ status: 'open', tokens: full, price, launchConfirmed: '2026-11-01' })
    ).not.toThrow();
  });
});
