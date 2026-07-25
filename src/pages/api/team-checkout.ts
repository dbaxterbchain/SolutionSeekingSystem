import type { APIRoute } from 'astro';
import { getUserFromRequest, json } from '../../lib/server/auth';
import { getStripe } from '../../lib/server/stripe';
import { resolveTeamPlan } from '../../lib/server/plans';
import { clientIp, isRateLimited } from '../../lib/server/rateLimit';
import { TEAM_MIN_SEATS, TEAM_MAX_SEATS } from '../../data/pricing';
import type { FirstTouch } from '../../lib/attribution';

export const prerender = false;

interface TeamCheckoutBody {
  /** The organization's display name, chosen at purchase. */
  org_name?: string;
  /** Seat count = the Stripe subscription item quantity. */
  seats?: number;
  /** GA4 ids, so the server-side conversion can be attributed to this session. */
  ga?: { client_id?: string; session_id?: string };
  /** First-touch ad attribution (src/lib/attribution.ts). */
  attribution?: FirstTouch;
  /** Path to return to if the user abandons checkout. */
  returnPath?: string;
}

/** Same open-redirect rule as /api/checkout. */
function safePath(path: unknown, fallback: string): string {
  if (typeof path !== 'string') return fallback;
  if (!path.startsWith('/') || path.startsWith('//')) return fallback;
  return path;
}

/** Same trimming rules as /api/checkout: 120 default, click ids get 500. */
const trimmed = (value: unknown, max = 120): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.slice(0, max) : undefined;

const CLICK_ID_MAX = 500;

/**
 * Create a per-seat Teams Checkout session. The org itself is created by the
 * Stripe webhook AFTER payment (checkout.session.completed with
 * metadata.org_intent = 'create'), so an abandoned checkout leaves no residue
 * and the webhook stays the only writer of entitlement state.
 *
 * CRITICAL: the metadata here must NEVER contain `user_id`, and the session
 * must never set `client_reference_id` or reuse a personal Stripe customer.
 * The webhook routes any subscription event carrying metadata.user_id into
 * the PERSONAL `subscriptions` table (stripe-webhook.ts), which would hand one
 * human an org-priced personal subscription and leave the org unmanaged. The
 * creator rides along as `creator_user_id` instead.
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'unauthorized' }, 401);

  // An anonymous trial user has no email, so no account to run the org from.
  if (user.is_anonymous) return json({ error: 'account_required' }, 403);

  // The buyer's email becomes the first manager's seat credential
  // (org_members.email), so it has to be a confirmed address.
  if (!user.email || !user.email_confirmed_at) {
    return json({ error: 'email_unconfirmed' }, 403);
  }

  const body = ((await request.json().catch(() => null)) ?? {}) as TeamCheckoutBody;

  const orgName = typeof body.org_name === 'string' ? body.org_name.trim() : '';
  if (orgName.length < 2 || orgName.length > 120) {
    return json({ error: 'bad_request', field: 'org_name' }, 400);
  }

  const seats = body.seats;
  if (
    typeof seats !== 'number' ||
    !Number.isInteger(seats) ||
    seats < TEAM_MIN_SEATS ||
    seats > TEAM_MAX_SEATS
  ) {
    return json(
      { error: 'bad_request', field: 'seats', message: `Teams plans have a ${TEAM_MIN_SEATS} seat minimum.` },
      400
    );
  }

  const teamPlan = resolveTeamPlan();
  if (!teamPlan) return json({ error: 'bad_request' }, 400);

  const ip = clientIp(request, clientAddress);
  if (await isRateLimited('team_checkout', ip, 10, 60 * 60)) {
    return json({ error: 'rate_limited' }, 429);
  }

  // NOTE: deliberately no `already_subscribed` guard (unlike /api/checkout).
  // A personal subscriber may legitimately buy a team for their organization;
  // checkEntitlement's precedence makes the overlap harmless.

  const origin = new URL(request.url).origin;
  const returnPath = safePath(body.returnPath, '/pricing#team');

  const gaMetadata = {
    ...(trimmed(body.ga?.client_id) ? { ga_client_id: trimmed(body.ga?.client_id)! } : {}),
    ...(trimmed(body.ga?.session_id) ? { ga_session_id: trimmed(body.ga?.session_id)! } : {}),
  };

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

  // org_intent is the discriminator the webhook branches on; creator_user_id
  // (NOT user_id, see above) is who becomes the first manager. Well under
  // Stripe's 50-key ceiling.
  const metadata = {
    org_intent: 'create',
    org_name: orgName.slice(0, 120),
    seats: String(seats),
    creator_user_id: user.id,
    plan: 'team',
    ...gaMetadata,
    ...attributionMetadata,
  };

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: teamPlan.priceId, quantity: seats }],
      // Always a FRESH customer keyed to the buyer's email: reusing a personal
      // stripe_customer_id would let lookupUserByCustomer route this org's
      // subscription events into their personal subscriptions row.
      customer_email: user.email,
      metadata,
      // Copy onto the subscription so customer.subscription.* events carry it.
      subscription_data: { metadata },
      success_url: `${origin}/dashboard?org_checkout=success`,
      cancel_url: `${origin}${returnPath}${returnPath.includes('?') ? '&' : '?'}checkout=cancelled`,
    });
    return json({ url: session.url });
  } catch (err) {
    console.error('team checkout session failed', err);
    return json({ error: 'checkout_failed' }, 502);
  }
};
