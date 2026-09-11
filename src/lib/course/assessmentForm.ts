import {
  CRITERION_IDS,
  PRINCIPLE_IDS,
  TOOL_IDS,
  type CriterionId,
  type PrincipleId,
  type ToolId,
} from '../../data/certification';
import { LESSON_ID_RE, hasBannedCopy } from './ids';

/**
 * The assessment form shape (src/content/course/assessment-forms/*.json) and
 * the rules a form must satisfy beyond what the Zod schema can say field by
 * field. Pure: the collection schema calls checkForm from superRefine, the
 * start action freezes the two snapshots, and the tests exercise both.
 *
 * Keys are snake_case on purpose: the same objects are frozen into the
 * database as an attempt's snapshot and cross into the grader's prompt.
 */

/** Every form file carries this literal; the dist scan looks for it. */
export const FORM_PRIVATE_MARKER = 'SSS-PRIVATE-ASSESSMENT-FORM';
export const FORM_STATUSES = ['active', 'retired', 'sample'] as const;
export type FormStatus = (typeof FORM_STATUSES)[number];
export const STAGE_PARTS = ['A', 'B', 'C'] as const;
export type StagePart = (typeof STAGE_PARTS)[number];
/** Matches the check constraint on course_assessment_responses.response_text. */
export const RESPONSE_MAX_CHARS = 8000;

export interface FormPrompt {
  prompt_id: string;
  text: string;
  required: boolean;
  min_chars: number;
  max_chars: number;
  principle_ids: PrincipleId[];
  tool_ids: ToolId[];
}

export interface FormStage {
  id: string;
  part: StagePart;
  title: string;
  intro?: string;
  /** Shown only once this stage opens, which requires the previous stage to lock. */
  reveal?: string;
  lock_on_advance: boolean;
  prompts: FormPrompt[];
}

export interface AssessmentForm {
  form_id: string;
  version: number;
  certification_version: string;
  status: FormStatus;
  order: number;
  private_marker: string;
  stages: FormStage[];
  reference_responses: { prompt_id: string; text: string }[];
  scoring_anchors: { criterion_id: CriterionId; note: string }[];
  lesson_ids: string[];
  notes?: string;
}

/** Which prompts are expected to show each principle and tool. */
export interface CoverageMap {
  principles: Record<PrincipleId, string[]>;
  tools: Record<ToolId, string[]>;
}

export function deriveCoverageMap(form: Pick<AssessmentForm, 'stages'>): CoverageMap {
  const principles = Object.fromEntries(PRINCIPLE_IDS.map((id) => [id, [] as string[]])) as Record<PrincipleId, string[]>;
  const tools = Object.fromEntries(TOOL_IDS.map((id) => [id, [] as string[]])) as Record<ToolId, string[]>;
  for (const stage of form.stages) {
    for (const prompt of stage.prompts) {
      for (const id of prompt.principle_ids) principles[id]?.push(prompt.prompt_id);
      for (const id of prompt.tool_ids) tools[id]?.push(prompt.prompt_id);
    }
  }
  return { principles, tools };
}

