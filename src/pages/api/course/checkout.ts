import type { APIRoute } from 'astro';
import { getUserFromRequest, privateJson } from '../../../lib/server/auth';
import { isAdminUser } from '../../../lib/server/adminAuth';
import { supabaseAdmin } from '../../../lib/server/supabaseAdmin';
import { getStripe } from '../../../lib/server/stripe';
import { clientIp, isRateLimited } from '../../../lib/server/rateLimit';
import { resolveCourseOffer } from '../../../lib/server/course/offer';
import { getCourseEntitlement, recordCheckoutCreated } from '../../../lib/server/course/enrollment';
import { COURSE, COURSE_STATUS } from '../../../data/course';
import type { FirstTouch } from '../../../lib/attribution';
import type { CourseEntitlement } from '../../../lib/server/course/enrollmentRules';

export const prerender = false;

interface CourseCheckoutBody {
  /** Client-generated uuid. The same key replays the same Stripe session instead of minting a second one. */
  request_key?: string;
  /** GA4 ids, so the server-side conversion can be attributed to this session. */
  ga?: { client_id?: string; session_id?: string };
  /** First-touch ad attribution (src/lib/attribution.ts). */
  attribution?: FirstTouch;
  /** Path to return to if the user abandons checkout. */
  returnPath?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Same open-redirect rule as /api/checkout: same-origin paths only. */
function safePath(path: unknown, fallback: string): string {
  if (typeof path !== 'string') return fallback;
  if (!path.startsWith('/') || path.startsWith('//')) return fallback;
  return path;
}

/** Same trimming rules as /api/checkout: 120 default, click ids get the full 500. */
const trimmed = (value: unknown, max = 120): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.slice(0, max) : undefined;

const CLICK_ID_MAX = 500;

/** Append checkout=cancelled to a same-origin path, keeping any query and fragment where they belong. */
function cancelUrl(origin: string, path: string): string {
  const [pathAndQuery, fragment] = path.split('#', 2);
  const joiner = pathAndQuery.includes('?') ? '&' : '?';
  return `${origin}${pathAndQuery}${joiner}checkout=cancelled${fragment ? `#${fragment}` : ''}`;
}

/**
 * Create a one-time Checkout Session for the course.
 *
 * Separate from /api/checkout on purpose: that endpoint sells subscriptions
 * through resolvePlan(), which must keep rejecting everything that is not a
 * self-serve plan. The webhook tells the two apart by metadata.purchase_intent
 * and enrolls AFTER payment, so an abandoned checkout leaves only a ledger row.
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const user = await getUserFromRequest(request);
  if (!user) return privateJson({ error: 'unauthorized' }, 401);

  // An anonymous trial user has no email: Stripe would take the money and
  // attach the course to an account nobody can sign back into.
  if (user.is_anonymous) return privateJson({ error: 'account_required' }, 403);

  // Before launch only admins can buy; that is how checkout is tested against
  // production without a page that sells it.
  if (COURSE_STATUS !== 'open' && !isAdminUser(user)) {
    return privateJson({ error: 'course_not_on_sale' }, 403);
  }

  const body = ((await request.json().catch(() => null)) ?? {}) as CourseCheckoutBody;
  if (typeof body.request_key !== 'string' || !UUID_RE.test(body.request_key)) {
    return privateJson({ error: 'bad_request', field: 'request_key' }, 400);
  }

  const ip = clientIp(request, clientAddress);
  if (await isRateLimited('course_checkout', ip, 10, 60 * 60)) {
    return privateJson({ error: 'rate_limited' }, 429);
  }

  let entitlement: CourseEntitlement;
  try {
    entitlement = await getCourseEntitlement(user);
  } catch (err) {
    console.error('course checkout: entitlement lookup failed', err);
    return privateJson({ error: 'entitlement_unavailable' }, 503);
  }
  if (entitlement.kind === 'enrolled') return privateJson({ error: 'already_enrolled' }, 409);
  if (entitlement.kind === 'inactive' && entitlement.reason === 'revoked') {
    return privateJson({ error: 'enrollment_revoked' }, 403);
  }

  const offer = resolveCourseOffer();
  if (!offer) return privateJson({ error: 'course_not_configured' }, 503);

  // A subscriber already has a Stripe customer; reuse it so one person is one
  // customer in Stripe. Otherwise Checkout creates one, so the receipt and a
  // refund have a customer to hang off.
  const { data: sub, error: subError } = await supabaseAdmin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (subError) {
    console.error('course checkout: subscription lookup failed', subError);
    return privateJson({ error: 'checkout_unavailable' }, 503);
  }

  const origin = new URL(request.url).origin;
  const returnPath = safePath(body.returnPath, '/course');

  const gaMetadata = {
    ...(trimmed(body.ga?.client_id) ? { ga_client_id: trimmed(body.ga?.client_id)! } : {}),
    ...(trimmed(body.ga?.session_id) ? { ga_session_id: trimmed(body.ga?.session_id)! } : {}),
  };

  const a = body.attribution;
  const attributionMetadata = a
    ? {
        ...(trimmed(a.click_id, CLICK_ID_MAX) ? { click_id: trimmed(a.click_id, CLICK_ID_MAX)! } : {}),
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

  // purchase_intent is the discriminator the webhook branches on, BEFORE the
  // org and personal paths. 16 keys at most; Stripe's ceiling is 50.
  const metadata = {
    purchase_intent: 'course',
    course_id: COURSE.id,
    user_id: user.id,
    request_key: body.request_key,
    plan: 'course',
    ...gaMetadata,
    ...attributionMetadata,
  };

  try {
    const session = await getStripe().checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [{ price: offer.priceId, quantity: 1 }],
        ...(sub?.stripe_customer_id
          ? { customer: sub.stripe_customer_id }
          : { customer_email: user.email, customer_creation: 'always' as const }),
        client_reference_id: user.id,
        metadata,
        // Copied onto the PaymentIntent so a refund event can name the learner.
        payment_intent_data: { metadata },
        success_url: `${origin}/course/learn/?checkout=success`,
        cancel_url: cancelUrl(origin, returnPath),
      },
      // A retry with the same key gets the same session back from Stripe.
      { idempotencyKey: `course:${user.id}:${body.request_key}` }
    );
    // A replayed key can hand back a session that already finished (a second
    // click after paying, before the webhook landed) or one that expired.
    // Neither has a page to send the learner to. A finished session whose
    // bank debit is still settling is a purchase in progress, not a new one.
    if (session.status === 'complete') {
      return privateJson(
        { error: session.payment_status === 'unpaid' ? 'payment_pending' : 'already_enrolled' },
        409
      );
    }
    if (!session.url) return privateJson({ error: 'request_key_reused' }, 409);
    await recordCheckoutCreated(
      user.id,
      session.id,
      entitlement.kind === 'none' ? null : entitlement.enrollment.id
    );
    return privateJson({ url: session.url });
  } catch (err) {
    // The same request key with different parameters: Stripe refuses to replay
    // it. Tell the client to mint a fresh key rather than retry into the same wall.
    // Stripe's SDK sets `.type` to the error CLASS name (StripeIdempotencyError);
    // the raw API error type string ('idempotency_error') is on `.rawType`.
    if (err instanceof Error && (err as { rawType?: string }).rawType === 'idempotency_error') {
      return privateJson({ error: 'request_key_reused' }, 409);
    }
    console.error('course checkout session failed', err);
    return privateJson({ error: 'checkout_failed' }, 502);
  }
};
