import { serverEnv } from './env';
import { PLANS, DEFAULT_PLAN, type PlanId } from '../../data/pricing';

/**
 * Maps a plan id to its Stripe price.
 *
 * The client sends a plan ID ('monthly' | 'annual'), never a Stripe price id: a
 * $0.01 price can be created in the Stripe dashboard at any time, and trusting a
 * client-supplied price would let anyone subscribe for a cent. This allowlist
 * (three env-mapped prices: monthly, annual, and the per-seat team price) is
 * the only place a price id is resolved.
 */

const PRICE_ENV: Record<'monthly' | 'annual', string> = {
  monthly: 'STRIPE_PRICE_ID',
  annual: 'STRIPE_PRICE_ID_ANNUAL',
};

export interface ResolvedPlan {
  plan: 'monthly' | 'annual';
  priceId: string;
  /** Dollar amount, for the conversion event's `value`. */
  value: number;
}

/**
 * Resolve an untrusted plan id from a request body. Returns null for anything
 * unknown, for the team plan (which has its own per-seat endpoint,
 * /api/team-checkout), or when the price id isn't configured.
 */
export function resolvePlan(input: unknown): ResolvedPlan | null {
  // Absent or unrecognised falls back to the default plan (older clients send no
  // plan at all). But a plan we know and deliberately don't sell self-serve, like
  // 'team', must be rejected rather than quietly turned into a monthly checkout.
  const named = typeof input === 'string' && input in PLANS ? (input as PlanId) : undefined;
  if (named && !PLANS[named].selfServe) return null;

  const id: PlanId = named ?? DEFAULT_PLAN;
  if (!PLANS[id].selfServe) return null;

  const plan = id as 'monthly' | 'annual';
  const priceId = serverEnv(PRICE_ENV[plan]);
  if (!priceId) {
    console.error(`Stripe price not configured for the ${plan} plan (${PRICE_ENV[plan]})`);
    return null;
  }

  return { plan, priceId, value: Number(PLANS[plan].priceAmount) };
}

export interface ResolvedTeamPlan {
  priceId: string;
  /** Dollar amount PER SEAT; multiply by quantity for a conversion value. */
  unitValue: number;
}

/**
 * The per-seat Teams price. Separate from resolvePlan on purpose: the team
 * plan has its own endpoint (/api/team-checkout) with quantity semantics that
 * the individual checkout must never grow, and PLANS.team.selfServe stays
 * false so resolvePlan keeps rejecting 'team' there.
 */
export function resolveTeamPlan(): ResolvedTeamPlan | null {
  const priceId = serverEnv('STRIPE_PRICE_ID_TEAM');
  if (!priceId) {
    console.error('Stripe price not configured for the team plan (STRIPE_PRICE_ID_TEAM)');
    return null;
  }
  return { priceId, unitValue: Number(PLANS.team.priceAmount) };
}
