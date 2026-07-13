import type { APIRoute } from 'astro';
import { getUserFromRequest, json } from '../../lib/server/auth';
import { supabaseAdmin } from '../../lib/server/supabaseAdmin';
import { getStripe } from '../../lib/server/stripe';

export const prerender = false;

/** Open the Stripe Customer Portal so subscribers can manage or cancel. */
export const POST: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'unauthorized' }, 401);

  // Anonymous trial users can't subscribe (see /api/checkout), so they can
  // never have a portal to open.
  if (user.is_anonymous) return json({ error: 'account_required' }, 403);

  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!sub?.stripe_customer_id) return json({ error: 'no_subscription' }, 404);

  const origin = new URL(request.url).origin;
  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/account`,
    });
    return json({ url: session.url });
  } catch (err) {
    console.error('billing portal session failed', err);
    return json({ error: 'portal_failed' }, 502);
  }
};
