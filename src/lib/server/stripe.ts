import Stripe from 'stripe';
import { serverEnv } from './env';

let client: Stripe | null = null;

/**
 * Lazy Stripe singleton — SERVER ONLY. No apiVersion override: the SDK pins
 * the API version it was built against.
 */
export function getStripe(): Stripe {
  return (client ??= new Stripe(serverEnv('STRIPE_SECRET_KEY')));
}
