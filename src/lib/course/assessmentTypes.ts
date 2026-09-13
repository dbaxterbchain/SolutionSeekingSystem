/**
 * Types shared by the assessment API, the grading worker and the browser.
 * Pure: no imports beyond the published rubric ids. Nothing here carries a
 * reveal, a reference response or a prompt of a stage that has not opened;
 * the server builds every view through viewForLearner (assessmentRules.ts).
 */

import type { CriterionId, PrincipleId, ToolId } from '../../data/certification';

export const ATTEMPT_STATES = ['draft', 'submitted', 'grading', 'passed', 'needs_revision', 'grading_error'] as const;
export type AttemptState = (typeof ATTEMPT_STATES)[number];
export const OPEN_ATTEMPT_STATES: readonly AttemptState[] = ['draft', 'submitted', 'grading', 'grading_error'];
export const JOB_STATES = ['queued', 'running', 'succeeded', 'failed'] as const;
export type JobState = (typeof JOB_STATES)[number];
export const ERROR_CATEGORIES = ['rate_limited', 'overloaded', 'upstream', 'invalid_output', 'refusal', 'max_tokens', 'integrity', 'internal'] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];
export const COVERAGES = ['applied', 'partial', 'missing', 'misapplied'] as const;
export type Coverage = (typeof COVERAGES)[number];
export type Score = 0 | 1 | 2 | 3 | 4;
export type CertificationStatus = 'none' | 'in_progress' | 'submitted' | 'passed' | 'needs_revision' | 'grading_error';

export interface Evidence { prompt_id: string; exact_quote: string }
export interface ValidatedCriterion { criterion_id: CriterionId; score: Score; reason: string; evidence_status: 'found' | 'none'; evidence: Evidence[]; revision_lesson_ids: string[] }
export interface ValidatedCoverage<Id extends string> { id: Id; coverage: Coverage; evidence: Evidence[] }
export interface ValidatedMisconception { criterion_id: CriterionId; description: string; evidence: Evidence[] }
export interface ValidatedGrade {
  attempt_id: string; rubric_version: string;
  criteria: ValidatedCriterion[]; principles: ValidatedCoverage<PrincipleId>[]; tools: ValidatedCoverage<ToolId>[];
  material_misconceptions: ValidatedMisconception[];
}
export interface CapApplied { criterion_id: CriterionId; cause: 'principle' | 'tool' | 'misconception'; detail: string; from: number; to: number }
export interface Decision { rubric_version: string; total: number; passed: boolean; raw: Record<CriterionId, number>; effective: Record<CriterionId, number>; caps_applied: CapApplied[] }

/** Learner-facing views. Nothing here carries a reveal or a prompt of a stage that has not opened. */
export interface ResponseView { text: string; revision: number; locked: boolean }
export interface PromptView { prompt_id: string; text: string; required: boolean; min_chars: number; max_chars: number; response: ResponseView }
export interface StageView { index: number; id: string; part: 'A' | 'B' | 'C'; title: string; intro: string | null; reveal: string | null; lock_on_advance: boolean; prompts: PromptView[] }
export interface AttemptView { id: string; state: AttemptState; form_id: string; certification_version: string; current_stage: number; stage_count: number; stages: StageView[]; submitted_at: string | null; finalized_at: string | null; created_at: string }
export interface JobView { id: string; state: JobState; generation: number; attempts: number; error_category: ErrorCategory | null; updated_at: string }
export interface EvidenceView { prompt_id: string; prompt_label: string; quote: string }
export interface LessonLink { id: string; title: string; href: string | null }
export interface CriterionFeedback { criterion_id: CriterionId; name: string; weight: number; score: number; effective_score: number; status: 'answered' | 'unanswered' | 'misconception'; reason: string; evidence: EvidenceView[]; revision_lessons: LessonLink[] }
export interface ResultView { total: number; pass_total: number; passed: boolean; criteria: CriterionFeedback[]; caps_applied: CapApplied[]; misconceptions: { criterion_id: CriterionId; description: string }[]; graded_at: string }
export type EligibilityReason = 'ready' | 'modules_incomplete' | 'already_passed' | 'open_attempt';
export interface AssessmentStatus { attempt: AttemptView | null; job: JobView | null; result: ResultView | null; awards_enabled: boolean; certificate: CertificateSummary | null; eligibility: { eligible: boolean; reason: EligibilityReason }; support_contact: string }

/** One row of a learner's attempt history. Outcome fields are null until a grade exists. */
export interface AttemptSummary {
  id: string;
  state: AttemptState;
  certification_version: string;
  /** 1-based, counted from the learner's first attempt. */
  sequence: number;
  created_at: string;
  submitted_at: string | null;
  finalized_at: string | null;
  passed: boolean | null;
  total: number | null;
}
export interface AssessmentHistory {
  attempts: AttemptSummary[];
}

export type CertificateStatus = 'active' | 'revoked';

/** What the assessment page needs in order to point at the certificate page. */
export interface CertificateSummary {
  id: string;
  serial: string;
  status: CertificateStatus;
  name_confirmed: boolean;
  issued_at: string;
}

/** The learner's own certificate, as the certificate page shows it. The share url is present only while sharing is on. */
export interface CertificateRecord {
  id: string;
  serial: string;
  certification_version: string;
  display_name: string | null;
  name_confirmed_at: string | null;
  issued_at: string;
  status: CertificateStatus;
  revoked_at: string | null;
  share_active: boolean;
  share_url: string | null;
}

/** GET /api/course/certificate: the certificate, or null with the facts the page needs to say why. */
export interface CertificatePayload {
  certificate: CertificateRecord | null;
  awards_enabled: boolean;
  passed_current: boolean;
  certification_version: string;
}

/** What the verify page shows: an active, shared certificate with a confirmed name, and nothing else. */
export interface PublicCertificate {
  display_name: string;
  serial: string;
  certification_version: string;
  issued_at: string;
}
