import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '../supabaseAdmin';
import { CRITERIA, type CriterionId } from '../../../data/certification';
import { applyReviewCorrections, correctedScoreMap } from '../../course/reviewRules';
import { decide } from './decision';
import { resolveEmails } from './adminEnrollment';
import { REVIEW_COLUMNS, type ReviewRow } from './reviews';
import type { AdminReviewView, CapApplied, CertificateAction, ReviewCorrections, ValidatedGrade } from '../../course/assessmentTypes';

/**
 * The operator's side of reviews: the queue behind ?view=reviews and the one
 * action that resolves a request. Resolving rebuilds the grade with the
 * operator's corrections, runs decide() over it so the caps and the pass rule
 * stay in the one module that owns them, and hands the finished grade to
 * resolve_course_review, which persists it at the next generation and points
 * the attempt at it. The grade under review is never edited.
 */

const LIMIT = 100;
const criterionName = (id: CriterionId): string => CRITERIA.find((c) => c.id === id)?.name ?? id;

/** The full grade, including the coverage the learner-facing loader leaves out, because decide() needs it to reapply caps. */
const ADMIN_GRADE_COLUMNS = 'id, rubric_version, criteria, coverage, misconceptions, caps_applied, total, passed, decision' as const;

interface AdminGradeRow {
  id: string;
  rubric_version: string;
  criteria: ValidatedGrade['criteria'];
  coverage: { principles: ValidatedGrade['principles']; tools: ValidatedGrade['tools'] };
  misconceptions: ValidatedGrade['material_misconceptions'];
  caps_applied: CapApplied[];
  total: number | string;
  passed: boolean;
}

