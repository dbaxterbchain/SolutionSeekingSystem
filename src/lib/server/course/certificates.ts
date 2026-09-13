import { randomBytes } from 'node:crypto';
import { supabaseAdmin } from '../supabaseAdmin';
import { COURSE } from '../../../data/course';
import { SHARE_TOKEN_BYTES, type CertificateRowLike } from '../../course/certificateRules';
import type { PublicCertificate } from '../../course/assessmentTypes';
import { workerOrigin } from './workerTrigger';

/**
 * The learner's certificate: one row per (user, certification version),
 * written by finalize_course_grade or issue_course_certificate and read here
 * by user id, so a certificate id on its own opens nothing. The share token is
 * minted the first time sharing turns on and kept when it turns off, so
 * turning it on again restores the same link. Every function throws with a
 * prefix on a database error; the route answers 503.
 */

export const CERTIFICATE_COLUMNS =
  'id, serial, user_id, certification_version, attempt_id, display_name, name_confirmed_at, issued_at, status, revoked_at, revoke_reason, share_token, share_active, email_sent_at, issued_by, revoked_by, created_at, updated_at' as const;

export interface CertificateRow extends CertificateRowLike {
  user_id: string;
  attempt_id: string | null;
  revoke_reason: string | null;
  email_sent_at: string | null;
  issued_by: string | null;
  revoked_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * What the admin area may see: every certificate column except the share
 * token. The token is the whole secret of a verification link, an operator
 * never needs it, and a response that carries one hands out working links for
 * learners who turned sharing off.
 */
export const ADMIN_CERTIFICATE_COLUMNS =
  'id, serial, user_id, certification_version, attempt_id, display_name, name_confirmed_at, issued_at, status, revoked_at, revoke_reason, share_active, email_sent_at, issued_by, revoked_by, created_at, updated_at' as const;

export type AdminCertificateRow = Omit<CertificateRow, 'share_token'>;

const asRow = (data: unknown): CertificateRow => data as CertificateRow;

/** Where share links and email links point: the deploy that is serving, production's own address in production. */
export const certificateOrigin = (requestOrigin: string): string => workerOrigin(requestOrigin) || requestOrigin;

export async function loadOwnedCertificate(userId: string, version: string = COURSE.certificationVersion): Promise<CertificateRow | null> {
  const { data, error } = await supabaseAdmin
    .from('course_certificates')
    .select(CERTIFICATE_COLUMNS)
    .eq('user_id', userId)
    .eq('certification_version', version)
    .maybeSingle();
  if (error) throw new Error(`certificate load failed: ${error.message}`);
  return data ? asRow(data) : null;
}

/**
 * Sets the name once: a compare-and-set on name_confirmed_at. Null when the
 * row is not this learner's, is revoked, or already has a confirmed name.
 */
export async function confirmCertificateName(id: string, userId: string, name: string): Promise<CertificateRow | null> {
  const { data, error } = await supabaseAdmin
    .from('course_certificates')
    .update({ display_name: name, name_confirmed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('name_confirmed_at', null)
    .select(CERTIFICATE_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`certificate name failed: ${error.message}`);
  return data ? asRow(data) : null;
}

export const mintShareToken = (): string => randomBytes(SHARE_TOKEN_BYTES).toString('base64url');

/**
 * Turns sharing on or off in two statements. Minting happens only when this
 * row has no token yet, and that update is itself guarded on share_token
 * being null, so two concurrent turn-on requests against a tokenless row
 * race to mint but at most one write lands; a loser's attempt simply matches
 * nothing. The second statement sets share_active, always runs, and always
 * reads the row back, so every caller answers with the token the database
 * actually holds rather than the one it minted locally. Null when the row is
 * no longer this learner's active certificate, including one revoked between
 * the two statements.
 */
export async function setCertificateSharing(row: CertificateRow, active: boolean): Promise<CertificateRow | null> {
  if (!row.share_token) {
    const { error: mintError } = await supabaseAdmin
      .from('course_certificates')
      .update({ share_token: mintShareToken() })
      .eq('id', row.id)
      .eq('user_id', row.user_id)
      .eq('status', 'active')
      .is('share_token', null);
    if (mintError) throw new Error(`certificate sharing failed: ${mintError.message}`);
  }
  const { data, error } = await supabaseAdmin
    .from('course_certificates')
    .update({ share_active: active })
    .eq('id', row.id)
    .eq('user_id', row.user_id)
    .eq('status', 'active')
    .select(CERTIFICATE_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`certificate sharing failed: ${error.message}`);
  return data ? asRow(data) : null;
}

/**
 * The verify page's lookup: active, shared, with a confirmed name. Anything
 * else is null, and the page treats every null the same way.
 */
export async function lookupSharedCertificate(token: string): Promise<PublicCertificate | null> {
  const { data, error } = await supabaseAdmin
    .from('course_certificates')
    .select('display_name, serial, certification_version, issued_at')
    .eq('share_token', token)
    .eq('share_active', true)
    .eq('status', 'active')
    .not('name_confirmed_at', 'is', null)
    .maybeSingle();
  if (error) throw new Error(`certificate lookup failed: ${error.message}`);
  if (!data || !data.display_name) return null;
  return { display_name: data.display_name, serial: data.serial, certification_version: data.certification_version, issued_at: data.issued_at };
}
