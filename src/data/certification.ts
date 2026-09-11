/**
 * The published certification rubric. Rendered on /course/certification and
 * used by the grader (src/lib/server/course/rubric.ts re-exports it), so the
 * page and the grader cannot disagree. Pure data, safe to import anywhere.
 *
 * Wording follows the course brief. Learner-facing, so the house copy rules
 * apply (no em dashes).
 */

/** Frozen before any certificate is awarded. A substantial change bumps it. */
export const CERTIFICATION_VERSION = '1';
export const CERTIFICATION_TITLE = 'Solution Seeking System Certification';
export const CERTIFICATION_METHOD = 'AI-assessed, unproctored';

export const CRITERIA = [
  {
    id: 'self_understanding',
    name: 'Self-understanding',
    weight: 15,
    demonstrates: 'Separates the account, feelings, assumptions, and useful questions.',
  },
  {
    id: 'mutual_understanding',
    name: 'Mutual Understanding',
    weight: 20,
    demonstrates:
      'Represents both accounts and asks each person to correct and confirm the summary.',
  },
  {
    id: 'wisdom_principles',
    name: 'Wisdom Principles',
    weight: 20,
    demonstrates: 'Applies all 12 principles in concrete choices, including their relevant limits.',
  },
  {
    id: 'solution_quality',
    name: 'Solution quality',
    weight: 20,
    demonstrates:
      'Offers fair actions, owners, evidence, timing, and a review. Keeps a proposal distinct from an agreement.',
  },
  {
    id: 'judgment_tools',
    name: 'Judgment and Leadership Tools',
    weight: 15,
    demonstrates:
      'Matches all four tools to their purposes. Chooses an appropriate main-case tool and respects participation limits.',
  },
  {
    id: 'learning_living_systems',
    name: 'Learning and Living Systems',
    weight: 10,
    demonstrates:
      'Uses implementation evidence and feedback to revise a solution and an ongoing practice.',
  },
] as const;

export type CriterionId = (typeof CRITERIA)[number]['id'];
export const CRITERION_IDS: readonly CriterionId[] = CRITERIA.map((c) => c.id);

/**
 * How many criteria there are, spelled the way a sentence wants it. Prose that
 * says "the six criteria" reads this rather than typing the number, so adding a
 * criterion cannot leave a published page counting wrong.
 */
const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
export const CRITERIA_COUNT_WORD: string = COUNT_WORDS[CRITERIA.length] ?? String(CRITERIA.length);

/** What each score from 0 to 4 means. Substance is judged, never length. */
export const SCORE_ANCHORS = {
  0: 'Missing or contrary evidence.',
  1: 'A label or a major misconception.',
  2: 'Partial application with a material gap.',
  3: 'Independent, appropriate application.',
  4: 'Sound application with a clear correction, reason, or tradeoff.',
} as const;

/** Weighted total out of 100 needed to pass, and the floor for every criterion. */
export const PASS_TOTAL = 80;
export const PASS_MIN_CRITERION = 3;

/** Content collection ids of the 12 Wisdom Principles (src/content/principles). */
export const PRINCIPLE_IDS = [
  'understanding',
  'good-faith',
  'forgiveness',
  'humility',
  'compassion-empathy',
  'bravery',
  'vulnerability',
  'patience',
  'fairness',
  'integrity',
  'flexibility',
  'critical-thinking',
] as const;
export type PrincipleId = (typeof PRINCIPLE_IDS)[number];

/** Content collection ids of the four Leadership Tools (src/content/tools). */
export const TOOL_IDS = [
  'one-on-ones',
  'feedback',
  'targeted-conversations',
  'solution-seeking-sessions',
] as const;
export type ToolId = (typeof TOOL_IDS)[number];
