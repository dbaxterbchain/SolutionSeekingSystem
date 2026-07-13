import type { User } from '@supabase/supabase-js';
import { getUserFromRequest } from './auth';
import { serverEnv } from './env';

/**
 * Who is allowed into /admin.
 *
 * The admin PAGE is public HTML: auth here is Bearer-token only (no cookies), so
 * no page can be gated before it renders. That is fine, because the page ships
 * with no data in it. The entire security boundary is this function, called at
 * the top of every /api/admin/* route. If you add a route, call this first.
 *
 * An allowlist in an env var rather than a role in the database: nothing the
 * browser can forge, no migration, and revoking someone is an env change and a
 * redeploy.
 */

/** Comma-separated addresses. UNSET MEANS NOBODY: this must fail closed. */
function adminEmails(): string[] {
  return serverEnv('ADMIN_EMAILS')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The caller if they are an admin, otherwise null. Callers 403 on null.
 *
 * `email_confirmed_at` is not paranoia. If email confirmation is ever switched
 * off on the Supabase project, then without this check anyone could sign up as
 * the admin's address, never confirm it, and own the panel. The allowlist is
 * only as trustworthy as the proof that the caller owns the address.
 */
export async function requireAdmin(request: Request): Promise<User | null> {
  const user = await getUserFromRequest(request);
  if (!user) return null;

  // An anonymous trial user has a real auth.users row and no email at all.
  if (user.is_anonymous === true) return null;
  if (!user.email || !user.email_confirmed_at) return null;

  const allow = adminEmails();
  if (allow.length === 0) {
    console.error('ADMIN_EMAILS is not set: refusing all admin access.');
    return null;
  }

  return allow.includes(user.email.toLowerCase()) ? user : null;
}

/** JSON response for admin routes. Never cached: this is somebody's private data. */
export function adminJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
