import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';
import { useSession } from './useSession';

/**
 * Stripe statuses that grant access to the AI assistants. `past_due` is
 * included so Stripe's smart payment retries get a grace period. Shared by
 * the server entitlement check and the client-side UI.
 */
export const ENTITLED_STATUSES = ['active', 'trialing', 'past_due'];

/**
 * Whether the signed-in user has an active subscription. Resolves to false
 * for signed-out users; stays false until the row is confirmed, so static
 * fallback copy never flashes for non-subscribers.
 */
export function useIsSubscriber(): boolean {
  const { user } = useSession();
  const [isSubscriber, setIsSubscriber] = useState(false);

  useEffect(() => {
    if (!user || !isSupabaseConfigured) {
      setIsSubscriber(false);
      return;
    }
    let active = true;
    supabase
      .from('subscriptions')
      .select('status')
      .maybeSingle()
      .then(({ data }) => {
        if (active) setIsSubscriber(Boolean(data && ENTITLED_STATUSES.includes(data.status)));
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  return isSubscriber;
}
