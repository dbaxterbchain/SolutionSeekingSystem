import { supabaseAdmin } from './supabaseAdmin';

/** Lifetime free messages for signed-in users without a subscription. */
export const FREE_MESSAGE_LIMIT = 10;

/**
 * Stripe statuses that grant access. `past_due` is included so Stripe's smart
 * payment retries get a grace period. A portal "cancel" sets
 * cancel_at_period_end while status stays `active`, so access naturally lasts
 * until the period ends; the `customer.subscription.deleted` webhook then
 * flips status to `canceled`.
 */
export const ENTITLED_STATUSES = ['active', 'trialing', 'past_due'];

export type Entitlement =
  | { kind: 'subscriber' }
  | { kind: 'free'; used: number; remaining: number }
  | { kind: 'blocked'; used: number };

export async function checkEntitlement(userId: string): Promise<Entitlement> {
  const { data: sub, error: subError } = await supabaseAdmin
    .from('subscriptions')
    .select('status')
    .eq('user_id', userId)
    .maybeSingle();
  // Read failures usually mean a misconfigured SUPABASE_SERVICE_ROLE_KEY —
  // log loudly instead of silently treating everyone as a free user.
  if (subError) console.error('subscription lookup failed', subError);
  if (sub && ENTITLED_STATUSES.includes(sub.status)) {
    return { kind: 'subscriber' };
  }

  const { data: usage, error: usageError } = await supabaseAdmin
    .from('ai_usage')
    .select('free_messages_used')
    .eq('user_id', userId)
    .maybeSingle();
  if (usageError) console.error('ai_usage lookup failed', usageError);
  const used = usage?.free_messages_used ?? 0;
  return used < FREE_MESSAGE_LIMIT
    ? { kind: 'free', used, remaining: FREE_MESSAGE_LIMIT - used }
    : { kind: 'blocked', used };
}
