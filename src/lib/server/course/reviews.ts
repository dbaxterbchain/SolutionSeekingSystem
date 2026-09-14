import { supabaseAdmin } from '../supabaseAdmin';
import { CRITERIA, type CriterionId } from '../../../data/certification';
import type { CertificateAction, ReviewState, ReviewSummary } from '../../course/assessmentTypes';

/**
 * A learner's review request. One open request per attempt is enforced by a
 * partial unique index in 0031, and the insert goes through
 * create_course_review so the attempt lock and that constraint are both on the
 * database side. Every read here is scoped by user id; a miss is a miss, so a
 * review id on its own opens nothing.
 */

export const REVIEW_COLUMNS =
  'id, attempt_id, user_id, grade_id, criterion_id, reason, state, owner, resolution, original_scores, corrected_scores, certificate_action, resolved_at, resolved_by, email_sent_at, created_at, updated_at' as const;

export interface ReviewRow {
  id: string;
  attempt_id: string;
  user_id: string;
  grade_id: string | null;
  criterion_id: CriterionId;
  reason: string;
  state: ReviewState;
  owner: string | null;
  resolution: string | null;
  original_scores: Record<string, number> | null;
  corrected_scores: Record<string, { from: number; to: number }> | null;
  certificate_action: CertificateAction;
  resolved_at: string | null;
  resolved_by: string | null;
  email_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

const criterionName = (id: CriterionId): string => CRITERIA.find((c) => c.id === id)?.name ?? id;

/** The learner-facing view. The operator's own notes on the row stay out of it apart from the resolution they wrote to be read. */
export const reviewSummary = (row: ReviewRow): ReviewSummary => ({
  id: row.id,
  criterion_id: row.criterion_id,
  criterion_name: criterionName(row.criterion_id),
  state: row.state,
  reason: row.reason,
  resolution: row.resolution,
  created_at: row.created_at,
  resolved_at: row.resolved_at,
});

/** The newest review on one of this learner's attempts, whatever its state. */
export async function loadOwnedReview(attemptId: string, userId: string): Promise<ReviewRow | null> {
  const { data, error } = await supabaseAdmin
    .from('course_review_requests')
    .select(REVIEW_COLUMNS)
    .eq('attempt_id', attemptId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`review load failed: ${error.message}`);
  return (data as ReviewRow | null) ?? null;
}

export type CreateReviewOutcome =
  | { outcome: 'created'; review: ReviewRow }
  | { outcome: 'not_found' | 'not_reviewable' | 'review_open' };

/** Open a review through the SQL function, then read the row back for the caller. */
export async function createReview(args: {
  attemptId: string;
  userId: string;
  criterionId: CriterionId;
  reason: string;
  originalScores: Record<string, number>;
}): Promise<CreateReviewOutcome> {
  const { data, error } = await supabaseAdmin.rpc('create_course_review', {
    p_attempt: args.attemptId,
    p_user: args.userId,
    p_criterion: args.criterionId,
    p_reason: args.reason,
    p_original: args.originalScores,
  });
  if (error) throw new Error(`review create failed: ${error.message}`);
  const result = data as { outcome: CreateReviewOutcome['outcome']; review_id?: string };
  if (result.outcome !== 'created') return { outcome: result.outcome };
  const { data: row, error: loadError } = await supabaseAdmin
    .from('course_review_requests')
    .select(REVIEW_COLUMNS)
    .eq('id', result.review_id ?? '')
    .single();
  if (loadError) throw new Error(`review load failed: ${loadError.message}`);
  return { outcome: 'created', review: row as ReviewRow };
}

/** Sets email_sent_at where it is null; true when this call set it. */
export async function markReviewEmailSent(reviewId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('course_review_requests')
    .update({ email_sent_at: new Date().toISOString() })
    .eq('id', reviewId)
    .is('email_sent_at', null)
    .select('id');
  if (error) throw new Error(`review email claim failed: ${error.message}`);
  return (data ?? []).length === 1;
}
