/**
 * Pure review rules: what a learner may write when asking for a second look,
 * and how an operator's corrections are folded back into a grade. Nothing
 * here decides anything. The corrected grade this module builds goes through
 * decide() in decision.ts, which is the only place that owns the caps, the
 * weights and the pass rule.
 */

import { CRITERION_IDS, type CriterionId } from '../../data/certification';
import type { ReviewCorrections, ValidatedGrade } from './assessmentTypes';

export const REVIEW_REASON_MIN = 20;
export const REVIEW_REASON_MAX = 2000;

/** The operator's resolution: no floor, the same ceiling as the learner's reason, counted the same way. */
export const RESOLUTION_MAX = 2000;

/** Control characters and format characters, the same guard the certificate's display name uses. */
const HIDDEN_RE = /[\p{Cc}\p{Cf}]/u;
const LETTER_RE = /\p{L}/u;

/**
 * The reason as it will be stored: trimmed, inner whitespace collapsed to one
 * space. Null when it is outside the bounds the column accepts, carries no
 * letter, or hides a control or format character. The bounds count Unicode
 * characters (codepoints), the same unit Postgres char_length uses, not
 * JavaScript's UTF-16 .length: those two disagree on any text that contains a
 * supplementary-plane character, emoji included. The bounds match the check
 * constraint in 0031, so a reason this returns can always be inserted.
 */
export function normalizeReviewReason(raw: string): string | null {
  const reason = raw.replace(/\s+/g, ' ').trim();
  const length = Array.from(reason).length;
  if (length < REVIEW_REASON_MIN || length > REVIEW_REASON_MAX) return null;
  if (HIDDEN_RE.test(reason) || !LETTER_RE.test(reason)) return null;
  return reason;
}

export const isCriterionId = (value: string): value is CriterionId => (CRITERION_IDS as readonly string[]).includes(value);

/**
 * The grade as the operator says it should have read. Scores they did not
 * touch keep the grader's number; a withdrawn coverage finding becomes
 * applied, which is what stops it capping; a withdrawn misconception is
 * dropped. The grade passed in is never mutated.
 */
export function applyReviewCorrections(grade: ValidatedGrade, corrections: ReviewCorrections): ValidatedGrade {
  const principles = new Set<string>(corrections.principles);
  const tools = new Set<string>(corrections.tools);
  const dropped = new Set<number>(corrections.misconceptions);
  return {
    ...grade,
    criteria: grade.criteria.map((c) => {
      const corrected = corrections.scores[c.criterion_id];
      return corrected === undefined ? c : { ...c, score: corrected };
    }),
    principles: grade.principles.map((p) => (principles.has(p.id) ? { ...p, coverage: 'applied' as const } : p)),
    tools: grade.tools.map((t) => (tools.has(t.id) ? { ...t, coverage: 'applied' as const } : t)),
    material_misconceptions: grade.material_misconceptions.filter((_, i) => !dropped.has(i)),
  };
}

/** Which criterion scores actually moved, for the record kept on the review row. */
export function correctedScoreMap(before: ValidatedGrade, after: ValidatedGrade): Record<string, { from: number; to: number }> {
  const was = new Map(before.criteria.map((c) => [c.criterion_id, c.score]));
  const out: Record<string, { from: number; to: number }> = {};
  for (const c of after.criteria) {
    const from = was.get(c.criterion_id);
    if (from !== undefined && from !== c.score) out[c.criterion_id] = { from, to: c.score };
  }
  return out;
}
