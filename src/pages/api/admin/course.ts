import type { APIRoute } from 'astro';
import { adminJson, requireAdmin } from '../../../lib/server/adminAuth';
import { supabaseAdmin } from '../../../lib/server/supabaseAdmin';
import { triggerGradingWorker } from '../../../lib/server/course/workerTrigger';
import { changeCourseAccess, findUserByEmail, listEnrollments } from '../../../lib/server/course/adminEnrollment';

export const prerender = false;

/**
 * Course administration. Sub-plan 1d: the grading queue, with a safe retry
 * of a failed job and a "kick" that re-triggers the worker for any job (the
 * claim function decides whether anything happens). Sub-plan 1e adds the
 * enrollment actions here. snapshot_private is never selected by this route
 * until the Phase 3 review queue needs one reference response.
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
};
const deny = (error: string, status: number): Response => adminJson({ error, message: MESSAGES[error] }, status);

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

  return deny('invalid', 400);
};
