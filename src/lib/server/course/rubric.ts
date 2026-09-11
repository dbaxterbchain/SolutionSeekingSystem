/**
 * The grader's view of the published rubric. Everything learner-facing lives
 * in src/data/certification.ts (the certification page renders from it), so
 * the page and the grader cannot disagree. This module adds the versions and
 * caps only the grader needs. Pure and worker-safe.
 */
export {
  CERTIFICATION_VERSION,
  CRITERIA,
  CRITERION_IDS,
  PASS_MIN_CRITERION,
  PASS_TOTAL,
  PRINCIPLE_IDS,
  SCORE_ANCHORS,
  TOOL_IDS,
} from '../../../data/certification';
export type { CriterionId, PrincipleId, ToolId } from '../../../data/certification';

/** Bumped when criteria, weights, anchors or decision rules change. Frozen into every attempt. */
export const RUBRIC_VERSION = '1';
/** Bumped when the grader instructions change. Frozen into every attempt; a change rolls the prompt cache. */
export const PROMPT_VERSION = '1';
export const SCORE_MAX = 4;
/** A missing or misapplied principle caps Wisdom Principles; a missing or misapplied tool caps Judgment and Leadership Tools. */
export const COVERAGE_CAP = 2;
/** Each material misconception caps the criterion it names. */
export const MISCONCEPTION_CAP = 2;
