import type { APIRoute } from 'astro';
import type Stripe from 'stripe';
import { supabaseAdmin } from '../../lib/server/supabaseAdmin';
import { getStripe } from '../../lib/server/stripe';
import { serverEnv } from '../../lib/server/env';

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
  } catch {
    return new Response('invalid signature', { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = session.client_reference_id ?? session.metadata?.user_id;
      if (userId && session.subscription) {
        const sub = await getStripe().subscriptions.retrieve(
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription.id
        );
        await upsertSubscription(userId, sub);
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const userId = sub.metadata?.user_id ?? (await lookupUserByCustomer(sub.customer));
      if (userId) await upsertSubscription(userId, sub);
      break;
    }
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
  // On current Stripe API versions the billing period lives on the
  // subscription item, not the subscription itself.
  const item = sub.items.data[0];
  const { error } = await supabaseAdmin.from('subscriptions').upsert({
    user_id: userId,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    stripe_subscription_id: sub.id,
    status: sub.status,
    price_id: item?.price.id ?? null,
    cancel_at_period_end: sub.cancel_at_period_end,
    current_period_end: item?.current_period_end
      ? new Date(item.current_period_end * 1000).toISOString()
      : null,
  });
  if (error) console.error('subscription upsert failed', error);
}
