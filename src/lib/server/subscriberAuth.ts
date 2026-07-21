import type { User } from '@supabase/supabase-js';
import { getUserFromRequest } from './auth';
import { checkEntitlement, type Entitlement } from './entitlement';

type SubscriberEntitlement = Extract<Entitlement, { kind: 'subscriber' }>;

/**
 * Gate a request to a subscriber, the way admin routes use requireAdmin. Every
 * dashboard-only endpoint (documents, and later assistants / white-label) calls
 * this first: the browser can't be trusted to gate itself, and these features
 * are subscriber-only (personal Stripe subscription or an organization seat).
 *
 * Returns the user + their subscriber entitlement, or a ready-to-send error so
 * callers can distinguish "sign in" (401) from "subscribe" (403):
 *
 *   const auth = await requireSubscriber(request);
 *   if ('error' in auth) return json({ error: auth.error }, auth.status);
 *   const { user } = auth;
 */
export async function requireSubscriber(
  request: Request
): Promise<
  | { user: User; entitlement: SubscriberEntitlement }
  | { error: 'unauthorized'; status: 401 }
  | { error: 'subscription_required'; status: 403 }
> {
  const user = await getUserFromRequest(request);
  if (!user) return { error: 'unauthorized', status: 401 };
  const entitlement = await checkEntitlement(user);
  if (entitlement.kind !== 'subscriber') return { error: 'subscription_required', status: 403 };
  return { user, entitlement };
}
