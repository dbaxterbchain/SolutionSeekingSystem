import type { SnapshotPublic, SnapshotStage } from './assessmentForm';
import type { AttemptState, AttemptView, CertificationStatus, StageView } from './assessmentTypes';

/**
 * Pure rules for an attempt: what the learner may see, when a stage is
 * complete, which form a learner gets next. The API binds them to the tables
 * in src/lib/server/course/attempts.ts.
 */

export interface AttemptRecord {
  id: string;
  state: AttemptState;
  form_id: string;
  form_version: number;
  certification_version: string;
  current_stage: number;
  stage_count: number;
  snapshot_public: SnapshotPublic;
  submitted_at: string | null;
  finalized_at: string | null;
  created_at: string;
}
export interface ResponseRecord {
  prompt_id: string;
  stage: number;
  response_text: string;
  revision: number;
  locked_at: string | null;
}

/**
 * Stages 0..current_stage only. Later prompts are withheld too, not just the
 * reveals, because a prompt like "what will you revise" gives away the shape
 * of the reveal.
 */
export function viewForLearner(attempt: AttemptRecord, responses: ResponseRecord[]): AttemptView {
  const byPrompt = new Map(responses.map((r) => [r.prompt_id, r]));
  const open = Math.min(attempt.current_stage, attempt.stage_count - 1);
  const stages: StageView[] = attempt.snapshot_public.stages.slice(0, open + 1).map((s, index) => ({
    index,
    id: s.id,
    part: s.part,
    title: s.title,
    intro: s.intro,
    reveal: s.reveal,
    lock_on_advance: s.lock_on_advance,
    prompts: s.prompts.map((p) => {
      const r = byPrompt.get(p.prompt_id);
      return {
        prompt_id: p.prompt_id,
        text: p.text,
        required: p.required,
        min_chars: p.min_chars,
        max_chars: p.max_chars,
        response: { text: r?.response_text ?? '', revision: r?.revision ?? 0, locked: Boolean(r?.locked_at) },
      };
    }),
  }));
  return {
    id: attempt.id,
    state: attempt.state,
    form_id: attempt.form_id,
    certification_version: attempt.certification_version,
    current_stage: attempt.current_stage,
    stage_count: attempt.stage_count,
    stages,
    submitted_at: attempt.submitted_at,
    finalized_at: attempt.finalized_at,
    created_at: attempt.created_at,
  };
}

export interface StageProblem {
  prompt_id: string;
  problem: 'required' | 'too_short' | 'too_long';
}

/** What stops a stage from advancing (or the attempt from submitting). */
export function stageProblems(stage: SnapshotStage, responses: ResponseRecord[]): StageProblem[] {
  const byPrompt = new Map(responses.map((r) => [r.prompt_id, r]));
  const out: StageProblem[] = [];
  for (const p of stage.prompts) {
    const text = (byPrompt.get(p.prompt_id)?.response_text ?? '').trim();
    if (text.length === 0) {
      if (p.required) out.push({ prompt_id: p.prompt_id, problem: 'required' });
      continue;
    }
    if (text.length < p.min_chars) out.push({ prompt_id: p.prompt_id, problem: 'too_short' });
    else if (text.length > p.max_chars) out.push({ prompt_id: p.prompt_id, problem: 'too_long' });
  }
  return out;
}

/** The stage index a prompt belongs to, or null for an unknown prompt. */
export function promptStage(snapshot: SnapshotPublic, promptId: string): number | null {
  const i = snapshot.stages.findIndex((s) => s.prompts.some((p) => p.prompt_id === promptId));
  return i === -1 ? null : i;
}

/** How many times one learner may be given the same form. */
export const MAX_EXPOSURES_PER_FORM = 1;
export interface AssignableForm {
  form_id: string;
  order: number;
  status: 'active' | 'retired' | 'sample';
}

/** The least-exposed assignable form: active (and the sample when allowed), unseen by this learner, lowest order first. */
export function chooseForm<F extends AssignableForm>(forms: F[], exposures: Record<string, number>, allowSample: boolean): F | null {
  return (
    forms
      .filter((f) => f.status === 'active' || (allowSample && f.status === 'sample'))
      .filter((f) => (exposures[f.form_id] ?? 0) < MAX_EXPOSURES_PER_FORM)
      .sort((a, b) => a.order - b.order || a.form_id.localeCompare(b.form_id))[0] ?? null
  );
}

export function certificationStatus(latest: AttemptState | null): CertificationStatus {
  switch (latest) {
    case null:
      return 'none';
    case 'draft':
      return 'in_progress';
    case 'submitted':
    case 'grading':
      return 'submitted';
    default:
      return latest;
  }
}
