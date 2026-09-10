import { supabaseAdmin } from '../supabaseAdmin';
import { COURSE } from '../../../data/course';
import type { ProgressRow } from '../../course/progressRules';
import type { CheckAttemptLite } from '../../course/stateRules';

/** The progress tables, service role only. Every error throws with a prefix; the routes answer 503. */

const COLUMNS =
  'lesson_id, content_version, studied_at, practice_state, response_text, previous_response_text, model_revealed_at, acknowledged_at, completed_at, revision, first_opened_at, last_opened_at' as const;

export async function loadProgress(userId: string, lessonId: string): Promise<ProgressRow | null> {
  const { data, error } = await supabaseAdmin
    .from('course_progress')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('course_id', COURSE.id)
    .eq('lesson_id', lessonId)
    .maybeSingle();
  if (error) throw new Error(`course_progress read failed: ${error.message}`);
  return (data as ProgressRow | null) ?? null;
}

export async function loadAllProgress(userId: string): Promise<ProgressRow[]> {
  const { data, error } = await supabaseAdmin
    .from('course_progress')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('course_id', COURSE.id);
  if (error) throw new Error(`course_progress list failed: ${error.message}`);
  return (data as ProgressRow[]) ?? [];
}

/** Upsert the whole row. The monotone trigger refuses any regression on update. */
export async function saveProgress(userId: string, row: ProgressRow): Promise<ProgressRow> {
  const { data, error } = await supabaseAdmin
    .from('course_progress')
    .upsert({ user_id: userId, course_id: COURSE.id, ...row }, { onConflict: 'user_id,course_id,lesson_id' })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`course_progress write failed: ${error.message}`);
  return data as ProgressRow;
}

export async function loadCheckAttempts(userId: string): Promise<CheckAttemptLite[]> {
  const { data, error } = await supabaseAdmin
    .from('course_check_attempts')
    .select('module_id, check_id, correct')
    .eq('user_id', userId)
    .eq('course_id', COURSE.id)
    .eq('correct', true);
  if (error) throw new Error(`course_check_attempts list failed: ${error.message}`);
  return (data as CheckAttemptLite[]) ?? [];
}
