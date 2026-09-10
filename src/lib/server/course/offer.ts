import { serverEnv } from '../env';
import { COURSE_PRICE } from '../../../data/pricing';

export interface CourseOffer {
  priceId: string;
  /** Dollar amount for the conversion event. 0 until COURSE_PRICE exists. */
  value: number;
}

/**
 * The course's Stripe price, resolved from env the way resolvePlan() resolves
 * a subscription price, and deliberately NOT through resolvePlan: the course
 * is a one-time payment with its own endpoint, so PLANS and PlanId stay
 * closed and resolvePlan keeps rejecting anything it does not know.
 */
export function resolveCourseOffer(): CourseOffer | null {
  const priceId = serverEnv('STRIPE_PRICE_ID_COURSE');
  if (!priceId) {
    console.error('Stripe price not configured for the course (STRIPE_PRICE_ID_COURSE)');
    return null;
  }
  return { priceId, value: Number(COURSE_PRICE?.priceAmount ?? 0) };
}