/** Open requests first, newest first within each state. */
export async function listReviewsForAdmin(): Promise<AdminReviewView[]> {
  const { data, error } = await supabaseAdmin
    .from('course_review_requests')
    .select(REVIEW_COLUMNS)
    .order('state', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(LIMIT);
  if (error) throw new Error(`review list failed: ${error.message}`);
  const rows = (data ?? []) as ReviewRow[];
  if (!rows.length) return [];

  const emails = await resolveEmails(rows.map((r) => r.user_id));
  const gradeIds = [...new Set(rows.map((r) => r.grade_id).filter((id): id is string => id !== null))];
  const grades = new Map<string, AdminGradeRow>();
  if (gradeIds.length) {
    const { data: gradeRows, error: gradeError } = await supabaseAdmin.from('course_grades').select(ADMIN_GRADE_COLUMNS).in('id', gradeIds);
    if (gradeError) throw new Error(`review grade load failed: ${gradeError.message}`);
    for (const g of (gradeRows ?? []) as AdminGradeRow[]) grades.set(g.id, g);
  }

  const attemptIds = [...new Set(rows.map((r) => r.attempt_id))];
  const { data: attemptRows, error: attemptError } = await supabaseAdmin
    .from('course_assessment_attempts')
    .select('id, user_id, certification_version, snapshot_public')
    .in('id', attemptIds);
  if (attemptError) throw new Error(`review attempt load failed: ${attemptError.message}`);
  const attempts = new Map((attemptRows ?? []).map((a) => [a.id as string, a]));

  const { data: responseRows, error: responseError } = await supabaseAdmin
    .from('course_assessment_responses')
    .select('attempt_id, prompt_id, response_text')
    .in('attempt_id', attemptIds);
  if (responseError) throw new Error(`review response load failed: ${responseError.message}`);

  const { data: certRows, error: certError } = await supabaseAdmin
    .from('course_certificates')
    .select('id, serial, user_id, certification_version, status')
    .in('user_id', [...new Set(rows.map((r) => r.user_id))]);
  if (certError) throw new Error(`review certificate load failed: ${certError.message}`);

  return rows.map((r) => {
    const attempt = attempts.get(r.attempt_id) as { snapshot_public?: { stages: { title: string; prompts: { prompt_id: string }[] }[] }; certification_version?: string } | undefined;
    const labels = new Map<string, string>();
    for (const stage of attempt?.snapshot_public?.stages ?? []) {
      stage.prompts.forEach((p, i) => labels.set(p.prompt_id, `${stage.title}, question ${i + 1}`));
    }
    const grade = r.grade_id ? grades.get(r.grade_id) : undefined;
    const certificate = (certRows ?? []).find((c) => c.user_id === r.user_id && c.certification_version === attempt?.certification_version);
    return {
      id: r.id,
      attempt_id: r.attempt_id,
      user_id: r.user_id,
      email: emails.get(r.user_id) ?? null,
      state: r.state,
      criterion_id: r.criterion_id,
      criterion_name: criterionName(r.criterion_id),
      reason: r.reason,
      created_at: r.created_at,
      resolved_at: r.resolved_at,
      owner: r.owner,
      resolution: r.resolution,
      certificate_action: r.certificate_action,
      grade: grade
        ? {
            id: grade.id,
            total: Number(grade.total),
            passed: grade.passed,
            rubric_version: grade.rubric_version,
            criteria: grade.criteria,
            principles: grade.coverage?.principles ?? [],
            tools: grade.coverage?.tools ?? [],
            misconceptions: grade.misconceptions ?? [],
            caps_applied: grade.caps_applied ?? [],
          }
        : null,
      responses: (responseRows ?? [])
        .filter((x) => x.attempt_id === r.attempt_id)
        .map((x) => ({ prompt_id: x.prompt_id as string, prompt_label: labels.get(x.prompt_id as string) ?? 'Response', text: x.response_text as string })),
      certificate: certificate ? { id: certificate.id as string, serial: certificate.serial as string, status: certificate.status as 'active' | 'revoked' } : null,
    };
  });
}

export type ResolveOutcome =
  | { ok: true; gradeId: string; passed: boolean; certificate: CertificateAction }
  | { ok: false; error: 'not_found' | 'already_resolved' | 'no_grade' };

/**
 * Resolve one request. The corrected grade is rebuilt here and decided here;
 * the SQL function only persists what this returned, which is the same split
 * the grading worker uses.
 */
export async function resolveReview(args: {
  reviewId: string;
  admin: User;
  resolution: string;
  corrections: ReviewCorrections;
  certificateAction: CertificateAction;
}): Promise<ResolveOutcome> {
  const { data, error } = await supabaseAdmin.from('course_review_requests').select(REVIEW_COLUMNS).eq('id', args.reviewId).maybeSingle();
  if (error) throw new Error(`review load failed: ${error.message}`);
  const row = data as ReviewRow | null;
  if (!row) return { ok: false, error: 'not_found' };
  if (row.state === 'resolved') return { ok: false, error: 'already_resolved' };
  if (!row.grade_id) return { ok: false, error: 'no_grade' };

  const { data: gradeData, error: gradeError } = await supabaseAdmin.from('course_grades').select(ADMIN_GRADE_COLUMNS).eq('id', row.grade_id).single();
  if (gradeError) throw new Error(`review grade load failed: ${gradeError.message}`);
  const stored = gradeData as AdminGradeRow;
  const before: ValidatedGrade = {
    attempt_id: row.attempt_id,
    rubric_version: stored.rubric_version,
    criteria: stored.criteria,
    principles: stored.coverage?.principles ?? [],
    tools: stored.coverage?.tools ?? [],
    material_misconceptions: stored.misconceptions ?? [],
  };
  const after = applyReviewCorrections(before, args.corrections);
  const decision = decide(after);

  const { data: result, error: rpcError } = await supabaseAdmin.rpc('resolve_course_review', {
    p_review: args.reviewId,
    p_admin: args.admin.id,
    p_owner: args.admin.email ?? null,
    p_resolution: args.resolution,
    p_grade: {
      rubric_version: after.rubric_version,
      criteria: after.criteria,
      coverage: { principles: after.principles, tools: after.tools },
      misconceptions: after.material_misconceptions,
      caps_applied: decision.caps_applied,
      decision,
    },
    p_corrected: correctedScoreMap(before, after),
    p_certificate_action: args.certificateAction,
  });
  if (rpcError) throw new Error(`review resolve failed: ${rpcError.message}`);
  const outcome = result as { outcome: string; grade_id?: string; passed?: boolean; certificate?: CertificateAction };
  if (outcome.outcome === 'not_found') return { ok: false, error: 'not_found' };
  if (outcome.outcome === 'already_resolved') return { ok: false, error: 'already_resolved' };
  return { ok: true, gradeId: outcome.grade_id ?? '', passed: outcome.passed ?? false, certificate: outcome.certificate ?? 'none' };
}
