import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from './supabaseAdmin';

export type OrgRole = 'member' | 'manager' | 'client';

export interface OrgMembership {
  orgId: string;
  orgName: string;
  orgStatus: string;
  role: OrgRole;
  /** The org_members row id (the SEAT): per-member shares are keyed to it. */
  memberId: string;
}

/**
 * Every organization the user belongs to, claiming any unclaimed seats first.
 *
 * A person can hold a seat in several orgs (migration 0024). This claims EVERY
 * seat matching their confirmed email — that is the seat-claim, and doing it here
 * (not only in checkEntitlement) is what fixes the bug where a member who is also
 * a personal subscriber never claimed, because entitlement short-circuited on the
 * Stripe subscription. The claim is idempotent and cheap once done.
 *
 * Service role, because org membership is deliberately unreadable from a browser
 * (0012). Callers decide which org is "active" and check role per org.
 */
export async function getOrgMemberships(user: User): Promise<OrgMembership[]> {
  const email = user.email_confirmed_at ? user.email : null;
  if (email) {
    const { error } = await supabaseAdmin.rpc('claim_org_seats', {
      p_user_id: user.id,
      p_email: email,
    });
    if (error) console.error('claim_org_seats failed', error);
  }

  const { data, error } = await supabaseAdmin
    .from('org_members')
    .select('id, role, org_id, organizations ( name, status )')
    .eq('user_id', user.id);
  if (error) {
    console.error('org memberships lookup failed', error);
    return [];
  }

  const memberships: OrgMembership[] = [];
  for (const row of data ?? []) {
    const org = row.organizations as unknown as { name: string; status: string } | null;
    if (!row.org_id || !org) continue;
    memberships.push({
      orgId: row.org_id,
      orgName: org.name,
      orgStatus: org.status,
      role: (row.role as OrgRole) ?? 'member',
      memberId: row.id,
    });
  }
  return memberships;
}

/** The user's membership (seat) in the given org, if any. */
export const getMembership = (
  memberships: OrgMembership[],
  orgId: string
): OrgMembership | undefined => memberships.find((m) => m.orgId === orgId);

/** True if the user is a member of the given org (any role, clients included). */
export const isMemberOf = (memberships: OrgMembership[], orgId: string): boolean =>
  memberships.some((m) => m.orgId === orgId);

/**
 * True if the user holds a member or manager seat in the given org. Clients
 * fail this: it gates org-wide resources (org documents, org-shared
 * assistants, creating into the workspace) that a client seat must not reach.
 */
export const isNonClientMemberOf = (memberships: OrgMembership[], orgId: string): boolean =>
  memberships.some((m) => m.orgId === orgId && m.role !== 'client');

/** True if the user is a manager of the given org. */
export const isManagerOf = (memberships: OrgMembership[], orgId: string): boolean =>
  memberships.some((m) => m.orgId === orgId && m.role === 'manager');
