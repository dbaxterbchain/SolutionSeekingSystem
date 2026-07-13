import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from './supabaseAdmin';
import { FREE_ANON_MESSAGES, FREE_ACCOUNT_MESSAGES } from '../../data/pricing';

/** Lifetime free messages for signed-in users without a subscription. */
export const FREE_MESSAGE_LIMIT = FREE_ACCOUNT_MESSAGES;

/** Messages an anonymous (not-yet-registered) visitor may send. */
export const ANON_MESSAGE_LIMIT = FREE_ANON_MESSAGES;

/**
 * Stripe statuses that grant access. `past_due` is included so Stripe's smart
 * payment retries get a grace period. A portal "cancel" sets
 * cancel_at_period_end while status stays `active`, so access naturally lasts
 * until the period ends; the `customer.subscription.deleted` webhook then
 * flips status to `canceled`.
 */
export const ENTITLED_STATUSES = ['active', 'trialing', 'past_due'];

/** Which allowance a user is spending. Anonymous users get a smaller one. */
export type Tier = 'anon' | 'account';

export type Entitlement =
  | { kind: 'subscriber' }
  | { kind: 'free'; tier: Tier; used: number; remaining: number; limit: number }
  | { kind: 'blocked'; tier: Tier; used: number; limit: number };

/**
 * The server is the only authority on how many messages a user has left.
 *
 * Anonymous and registered users share ONE counter (ai_usage.free_messages_used)
 * but have different limits. That is deliberate: Supabase keeps the same user id
 * when an anonymous user converts to a permanent account, so a visitor who spent
 * 3 anonymous messages arrives at the registered tier with used=3 of 10, and the
 * remaining 7 roll over with no code. Do not "reset" the counter on signup.
 */
export async function checkEntitlement(user: User): Promise<Entitlement> {
  const isAnon = user.is_anonymous === true;
  const tier: Tier = isAnon ? 'anon' : 'account';
  const limit = isAnon ? ANON_MESSAGE_LIMIT : FREE_MESSAGE_LIMIT;

  // An anonymous user can never be a subscriber (checkout is blocked for them,
  // since a subscription with no email address is unrecoverable), so skip the
  // lookup entirely rather than pay for a query that can only return nothing.
  if (!isAnon) {
    const { data: sub, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle();
    // Read failures usually mean a misconfigured SUPABASE_SERVICE_ROLE_KEY —
    // log loudly instead of silently treating everyone as a free user.
    if (subError) console.error('subscription lookup failed', subError);
    if (sub && ENTITLED_STATUSES.includes(sub.status)) {
      return { kind: 'subscriber' };
    }
  }

  const { data: usage, error: usageError } = await supabaseAdmin
    .from('ai_usage')
    .select('free_messages_used')
    .eq('user_id', user.id)
    .maybeSingle();
  if (usageError) console.error('ai_usage lookup failed', usageError);
  const used = usage?.free_messages_used ?? 0;

  return used < limit
    ? { kind: 'free', tier, used, remaining: limit - used, limit }
    : { kind: 'blocked', tier, used, limit };
}
