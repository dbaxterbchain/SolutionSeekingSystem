import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '../supabaseAdmin';
import { serverEnv } from '../env';
import { COURSE } from '../../../data/course';
import { findUserByEmail } from './adminEnrollment';
import { CERTIFICATE_COLUMNS, certificateOrigin, type CertificateRow } from './certificates';
import { notifyLearnerOfCertificate } from './certificateEmail';
import { supabaseJobStore } from './jobStore';

/**
 * The admin's side of certificates: the list behind ?view=certificates, the
 * passes waiting for a certificate, and the three actions. Issue and revoke go
 * through the SQL functions in 0032 so the row lock and the audit columns are
 * theirs; rename is one guarded update. Learners are shown by id, as the
 * grading queue does; a search by email resolves to the id first.
 */

export interface PendingPassRow {
  attempt_id: string;
  user_id: string;
  certification_version: string;
  finalized_at: string | null;
}

const SERIAL_RE = /^SSS-\d{4}-\d{5}$/i;
const LIMIT = 100;

/** `q` is a serial, an email, or a certification version; empty lists the newest. Pending passes are listed only for the empty query. */
export async function listCertificatesForAdmin(q: string): Promise<{ rows: CertificateRow[]; pending: PendingPassRow[] }> {
  const query = q.trim();
  // Filters first, then order and limit: the filter builder is what `.eq()` returns, so the reassignments type-check.
  let builder = supabaseAdmin.from('course_certificates').select(CERTIFICATE_COLUMNS);
  if (SERIAL_RE.test(query)) builder = builder.eq('serial', query.toUpperCase());
  else if (query.includes('@')) {
    const account = await findUserByEmail(query);
    if (!account) return { rows: [], pending: [] };
    builder = builder.eq('user_id', account.id);
  } else if (query) builder = builder.eq('certification_version', query);
  const { data, error } = await builder.order('issued_at', { ascending: false }).limit(LIMIT);
  if (error) throw new Error(`certificate list failed: ${error.message}`);
  return { rows: (data ?? []) as CertificateRow[], pending: query ? [] : await listPendingPasses() };
}

/** Passed attempts at the current version whose learner has no certificate for it. */
async function listPendingPasses(): Promise<PendingPassRow[]> {
  const { data, error } = await supabaseAdmin
    .from('course_assessment_attempts')
    .select('id, user_id, certification_version, finalized_at')
    .eq('course_id', COURSE.id)
    .eq('state', 'passed')
    .eq('certification_version', COURSE.certificationVersion)
    .order('finalized_at', { ascending: false })
    .limit(LIMIT);
  if (error) throw new Error(`pending pass list failed: ${error.message}`);
  const passes = data ?? [];
  if (!passes.length) return [];
  const { data: certs, error: certError } = await supabaseAdmin
    .from('course_certificates')
    .select('user_id')
    .eq('certification_version', COURSE.certificationVersion)
    .in('user_id', [...new Set(passes.map((p) => p.user_id))]);
  if (certError) throw new Error(`pending pass certificates failed: ${certError.message}`);
  const covered = new Set((certs ?? []).map((c) => c.user_id));
  return passes
    .filter((p) => !covered.has(p.user_id))
    .map((p) => ({ attempt_id: p.id, user_id: p.user_id, certification_version: p.certification_version, finalized_at: p.finalized_at }));
}

export type IssueOutcome = { ok: true; certificate: CertificateRow; issued: boolean } | { ok: false; error: 'not_found' | 'not_passed' };

/** Issue by hand; when this call issued it, send the certificate email. An already-issued certificate is reported, not refused. */
export async function issuePendingCertificate(attemptId: string, admin: User, origin: string): Promise<IssueOutcome> {
  const { data, error } = await supabaseAdmin.rpc('issue_course_certificate', { p_attempt: attemptId, p_admin: admin.id });
  if (error) throw new Error(`certificate issue failed: ${error.message}`);
  const result = data as { outcome: 'not_found' | 'not_passed' | 'already_issued' | 'issued'; certificate_id?: string };
  if (result.outcome === 'not_found' || result.outcome === 'not_passed') return { ok: false, error: result.outcome };
  const { data: row, error: loadError } = await supabaseAdmin.from('course_certificates').select(CERTIFICATE_COLUMNS).eq('id', result.certificate_id ?? '').single();
  if (loadError) throw new Error(`certificate load failed: ${loadError.message}`);
  const certificate = row as CertificateRow;
  if (result.outcome === 'issued') await sendCertificateEmail(certificate, origin);
  return { ok: true, certificate, issued: result.outcome === 'issued' };
}

/** The same email the worker sends after a pass with awards on, from the Astro side. Never throws. */
export function sendCertificateEmail(certificate: CertificateRow, origin: string): Promise<boolean> {
  return notifyLearnerOfCertificate(
    { apiKey: serverEnv('RESEND_API_KEY'), from: serverEnv('EMAIL_FROM') },
    { certificateId: certificate.id, userId: certificate.user_id, certificateUrl: `${certificateOrigin(origin)}/course/learn/certificate/` },
    {
      emailFor: async (userId) => {
        const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (error) console.error(`certificate ${certificate.id}: learner lookup failed`, error);
        return data.user?.email ?? null;
      },
      markSent: (id) => supabaseJobStore(supabaseAdmin).markCertificateEmailSent(id),
    }
  );
}

export async function revokeCertificate(id: string, admin: User, reason: string): Promise<'revoked' | 'already_revoked' | 'not_found'> {
  const { data, error } = await supabaseAdmin.rpc('revoke_course_certificate', { p_certificate: id, p_admin: admin.id, p_reason: reason });
  if (error) throw new Error(`certificate revoke failed: ${error.message}`);
  return (data as { outcome: 'revoked' | 'already_revoked' | 'not_found' }).outcome;
}

/** A typo fix after the learner confirmed. The confirmation stands, since the learner did confirm; only the printed name changes. Null when no such certificate. */
export async function renameCertificate(id: string, name: string): Promise<CertificateRow | null> {
  const { data, error } = await supabaseAdmin.from('course_certificates').update({ display_name: name }).eq('id', id).select(CERTIFICATE_COLUMNS).maybeSingle();
  if (error) throw new Error(`certificate rename failed: ${error.message}`);
  return data ? (data as CertificateRow) : null;
}
