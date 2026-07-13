/**
 * The single source of truth for free allowances and prices.
 *
 * Import these; never retype a number or a price string. They appear in page
 * copy, the chat UI, JSON-LD offers, llms.txt, and the server's entitlement
 * check, and if those ever disagree the site lies to customers and to Google.
 *
 * The amount actually charged comes from Stripe (via the price ids in
 * src/lib/server/plans.ts). Keep these labels in step with the Stripe prices:
 * changing one without the other makes every page on the site wrong.
 *
 * Safe to import from anywhere (Astro pages, React islands, API routes): pure
 * data, no browser or server dependencies.
 */

/** Messages a visitor may send before creating an account. */
export const FREE_ANON_MESSAGES = 3;

/** Lifetime free messages for a signed-in user without a subscription. */
export const FREE_ACCOUNT_MESSAGES = 10;

/** What a converting anonymous user still has left once they register. */
export const FREE_MESSAGES_AFTER_SIGNUP = FREE_ACCOUNT_MESSAGES - FREE_ANON_MESSAGES;

export type PlanId = 'monthly' | 'annual' | 'team';

export interface Plan {
  id: PlanId;
  name: string;
  /** Display price, e.g. "$5". */
  priceLabel: string;
  /** Numeric amount for JSON-LD offers, e.g. "5.00". Never retyped elsewhere. */
  priceAmount: string;
  currency: 'USD';
  /** Words under the price, e.g. "per month". */
  cadence: string;
  /** schema.org billing duration. */
  billingDuration?: 'P1M' | 'P1Y';
  /** Optional badge, e.g. "Two months free". */
  note?: string;
  /** Self-serve plans go through Stripe Checkout; the team plan is an enquiry. */
  selfServe: boolean;
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  monthly: {
    id: 'monthly',
    name: 'Monthly',
    priceLabel: '$5',
    priceAmount: '5.00',
    currency: 'USD',
    cadence: 'per month',
    billingDuration: 'P1M',
    selfServe: true,
    features: [
      'Unlimited conversations with the Guide and the Mentor',
      'Every mode: parent, teacher, partner, manager, and more',
      'Your conversations saved and searchable',
      'Cancel anytime',
    ],
  },
  annual: {
    id: 'annual',
    name: 'Annual',
    priceLabel: '$50',
    priceAmount: '50.00',
    currency: 'USD',
    cadence: 'per year',
    billingDuration: 'P1Y',
    note: 'Two months free',
    selfServe: true,
    features: [
      'Everything in Monthly',
      'Two months free compared with paying monthly',
      'One payment, no monthly admin',
      'Cancel anytime',
    ],
  },
  team: {
    id: 'team',
    name: 'Teams',
    priceLabel: 'From $4',
    priceAmount: '4.00',
    currency: 'USD',
    cadence: 'per person, per month',
    note: '5 seat minimum',
    selfServe: false,
    features: [
      'Everything in Annual, for everyone on the team',
      'Help adapting the Leadership Tools to how your organization actually works',
      'For co-ops, schools, nonprofits, and small companies',
    ],
  },
};

/** The plans a visitor can buy without talking to anyone. */
export const SELF_SERVE_PLANS: Plan[] = [PLANS.monthly, PLANS.annual];

export const DEFAULT_PLAN: PlanId = 'monthly';

/**
 * Shared copy. These strings used to be retyped in eight files, which meant a
 * price change silently made most of the site lie.
 */
export const priceCopy = {
  /** Under the assistants, for a visitor who isn't subscribed. */
  generic: `Try it free, no account needed. ${FREE_ANON_MESSAGES} messages to start, ${FREE_ACCOUNT_MESSAGES} with a free account, then ${PLANS.monthly.priceLabel} a month for unlimited.`,
  /** Shorter version, where space is tight. */
  short: `${FREE_ANON_MESSAGES} free messages, no account needed · ${PLANS.monthly.priceLabel}/month for unlimited`,
  subscriber: "You're subscribed: unlimited conversations with both assistants.",
  subscribeCta: `Subscribe for ${PLANS.monthly.priceLabel}/month`,
  paywallHeading: `You've used your ${FREE_ACCOUNT_MESSAGES} free messages`,
  paywallBody: `Subscribe for ${PLANS.monthly.priceLabel}/month to get unlimited conversations with both the Guide and the Mentor. Cancel anytime.`,
};
