import type { APIRoute } from 'astro';
import { requireAdmin, adminJson } from '../../../lib/server/adminAuth';
import { supabaseAdmin } from '../../../lib/server/supabaseAdmin';

export const prerender = false;

/**
 * Concierge organizations: create one, set its seats, add member emails.
 *
 * This is the only route with an action discriminator rather than its own file,
 * because an organization and its members are one aggregate: every member
 * operation needs the org, and splitting them would just duplicate that lookup.
 *
 * A member gets access by signing in with a listed email (see `claim_org_seat`
 * in migration 0012). There is no invite token, because there is nothing to
 * prove: the address IS the credential, and Supabase already made them confirm
 * it. So the operator's real job is to tell people which address to use.
 */

const STATUSES = ['trialing', 'active', 'past_due', 'canceled', 'paused'];

const clean = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

export const GET: APIRoute = async ({ request }) => {
  const admin = await requireAdmin(request);
  if (!admin) return adminJson({ error: 'forbidden' }, 403);

  const [orgs, members] = await Promise.all([
    supabaseAdmin
      .from('organizations')
      .select(
        'id, name, seats, status, billing, stripe_customer_id, stripe_subscription_id, created_by, current_period_end, note, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(200),
    supabaseAdmin
      .from('org_members')
      .select('id, org_id, email, user_id, role, joined_at, created_at')
      .order('created_at', { ascending: true })
      .limit(1000),
  ]);

  if (orgs.error || members.error) {
    console.error('admin orgs list failed', orgs.error ?? members.error);
    return adminJson({ error: 'server_error' }, 500);
  }

  // Never leak the raw user_id; the admin only needs to know whether the seat
  // has been claimed (i.e. whether that person has actually signed in yet).
  const rows = (orgs.data ?? []).map((o) => ({
    ...o,
    members: (members.data ?? [])
      .filter((m) => m.org_id === o.id)
      .map((m) => ({
        id: m.id,
        email: m.email,
        claimed: m.user_id !== null,
        role: m.role ?? 'member',
        joined_at: m.joined_at,
      })),
  }));

  return adminJson({ rows });
};

export const POST: APIRoute = async ({ request }) => {
  const admin = await requireAdmin(request);
  if (!admin) return adminJson({ error: 'forbidden' }, 403);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;

  switch (action) {
    case 'create': {
      const name = clean(body?.name, 120);
      const seats = Number(body?.seats);
      if (!name || !Number.isInteger(seats) || seats < 1) {
        return adminJson({ error: 'invalid', message: 'A name and a seat count are required.' }, 400);
      }
      const { data, error } = await supabaseAdmin
        .from('organizations')
        .insert({
          name,
          seats,
          status: STATUSES.includes(body?.status as string) ? (body!.status as string) : 'active',
          stripe_customer_id: clean(body?.stripe_customer_id, 60) || null,
          current_period_end: clean(body?.current_period_end, 40) || null,
          note: clean(body?.note, 2000) || null,
        })
        .select('id')
        .single();
      if (error) return fail('org create', error);
      console.log('admin action', admin.email, 'org created', data.id, name);
      return adminJson({ ok: true, id: data.id });
    }

    case 'update': {
      const id = clean(body?.id, 40);
      if (!id) return adminJson({ error: 'invalid' }, 400);

      const patch: Record<string, unknown> = {};
      if (typeof body?.name === 'string') patch.name = clean(body.name, 120);
      if (body?.seats !== undefined) {
        const seats = Number(body.seats);
        if (!Number.isInteger(seats) || seats < 1) return adminJson({ error: 'invalid' }, 400);
        // Pre-check the 0027 seat floor so the operator gets the real story
        // instead of fail()'s "no free seats" message (same errcode, 23514).
        const { count } = await supabaseAdmin
          .from('org_members')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', id);
        if (seats < (count ?? 0)) {
          return adminJson(
            {
              error: 'seats_below_members',
              message: `Seat count is below the current member count (${count}). Remove members first.`,
            },
            409
          );
        }
        patch.seats = seats;
      }
      if (typeof body?.status === 'string') {
        if (!STATUSES.includes(body.status)) return adminJson({ error: 'invalid' }, 400);
        patch.status = body.status;
      }
      if (typeof body?.billing === 'string') {
        // 'stripe' means "the per-seat team subscription drives seats". Only
        // set it when that is actually true; see migration 0027.
        if (body.billing !== 'manual' && body.billing !== 'stripe') {
          return adminJson({ error: 'invalid' }, 400);
        }
        patch.billing = body.billing;
      }
      if (body?.stripe_customer_id !== undefined) {
        patch.stripe_customer_id = clean(body.stripe_customer_id, 60) || null;
      }
      if (body?.current_period_end !== undefined) {
        patch.current_period_end = clean(body.current_period_end, 40) || null;
      }
      if (body?.note !== undefined) patch.note = clean(body.note, 2000) || null;

      const { error } = await supabaseAdmin.from('organizations').update(patch).eq('id', id);
      if (error) return fail('org update', error);
      console.log('admin action', admin.email, 'org updated', id, JSON.stringify(patch));
      return adminJson({ ok: true });
    }

    case 'add_member': {
      const orgId = clean(body?.org_id, 40);
      const email = clean(body?.email, 254).toLowerCase();
      if (!orgId || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        return adminJson({ error: 'invalid', message: 'A valid email address is required.' }, 400);
      }
      const { error } = await supabaseAdmin
        .from('org_members')
        .insert({ org_id: orgId, email });
      if (error) return fail('org add_member', error);
      console.log('admin action', admin.email, 'org', orgId, '+member', email);
      return adminJson({ ok: true });
    }

    case 'remove_member': {
      const id = clean(body?.id, 40);
      if (!id) return adminJson({ error: 'invalid' }, 400);
      const { error } = await supabaseAdmin.from('org_members').delete().eq('id', id);
      if (error) return fail('org remove_member', error);
      console.log('admin action', admin.email, 'member removed', id);
      return adminJson({ ok: true });
    }

    case 'set_role': {
      const id = clean(body?.id, 40);
      const role = body?.role;
      if (!id || (role !== 'member' && role !== 'manager' && role !== 'client')) {
        return adminJson({ error: 'invalid' }, 400);
      }
      const { error } = await supabaseAdmin.from('org_members').update({ role }).eq('id', id);
      if (error) return fail('org set_role', error);
      console.log('admin action', admin.email, 'member', id, 'role', role);
      return adminJson({ ok: true });
    }

    default:
      return adminJson({ error: 'unknown_action' }, 400);
  }
};

/**
 * Turn the two constraints that will actually fire into sentences an operator
 * can act on. Both are the database refusing something a human got wrong, so
 * neither is a 500.
 */
function fail(what: string, error: { code?: string; message: string }): Response {
  if (error.code === '23514') {
    return adminJson(
      {
        error: 'no_seats',
        message: 'That organization has no free seats. Raise the seat count first.',
      },
      409
    );
  }
  if (error.code === '23505') {
    return adminJson(
      {
        error: 'duplicate',
        message: 'That email is already a member of this organization.',
      },
      409
    );
  }
  console.error(`admin ${what} failed`, error);
  return adminJson({ error: 'server_error' }, 500);
}
