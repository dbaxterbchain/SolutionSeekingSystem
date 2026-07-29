import type { APIRoute } from 'astro';
import { json } from '../../lib/server/auth';
import { requireManager } from '../../lib/server/orgAuth';
import { supabaseAdmin } from '../../lib/server/supabaseAdmin';
import { getStripe } from '../../lib/server/stripe';
import { serverEnv } from '../../lib/server/env';
import { isRateLimited } from '../../lib/server/rateLimit';
import { TEAM_MIN_SEATS, TEAM_MAX_SEATS } from '../../data/pricing';

export const prerender = false;

/**
 * Self-service organization management, for managers.
 *
 * The manager-facing sibling of /api/admin/orgs: one aggregate route with an
 * action discriminator, because every member operation needs the org and its
 * membership list anyway. Everything here is scoped by requireManager, so a
 * plain member (or a manager of a DIFFERENT org) gets a 403 before any data
 * moves.
 *
 * Two rules with no admin equivalent, because managers can lock themselves
 * out and admins cannot:
 *  - last-manager: the only manager cannot be removed or demoted (an org must
 *    always have someone who can run it). /admin stays exempt on purpose so
 *    weird states are always repairable.
 *  - seat floor: seats cannot drop below the member count (also enforced by
 *    the 0027 trigger as a backstop).
 *
 * Seat changes are Stripe-first: the subscription item quantity is updated
 *  before the DB row, so the database never claims seats the customer is not
 * being billed for. A failed DB write self-heals via the webhook's
 * customer.subscription.updated re-sync.
 */

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const clean = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

/** Same deliberately permissive email shape as the admin route. */
const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

interface OrgRow {
  id: string;
  name: string;
  seats: number;
  status: string;
  billing: 'manual' | 'stripe';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
}

async function loadOrg(orgId: string): Promise<OrgRow | null> {
  const { data } = await supabaseAdmin
    .from('organizations')
    .select(
      'id, name, seats, status, billing, stripe_customer_id, stripe_subscription_id, current_period_end'
    )
    .eq('id', orgId)
    .maybeSingle();
  return (data as OrgRow | null) ?? null;
}

