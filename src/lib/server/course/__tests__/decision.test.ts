import { describe, expect, it } from 'vitest';
import { CRITERION_IDS, PRINCIPLE_IDS, TOOL_IDS, type CriterionId } from '../../../../data/certification';
import type { Score, ValidatedGrade } from '../../../course/assessmentTypes';
import { decide } from '../decision';

function grade(scores: Partial<Record<CriterionId, Score>>, extra: Partial<ValidatedGrade> = {}): ValidatedGrade {
  return {
    attempt_id: 'att-1',
    rubric_version: '1',
    criteria: CRITERION_IDS.map((id) => ({
      criterion_id: id,
      score: scores[id] ?? 3,
      reason: 'Applied with a reason.',
      evidence_status: 'found',
      evidence: [{ prompt_id: 'a1', exact_quote: 'a quoted passage' }],
      revision_lesson_ids: [],
    })),
    principles: PRINCIPLE_IDS.map((id) => ({ id, coverage: 'applied', evidence: [] })),
    tools: TOOL_IDS.map((id) => ({ id, coverage: 'applied', evidence: [] })),
    material_misconceptions: [],
    ...extra,
  };
}
const all = (score: Score) => Object.fromEntries(CRITERION_IDS.map((id) => [id, score])) as Record<CriterionId, Score>;

describe('decide', () => {
  it('all fours is 100 and passes', () => {
    const d = decide(grade(all(4)));
    expect(d.total).toBe(100);
    expect(d.passed).toBe(true);
    expect(d.caps_applied).toEqual([]);
  });

  it('exactly 80.0 passes', () => {
    const d = decide(grade({ ...all(3), mutual_understanding: 4 }));
    expect(d.total).toBe(80);
    expect(d.passed).toBe(true);
  });

  it('all threes is 75 and does not pass', () => {
    const d = decide(grade(all(3)));
    expect(d.total).toBe(75);
    expect(d.passed).toBe(false);
  });

  it('a 2 anywhere fails even at 95', () => {
    const d = decide(grade({ ...all(4), learning_living_systems: 2 }));
    expect(d.total).toBe(95);
    expect(d.passed).toBe(false);
  });

  it('a missing principle caps wisdom_principles at 2 and records it', () => {
    const g = grade(all(4));
    g.principles[3] = { ...g.principles[3], coverage: 'missing' };
    const d = decide(g);
    expect(d.effective.wisdom_principles).toBe(2);
    expect(d.raw.wisdom_principles).toBe(4);
    expect(d.caps_applied).toEqual([
      { criterion_id: 'wisdom_principles', cause: 'principle', detail: `${g.principles[3].id}: missing`, from: 4, to: 2 },
    ]);
    expect(d.total).toBe(90);
    expect(d.passed).toBe(false);
  });

  it('a misapplied tool caps judgment_tools at 2', () => {
    const g = grade(all(4));
    g.tools[0] = { ...g.tools[0], coverage: 'misapplied' };
    const d = decide(g);
    expect(d.effective.judgment_tools).toBe(2);
    expect(d.caps_applied[0]).toMatchObject({ criterion_id: 'judgment_tools', cause: 'tool', from: 4, to: 2 });
  });

  it('a material misconception caps its criterion at 2', () => {
    const g = grade(all(4), {
      material_misconceptions: [{ criterion_id: 'solution_quality', description: 'Treated the proposal as an agreement.', evidence: [] }],
    });
    const d = decide(g);
    expect(d.effective.solution_quality).toBe(2);
    expect(d.caps_applied[0]).toMatchObject({ criterion_id: 'solution_quality', cause: 'misconception', from: 4, to: 2 });
  });

  it('a cap never raises a score', () => {
    const g = grade({ ...all(4), wisdom_principles: 1 });
    g.principles[0] = { ...g.principles[0], coverage: 'missing' };
    const d = decide(g);
    expect(d.effective.wisdom_principles).toBe(1);
    expect(d.caps_applied[0]).toMatchObject({ from: 1, to: 1 });
  });

  it('partial coverage applies no cap', () => {
    const g = grade(all(4));
    g.principles[0] = { ...g.principles[0], coverage: 'partial' };
    expect(decide(g).caps_applied).toEqual([]);
  });

  it('carries the grade its own rubric version', () => {
    expect(decide(grade(all(4), { rubric_version: '7' })).rubric_version).toBe('7');
  });

  it('keeps the total unrounded', () => {
    expect(decide(grade({ ...all(4), self_understanding: 3 })).total).toBe(96.25);
  });
});
