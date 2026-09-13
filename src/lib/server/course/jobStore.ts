import type { SupabaseClient } from '@supabase/supabase-js';
import type { SnapshotPrivate, SnapshotPublic } from '../../course/assessmentForm';
import type { ClaimResult, GradingJobStore, JobContext } from './gradingJob';

/**
 * The GradingJobStore on a Supabase service-role client the caller builds:
 * the Netlify worker constructs its own from Netlify.env, the dev server
 * passes supabaseAdmin. Worker-shared, so nothing here imports the env helper
 * or the admin client. This file and the admin route are the only readers of
 * snapshot_private.
 */
export function supabaseJobStore(client: SupabaseClient): GradingJobStore {
  return {
    async claim(jobId, worker, leaseSeconds): Promise<ClaimResult> {
      const { data, error } = await client.rpc('claim_course_grading_job', { p_job: jobId, p_worker: worker, p_lease_seconds: leaseSeconds });
      if (error) throw new Error(`claim failed: ${error.message}`);
      const r = data as { outcome: string; lock_token?: string; attempt_id?: string; generation?: number; attempts?: number; last_error?: string };
      if (r.outcome === 'claimed' && r.lock_token && r.attempt_id) {
        return { outcome: 'claimed', lockToken: r.lock_token, attemptId: r.attempt_id, generation: r.generation ?? 1, attempts: r.attempts ?? 1 };
      }
      if (r.outcome === 'exhausted' && r.attempt_id) {
        return { outcome: 'exhausted', attemptId: r.attempt_id, error: r.last_error || 'retry budget exhausted', attempts: r.attempts ?? 0 };
      }
      return { outcome: 'unavailable' };
    },

    async loadContext(attemptId): Promise<JobContext | null> {
      const { data: attempt, error } = await client
        .from('course_assessment_attempts')
        .select('id, user_id, form_id, form_version, rubric_version, prompt_version, submission_hash, source_pack_id, snapshot_public, snapshot_private')
        .eq('id', attemptId)
        .maybeSingle();
      if (error) throw new Error(`attempt load failed: ${error.message}`);
      if (!attempt) return null;
      const { data: rows, error: rowsError } = await client
        .from('course_assessment_responses')
        .select('prompt_id, stage, response_text')
        .eq('attempt_id', attemptId);
      if (rowsError) throw new Error(`responses load failed: ${rowsError.message}`);
      const { data: pack, error: packError } = await client
        .from('course_source_packs')
        .select('sha256, body')
        .eq('id', attempt.source_pack_id)
        .maybeSingle();
      if (packError) throw new Error(`source pack load failed: ${packError.message}`);
      // null means "no such attempt", which the runner treats as a permanent
      // failure. A missing pack row is a different thing entirely, so it throws
      // and the runner records a retryable internal failure with this message.
      if (!pack) throw new Error(`source pack missing for attempt ${attemptId}`);

      // Snapshot order: stage, then prompt order within the stage.
      const snapshotPublic = attempt.snapshot_public as SnapshotPublic;
      const order = new Map<string, number>();
      let n = 0;
      for (const stage of snapshotPublic.stages) for (const p of stage.prompts) order.set(p.prompt_id, n++);
      const responses = [...(rows ?? [])].sort((a, b) => (order.get(a.prompt_id) ?? 1e9) - (order.get(b.prompt_id) ?? 1e9));

      return {
        attempt: {
          id: attempt.id,
          user_id: attempt.user_id,
          form_id: attempt.form_id,
          form_version: attempt.form_version,
          rubric_version: attempt.rubric_version,
          prompt_version: attempt.prompt_version,
          submission_hash: attempt.submission_hash,
          snapshot_public: snapshotPublic,
          snapshot_private: attempt.snapshot_private as SnapshotPrivate,
        },
        responses,
        sourcePack: { sha256: pack.sha256, body: pack.body },
      };
    },

    async finalize(a) {
      const { data, error } = await client.rpc('finalize_course_grade', {
        p_job: a.jobId,
        p_lock_token: a.lockToken,
        p_raw: a.raw,
        p_usage: a.usage,
        p_validated: a.validated,
        p_decision: a.decision,
        p_model: a.model,
        p_prompt_version: a.promptVersion,
        p_rubric_version: a.rubricVersion,
        p_awards_enabled: a.awardsEnabled,
      });
      if (error) throw new Error(`finalize failed: ${error.message}`);
      return (data as { outcome: string }).outcome === 'finalized' ? 'finalized' : 'stale';
    },

    async fail(a) {
      const { data, error } = await client.rpc('fail_course_grading_job', {
        p_job: a.jobId,
        p_lock_token: a.lockToken,
        p_category: a.category,
        p_error: a.error,
        p_retryable: a.retryable,
      });
      if (error) throw new Error(`fail failed: ${error.message}`);
      const outcome = (data as { outcome: string }).outcome;
      return outcome === 'requeued' ? 'requeued' : outcome === 'failed' ? 'failed' : 'stale';
    },

    async markResultEmailSent(jobId): Promise<boolean> {
      const { data, error } = await client
        .from('course_grading_jobs')
        .update({ result_email_sent_at: new Date().toISOString() })
        .eq('id', jobId)
        .is('result_email_sent_at', null)
        .select('id');
      if (error) throw new Error(`result email claim failed: ${error.message}`);
      return (data ?? []).length === 1;
    },

    async certificateForAttempt(attemptId): Promise<{ id: string } | null> {
      const { data, error } = await client.from('course_certificates').select('id').eq('attempt_id', attemptId).maybeSingle();
      if (error) throw new Error(`certificate lookup failed: ${error.message}`);
      return data ? { id: data.id as string } : null;
    },
    async markCertificateEmailSent(certificateId): Promise<boolean> {
      const { data, error } = await client
        .from('course_certificates')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('id', certificateId)
        .is('email_sent_at', null)
        .select('id');
      if (error) throw new Error(`certificate email claim failed: ${error.message}`);
      return (data ?? []).length === 1;
    },
  };
}
