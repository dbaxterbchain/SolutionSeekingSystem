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
          // Not an individual's subscription. It may be an organization's, which
          // has no user_id anywhere. Without this branch a LAPSED ORGANIZATION
          // KEEPS ACCESS FOREVER: the event would be shrugged off and the only
          // thing standing between a cancelled customer and unlimited use would
          // be a human remembering to flip a status by hand.
          if (await syncOrgSubscription(sub)) break;
          console.warn('could not resolve a user or an org for subscription event', sub.id);
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

/**
 * Keep an ORGANIZATION's status in step with Stripe. Returns true if this
 * subscription belonged to one.
 *
 * Deliberately only ever UPDATES a row the operator already created and stamped
 * with a `stripe_customer_id`. It never inserts, so a stray Stripe customer can
 * never conjure entitlement for an organization that does not exist.
 *
 * If an org is billed by hand (an invoice rather than a Stripe subscription)
 * there are no events at all, and the status the operator set in /admin stands.
 * That is expected, and it is why the admin panel flags a renewal date coming up.
 */
async function syncOrgSubscription(sub: Stripe.Subscription): Promise<boolean> {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, name')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (!org) return false;

  const item = sub.items.data[0];
  const periodEnd =
    item?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    null;

  const { error } = await supabaseAdmin
    .from('organizations')
    .update({
      status: sub.status,
      stripe_subscription_id: sub.id,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    })
    .eq('id', org.id);

  if (error) {
    console.error('organization sync failed', error);
    throw new Error(`organization sync failed: ${error.message}`);
  }
  console.log(`organization ${org.name} (${org.id}) is now ${sub.status}`);
  return true;
}

/**
 * Ad attribution carried on the subscription's own metadata.
 *
 * Read from `sub.metadata`, NOT from the checkout session, and that is deliberate.
 * Stripe persists subscription metadata, so these values are present on every
 * later event about this subscription. Reading them here means there is one code
 * path instead of two, and no race between `checkout.session.completed` and
 * `customer.subscription.created`, which Stripe delivers in no guaranteed order.
 *
 * Returns only the keys that are actually present, so a renewal event (whose
 * metadata carries the same values) cannot null out a column, and a subscription
 * that predates this feature is simply left alone.
 */
function attributionColumns(sub: Stripe.Subscription): Record<string, string> {
  const m = sub.metadata ?? {};
  const keys = [
    'click_id',
    'click_source',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'landing_path',
  ] as const;

  const columns: Record<string, string> = {};
  for (const key of keys) {
    if (m[key]) columns[key] = m[key];
  }
  // Stored as a string in metadata (Stripe has no number type there).
  const at = Number(m.first_touch_at);
  if (Number.isFinite(at) && at > 0) {
    columns.first_touch_at = new Date(at).toISOString();
  }
  return columns;
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
    ...attributionColumns(sub),
  });
  if (error) {
    console.error('subscription upsert failed', error);
    throw new Error(`subscription upsert failed: ${error.message}`);
  }
  console.log(`subscription upserted for ${userId}: ${sub.status}`);
}
