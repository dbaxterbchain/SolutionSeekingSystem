import { serverEnv } from './env';

/**
 * Server-side conversion events via the GA4 Measurement Protocol.
 *
 * The subscription event is sent from the Stripe webhook rather than from the
 * browser landing on /account?checkout=success. A browser event misses exactly
 * the cases where the money is real: closed tabs after Stripe's confirmation,
 * ad blockers (GTM never loads), and the iOS in-app-browser hand-off. Worse,
 * it misses them *non-uniformly by device*, which would systematically bias any
 * ad bidding built on the signal. The webhook is already the sole writer of
 * entitlement state, so the revenue event comes from the same place the
 * entitlement does.
 */

const MP_ENDPOINT = 'https://www.google-analytics.com/mp/collect';

interface SubscriptionEvent {
  /** GA client id stitched through Stripe metadata; falls back to the user id. */
  clientId: string;
  sessionId?: string;
  plan: string;
  /** Amount in dollars (Stripe reports cents). */
  value: number;
  currency: string;
  /** Stripe Checkout Session id — GA4 dedupes retries on this. */
  transactionId: string;
}

/**
 * Fire `subscription_completed`. Best-effort: a failure here must never fail
 * the webhook, or Stripe will retry a delivery we already processed.
 */
export async function trackSubscriptionCompleted(e: SubscriptionEvent): Promise<void> {
  const measurementId = serverEnv('PUBLIC_GA4_MEASUREMENT_ID');
  const apiSecret = serverEnv('GA4_API_SECRET');
  if (!measurementId || !apiSecret) {
    console.warn('GA4 not configured; skipping subscription_completed');
    return;
  }

  const url = `${MP_ENDPOINT}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  const body = {
    client_id: e.clientId,
    events: [
      {
        name: 'subscription_completed',
        params: {
          plan: e.plan,
          value: e.value,
          currency: e.currency,
          transaction_id: e.transactionId,
          ...(e.sessionId ? { session_id: e.sessionId } : {}),
          // Required, or GA4 attributes the event to no session at all.
          engagement_time_msec: 1,
        },
      },
    ],
  };

  try {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) {
      console.error('GA4 measurement protocol rejected the event', res.status, await res.text());
    }
  } catch (err) {
    console.error('GA4 measurement protocol request failed', err);
  }
}
