import crypto from 'node:crypto';
import { supabaseAdmin } from './supabaseAdmin';
import { serverEnv } from './env';

/**
 * White-label SSO hand-off.
 *
 * Turnstile-gated sign-in happens only on the canonical host (solutionseeking.com),
 * so a custom domain never renders Turnstile or is a Supabase redirect target. To
 * give the custom domain its own (per-origin) session, the canonical host mints a
 * single-use code that carries the freshly-signed-in session, encrypted at rest, and
 * bound to one custom domain; the custom domain exchanges it once, within ~60s, for
 * the tokens and calls supabase.auth.setSession.
 *
 * The code travels in a URL, so the controls that matter are: single-use, short TTL,
 * domain-bound, and the payload encrypted so a leaked DB row is inert without the key.
 */

const CODE_TTL_MS = 60_000;

interface Session {
  access_token: string;
  refresh_token: string;
}

function encKey(): Buffer {
  const k = Buffer.from(serverEnv('WL_AUTH_ENC_KEY'), 'base64');
  if (k.length !== 32) throw new Error('WL_AUTH_ENC_KEY must be 32 bytes, base64-encoded');
  return k;
}

/** AES-256-GCM: output is base64(iv[12] ++ tag[16] ++ ciphertext). */
function encryptSession(session: Session): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(session), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

function decryptSession(enc: string): Session {
  const raw = Buffer.from(enc, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(pt.toString('utf8')) as Session;
}

/** Normalize a host for comparison (lowercase, strip a default port). */
export function normalizeDomain(d: string): string {
  return d.trim().toLowerCase().replace(/:(80|443)$/, '');
}

/**
 * The hand-off may only target a domain that is actually a live white-label page's
 * custom domain, so a stolen/forged `return` can never make us mint a session for an
 * attacker-controlled host.
 */
async function isEligibleDomain(domain: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('white_label_pages')
    .select('id')
    .eq('custom_domain', normalizeDomain(domain))
    .eq('status', 'active')
    .maybeSingle();
  return Boolean(data);
}

/** Mint a single-use code carrying `session`, bound to `domain`. Returns null if ineligible. */
export async function issueWlAuthCode(
  userId: string,
  session: Session,
  domain: string
): Promise<string | null> {
  const target = normalizeDomain(domain);
  if (!(await isEligibleDomain(target))) return null;

  // Opportunistic sweep so expired/used rows never accumulate (no cron in this stack).
  await supabaseAdmin.from('wl_auth_codes').delete().lt('expires_at', new Date(Date.now() - CODE_TTL_MS).toISOString());

  const code = crypto.randomBytes(32).toString('base64url');
  const { error } = await supabaseAdmin.from('wl_auth_codes').insert({
    code,
    user_id: userId,
    enc_session: encryptSession(session),
    domain: target,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (error) {
    console.error('wl-auth issue failed', error);
    return null;
  }
  return code;
}

type ExchangeResult =
  | { ok: true; session: Session }
  | { ok: false; reason: 'not_found' | 'used' | 'expired' | 'domain_mismatch' };

/** Redeem a code once, for the domain it was bound to. Marks it used before returning tokens. */
export async function exchangeWlAuthCode(code: string, domain: string): Promise<ExchangeResult> {
  const { data: row } = await supabaseAdmin
    .from('wl_auth_codes')
    .select('code, enc_session, domain, expires_at, used_at')
    .eq('code', code)
    .maybeSingle();
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.used_at) return { ok: false, reason: 'used' };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: 'expired' };
  if (row.domain !== normalizeDomain(domain)) return { ok: false, reason: 'domain_mismatch' };

  // Single-use: claim it first (guard on used_at so a race can't double-redeem).
  const { data: claimed } = await supabaseAdmin
    .from('wl_auth_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('code', code)
    .is('used_at', null)
    .select('code')
    .maybeSingle();
  if (!claimed) return { ok: false, reason: 'used' };

  return { ok: true, session: decryptSession(row.enc_session) };
}
