import { describe, expect, it } from 'vitest';
import { REVIEW_REASON_MAX, REVIEW_REASON_MIN, applyReviewCorrections, correctedScoreMap, isCriterionId, normalizeReviewReason } from '../reviewRules';
import type { ValidatedGrade } from '../assessmentTypes';

const grade: ValidatedGrade = {
  attempt_id: 'att-1',
  rubric_version: '1',
  criteria: [
    { criterion_id: 'self_understanding', score: 3, reason: 'r', evidence_status: 'found', evidence: [], revision_lesson_ids: [] },
    { criterion_id: 'mutual_understanding', score: 4, reason: 'r', evidence_status: 'found', evidence: [], revision_lesson_ids: [] },
    { criterion_id: 'wisdom_principles', score: 4, reason: 'r', evidence_status: 'found', evidence: [], revision_lesson_ids: [] },
    { criterion_id: 'solution_quality', score: 3, reason: 'r', evidence_status: 'found', evidence: [], revision_lesson_ids: [] },
    { criterion_id: 'judgment_tools', score: 4, reason: 'r', evidence_status: 'found', evidence: [], revision_lesson_ids: [] },
    { criterion_id: 'learning_living_systems', score: 3, reason: 'r', evidence_status: 'found', evidence: [], revision_lesson_ids: [] },
  ],
  principles: [{ id: 'forgiveness', coverage: 'missing', evidence: [] }],
  tools: [{ id: 'feedback', coverage: 'applied', evidence: [] }],
  material_misconceptions: [{ criterion_id: 'solution_quality', description: 'said consensus means unanimity', evidence: [] }],
};

describe('normalizeReviewReason', () => {
  it('trims and collapses whitespace', () => {
    const raw = `  ${'a'.repeat(30)}   ${'b'.repeat(5)} `;
    expect(normalizeReviewReason(raw)).toBe(`${'a'.repeat(30)} ${'b'.repeat(5)}`);
  });
  it('refuses a reason that is too short, too long, or has no letters', () => {
    expect(normalizeReviewReason('too short')).toBeNull();
    expect(normalizeReviewReason('a'.repeat(REVIEW_REASON_MIN))).toHaveLength(REVIEW_REASON_MIN);
    expect(normalizeReviewReason('a'.repeat(REVIEW_REASON_MAX + 1))).toBeNull();
    expect(normalizeReviewReason('1'.repeat(40))).toBeNull();
  });
  it('refuses control and format characters, so a reason cannot carry an invisible payload', () => {
    expect(normalizeReviewReason('a'.repeat(30) + String.fromCharCode(7))).toBeNull();
    expect(normalizeReviewReason('a'.repeat(30) + String.fromCharCode(0x202e))).toBeNull();
  });
});

describe('isCriterionId', () => {
  it('accepts a published criterion and nothing else', () => {
    expect(isCriterionId('wisdom_principles')).toBe(true);
    expect(isCriterionId('made_up')).toBe(false);
    expect(isCriterionId('')).toBe(false);
  });
});

describe('applyReviewCorrections', () => {
  it('returns the grade untouched when nothing was corrected', () => {
    const out = applyReviewCorrections(grade, { scores: {}, principles: [], tools: [], misconceptions: [] });
    expect(out).toEqual(grade);
  });
  it('substitutes only the scores it was given', () => {
    const out = applyReviewCorrections(grade, { scores: { self_understanding: 4 }, principles: [], tools: [], misconceptions: [] });
    expect(out.criteria.find((c) => c.criterion_id === 'self_understanding')?.score).toBe(4);
    expect(out.criteria.find((c) => c.criterion_id === 'solution_quality')?.score).toBe(3);
  });
  it('withdraws a coverage finding by turning it into applied, so the cap it caused stops applying', () => {
    const out = applyReviewCorrections(grade, { scores: {}, principles: ['forgiveness'], tools: [], misconceptions: [] });
    expect(out.principles[0].coverage).toBe('applied');
  });
  it('drops a withdrawn misconception by its position', () => {
    const out = applyReviewCorrections(grade, { scores: {}, principles: [], tools: [], misconceptions: [0] });
    expect(out.material_misconceptions).toHaveLength(0);
  });
  it('never mutates the grade it was given', () => {
    const before = JSON.stringify(grade);
    applyReviewCorrections(grade, { scores: { wisdom_principles: 0 }, principles: ['forgiveness'], tools: [], misconceptions: [0] });
    expect(JSON.stringify(grade)).toBe(before);
  });
});

describe('correctedScoreMap', () => {
  it('records only the criteria whose score actually moved', () => {
    const corrected = applyReviewCorrections(grade, { scores: { self_understanding: 4 }, principles: [], tools: [], misconceptions: [] });
    expect(correctedScoreMap(grade, corrected)).toEqual({ self_understanding: { from: 3, to: 4 } });
  });
  it('is empty when only a finding was withdrawn', () => {
    const corrected = applyReviewCorrections(grade, { scores: {}, principles: ['forgiveness'], tools: [], misconceptions: [] });
    expect(correctedScoreMap(grade, corrected)).toEqual({});
  });
});
