import Anthropic from '@anthropic-ai/sdk';
import { serverEnv } from '../env';
import { supabaseAdmin } from '../supabaseAdmin';
import { GRADER_CALL_TIMEOUT_MS, gradeAttempt } from './grader';
import { runGradingJob } from './gradingJob';
import { supabaseJobStore } from './jobStore';

/**
 * How a submitted attempt reaches the grader. COURSE_GRADER_MODE:
 *   worker  POST the Netlify background function with the shared secret
 *           (production; a failed hand-off is logged and the sweeper retries)
 *   inline  run the job inside the dev server (astro dev only)
 *   off     leave the job queued (the recovery test drives it by hand)
 * Unset means inline under astro dev and worker everywhere else.
 */
export type GraderMode = 'worker' | 'inline' | 'off';

export function graderMode(): GraderMode {
  const value = serverEnv('COURSE_GRADER_MODE');
  if (value === 'worker' || value === 'inline' || value === 'off') return value;
  return import.meta.env.DEV ? 'inline' : 'worker';
}
export const awardsEnabled = (): boolean => serverEnv('COURSE_AWARDS_ENABLED') === 'true';
export function graderSettings(): { model: string; awardsEnabled: boolean } {
  return { model: serverEnv('COURSE_GRADER_MODEL') || 'claude-opus-5', awardsEnabled: awardsEnabled() };
}

/**
 * Where the worker lives. The trigger carries the shared secret, so the
 * destination comes from configuration and never from the request: anyone who
 * can set the Host header on a call to the SSR function would otherwise choose
 * where that secret is sent. Netlify sets URL to the deploy's own address,
 * PUBLIC_CANONICAL_ORIGIN covers a host that does not, and the request origin is
 * trusted only under astro dev, where the port moves between runs.
 */
export function workerOrigin(requestOrigin: string): string {
  return serverEnv('URL') || serverEnv('PUBLIC_CANONICAL_ORIGIN') || (import.meta.env.DEV ? requestOrigin : '');
}

// No SDK retries: the job runner owns retries through fail_course_grading_job,
// which counts them against the job's budget and hands the next attempt a fresh
// lease. An SDK retry would spend the grade's budget where nothing can see it.
let anthropic: Anthropic | null = null;
const getAnthropic = () =>
  (anthropic ??= new Anthropic({ apiKey: serverEnv('ANTHROPIC_API_KEY'), timeout: GRADER_CALL_TIMEOUT_MS, maxRetries: 0 }));

/** Hand a queued job to the grader. `origin` is the caller's request origin, used only as the dev fallback. Never throws. */
export async function triggerGradingWorker(args: { origin: string; jobId: string }): Promise<void> {
  const mode = graderMode();
  if (mode === 'off') {
    console.log(`grading job ${args.jobId}: left queued (COURSE_GRADER_MODE=off)`);
    return;
  }
  if (mode === 'inline') {
    if (!import.meta.env.DEV) {
      console.error(`grading job ${args.jobId}: COURSE_GRADER_MODE=inline is honoured only under astro dev; the job stays queued`);
      return;
    }
    const settings = graderSettings();
    void runGradingJob({
      jobId: args.jobId,
      worker: 'inline-dev',
      store: supabaseJobStore(supabaseAdmin),
      grade: (input, ctx) => gradeAttempt({ anthropic: getAnthropic(), input, ctx, settings: { model: settings.model } }),
      settings,
    }).catch((err) => console.error(`grading job ${args.jobId}: inline run failed`, err));
    return;
  }
  const secret = serverEnv('COURSE_WORKER_SECRET');
  if (!secret) {
    console.error(`grading job ${args.jobId}: COURSE_WORKER_SECRET is unset; the job stays queued for the sweeper`);
    return;
  }
  const origin = workerOrigin(args.origin);
  if (!origin) {
    console.error(`grading job ${args.jobId}: no worker origin configured (URL or PUBLIC_CANONICAL_ORIGIN); the sweeper will retry`);
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${origin}/.netlify/functions/course-grade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-course-worker-secret': secret },
      body: JSON.stringify({ job_id: args.jobId }),
      signal: controller.signal,
    });
    if (!res.ok) console.error(`grading job ${args.jobId}: worker answered ${res.status}; the sweeper will retry`);
  } catch (err) {
    console.error(`grading job ${args.jobId}: worker trigger failed; the sweeper will retry`, err);
  } finally {
    clearTimeout(timer);
  }
}
