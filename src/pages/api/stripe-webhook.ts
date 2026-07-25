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

        // A Teams purchase: create the organization and its first manager.
        // This branch runs FIRST because team sessions carry no user_id at
        // all (deliberately, see /api/team-checkout) and must never fall
        // through to the personal-subscription path below.
        if (session.metadata?.org_intent === 'create') {
          await handleOrgCheckout(session);
          break;
        }

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
 * A completed Teams checkout: create the organization and seat its buyer as
 * the first manager. The one place self-serve orgs come into existence.
 *
 * Idempotent by the UNIQUE stripe_customer_id: a Stripe retry (or a duplicate
 * delivery) finds the org already created and just re-syncs the billing
 * columns. Any Supabase error throws, the handler 500s, and Stripe retries
 * into that same idempotency.
 */
async function handleOrgCheckout(session: Stripe.Checkout.Session) {
  const creatorUserId = session.metadata?.creator_user_id;
  if (!creatorUserId || !session.subscription || !session.customer) {
    console.warn('org checkout missing creator, subscription, or customer', session.id);
    return;
  }

  const sub = await getStripe().subscriptions.retrieve(
    typeof session.subscription === 'string' ? session.subscription : session.subscription.id
  );
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer.id;
  const item = sub.items.data[0];
  // The item quantity is authoritative (it is what Stripe bills); the metadata
  // copy is only a fallback for a malformed retrieval.
  const metadataSeats = Number(session.metadata?.seats);
  const seats = Math.max(
    item?.quantity ?? (Number.isFinite(metadataSeats) ? metadataSeats : 1),
    1
  );
  const periodEnd =
    item?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    null;

  // Retry / duplicate delivery: the org exists, keep its billing columns fresh.
  const { data: existing } = await supabaseAdmin
    .from('organizations')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (existing) {
    await syncOrgSubscription(sub);
    return;
  }

  // The buyer's email is fetched authoritatively rather than trusted from
  // metadata: it becomes the seat credential (org_members.email).
  const { data: creator, error: creatorError } =
    await supabaseAdmin.auth.admin.getUserById(creatorUserId);
  if (creatorError || !creator?.user?.email) {
    console.error('org checkout: could not resolve creator', creatorUserId, creatorError);
    throw new Error('org checkout: creator lookup failed');
  }

  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .insert({
      name: session.metadata?.org_name || `${creator.user.email}'s team`,
      seats,
      status: sub.status,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      billing: 'stripe',
      created_by: creatorUserId,
    })
    .select('id, name')
    .single();
  if (orgError) {
    console.error('org checkout: organization insert failed', orgError);
    throw new Error(`org checkout: organization insert failed: ${orgError.message}`);
  }

  // Seat 1: the buyer, bound immediately (no claim step), as manager.
  const { error: memberError } = await supabaseAdmin.from('org_members').insert({
    org_id: org.id,
    email: creator.user.email.toLowerCase(),
    user_id: creatorUserId,
    role: 'manager',
    joined_at: new Date().toISOString(),
  });
  // 23505 = the member row already exists (a retry that died between the two
  // inserts). Fine: the org is whole.
  if (memberError && memberError.code !== '23505') {
    console.error('org checkout: manager insert failed', memberError);
    throw new Error(`org checkout: manager insert failed: ${memberError.message}`);
  }

  // The conversion of record for a team sale; amount_total already reflects
  // seats x unit price. Same dedupe (transaction_id = session id) as personal.
  await trackSubscriptionCompleted({
    clientId: session.metadata?.ga_client_id || creatorUserId,
    sessionId: session.metadata?.ga_session_id || undefined,
    plan: 'team',
    value: (session.amount_total ?? 0) / 100,
    currency: (session.currency ?? 'usd').toUpperCase(),
    transactionId: session.id,
  });

  console.log(`organization ${org.name} (${org.id}) created: ${seats} seats, manager ${creatorUserId}`);
}

/**
 * Keep an ORGANIZATION's status in step with Stripe. Returns true if this
 * subscription belonged to one.
 *
 * Deliberately only ever UPDATES a row that already exists (created by an
 * operator in /admin, or by handleOrgCheckout above) and carries this
 * `stripe_customer_id`. It never inserts, so a stray Stripe customer can
 * never conjure entitlement for an organization that does not exist.
 *
 * If an org is billed by hand (an invoice rather than a Stripe subscription)
 * there are no events at all, and the status the operator set in /admin stands.
 * That is expected, and it is why the admin panel flags a renewal date coming up.
 *
 * For self-serve orgs on the per-seat team price, the item QUANTITY is the
 * seat count, so a quantity change (from /api/org's set_seats, or a portal
 * edit) syncs `seats` too — clamped to the member count, because billing can
 * say "3 seats" but three existing members cannot be unseated by a webhook.
 * The clamp conflict is logged loudly for an admin to resolve.
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

  // Seat sync, ONLY for the per-seat team price. Any other price (a hand-made
  // subscription an admin stamped onto a manual org) must never drive seats.
  let seatColumns: { seats?: number } = {};
  const teamPriceId = serverEnv('STRIPE_PRICE_ID_TEAM');
  if (teamPriceId && item?.price.id === teamPriceId && typeof item.quantity === 'number') {
    const { count } = await supabaseAdmin
      .from('org_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', org.id);
    const memberCount = count ?? 0;
    if (item.quantity < memberCount) {
      console.error(
        `organization ${org.name} (${org.id}): Stripe quantity ${item.quantity} is below ` +
          `member count ${memberCount}; clamping seats to ${memberCount}. ` +
          'Billing and membership disagree; resolve in /admin.'
      );
    }
    seatColumns = { seats: Math.max(item.quantity, memberCount) };
  }

  const { error } = await supabaseAdmin
    .from('organizations')
    .update({
      status: sub.status,
      stripe_subscription_id: sub.id,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      ...seatColumns,
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
