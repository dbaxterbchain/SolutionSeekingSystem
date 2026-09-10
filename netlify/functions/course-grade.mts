import type { Config } from '@netlify/functions';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { gradeAttempt } from '../../src/lib/server/course/grader';
import { runGradingJob } from '../../src/lib/server/course/gradingJob';
import { supabaseJobStore } from '../../src/lib/server/course/jobStore';

/**
 * The grading worker: a background function (fifteen minute budget) that
 * grades one queued job. Netlify answers 202 to the caller before this runs,
 * so a refusal shows in the function log and in the untouched job row, never
 * as a status code the caller sees. Reads its configuration from Netlify.env
 * (Functions scope): PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * ANTHROPIC_API_KEY, COURSE_WORKER_SECRET, COURSE_AWARDS_ENABLED,
 * COURSE_GRADER_MODEL.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const env = (name: string): string => Netlify.env.get(name) ?? '';

function secretMatches(given: string, expected: string): boolean {
  if (!expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (!secretMatches(req.headers.get('x-course-worker-secret') ?? '', env('COURSE_WORKER_SECRET'))) {
    console.warn('course-grade: refused (missing or wrong worker secret)');
    return new Response('forbidden', { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { job_id?: unknown } | null;
  const jobId = typeof body?.job_id === 'string' ? body.job_id : '';
  if (!UUID_RE.test(jobId)) {
    console.warn('course-grade: refused (bad job id)');
    return new Response('bad request', { status: 400 });
  }

  const supabase = createClient(env('PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anthropic = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY'), timeout: 300_000, maxRetries: 2 });
  const model = env('COURSE_GRADER_MODEL') || 'claude-opus-5';
  const outcome = await runGradingJob({
    jobId,
    worker: `netlify:${randomUUID().slice(0, 8)}`,
    store: supabaseJobStore(supabase),
    grade: (input, ctx) => gradeAttempt({ anthropic, input, ctx, settings: { model } }),
    settings: { model, awardsEnabled: env('COURSE_AWARDS_ENABLED') === 'true' },
  });
  console.log(`course-grade: job ${jobId} ${outcome.outcome}`);
  return new Response(null, { status: 202 });
};

export const config: Config = { background: true };
