import { hasBannedCopy } from '../../course/ids';
import {
  COVERAGES,
  type Coverage,
  type Evidence,
  type Score,
  type ValidatedCoverage,
  type ValidatedCriterion,
  type ValidatedGrade,
  type ValidatedMisconception,
} from '../../course/assessmentTypes';
import { CRITERION_IDS, PRINCIPLE_IDS, TOOL_IDS, type CriterionId, type PrincipleId, type ToolId } from './rubric';

/**
 * The server's check of the model's grade. The schema constrains the shape;
 * this checks what a schema cannot: that every quote is verbatim from the
 * submission, that every id appears exactly once, that lessons come from the
 * allowed list, and that reasons read as copy for a learner. Errors are
 * collected, not thrown, so one corrective turn can list them all.
 */

export const QUOTE_MIN_CHARS = 8;
export const QUOTE_MAX_CHARS = 400;
export const REASON_MAX_CHARS = 400;

export interface ValidationContext {
  attemptId: string;
  rubricVersion: string;
  responses: { prompt_id: string; text: string }[];
  allowedLessonIds: string[];
}
export type ValidationResult =
  | { ok: true; grade: ValidatedGrade; warnings: string[] }
  | { ok: false; errors: string[] };

/** The form both sides are compared in: unescaped, straight quotes, one space between words. */
export function normalizeForQuote(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A dash becomes a sentence break. The caller logs the prompt-tuning signal. */
export function sanitizeReason(reason: string): string {
  return reason
    .replace(/\s*[–—]\s*/g, '. ')
    .replace(/[{}]/g, '')
    .replace(/\.(\s*\.)+/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const keysExactly = (v: Record<string, unknown>, keys: string[]): boolean => {
  const have = Object.keys(v).sort();
  const want = [...keys].sort();
  return have.length === want.length && have.every((k, i) => k === want[i]);
};

export function validateGradeOutput(
  raw: unknown,
  ctx: ValidationContext,
  opts: { sanitizeReasons?: boolean } = {}
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRecord(raw)) return { ok: false, errors: ['output is not a JSON object'] };

  const TOP = ['attempt_id', 'rubric_version', 'criteria', 'principles', 'tools', 'material_misconceptions'];
  if (!keysExactly(raw, TOP)) errors.push(`top-level keys must be exactly ${TOP.join(', ')}`);
  if (raw.attempt_id !== ctx.attemptId) errors.push('attempt_id does not match the grading input');
  if (raw.rubric_version !== ctx.rubricVersion) errors.push('rubric_version does not match the grading input');

  const responses = new Map(ctx.responses.map((r) => [r.prompt_id, normalizeForQuote(r.text)]));
  const allowed = new Set(ctx.allowedLessonIds);

  const evidenceList = (label: string, v: unknown): Evidence[] => {
    if (!Array.isArray(v)) {
      errors.push(`${label}: evidence must be an array`);
      return [];
    }
    const out: Evidence[] = [];
    v.forEach((e, i) => {
      if (!isRecord(e) || !keysExactly(e, ['prompt_id', 'exact_quote'])) {
        errors.push(`${label} evidence ${i}: keys must be prompt_id and exact_quote`);
        return;
      }
      const pid = typeof e.prompt_id === 'string' ? e.prompt_id : '';
      const quote = typeof e.exact_quote === 'string' ? e.exact_quote : '';
      const text = responses.get(pid);
      if (text === undefined) {
        errors.push(`${label} evidence ${i}: unknown prompt_id ${pid}`);
        return;
      }
      if (quote.length < QUOTE_MIN_CHARS || quote.length > QUOTE_MAX_CHARS) {
        errors.push(`${label} evidence ${i}: exact_quote must be ${QUOTE_MIN_CHARS} to ${QUOTE_MAX_CHARS} characters`);
        return;
      }
      if (!text.includes(normalizeForQuote(quote))) {
        errors.push(`${label} evidence ${i}: exact_quote is not verbatim from the response to ${pid}`);
        return;
      }
      out.push({ prompt_id: pid, exact_quote: quote });
    });
    return out;
  };

  const learnerText = (label: string, v: unknown, max: number): string => {
    if (typeof v !== 'string' || v.trim().length === 0 || v.length > max) {
      errors.push(`${label}: must be 1 to ${max} characters`);
      return '';
    }
    if (hasBannedCopy(v)) {
      if (opts.sanitizeReasons) {
        warnings.push(`${label}: dash replaced (prompt tuning signal)`);
        return sanitizeReason(v);
      }
      errors.push(`${label}: no em dashes, en dashes or {{tokens}}; use plain sentences`);
    }
    return v;
  };

  const eachOnce = (label: string, v: unknown, ids: readonly string[], key: string): Record<string, unknown>[] => {
    if (!Array.isArray(v)) {
      errors.push(`${label}: must be an array`);
      return [];
    }
    const seen = new Set<string>();
    const items: Record<string, unknown>[] = [];
    for (const item of v) {
      if (!isRecord(item)) {
        errors.push(`${label}: every item must be an object`);
        continue;
      }
      const id = String(item[key]);
      if (!ids.includes(id)) errors.push(`${label}: unknown ${key} ${id}`);
      else if (seen.has(id)) errors.push(`${label}: ${id} appears twice`);
      seen.add(id);
      items.push(item);
    }
    for (const id of ids) if (!seen.has(id)) errors.push(`${label}: ${id} is missing`);
    return items;
  };

  const criteria: ValidatedCriterion[] = [];
  for (const c of eachOnce('criteria', raw.criteria, CRITERION_IDS, 'criterion_id')) {
    const id = c.criterion_id as CriterionId;
    const label = `criteria ${id}`;
    if (!keysExactly(c, ['criterion_id', 'score', 'reason', 'evidence_status', 'evidence', 'revision_lesson_ids'])) {
      errors.push(`${label}: unexpected or missing keys`);
    }
    const score = c.score;
    const scoreOk = Number.isInteger(score) && (score as number) >= 0 && (score as number) <= 4;
    if (!scoreOk) errors.push(`${label}: score must be an integer from 0 to 4`);
    const reason = learnerText(`${label} reason`, c.reason, REASON_MAX_CHARS);
    const status = c.evidence_status;
    if (status !== 'found' && status !== 'none') errors.push(`${label}: evidence_status must be found or none`);
    const evidence = evidenceList(label, c.evidence);
    if (status === 'none' && Array.isArray(c.evidence) && c.evidence.length > 0) {
      errors.push(`${label}: evidence_status none requires an empty evidence list`);
    }
    if (status === 'found' && Array.isArray(c.evidence) && c.evidence.length === 0) {
      errors.push(`${label}: evidence_status found requires at least one quote`);
    }
    const lessonIds: string[] = [];
    if (!Array.isArray(c.revision_lesson_ids)) errors.push(`${label}: revision_lesson_ids must be an array`);
    else {
      for (const l of c.revision_lesson_ids) {
        if (typeof l !== 'string' || !allowed.has(l)) errors.push(`${label}: revision lesson ${String(l)} is not in the allowed list`);
        else if (!lessonIds.includes(l)) lessonIds.push(l);
      }
    }
    criteria.push({
      criterion_id: id,
      score: (scoreOk ? score : 0) as Score,
      reason,
      evidence_status: status === 'none' ? 'none' : 'found',
      evidence,
      revision_lesson_ids: lessonIds,
    });
  }

  const coverageList = <Id extends string>(label: string, v: unknown, ids: readonly Id[]): ValidatedCoverage<Id>[] =>
    eachOnce(label, v, ids, 'id').map((item) => {
      const id = String(item.id);
      if (!keysExactly(item, ['id', 'coverage', 'evidence'])) errors.push(`${label} ${id}: unexpected or missing keys`);
      const known = (COVERAGES as readonly string[]).includes(String(item.coverage));
      if (!known) errors.push(`${label} ${id}: coverage must be one of ${COVERAGES.join(', ')}`);
      return { id: id as Id, coverage: known ? (item.coverage as Coverage) : 'missing', evidence: evidenceList(`${label} ${id}`, item.evidence) };
    });
  const principles = coverageList<PrincipleId>('principles', raw.principles, PRINCIPLE_IDS);
  const tools = coverageList<ToolId>('tools', raw.tools, TOOL_IDS);

  const misconceptions: ValidatedMisconception[] = [];
  if (!Array.isArray(raw.material_misconceptions)) errors.push('material_misconceptions must be an array');
  else {
    raw.material_misconceptions.forEach((m, i) => {
      const label = `material_misconceptions ${i}`;
      if (!isRecord(m) || !keysExactly(m, ['criterion_id', 'description', 'evidence'])) {
        errors.push(`${label}: keys must be criterion_id, description and evidence`);
        return;
      }
      const id = String(m.criterion_id);
      if (!(CRITERION_IDS as readonly string[]).includes(id)) errors.push(`${label}: unknown criterion_id ${id}`);
      const description = learnerText(`${label} description`, m.description, REASON_MAX_CHARS);
      const evidence = evidenceList(label, m.evidence);
      if (Array.isArray(m.evidence) && m.evidence.length === 0) errors.push(`${label}: a material misconception needs at least one quote`);
      misconceptions.push({ criterion_id: id as CriterionId, description, evidence });
    });
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    warnings,
    grade: { attempt_id: ctx.attemptId, rubric_version: ctx.rubricVersion, criteria, principles, tools, material_misconceptions: misconceptions },
  };
}
