import type { CapApplied, Decision, ValidatedGrade } from '../../course/assessmentTypes';
import { COVERAGE_CAP, CRITERIA, MISCONCEPTION_CAP, PASS_MIN_CRITERION, PASS_TOTAL, SCORE_MAX, type CriterionId } from './rubric';

/**
 * The pass decision, computed by the server from a validated grade. The model
 * scores; it never decides. Response length is not an input anywhere here.
 * Every cap is recorded even when it changes nothing, so the learner's result
 * can say why a criterion reads 2.
 */
export function decide(grade: ValidatedGrade): Decision {
  const raw = {} as Record<CriterionId, number>;
  for (const c of grade.criteria) raw[c.criterion_id] = c.score;
  const effective = { ...raw };
  const caps: CapApplied[] = [];
  const cap = (criterion: CriterionId, cause: CapApplied['cause'], detail: string, limit: number) => {
    const from = effective[criterion];
    const to = Math.min(from, limit);
    effective[criterion] = to;
    caps.push({ criterion_id: criterion, cause, detail, from, to });
  };

  for (const p of grade.principles) {
    if (p.coverage === 'missing' || p.coverage === 'misapplied') cap('wisdom_principles', 'principle', `${p.id}: ${p.coverage}`, COVERAGE_CAP);
  }
  for (const t of grade.tools) {
    if (t.coverage === 'missing' || t.coverage === 'misapplied') cap('judgment_tools', 'tool', `${t.id}: ${t.coverage}`, COVERAGE_CAP);
  }
  for (const m of grade.material_misconceptions) cap(m.criterion_id, 'misconception', m.description.slice(0, 160), MISCONCEPTION_CAP);

  let total = 0;
  for (const c of CRITERIA) total += (c.weight * effective[c.id]) / SCORE_MAX;
  const passed = total >= PASS_TOTAL && CRITERIA.every((c) => effective[c.id] >= PASS_MIN_CRITERION);
  // The grade's version, not this module's: it was validated against the version
  // frozen into the attempt, and a rubric bump must not relabel an old decision.
  return { rubric_version: grade.rubric_version, total, passed, raw, effective, caps_applied: caps };
}