/** Every cross-field rule. An empty list means the form is valid. */
export function checkForm(form: AssessmentForm): string[] {
  const problems: string[] = [];
  const copy = (label: string, s: string | undefined) => {
    if (s !== undefined && hasBannedCopy(s)) problems.push(`${label}: no em dashes, en dashes or {{tokens}}`);
  };

  if (form.private_marker !== FORM_PRIVATE_MARKER) problems.push('private_marker must be the literal marker');
  if (form.stages.length === 0) problems.push('a form needs at least one stage');

  const stageIds = new Set<string>();
  const promptIds = new Set<string>();
  let lastPart = 0;
  form.stages.forEach((stage, i) => {
    if (stageIds.has(stage.id)) problems.push(`stage ${stage.id}: duplicate stage id`);
    stageIds.add(stage.id);
    copy(`stage ${stage.id} title`, stage.title);
    copy(`stage ${stage.id} intro`, stage.intro);
    copy(`stage ${stage.id} reveal`, stage.reveal);
    const part = STAGE_PARTS.indexOf(stage.part);
    if (part < lastPart) problems.push(`stage ${stage.id}: parts must run A, B, C in order`);
    lastPart = Math.max(lastPart, part);
    if (i === 0 && stage.reveal) problems.push(`stage ${stage.id}: the first stage cannot have a reveal`);
    if (i > 0 && stage.reveal && !form.stages[i - 1].lock_on_advance) {
      problems.push(`stage ${stage.id}: a reveal requires the previous stage to lock on advance`);
    }
    if (stage.prompts.length === 0) problems.push(`stage ${stage.id}: a stage needs at least one prompt`);
    for (const p of stage.prompts) {
      if (promptIds.has(p.prompt_id)) problems.push(`prompt ${p.prompt_id}: duplicate prompt id`);
      promptIds.add(p.prompt_id);
      copy(`prompt ${p.prompt_id}`, p.text);
      if (p.min_chars < 0 || p.max_chars > RESPONSE_MAX_CHARS || p.min_chars > p.max_chars) {
        problems.push(`prompt ${p.prompt_id}: min_chars and max_chars must satisfy 0 <= min <= max <= ${RESPONSE_MAX_CHARS}`);
      }
    }
  });

  const coverage = deriveCoverageMap(form);
  for (const id of PRINCIPLE_IDS) if (coverage.principles[id].length === 0) problems.push(`principle ${id} is covered by no prompt`);
  for (const id of TOOL_IDS) if (coverage.tools[id].length === 0) problems.push(`tool ${id} is covered by no prompt`);

  const referenced = new Set(form.reference_responses.map((r) => r.prompt_id));
  for (const r of form.reference_responses) {
    if (!promptIds.has(r.prompt_id)) problems.push(`reference response ${r.prompt_id}: unknown prompt`);
    copy(`reference response ${r.prompt_id}`, r.text);
  }
  for (const stage of form.stages) {
    for (const p of stage.prompts) {
      if (p.required && !referenced.has(p.prompt_id)) problems.push(`prompt ${p.prompt_id}: a required prompt needs a reference response`);
    }
  }

  const anchored = new Set<string>();
  for (const a of form.scoring_anchors) {
    if (!(CRITERION_IDS as readonly string[]).includes(a.criterion_id)) problems.push(`scoring anchor ${a.criterion_id}: unknown criterion`);
    if (anchored.has(a.criterion_id)) problems.push(`scoring anchor ${a.criterion_id}: one anchor per criterion`);
    anchored.add(a.criterion_id);
    copy(`scoring anchor ${a.criterion_id}`, a.note);
  }

  if (form.lesson_ids.length === 0) problems.push('lesson_ids must name at least one lesson');
  if (new Set(form.lesson_ids).size !== form.lesson_ids.length) problems.push('lesson_ids must be unique');
  for (const id of form.lesson_ids) if (!LESSON_ID_RE.test(id)) problems.push(`lesson id ${id}: not a lesson id`);
  copy('notes', form.notes);
  return problems;
}

export interface SnapshotPrompt {
  prompt_id: string;
  text: string;
  required: boolean;
  min_chars: number;
  max_chars: number;
}
export interface SnapshotStage {
  id: string;
  part: StagePart;
  title: string;
  intro: string | null;
  reveal: string | null;
  lock_on_advance: boolean;
  prompts: SnapshotPrompt[];
}
/** What the learner may eventually see, frozen at start. Sliced per stage by viewForLearner. */
export interface SnapshotPublic {
  form_id: string;
  version: number;
  stage_count: number;
  stages: SnapshotStage[];
}
/** What only the grader may see, frozen at start. Selected by jobStore.ts and the admin route, nowhere else. */
export interface SnapshotPrivate {
  form_id: string;
  version: number;
  coverage: CoverageMap;
  reference_responses: { prompt_id: string; text: string }[];
  scoring_anchors: { criterion_id: CriterionId; note: string }[];
  notes: string | null;
  allowed_lessons: { id: string; title: string }[];
  source_pack_sha256: string;
  rubric_version: string;
  prompt_version: string;
}

export function publicSnapshot(form: AssessmentForm): SnapshotPublic {
  return {
    form_id: form.form_id,
    version: form.version,
    stage_count: form.stages.length,
    stages: form.stages.map((s) => ({
      id: s.id,
      part: s.part,
      title: s.title,
      intro: s.intro ?? null,
      reveal: s.reveal ?? null,
      lock_on_advance: s.lock_on_advance,
      prompts: s.prompts.map((p) => ({
        prompt_id: p.prompt_id,
        text: p.text,
        required: p.required,
        min_chars: p.min_chars,
        max_chars: p.max_chars,
      })),
    })),
  };
}

export function privateSnapshot(
  form: AssessmentForm,
  args: { allowedLessons: { id: string; title: string }[]; sourcePackSha256: string; rubricVersion: string; promptVersion: string }
): SnapshotPrivate {
  return {
    form_id: form.form_id,
    version: form.version,
    coverage: deriveCoverageMap(form),
    reference_responses: form.reference_responses.map((r) => ({ prompt_id: r.prompt_id, text: r.text })),
    scoring_anchors: form.scoring_anchors.map((a) => ({ criterion_id: a.criterion_id, note: a.note })),
    notes: form.notes ?? null,
    allowed_lessons: args.allowedLessons.map((l) => ({ id: l.id, title: l.title })),
    source_pack_sha256: args.sourcePackSha256,
    rubric_version: args.rubricVersion,
    prompt_version: args.promptVersion,
  };
}
