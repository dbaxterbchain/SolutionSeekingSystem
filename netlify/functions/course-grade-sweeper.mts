import type { Config } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

/**
 * Every ten minutes on the published deploy: re-trigger jobs that sat queued
 * for more than ninety seconds (a lost hand-off) or ran past their lease (a
 * worker that died), at most fifty at a time. Whether a job has any budget left
 * is the claim function's decision, never this one's.
 */
export default async () => {
  const env = (name: string): string => Netlify.env.get(name) ?? '';
  const secret = env('COURSE_WORKER_SECRET');
  if (!secret) {
    console.error('course-grade-sweeper: COURSE_WORKER_SECRET is unset');
    return;
  }
  const supabase = createClient(env('PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = Date.now();
  const queuedBefore = new Date(now - 90_000).toISOString();
  // 840 seconds is DEFAULT_LEASE_SECONDS in src/lib/server/course/gradingJob.ts,
  // the lease every claim takes. This function only mirrors it; the claim
  // function is what actually decides whether a lease has expired.
  const runningBefore = new Date(now - 840_000).toISOString();
  const [queued, running] = await Promise.all([
    supabase.from('course_grading_jobs').select('id').eq('state', 'queued').lt('updated_at', queuedBefore).order('updated_at', { ascending: true }).limit(50),
    supabase.from('course_grading_jobs').select('id').eq('state', 'running').lt('locked_at', runningBefore).order('locked_at', { ascending: true }).limit(50),
  ]);
  if (queued.error || running.error) {
    console.error('course-grade-sweeper: query failed', queued.error?.message ?? running.error?.message);
    return;
  }
  const jobs = [...(queued.data ?? []), ...(running.data ?? [])].slice(0, 50);
  const base = env('URL');
  let kicked = 0;
  for (const job of jobs) {
    try {
      const res = await fetch(`${base}/.netlify/functions/course-grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-course-worker-secret': secret },
        body: JSON.stringify({ job_id: job.id }),
      });
      if (res.ok) kicked += 1;
      else console.error(`course-grade-sweeper: job ${job.id} answered ${res.status}`);
    } catch (err) {
      console.error(`course-grade-sweeper: job ${job.id} trigger failed`, err);
    }
  }
  console.log(`course-grade-sweeper: ${jobs.length} stale, ${kicked} re-triggered`);
};

export const config: Config = { schedule: '*/10 * * * *' };
