import { useEntitlement } from './entitlement';

/**
 * Stripe statuses that grant access to the AI assistants. `past_due` is
 * included so Stripe's smart payment retries get a grace period.
 *
 * Kept for the client code that still speaks in raw subscription rows (the
 * billing panel in AccountView). Entitlement itself is no longer decided here:
 * ask the server, via useEntitlement().
 */
export const ENTITLED_STATUSES = ['active', 'trialing', 'past_due'];

/**
 * Whether the signed-in user may use the assistants without paying again.
 *
 * This used to read the `subscriptions` table from the browser, which quietly
 * assumed that a personal Stripe row is the only way to be entitled. It is not:
 * an organization can pay for you, and the org tables are not readable from a
 * browser by design. So this now asks the server, and a member of a paying
 * organization is correctly treated as a subscriber (and, for one thing, is no
 * longer shown a price they do not have to pay).
 *
 * False while loading, so subscriber-only copy never flashes at a non-subscriber.
 */
export function useIsSubscriber(): boolean {
  const { entitlement } = useEntitlement();
  return entitlement?.kind === 'subscriber';
}
