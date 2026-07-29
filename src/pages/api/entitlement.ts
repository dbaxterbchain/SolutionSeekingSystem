import type { APIRoute } from 'astro';
import { getUserFromRequest } from '../../lib/server/auth';
import { checkEntitlement, hasAuthorSource } from '../../lib/server/entitlement';
import { getOrgMemberships } from '../../lib/server/orgMembership';

export const prerender = false;

/**
 * What this user is allowed to do, according to the server.
 *
 * The client used to work this out for itself, by reading `subscriptions` and
 * `ai_usage` from the browser. That was always a duplicate of the server's
 * logic, and it broke the moment entitlement could come from somewhere other
 * than a personal Stripe row: an organization's member has no `subscriptions`
 * record at all, so the browser would call them a free user and, if they had
 * already spent their 10 free messages, replace the composer with a paywall.
 * They would be locked out of a product their employer pays for, and no request
 * would ever reach the server to correct it.
 *
 * So there is now exactly one authority, and this endpoint is it: the SAME
 * checkEntitlement() that /api/chat enforces. The client cannot disagree with
 * the server, because it is no longer computing an opinion of its own.
 *
 * Never cached. An entitlement response held by any intermediary is one user's
 * access leaking into another user's browser.
 */
export const GET: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  const entitlement = await checkEntitlement(user);

  // Subscribers also learn whether they may AUTHOR (create assistants, keep a
  // document library): false only for client-only users, whose every entitled
  // seat is a client seat. The membership lookup is skipped for personal
  // Stripe subscribers, who always author.
  const payload =
    entitlement.kind === 'subscriber'
      ? {
          ...entitlement,
          authoring:
            entitlement.via === 'stripe' ||
            hasAuthorSource(entitlement, await getOrgMemberships(user)),
        }
      : entitlement;

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
