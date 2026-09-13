import type { APIRoute } from 'astro';
import type { User } from '@supabase/supabase-js';
import { COURSE } from '../../../data/course';
import { getUserFromRequest, privateJson } from '../../../lib/server/auth';
import { awardsEnabled } from '../../../lib/server/course/workerTrigger';
import { loadAssessmentSummary } from '../../../lib/server/course/attempts';
import { certificateOrigin, confirmCertificateName, loadOwnedCertificate, setCertificateSharing } from '../../../lib/server/course/certificates';
import { certificateRecord, normalizeDisplayName } from '../../../lib/course/certificateRules';
import type { CertificatePayload } from '../../../lib/course/assessmentTypes';

export const prerender = false;

/**
 * The learner's certificate. Sign-in and ownership, not enrollment: a
 * certificate is earned, and it outlives the access that earned it. Every
 * response is no-store. GET returns the certificate, or null with the facts
 * the page needs to say why; POST confirms the name once, or turns sharing
 * on and off.
 */
const ACTIONS = ['confirm_name', 'share'] as const;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const bad = (field: string) => privateJson({ error: 'bad_request', field }, 400);

async function requireAccount(request: Request): Promise<User | Response> {
  const user = await getUserFromRequest(request);
  if (!user) return privateJson({ error: 'unauthorized' }, 401);
  if (user.is_anonymous) return privateJson({ error: 'account_required' }, 403);
  return user;
}

async function payloadFor(user: User, origin: string): Promise<CertificatePayload> {
  const [row, summary] = await Promise.all([loadOwnedCertificate(user.id), loadAssessmentSummary(user.id)]);
  return {
    certificate: row ? certificateRecord(row, origin) : null,
    awards_enabled: awardsEnabled(),
    passed_current: summary.passedCurrent,
    certification_version: COURSE.certificationVersion,
  };
}

export const GET: APIRoute = async ({ request }) => {
  const user = await requireAccount(request);
  if (user instanceof Response) return user;
  try {
    return privateJson(await payloadFor(user, certificateOrigin(new URL(request.url).origin)));
  } catch (err) {
    console.error('course certificate failed', err);
    return privateJson({ error: 'certificate_unavailable' }, 503);
  }
};

export const POST: APIRoute = async ({ request }) => {
  const user = await requireAccount(request);
  if (user instanceof Response) return user;
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const action = str(body.action);
  if (!(ACTIONS as readonly string[]).includes(action)) return bad('action');
  const origin = certificateOrigin(new URL(request.url).origin);
  try {
    const row = await loadOwnedCertificate(user.id);
    if (!row) return privateJson({ error: 'no_certificate' }, 404);
    if (row.status === 'revoked') return privateJson({ error: 'certificate_revoked' }, 409);
    if (action === 'confirm_name') {
      const name = normalizeDisplayName(str(body.name));
      if (!name) return bad('name');
      if (row.name_confirmed_at) return privateJson({ error: 'name_already_confirmed' }, 409);
      const updated = await confirmCertificateName(row.id, user.id, name);
      if (!updated) return privateJson({ error: 'name_already_confirmed' }, 409);
      return privateJson(await payloadFor(user, origin));
    }
    if (typeof body.active !== 'boolean') return bad('active');
    if (!row.name_confirmed_at) return privateJson({ error: 'name_required' }, 409);
    const updated = await setCertificateSharing(row, body.active);
    if (!updated) return privateJson({ error: 'certificate_revoked' }, 409);
    return privateJson(await payloadFor(user, origin));
  } catch (err) {
    console.error('course certificate action failed', err);
    return privateJson({ error: 'certificate_unavailable' }, 503);
  }
};
