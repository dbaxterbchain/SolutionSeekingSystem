import type { APIRoute } from 'astro';
import type Stripe from 'stripe';
import { supabaseAdmin } from '../../lib/server/supabaseAdmin';
import { getStripe } from '../../lib/server/stripe';
import { serverEnv } from '../../lib/server/env';
import { trackSubscriptionCompleted } from '../../lib/server/ga4';

export const prerender = false;

/**
 * Stripe webhook — the ONLY writer of subscription entitlement state.
 * Register in the Stripe dashboard for: checkout.session.completed,
 * customer.subscription.created / .updated / .deleted.
 */
export const POST: APIRoute = async ({ request }) => {
  const signature = request.headers.get('stripe-signature');
  // Raw body bytes — signature verification fails on anything re-serialized.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      rawBody,
      signature ?? '',
      serverEnv('STRIPE_WEBHOOK_SECRET')
    );
  } catch (err) {
    // Almost always means STRIPE_WEBHOOK_SECRET doesn't match this endpoint's
    // signing secret (dashboard endpoint vs `stripe listen`, test vs live).
    console.error(
      'stripe-webhook signature verification failed:',
      err instanceof Error ? err.message : err
    );
    return new Response('invalid signature', { status: 400 });
  }

  console.log('stripe-webhook received:', event.type);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id ?? session.metadata?.user_id;
        if (!userId || !session.subscription) {
          console.warn('checkout.session.completed missing user_id or subscription', session.id);
          break;
        }
        const sub = await getStripe().subscriptions.retrieve(
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription.id
        );
        await upsertSubscription(userId, sub);

        // The conversion of record. Fired here, and ONLY on this event type
        // (the customer.subscription.* cases below also fire on renewals and
        // status changes, which would double-count). GA4 dedupes Stripe's
        // retries on transaction_id.
        await trackSubscriptionCompleted({
          // Falls back to the user id when an ad blocker stripped the _ga
          // cookie: we lose campaign attribution for that user but never the
          // revenue count, which is the number that decides whether ads work.
          clientId: session.metadata?.ga_client_id || userId,
          sessionId: session.metadata?.ga_session_id || undefined,
          plan: session.metadata?.plan || 'monthly',
          value: (session.amount_total ?? 0) / 100,
          currency: (session.currency ?? 'usd').toUpperCase(),
          transactionId: session.id,
        });
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const userId = sub.metadata?.user_id ?? (await lookupUserByCustomer(sub.customer));
        if (!userId) {
          console.warn('could not resolve a user for subscription event', sub.id);
          break;
        }
        await upsertSubscription(userId, sub);
        break;
      }
    }
  } catch (err) {
    // e.g. the restricted key lacking Subscriptions read, or a Supabase
    // outage. 500 makes Stripe retry the delivery instead of dropping it.
    console.error(`stripe-webhook failed handling ${event.type}:`, err);
    return new Response('handler error', { status: 500 });
  }

  // Always 200 so Stripe doesn't retry event types we deliberately ignore.
  return new Response('ok', { status: 200 });
};

async function lookupUserByCustomer(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer
): Promise<string | null> {
  const customerId = typeof customer === 'string' ? customer : customer.id;
  const { data } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  return data?.user_id ?? null;
}

async function upsertSubscription(userId: string, sub: Stripe.Subscription) {
  // Current Stripe API versions put the billing period on the subscription
  // item; older webhook-endpoint API versions (payload snapshots) keep it on
  // the subscription itself. Accept either shape.
  const item = sub.items.data[0];
  const periodEnd =
    item?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    null;
  const { error } = await supabaseAdmin.from('subscriptions').upsert({
    user_id: userId,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    stripe_subscription_id: sub.id,
    status: sub.status,
    price_id: item?.price.id ?? null,
    cancel_at_period_end: sub.cancel_at_period_end,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
  });
  if (error) {
    console.error('subscription upsert failed', error);
    throw new Error(`subscription upsert failed: ${error.message}`);
  }
  console.log(`subscription upserted for ${userId}: ${sub.status}`);
}
