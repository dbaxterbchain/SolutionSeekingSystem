import type { User } from '@supabase/supabase-js';
import { json } from './auth';
import { requireSubscriber } from './subscriberAuth';
import { getOrgMemberships, type OrgMembership } from './orgMembership';
import { isUuid } from './whiteLabel';

/**
 * Manager-only gate, scoped to a specific organization the caller manages.
 *
 * The same shape as the local requireManager helpers in the white-label
 * routes (src/pages/api/white-label*.ts), extracted for the org-management
 * API. The white-label routes keep their local copies for now; consolidating
 * them onto this module is a follow-up.
 *
 * Returns the caller's full membership list too, so a route that needs more
 * than the gate (e.g. /api/org's GET) doesn't fetch memberships twice.
 */
export async function requireManager(
  request: Request,
  orgId: string
): Promise<
  | { user: User; orgName: string; memberships: OrgMembership[] }
  | { response: Response }
> {
  const auth = await requireSubscriber(request);
  if ('error' in auth) return { response: json({ error: auth.error }, auth.status) };
  if (!isUuid(orgId)) return { response: json({ error: 'bad_request' }, 400) };
  const memberships = await getOrgMemberships(auth.user);
  const org = memberships.find((m) => m.orgId === orgId && m.role === 'manager');
  if (!org) return { response: json({ error: 'manager_required' }, 403) };
  return { user: auth.user, orgName: org.orgName, memberships };
}
