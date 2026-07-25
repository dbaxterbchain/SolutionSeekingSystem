import { supabase } from './supabase';

/**
 * Client wrappers for /api/org — manager self-service for an organization.
 * Same shape as whiteLabelClient.ts: bearer-token fetches that throw friendly
 * Error messages built from the server's `message` field when present.
 */

export interface OrgMemberView {
  id: string;
  email: string;
  claimed: boolean;
  role: 'member' | 'manager';
  joined_at: string | null;
  is_self: boolean;
}

export interface OrgView {
  org: {
    id: string;
    name: string;
    seats: number;
    status: string;
    billing: 'manual' | 'stripe';
    current_period_end: string | null;
    has_billing: boolean;
  };
  members: OrgMemberView[];
  member_count: number;
  manager_count: number;
  min_seats: number;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchOrg(orgId: string): Promise<OrgView> {
  const res = await fetch(`/api/org?org_id=${encodeURIComponent(orgId)}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error('Could not load your organization.');
  return (await res.json()) as OrgView;
}

async function post(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch('/api/org', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message ?? orgErrorMessage(data?.error));
  return data ?? {};
}

export async function renameOrg(orgId: string, name: string): Promise<void> {
  await post({ action: 'rename', org_id: orgId, name });
}

export async function addMember(orgId: string, email: string): Promise<void> {
  await post({ action: 'add_member', org_id: orgId, email });
}

export async function removeMember(orgId: string, memberId: string): Promise<void> {
  await post({ action: 'remove_member', org_id: orgId, id: memberId });
}

export async function setMemberRole(
  orgId: string,
  memberId: string,
  role: 'member' | 'manager'
): Promise<void> {
  await post({ action: 'set_role', org_id: orgId, id: memberId, role });
}

export async function setSeats(orgId: string, seats: number): Promise<void> {
  await post({ action: 'set_seats', org_id: orgId, seats });
}

export async function openBillingPortal(orgId: string): Promise<string> {
  const data = await post({ action: 'billing_portal', org_id: orgId });
  return String(data.url ?? '');
}

function orgErrorMessage(code?: string): string {
  switch (code) {
    case 'manager_required':
      return 'Only an organization manager can do that.';
    case 'last_manager':
      return 'An organization needs at least one manager.';
    case 'no_seats':
      return 'No free seats left. Increase your seat count first.';
    case 'duplicate':
      return 'That email is already a member of this organization.';
    case 'manual_billing':
      return 'Your organization is billed by invoice. Contact us to change seats.';
    case 'custom_billing':
      return 'Your billing is customized. Contact us to change seats.';
    case 'no_billing':
      return 'This organization has no online billing to manage.';
    case 'rate_limited':
      return 'Too many changes at once. Wait a moment and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
