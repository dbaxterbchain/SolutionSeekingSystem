import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '../supabaseAdmin';
import { COURSE } from '../../../data/course';
import { enrollmentStore, findEnrollment } from './enrollment';
import type { EnrollmentRow, EventKind } from './enrollmentRules';

/**
 * Access changes made by a person from /admin. Every change is one row update
 * plus one ledger row with the admin's id, so the history of an enrollment
 * reads the same whether Stripe or an admin wrote it. Accounts are found
 * through the auth admin API: the service role cannot read auth.users
 * through PostgREST, and a lookup by email is what an operator has in hand.
 */

const LIST_COLUMNS =
  'id, user_id, status, source, purchased_at, access_starts_at, access_ends_at, created_at, updated_at' as const;
// The same projection findEnrollment uses (enrollment.ts keeps its own copy
// private), so a row written here reads exactly like one Stripe wrote: never
// select('*') and let the row shape drift from EnrollmentRow as the table gains columns.
const ENROLLMENT_COLUMNS =
  'id, user_id, course_id, status, source, stripe_checkout_session_id, stripe_payment_intent_id, stripe_customer_id, amount_total, currency, purchased_at, access_starts_at, access_ends_at' as const;
const PAGE = 200;

export async function findUserByEmail(email: string): Promise<User | null> {
  const wanted = email.trim().toLowerCase();
  if (!wanted) return null;
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new Error(`user lookup failed: ${error.message}`);
    const hit = data.users.find((u) => (u.email ?? '').trim().toLowerCase() === wanted);
    if (hit) return hit;
    if (data.users.length < PAGE) return null;
  }
  return null;
}

export interface EnrollmentListRow {
  id: string;
  user_id: string;
  email: string | null;
  status: 'enrolled' | 'revoked' | 'refunded';
  source: 'stripe' | 'admin';
  purchased_at: string | null;
  access_starts_at: string;
  access_ends_at: string | null;
  created_at: string;
  updated_at: string;
}

/** The newest 200 enrollments with the account's email resolved for each. */
export async function listEnrollments(): Promise<EnrollmentListRow[]> {
  const { data, error } = await supabaseAdmin
    .from('course_enrollments')
    .select(LIST_COLUMNS)
    .eq('course_id', COURSE.id)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(`enrollment list failed: ${error.message}`);
  const rows = data ?? [];
  const emails = new Map<string, string | null>();
  await Promise.all(
    [...new Set(rows.map((r) => r.user_id))].map(async (userId) => {
      const { data: found } = await supabaseAdmin.auth.admin.getUserById(userId);
      emails.set(userId, found?.user?.email ?? null);
    })
  );
  return rows.map((r) => ({ ...(r as Omit<EnrollmentListRow, 'email'>), email: emails.get(r.user_id) ?? null }));
}

export type AdminOutcome =
  | { ok: true; enrollment: EnrollmentRow; kind: EventKind }
  | { ok: false; error: 'already_enrolled' | 'not_enrolled' | 'not_inactive' };

async function ledger(row: EnrollmentRow, kind: EventKind, admin: User, note: string | null): Promise<void> {
  await enrollmentStore.addEvent({
    enrollment_id: row.id,
    user_id: row.user_id,
    course_id: row.course_id,
    kind,
    actor: 'admin',
    actor_user_id: admin.id,
    stripe_checkout_session_id: null,
    stripe_event_id: null,
    note,
  });
}

async function updateStatus(id: string, patch: Record<string, unknown>): Promise<EnrollmentRow> {
  const { data, error } = await supabaseAdmin
    .from('course_enrollments')
    .update(patch)
    .eq('id', id)
    .select(ENROLLMENT_COLUMNS)
    .single();
  if (error) throw new Error(`enrollment update failed: ${error.message}`);
  return data as EnrollmentRow;
}

/** Give an account access. A revoked or refunded row is reinstated; a missing row is created with source admin. */
export async function grantEnrollment(userId: string, admin: User, note: string | null): Promise<AdminOutcome> {
  const existing = await findEnrollment(userId, COURSE.id);
  if (existing?.status === 'enrolled') return { ok: false, error: 'already_enrolled' };
  if (existing) {
    const row = await updateStatus(existing.id, {
      status: 'enrolled',
      access_starts_at: new Date().toISOString(),
      access_ends_at: null,
    });
    await ledger(row, 'reinstated', admin, note);
    return { ok: true, enrollment: row, kind: 'reinstated' };
  }
  const { data, error } = await supabaseAdmin
    .from('course_enrollments')
    .insert({
      user_id: userId,
      course_id: COURSE.id,
      status: 'enrolled',
      source: 'admin',
      access_starts_at: new Date().toISOString(),
    })
    .select(ENROLLMENT_COLUMNS)
    .single();
  if (error) throw new Error(`enrollment insert failed: ${error.message}`);
  const row = data as EnrollmentRow;
  await ledger(row, 'admin_granted', admin, note);
  return { ok: true, enrollment: row, kind: 'admin_granted' };
}

/** End access: revoked (a decision) or refunded (the money moved back in the Stripe dashboard). */
export async function setEnrollmentStatus(
  userId: string,
  status: 'revoked' | 'refunded',
  admin: User,
  note: string | null
): Promise<AdminOutcome> {
  const existing = await findEnrollment(userId, COURSE.id);
  if (!existing || existing.status !== 'enrolled') return { ok: false, error: 'not_enrolled' };
  const row = await updateStatus(existing.id, { status, access_ends_at: new Date().toISOString() });
  await ledger(row, status, admin, note);
  return { ok: true, enrollment: row, kind: status };
}

/** Restore access to a revoked or refunded row. */
export async function reinstateEnrollment(userId: string, admin: User, note: string | null): Promise<AdminOutcome> {
  const existing = await findEnrollment(userId, COURSE.id);
  if (!existing || existing.status === 'enrolled') return { ok: false, error: 'not_inactive' };
  const row = await updateStatus(existing.id, { status: 'enrolled', access_ends_at: null });
  await ledger(row, 'reinstated', admin, note);
  return { ok: true, enrollment: row, kind: 'reinstated' };
}
