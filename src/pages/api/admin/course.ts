import type { APIRoute } from 'astro';
import { COURSE_STATUS } from '../../../data/course';
import { adminJson, requireAdmin } from '../../../lib/server/adminAuth';
import { supabaseAdmin } from '../../../lib/server/supabaseAdmin';
import { triggerGradingWorker } from '../../../lib/server/course/workerTrigger';
import { changeCourseAccess, findUserByEmail, listEnrollments } from '../../../lib/server/course/adminEnrollment';
import { issuePendingCertificate, listCertificatesForAdmin, renameCertificate, resendCertificateEmail, revokeCertificate } from '../../../lib/server/course/adminCertificates';
import { listReviewsForAdmin, resolveReview } from '../../../lib/server/course/adminReviews';
import { normalizeDisplayName } from '../../../lib/course/certificateRules';
import { RESOLUTION_MAX, isCriterionId } from '../../../lib/course/reviewRules';
import { getCourseCatalog } from '../../../lib/course/catalog';
import { ladderReport } from '../../../lib/course/ladder';

export const prerender = false;

/**
 * Course administration. Sub-plan 1d: the grading queue, with a safe retry
 * of a failed job and a "kick" that re-triggers the worker for any job (the
 * claim function decides whether anything happens). Sub-plan 1e adds the
 * enrollment actions here. Phase 3b adds the certificates view, plus
 * issue_pending, revoke_certificate, rename_certificate and
 * resend_certificate_email. Phase 3c adds the reviews view and the
 * resolve_review action: the operator reads a request, corrects the grade,
 * and resolve_course_review persists it. snapshot_private is never selected
 * by this route; the reviews view only needs snapshot_public, for the prompt
 * labels beside each of the learner's answers.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const JOB_COLUMNS =
  'id, attempt_id, generation, state, reason, attempts, max_attempts, error_category, last_error, model, locked_by, locked_at, created_at, updated_at' as const;

/**
 * What the operator reads when an action is refused. A code with no message
 * reaches the admin view as "Something went wrong", which is true and useless,
 * so every refusal this route can answer has a sentence of its own here.
 */
const MESSAGES: Record<string, string> = {
  invalid: 'That request was not understood.',
  anonymous_account: 'That account has no email address yet, so it cannot be granted access.',
  user_not_found: 'No account with that email. The learner creates the account first; then you grant access.',
  already_enrolled: 'That account already has access.',
  not_enrolled: 'That account does not have access right now.',
  not_inactive: 'That account already has access.',
  already_refunded: 'That account is already recorded as refunded.',
  not_passed: 'Only a passed attempt can be issued a certificate.',
  already_revoked: 'This certificate is already revoked.',
  not_found: 'No such record.',
  already_resolved: 'That review has already been answered.',
  no_grade: 'That request points at no grade, so there is nothing to correct.',
  certificate_active: 'This correction takes the attempt below the pass line, and the learner already holds an active certificate for it. Set the certificate action to revoke, then resolve again.',
};
const deny = (error: string, status: number): Response => adminJson({ error, message: MESSAGES[error] }, status);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const GET: APIRoute = async ({ request }) => {
  const admin = await requireAdmin(request);
  if (!admin) return adminJson({ error: 'forbidden' }, 403);
  const view = new URL(request.url).searchParams.get('view');

  if (view === 'enrollments') {
    try {
      return adminJson({ rows: await listEnrollments() });
    } catch (err) {
      console.error('admin enrollment list failed', err);
      return adminJson({ error: 'server_error' }, 500);
    }
  }
  if (view === 'content') {
    try {
      const catalog = await getCourseCatalog();
      return adminJson({ rows: ladderReport(catalog, COURSE_STATUS), summary: catalog.summary });
    } catch (err) {
      console.error('admin content ladder failed', err);
      return adminJson({ error: 'server_error' }, 500);
    }
  }
  if (view === 'certificates') {
    try {
      return adminJson(await listCertificatesForAdmin(new URL(request.url).searchParams.get('q') ?? ''));
    } catch (err) {
      console.error('admin certificate list failed', err);
      return adminJson({ error: 'server_error' }, 500);
    }
  }
  if (view === 'reviews') {
    try {
      return adminJson({ rows: await listReviewsForAdmin() });
    } catch (err) {
      console.error('admin review list failed', err);
      return adminJson({ error: 'server_error' }, 500);
    }
  }
  if (view !== 'grading') return deny('invalid', 400);

  const { data: jobs, error } = await supabaseAdmin.from('course_grading_jobs').select(JOB_COLUMNS).order('updated_at', { ascending: false }).limit(100);
  if (error) {
    console.error('admin grading list failed', error);
    return adminJson({ error: 'server_error' }, 500);
  }
  const attemptIds = [...new Set((jobs ?? []).map((j) => j.attempt_id))];
  const attempts = attemptIds.length
    ? await supabaseAdmin.from('course_assessment_attempts').select('id, user_id, state, form_id, submitted_at').in('id', attemptIds)
    : { data: [], error: null };
  if (attempts.error) {
    console.error('admin grading attempts failed', attempts.error);
    return adminJson({ error: 'server_error' }, 500);
  }
  const byId = new Map((attempts.data ?? []).map((a) => [a.id, a]));
  const rows = (jobs ?? []).map((j) => {
    const a = byId.get(j.attempt_id);
    return {
      ...j,
      last_error: j.last_error ? j.last_error.slice(0, 300) : null,
      attempt_state: a?.state ?? null,
      user_id: a?.user_id ?? null,
      form_id: a?.form_id ?? null,
      submitted_at: a?.submitted_at ?? null,
    };
  });
  return adminJson({ rows });
};

