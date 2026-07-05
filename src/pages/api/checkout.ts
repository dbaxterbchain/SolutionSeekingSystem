import type { APIRoute } from 'astro';
import { getUserFromRequest, json } from '../../lib/server/auth';
import { supabaseAdmin } from '../../lib/server/supabaseAdmin';
import { getStripe } from '../../lib/server/stripe';
import { serverEnv } from '../../lib/server/env';
import { ENTITLED_STATUSES } from '../../lib/server/entitlement';

export const prerender = false;

/** Create a Stripe Checkout session for the $5/month subscription. */
export const POST: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const { data: existing } = await supabaseAdmin
    .from('subscriptions')
    .select('stripe_customer_id, status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (existing && ENTITLED_STATUSES.includes(existing.status)) {
    return json({ error: 'already_subscribed' }, 409);
  }

  // Works for production, deploy previews, and localhost alike.
  const origin = new URL(request.url).origin;

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: serverEnv('STRIPE_PRICE_ID'), quantity: 1 }],
      // Reuse the Stripe customer if we've seen this user before, so a
      // re-subscribe doesn't create duplicate customers.
      ...(existing?.stripe_customer_id
        ? { customer: existing.stripe_customer_id }
        : { customer_email: user.email }),
      client_reference_id: user.id,
      metadata: { user_id: user.id },
      // Copy onto the subscription so customer.subscription.* events carry it.
      subscription_data: { metadata: { user_id: user.id } },
      success_url: `${origin}/account?checkout=success`,
      cancel_url: `${origin}/practice?checkout=cancelled`,
    });
    return json({ url: session.url });
  } catch (err) {
    console.error('checkout session failed', err);
    return json({ error: 'checkout_failed' }, 502);
  }
};
