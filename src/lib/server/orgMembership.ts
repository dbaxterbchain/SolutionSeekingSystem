import { supabaseAdmin } from './supabaseAdmin';

export type OrgRole = 'member' | 'manager';

export interface OrgMembership {
  orgId: string;
  orgName: string;
  orgStatus: string;
  role: OrgRole;
}

/**
 * The user's claimed organization seat (one per user), or null. Service role,
 * because org membership is deliberately unreadable from the browser (0012).
 *
 * Powers "shared with my org" access (chat, assistants) and the manager role
 * that gates sharing and white-label management. Returns the seat regardless of
 * org status, so a manager of a past_due org can still manage; callers that care
 * about entitlement check `orgStatus` themselves.
 */
export async function getOrgMembership(userId: string): Promise<OrgMembership | null> {
  const { data, error } = await supabaseAdmin
    .from('org_members')
    .select('role, org_id, organizations ( name, status )')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('org membership lookup failed', error);
    return null;
  }
  if (!data?.org_id) return null;
  const org = data.organizations as unknown as { name: string; status: string } | null;
  if (!org) return null;
  return {
    orgId: data.org_id,
    orgName: org.name,
    orgStatus: org.status,
    role: (data.role as OrgRole) ?? 'member',
  };
}
