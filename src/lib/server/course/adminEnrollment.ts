import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '../supabaseAdmin';
import { COURSE } from '../../../data/course';
import type { EnrollmentRow, EventKind } from './enrollmentRules';

/**
 * Access changes made by a person from /admin. Every change is one row update
 * plus one ledger row with the admin's id, committed together by the
 * admin_change_course_access() function (migration 0030): the two writes are
 * one transaction there, so a ledger insert that fails can never leave a real
 * access change with no audit row. Accounts are found through the auth admin
 * API: the service role cannot read auth.users through PostgREST, and a
 * lookup by email is what an operator has in hand.
 */

const LIST_COLUMNS =
  'id, user_id, status, source, purchased_at, access_starts_at, access_ends_at, created_at, updated_at' as const;
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
  | { ok: false; error: 'already_enrolled' | 'not_enrolled' | 'not_inactive' | 'already_refunded' };

/**
 * Grant, revoke, refund or reinstate. Calls admin_change_course_access()
 * (migration 0030), which locks the row, applies the change and writes the
 * ledger row in one transaction, so the two can never come apart. The
 * function also owns which statuses each action accepts: a refund may follow
 * a revoke, and only a row already refunded refuses one.
 */
export async function changeCourseAccess(
  userId: string,
  action: 'grant' | 'revoke' | 'refund' | 'reinstate',
  admin: User,
  note: string | null
): Promise<AdminOutcome> {
  const { data, error } = await supabaseAdmin.rpc('admin_change_course_access', {
    p_user: userId,
    p_course: COURSE.id,
    p_admin: admin.id,
    p_action: action,
    p_note: note,
  });
  if (error) throw new Error(`enrollment access change failed: ${error.message}`);
  const outcome = data as { outcome: string; enrollment?: unknown };
  const kind = outcome.outcome;
  if (kind === 'already_enrolled' || kind === 'not_enrolled' || kind === 'not_inactive' || kind === 'already_refunded') {
    return { ok: false, error: kind };
  }
  if (kind === 'admin_granted' || kind === 'reinstated' || kind === 'revoked' || kind === 'refunded') {
    return { ok: true, enrollment: outcome.enrollment as EnrollmentRow, kind };
  }
  throw new Error(`enrollment access change returned unexpected outcome: ${kind}`);
}