export const POST: APIRoute = async ({ request }) => {
  const admin = await requireAdmin(request);
  if (!admin) return adminJson({ error: 'forbidden' }, 403);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof body?.action === 'string' ? body.action : '';
  const origin = new URL(request.url).origin;

  // Branch on the action before validating any id: grant, revoke, refund and
  // reinstate each key off a different field, and none of them carries job_id.
  if (action === 'retry_job' || action === 'kick_job') {
    const jobId = typeof body?.job_id === 'string' ? body.job_id : '';
    if (!UUID_RE.test(jobId)) return deny('invalid', 400);

    if (action === 'retry_job') {
      const { data, error } = await supabaseAdmin.rpc('retry_course_grading_job', { p_job: jobId, p_admin: admin.id });
      if (error) {
        console.error('admin retry_job failed', error);
        return adminJson({ error: 'server_error' }, 500);
      }
      if ((data as { outcome: string }).outcome !== 'queued') {
        return adminJson({ error: 'unavailable', message: 'Only a failed job can be retried.' }, 409);
      }
      await triggerGradingWorker({ origin, jobId });
      console.log('admin action', admin.email, 'retry_job', jobId);
      return adminJson({ ok: true });
    }
    await triggerGradingWorker({ origin, jobId });
    console.log('admin action', admin.email, 'kick_job', jobId);
    return adminJson({ ok: true });
  }

  if (action === 'grant') {
    const email = typeof body?.email === 'string' ? body.email : '';
    if (!EMAIL_RE.test(email)) return deny('invalid', 400);
    const rawNote = body?.note;
    if (rawNote !== undefined && rawNote !== null && (typeof rawNote !== 'string' || rawNote.length > 500)) {
      return deny('invalid', 400);
    }
    const note = typeof rawNote === 'string' ? rawNote : null;

    let account;
    try {
      account = await findUserByEmail(email);
    } catch (err) {
      console.error('admin grant lookup failed', err);
      return adminJson({ error: 'server_error' }, 500);
    }
    if (!account) return deny('user_not_found', 404);
    if (account.is_anonymous === true || !account.email) return deny('anonymous_account', 400);

    let outcome;
    try {
      outcome = await changeCourseAccess(account.id, 'grant', admin, note);
    } catch (err) {
      console.error('admin grant failed', err);
      return adminJson({ error: 'server_error' }, 500);
    }
    if (!outcome.ok) return deny(outcome.error, 409);
    console.log('admin action', admin.email, action, account.id, note ?? '');
    return adminJson({ ok: true, enrollment: outcome.enrollment });
  }

  if (action === 'revoke' || action === 'refund' || action === 'reinstate') {
    const userId = typeof body?.user_id === 'string' ? body.user_id : '';
    if (!UUID_RE.test(userId)) return deny('invalid', 400);
    const rawNote = body?.note;
    if (rawNote !== undefined && rawNote !== null && (typeof rawNote !== 'string' || rawNote.length > 500)) {
      return deny('invalid', 400);
    }
    const note = typeof rawNote === 'string' ? rawNote : null;

    let outcome;
    try {
      outcome = await changeCourseAccess(userId, action, admin, note);
    } catch (err) {
      console.error(`admin ${action} failed`, err);
      return adminJson({ error: 'server_error' }, 500);
    }
    // The function decides which statuses each action accepts, so the refusal
    // it names is the one the operator is told about.
    if (!outcome.ok) return deny(outcome.error, 409);
    console.log('admin action', admin.email, action, userId, note ?? '');
    return adminJson({ ok: true, enrollment: outcome.enrollment });
  }

  if (action === 'issue_pending') {
    const attemptId = typeof body?.attempt_id === 'string' ? body.attempt_id : '';
    if (!UUID_RE.test(attemptId)) return deny('invalid', 400);
    try {
      const outcome = await issuePendingCertificate(attemptId, admin, origin);
      if (!outcome.ok) return deny(outcome.error, outcome.error === 'not_found' ? 404 : 409);
      console.log('admin action', admin.email, 'issue_pending', attemptId, outcome.issued ? 'issued' : 'already issued');
      return adminJson({ ok: true, issued: outcome.issued, serial: outcome.certificate.serial });
    } catch (err) {
      console.error('admin issue_pending failed', err);
      return adminJson({ error: 'server_error' }, 500);
    }
  }

  if (action === 'revoke_certificate') {
    const certificateId = typeof body?.certificate_id === 'string' ? body.certificate_id : '';
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (!UUID_RE.test(certificateId) || !reason || reason.length > 500) return deny('invalid', 400);
    try {
      const outcome = await revokeCertificate(certificateId, admin, reason);
      if (outcome !== 'revoked') return deny(outcome, outcome === 'not_found' ? 404 : 409);
      console.log('admin action', admin.email, 'revoke_certificate', certificateId);
      return adminJson({ ok: true });
    } catch (err) {
      console.error('admin revoke_certificate failed', err);
      return adminJson({ error: 'server_error' }, 500);
    }
  }

  if (action === 'rename_certificate') {
    const certificateId = typeof body?.certificate_id === 'string' ? body.certificate_id : '';
    const name = normalizeDisplayName(typeof body?.name === 'string' ? body.name : '');
    if (!UUID_RE.test(certificateId) || !name) return deny('invalid', 400);
    try {
      const row = await renameCertificate(certificateId, name);
      if (!row) return deny('not_found', 404);
      console.log('admin action', admin.email, 'rename_certificate', certificateId);
      return adminJson({ ok: true });
    } catch (err) {
      console.error('admin rename_certificate failed', err);
      return adminJson({ error: 'server_error' }, 500);
    }
  }

  if (action === 'resend_certificate_email') {
    const certificateId = typeof body?.certificate_id === 'string' ? body.certificate_id : '';
    if (!UUID_RE.test(certificateId)) return deny('invalid', 400);
    try {
      const outcome = await resendCertificateEmail(certificateId, origin);
      if (!outcome.ok) return deny(outcome.error, 404);
      console.log('admin action', admin.email, 'resend_certificate_email', certificateId, outcome.sent ? 'sent' : 'not sent');
      return adminJson({ ok: true, sent: outcome.sent });
    } catch (err) {
      console.error('admin resend_certificate_email failed', err);
      return adminJson({ error: 'server_error' }, 500);
    }
  }

  if (action === 'resolve_review') {
    const reviewId = typeof body?.review_id === 'string' ? body.review_id : '';
    const resolution = typeof body?.resolution === 'string' ? body.resolution.trim() : '';
    const certificateAction = typeof body?.certificate_action === 'string' ? body.certificate_action : 'none';
    // Codepoints, not JavaScript's UTF-16 .length: the same unit normalizeReviewReason
    // counts the learner's reason in, so an operator's answer full of emoji or other
    // supplementary-plane characters is measured the same way on both sides of the form.
    if (!UUID_RE.test(reviewId) || !resolution || Array.from(resolution).length > RESOLUTION_MAX) return deny('invalid', 400);
    if (!['none', 'issue', 'revoke'].includes(certificateAction)) return deny('invalid', 400);

    const raw = isRecord(body?.corrections) ? body.corrections : {};
    const scores: Record<string, number> = {};
    for (const [id, value] of Object.entries(isRecord(raw.scores) ? raw.scores : {})) {
      if (!isCriterionId(id) || !Number.isInteger(value) || (value as number) < 0 || (value as number) > 4) return deny('invalid', 400);
      scores[id] = value as number;
    }
    const list = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);
    const indices = (value: unknown): number[] => (Array.isArray(value) ? value.filter((v): v is number => Number.isInteger(v) && v >= 0) : []);
    const corrections = {
      scores,
      principles: list(raw.principles),
      tools: list(raw.tools),
      misconceptions: indices(raw.misconceptions),
    } as Parameters<typeof resolveReview>[0]['corrections'];

    try {
      const outcome = await resolveReview({ reviewId, admin, resolution, corrections, certificateAction: certificateAction as 'none' | 'issue' | 'revoke' });
      if (!outcome.ok) return deny(outcome.error, outcome.error === 'not_found' ? 404 : 409);
      console.log('admin action', admin.email, 'resolve_review', reviewId, outcome.passed ? 'passed' : 'not passed', outcome.certificate);
      return adminJson({ ok: true, passed: outcome.passed, certificate: outcome.certificate });
    } catch (err) {
      console.error('admin resolve_review failed', err);
      return adminJson({ error: 'server_error' }, 500);
    }
  }

  return deny('invalid', 400);
};
