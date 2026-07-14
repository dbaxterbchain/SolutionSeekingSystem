import type { APIRoute } from 'astro';
import { getUserFromRequest, json } from '../../lib/server/auth';
import { supabaseAdmin } from '../../lib/server/supabaseAdmin';
import { getStripe } from '../../lib/server/stripe';
import { ENTITLED_STATUSES } from '../../lib/server/entitlement';
import { resolvePlan } from '../../lib/server/plans';
import type { FirstTouch } from '../../lib/attribution';

export const prerender = false;

interface CheckoutBody {
  /** 'monthly' | 'annual'. Never a Stripe price id — see resolvePlan(). */
  plan?: string;
  /** GA4 ids, so the server-side conversion can be attributed to this session. */
  ga?: { client_id?: string; session_id?: string };
  /** First-touch ad attribution (src/lib/attribution.ts), so a sale can name its keyword. */
  attribution?: FirstTouch;
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

/**
 * Stripe metadata values are strings with a 500-character hard limit.
 *
 * The default of 120 is fine for the GA ids, but a Google click id (gclid) is
 * routinely LONGER THAN 120 CHARACTERS. Truncating one produces a string that
 * looks perfectly plausible and is useless: an offline conversion import keyed on
 * it fails to match, months later, with nothing left to recover from. So the max
 * is a parameter, and the click id gets the full 500.
 */
const trimmed = (value: unknown, max = 120): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.slice(0, max) : undefined;

/** A click id must never be truncated. See above. */
const CLICK_ID_MAX = 500;

/** Create a Stripe Checkout session for the subscription. */
export const POST: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'unauthorized' }, 401);

  // An anonymous trial user has no email address. Stripe would happily take
  // their money and attach the subscription to an account they can never sign
  // back into. They have to register first.
  if (user.is_anonymous) return json({ error: 'account_required' }, 403);

  const body = ((await request.json().catch(() => null)) ?? {}) as CheckoutBody;

  const selected = resolvePlan(body.plan);
  if (!selected) return json({ error: 'bad_request' }, 400);

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

  /*
   * Where this customer came from, captured on their FIRST page view and carried
   * across the OAuth redirect that would otherwise have destroyed it
   * (src/lib/attribution.ts). This is what lets us answer "which keyword actually
   * bought a subscription", and it is the ground truth when an ad blocker strips
   * the GA cookie and the conversion would otherwise land as "direct".
   */
  const a = body.attribution;
  const attributionMetadata = a
    ? {
        ...(trimmed(a.click_id, CLICK_ID_MAX)
          ? { click_id: trimmed(a.click_id, CLICK_ID_MAX)! }
          : {}),
        ...(trimmed(a.click_source) ? { click_source: trimmed(a.click_source)! } : {}),
        ...(trimmed(a.utm_source) ? { utm_source: trimmed(a.utm_source)! } : {}),
        ...(trimmed(a.utm_medium) ? { utm_medium: trimmed(a.utm_medium)! } : {}),
        ...(trimmed(a.utm_campaign) ? { utm_campaign: trimmed(a.utm_campaign)! } : {}),
        ...(trimmed(a.utm_term) ? { utm_term: trimmed(a.utm_term)! } : {}),
        ...(trimmed(a.utm_content) ? { utm_content: trimmed(a.utm_content)! } : {}),
        ...(trimmed(a.landing_path) ? { landing_path: trimmed(a.landing_path)! } : {}),
        ...(typeof a.at === 'number' ? { first_touch_at: String(a.at) } : {}),
      }
    : {};

  // `plan` rides along so the webhook's conversion event can report which one
  // was bought without re-deriving it from the price id. 13 keys at most, and
  // Stripe's ceiling is 50.
  const metadata = {
    user_id: user.id,
    plan: selected.plan,
    ...gaMetadata,
    ...attributionMetadata,
  };

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: selected.priceId, quantity: 1 }],
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
