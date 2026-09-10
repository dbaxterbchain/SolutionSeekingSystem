import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveCourseOffer } from '../offer';
import { COURSE_PRICE } from '../../../../data/pricing';

describe('resolveCourseOffer', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('resolves the price id from STRIPE_PRICE_ID_COURSE', () => {
    vi.stubEnv('STRIPE_PRICE_ID_COURSE', 'price_course_test');
    expect(resolveCourseOffer()).toEqual({
      priceId: 'price_course_test',
      value: Number(COURSE_PRICE?.priceAmount ?? 0),
    });
  });

  it('returns null and logs when the price is not configured', () => {
    vi.stubEnv('STRIPE_PRICE_ID_COURSE', '');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(resolveCourseOffer()).toBeNull();
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
