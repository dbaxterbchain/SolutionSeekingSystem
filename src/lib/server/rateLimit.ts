import { createHash } from 'node:crypto';
import { supabaseAdmin } from './supabaseAdmin';
import { serverEnv } from './env';

/**
 * IP rate limiting for endpoints that cost real money without an account.
 *
 * Anonymous identities are free to mint, so an allowance attached to a user id
 * bounds nothing on its own. The limit that actually caps cost has to count
 * *messages per IP*.
 *
 * Raw IPs are never stored: we key on a salted hash, so the table is useless to
 * anyone who gets hold of it.
 */

/** Anonymous chat messages allowed per IP per day. */
export const ANON_CHAT_PER_IP = 25;
export const ANON_CHAT_WINDOW_SECONDS = 24 * 60 * 60;

/**
 * Netlify passes the client IP through this header; Astro's `clientAddress`
 * reads it too, but the header is the reliable one inside Functions.
 */
export function clientIp(request: Request, fallback?: string): string | null {
  return (
    request.headers.get('x-nf-client-connection-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    fallback ||
    null
  );
}

/** Salted hash of a client IP. The raw address is never stored anywhere. */
export function hashIp(ip: string): string {
  return createHash('sha256').update(`${ip}${serverEnv('IP_HASH_SALT')}`).digest('hex');
}

function bucketFor(scope: string, ip: string): string {
  return `${scope}:${hashIp(ip)}`;
}

/**
 * Count one call against an IP's budget. Returns true when the caller is over
 * the limit.
 *
 * Fails OPEN: if the IP is unknown (header shape changed) or the database call
 * errors, we allow the request. A rate limiter that silently blocks paying
 * users when infrastructure hiccups is worse than the abuse it prevents; the
 * spend cap in the Anthropic console is the real backstop.
 */
export async function isRateLimited(
  scope: string,
  ip: string | null,
  max: number,
  windowSeconds: number
): Promise<boolean> {
  if (!ip) {
    console.warn(`rate limit: no client IP available for scope "${scope}"; allowing`);
    return false;
  }
  const { data, error } = await supabaseAdmin.rpc('bump_rate_limit', {
    p_bucket: bucketFor(scope, ip),
    p_window_seconds: windowSeconds,
    p_max: max,
  });
  if (error) {
    console.error('rate limit check failed; allowing', error);
    return false;
  }
  return data === -1;
}