export const GET: APIRoute = async ({ request }) => {
  const orgId = new URL(request.url).searchParams.get('org_id') ?? '';
  const gate = await requireManager(request, orgId);
  if ('response' in gate) return gate.response;

  const [org, members] = await Promise.all([
    loadOrg(orgId),
    supabaseAdmin
      .from('org_members')
      .select('id, email, user_id, role, joined_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true }),
  ]);
  if (!org || members.error) {
    console.error('org load failed', members.error);
    return json({ error: 'server_error' }, 500);
  }

  // Never leak user ids; `claimed` and `is_self` are all the client needs.
  const rows = (members.data ?? []).map((m) => ({
    id: m.id,
    email: m.email,
    claimed: m.user_id !== null,
    role: (m.role ?? 'member') as 'member' | 'manager' | 'client',
    joined_at: m.joined_at,
    is_self: m.user_id === gate.user.id,
  }));

  return json({
    org: {
      id: org.id,
      name: org.name,
      seats: org.seats,
      status: org.status,
      billing: org.billing,
      current_period_end: org.current_period_end,
      has_billing: org.stripe_customer_id !== null,
    },
    members: rows,
    member_count: rows.length,
    manager_count: rows.filter((m) => m.role === 'manager').length,
    min_seats: TEAM_MIN_SEATS,
  });
};

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: 'bad_request' }, 400);
  const orgId = str(body.org_id);
  const gate = await requireManager(request, orgId);
  if ('response' in gate) return gate.response;

  switch (str(body.action)) {
    case 'rename': {
      const name = clean(body.name, 120);
      if (name.length < 2) {
        return json({ error: 'bad_request', message: 'Give your organization a name.' }, 400);
      }
      const { error } = await supabaseAdmin
        .from('organizations')
        .update({ name })
        .eq('id', orgId);
      if (error) return fail('org rename', error);
      return json({ ok: true });
    }

    case 'add_member': {
      const email = clean(body.email, 254).toLowerCase();
      if (!looksLikeEmail(email)) {
        return json({ error: 'bad_request', message: 'A valid email address is required.' }, 400);
      }
      const role = body.role === undefined ? 'member' : body.role;
      if (role !== 'member' && role !== 'manager' && role !== 'client') {
        return json({ error: 'bad_request', message: 'Unknown role.' }, 400);
      }
      // Keyed to the user, not the IP: a manager legitimately adds many
      // members in a sitting, but not hundreds in an hour.
      if (await isRateLimited('org_add_member', gate.user.id, 30, 60 * 60)) {
        return json({ error: 'rate_limited' }, 429);
      }
      const { error } = await supabaseAdmin.from('org_members').insert({ org_id: orgId, email, role });
      if (error) return fail('org add_member', error);
      return json({ ok: true });
    }

    case 'remove_member': {
      const target = await loadMember(orgId, str(body.id));
      if (!target) return json({ error: 'not_found' }, 404);
      if (target.role === 'manager' && (await managerCount(orgId)) <= 1) {
        return json(
          { error: 'last_manager', message: 'An organization needs at least one manager.' },
          409
        );
      }
      const { error } = await supabaseAdmin.from('org_members').delete().eq('id', target.id);
      if (error) return fail('org remove_member', error);
      return json({ ok: true });
    }

    case 'set_role': {
      const role = body.role;
      if (role !== 'member' && role !== 'manager' && role !== 'client') {
        return json({ error: 'bad_request' }, 400);
      }
      const target = await loadMember(orgId, str(body.id));
      if (!target) return json({ error: 'not_found' }, 404);
      // Demoting the only manager (yourself included, to ANY other role)
      // would strand the org.
      if (
        role !== 'manager' &&
        target.role === 'manager' &&
        (await managerCount(orgId)) <= 1
      ) {
        return json(
          { error: 'last_manager', message: 'An organization needs at least one manager.' },
          409
        );
      }
      const { error } = await supabaseAdmin
        .from('org_members')
        .update({ role })
        .eq('id', target.id);
      if (error) return fail('org set_role', error);
      return json({ ok: true });
    }

    case 'set_seats': {
      const seats = Number(body.seats);
      const org = await loadOrg(orgId);
      if (!org) return json({ error: 'server_error' }, 500);

      if (org.billing !== 'stripe' || !org.stripe_subscription_id) {
        return json(
          {
            error: 'manual_billing',
            message: 'Your organization is billed by invoice. Contact us to change seats.',
          },
          409
        );
      }
      if (!Number.isInteger(seats) || seats < TEAM_MIN_SEATS || seats > TEAM_MAX_SEATS) {
        return json(
          {
            error: 'bad_request',
            message: `Teams plans have a ${TEAM_MIN_SEATS} seat minimum.`,
          },
          400
        );
      }
      const { count } = await supabaseAdmin
        .from('org_members')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId);
      const memberCount = count ?? 0;
      if (seats < memberCount) {
        return json(
          {
            error: 'too_few_seats',
            message: `You have ${memberCount} members. Remove members first or keep at least ${memberCount} seats.`,
          },
          409
        );
      }

      try {
        const sub = await getStripe().subscriptions.retrieve(org.stripe_subscription_id);
        const item = sub.items.data[0];
        // Defense in depth on top of the billing column: never do per-seat
        // quantity math against a price that is not the team price.
        if (!item || item.price.id !== serverEnv('STRIPE_PRICE_ID_TEAM')) {
          return json(
            {
              error: 'custom_billing',
              message: 'Your billing is customized. Contact us to change seats.',
            },
            409
          );
        }
        if (item.quantity !== seats) {
          await getStripe().subscriptionItems.update(item.id, {
            quantity: seats,
            proration_behavior: 'create_prorations',
          });
        }
      } catch (err) {
        console.error('org set_seats stripe update failed', err);
        return json({ error: 'stripe_failed' }, 502);
      }

      // Stripe succeeded; mirror it. If this write fails the webhook's
      // subscription.updated re-sync writes the same value shortly after.
      const { error } = await supabaseAdmin
        .from('organizations')
        .update({ seats })
        .eq('id', orgId);
      if (error) console.error('org set_seats db mirror failed (webhook will heal)', error);
      return json({ ok: true, seats });
    }

    case 'billing_portal': {
      const org = await loadOrg(orgId);
      if (!org) return json({ error: 'server_error' }, 500);
      if (!org.stripe_customer_id) return json({ error: 'no_billing' }, 404);
      try {
        const origin = new URL(request.url).origin;
        const session = await getStripe().billingPortal.sessions.create({
          customer: org.stripe_customer_id,
          return_url: `${origin}/dashboard`,
        });
        return json({ url: session.url });
      } catch (err) {
        console.error('org billing portal failed', err);
        return json({ error: 'portal_failed' }, 502);
      }
    }

    default:
      return json({ error: 'unknown_action' }, 400);
  }
};

async function loadMember(
  orgId: string,
  memberId: string
): Promise<{ id: string; role: string } | null> {
  if (!memberId) return null;
  // Scoped by org_id so a manager can never touch another org's member row by id.
  const { data } = await supabaseAdmin
    .from('org_members')
    .select('id, role')
    .eq('id', memberId)
    .eq('org_id', orgId)
    .maybeSingle();
  return data ?? null;
}

async function managerCount(orgId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from('org_members')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('role', 'manager');
  return count ?? 0;
}

/** Same constraint-to-sentence translation as the admin route. */
function fail(what: string, error: { code?: string; message: string }): Response {
  if (error.code === '23514') {
    return json(
      { error: 'no_seats', message: 'No free seats left. Increase your seat count first.' },
      409
    );
  }
  if (error.code === '23505') {
    return json(
      { error: 'duplicate', message: 'That email is already a member of this organization.' },
      409
    );
  }
  console.error(`${what} failed`, error);
  return json({ error: 'server_error' }, 500);
}
