/**
 * The single source of truth for free allowances and prices.
 *
 * Import these; never retype a number or a price string. They appear in page
 * copy, chat UI, JSON-LD offers, llms.txt, and the server's entitlement check,
 * and if those ever disagree the site lies to customers and to Google.
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

export const MONTHLY_PRICE_LABEL = '$5';
export const MONTHLY_PRICE_AMOUNT = '5.00';
