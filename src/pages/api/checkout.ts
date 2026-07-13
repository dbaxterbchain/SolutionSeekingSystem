import type { APIRoute } from 'astro';
import { getUserFromRequest, json } from '../../lib/server/auth';
import { supabaseAdmin } from '../../lib/server/supabaseAdmin';
import { getStripe } from '../../lib/server/stripe';
import { serverEnv } from '../../lib/server/env';
import { ENTITLED_STATUSES } from '../../lib/server/entitlement';

export const prerender = false;

interface CheckoutBody {
  /** GA4 ids, so the server-side conversion can be attributed to this session. */
  ga?: { client_id?: string; session_id?: string };
  /** Path to return to if the user abandons checkout. */
  returnPath?: string;
}

/**
 * Only same-origin paths may be used to build the Stripe return URLs — an
 * attacker-supplied absolute URL would turn checkout into an open redirect.
 * Same rule as safeNext() in src/lib/accountLink.ts.
 */
function safePath(path: unknown, fallback: string): string {
  if (typeof path !== 'string') return fallback;
  if (!path.startsWith('/') || path.startsWith('//')) return fallback;
  return path;
}

const trimmed = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.slice(0, 120) : undefined;

/** Create a Stripe Checkout session for the subscription. */
export const POST: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'unauthorized' }, 401);

  // An anonymous trial user has no email address. Stripe would happily take
  // their money and attach the subscription to an account they can never sign
  // back into. They have to register first.
  if (user.is_anonymous) return json({ error: 'account_required' }, 403);

  const body = ((await request.json().catch(() => null)) ?? {}) as CheckoutBody;

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
  const returnPath = safePath(body.returnPath, '/practice');

  // Stripe metadata values must be strings; drop the keys we don't have.
  const gaMetadata = {
    ...(trimmed(body.ga?.client_id) ? { ga_client_id: trimmed(body.ga?.client_id)! } : {}),
    ...(trimmed(body.ga?.session_id) ? { ga_session_id: trimmed(body.ga?.session_id)! } : {}),
  };
  const metadata = { user_id: user.id, ...gaMetadata };

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
      metadata,
      // Copy onto the subscription so customer.subscription.* events carry it.
      subscription_data: { metadata },
      success_url: `${origin}/account?checkout=success`,
      // Send them back where they were, mid-conversation, not to a generic hub.
      cancel_url: `${origin}${returnPath}${returnPath.includes('?') ? '&' : '?'}checkout=cancelled`,
    });
    return json({ url: session.url });
  } catch (err) {
    console.error('checkout session failed', err);
    return json({ error: 'checkout_failed' }, 502);
  }
};
