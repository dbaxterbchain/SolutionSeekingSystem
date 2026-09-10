import Anthropic from '@anthropic-ai/sdk';
import type { ErrorCategory, ValidatedGrade } from '../../course/assessmentTypes';
import { validateGradeOutput, type ValidationContext } from './gradeValidation';
import { GRADE_OUTPUT_SCHEMA, buildGraderRequest, type GradingInput } from './promptBuilder';

/**
 * One grade: the model call with structured output, the single max_tokens
 * retry, one corrective turn on the same cached prefix when the server-side
 * validation fails, and the mapping of every failure to a category the job
 * store understands. No tools, no sampling parameters, no thinking override
 * (adaptive thinking is the model's default). Worker-shared: the Anthropic
 * client is injected and tests pass a fake.
 *
 * The four time budgets nest, shortest first. One call gets
 * GRADER_CALL_TIMEOUT_MS and the SDK retries nothing, so a slow call can never
 * quietly become three. One grade makes at most two calls and has
 * GRADER_BUDGET_MS for both: before every call after the first, a grade with no
 * room left for a whole call stops and reports a retryable failure rather than
 * run past its lease. The lease the runner takes (DEFAULT_LEASE_SECONDS in
 * gradingJob.ts) is longer than that budget, so the lease is still this
 * worker's while it finishes, and the Netlify background limit of 900 seconds
 * is longer again, so the function is never killed while holding a lease.
 */

/** The slice of the SDK the grader uses. */
export interface GraderClient {
  messages: {
    stream(params: Anthropic.MessageStreamParams): { finalMessage(): Promise<Anthropic.Message> };
  };
}
export interface GraderSettings {
  model: string;
  maxTokens?: number;
  retryMaxTokens?: number;
  /** Epoch ms this grade must be finished by. Defaults to now plus GRADER_BUDGET_MS. */
  deadlineAt?: number;
}
export const DEFAULT_MAX_TOKENS = 16000;
export const RETRY_MAX_TOKENS = 24000;
/** What one call gets, and what both client constructions pass as their SDK timeout. */
export const GRADER_CALL_TIMEOUT_MS = 300_000;
/** What one grade gets for every call it makes. Shorter than the lease. */
export const GRADER_BUDGET_MS = 720_000;

export interface GradeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  calls: number;
}
export type GradeOutcome =
  | { ok: true; raw: string; grade: ValidatedGrade; usage: GradeUsage; model: string; warnings: string[]; corrected: boolean }
  | { ok: false; category: ErrorCategory; retryable: boolean; message: string; raw: string | null; usage: GradeUsage };

export function categorizeError(err: unknown): { category: ErrorCategory; retryable: boolean; message: string } {
  if (err instanceof Anthropic.RateLimitError) return { category: 'rate_limited', retryable: true, message: err.message };
  if (err instanceof Anthropic.APIError) {
    const status = err.status;
    if (status === 529) return { category: 'overloaded', retryable: true, message: err.message };
    if (status === undefined || status >= 500) return { category: 'upstream', retryable: true, message: err.message };
    return { category: 'internal', retryable: false, message: `${status}: ${err.message}` };
  }
  return { category: 'internal', retryable: false, message: err instanceof Error ? err.message : String(err) };
}

const textOf = (m: Anthropic.Message): string =>
  m.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
const emptyUsage = (): GradeUsage => ({ input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, calls: 0 });
function addUsage(total: GradeUsage, u: Anthropic.Usage | undefined): void {
  if (!u) return;
  total.input_tokens += u.input_tokens ?? 0;
  total.output_tokens += u.output_tokens ?? 0;
  total.cache_creation_input_tokens += u.cache_creation_input_tokens ?? 0;
  total.cache_read_input_tokens += u.cache_read_input_tokens ?? 0;
  total.calls += 1;
}
function parseJson(text: string): { parsed: unknown; error: string | null } {
  try {
    return { parsed: JSON.parse(text), error: null };
  } catch {
    return { parsed: null, error: 'output is not valid JSON' };
  }
}

export async function gradeAttempt(args: {
  anthropic: GraderClient;
  input: GradingInput;
  ctx: ValidationContext;
  settings: GraderSettings;
}): Promise<GradeOutcome> {
  const { anthropic, input, ctx, settings } = args;
  const request = buildGraderRequest(input);
  const usage = emptyUsage();
  const startedAt = Date.now();
  const deadline = settings.deadlineAt ?? startedAt + GRADER_BUDGET_MS;
  /** True when a whole call still fits before the deadline. */
  const roomForAnotherCall = () => Date.now() + GRADER_CALL_TIMEOUT_MS <= deadline;
  const outOfBudget = (raw: string | null): GradeOutcome => ({
    ok: false,
    category: 'upstream',
    retryable: true,
    message: 'grading budget exhausted before the next call',
    raw,
    usage,
  });
  const base = {
    model: settings.model,
    system: request.system,
    output_config: { effort: 'high' as const, format: { type: 'json_schema' as const, schema: GRADE_OUTPUT_SCHEMA } },
  };

  type CallResult = { ok: true; text: string } | { ok: false; outcome: GradeOutcome };
  const call = async (messages: Anthropic.MessageParam[]): Promise<CallResult> => {
    let maxTokens = settings.maxTokens ?? DEFAULT_MAX_TOKENS;
    for (let round = 0; round < 2; round++) {
      let message: Anthropic.Message;
      try {
        message = await anthropic.messages.stream({ ...base, max_tokens: maxTokens, messages }).finalMessage();
      } catch (err) {
        return { ok: false, outcome: { ok: false, ...categorizeError(err), raw: null, usage } };
      }
      addUsage(usage, message.usage);
      const text = textOf(message);
      if (message.stop_reason === 'refusal') {
        return { ok: false, outcome: { ok: false, category: 'refusal', retryable: false, message: 'the model declined to grade this submission', raw: text || null, usage } };
      }
      if (message.stop_reason === 'max_tokens') {
        if (round === 0) {
          if (!roomForAnotherCall()) return { ok: false, outcome: outOfBudget(text || null) };
          maxTokens = settings.retryMaxTokens ?? RETRY_MAX_TOKENS;
          continue;
        }
        return { ok: false, outcome: { ok: false, category: 'max_tokens', retryable: false, message: `output exceeded ${maxTokens} tokens twice`, raw: text || null, usage } };
      }
      return { ok: true, text };
    }
    throw new Error('unreachable');
  };

  const first = await call(request.messages);
  if (!first.ok) return first.outcome;
  const p1 = parseJson(first.text);
  const v1 = p1.error ? { ok: false as const, errors: [p1.error] } : validateGradeOutput(p1.parsed, ctx);
  if (v1.ok) return { ok: true, raw: first.text, grade: v1.grade, usage, model: settings.model, warnings: v1.warnings, corrected: false };

  if (!roomForAnotherCall()) return outOfBudget(first.text || null);

  // One corrective turn on the same cached prefix, listing every problem.
  const correction: Anthropic.MessageParam[] = [
    ...request.messages,
    { role: 'assistant', content: first.text },
    {
      role: 'user',
      content: [
        'Your grade failed validation. Fix every problem below and return the complete corrected grade as one JSON object that matches the schema. Quote only text that appears verbatim in a learner_response.',
        ...v1.errors.slice(0, 40).map((e) => `- ${e}`),
      ].join('\n'),
    },
  ];
  const second = await call(correction);
  if (!second.ok) return second.outcome;
  const p2 = parseJson(second.text);
  const v2 = p2.error ? { ok: false as const, errors: [p2.error] } : validateGradeOutput(p2.parsed, ctx, { sanitizeReasons: true });
  if (v2.ok) return { ok: true, raw: second.text, grade: v2.grade, usage, model: settings.model, warnings: v2.warnings, corrected: true };
  return {
    ok: false,
    category: 'invalid_output',
    retryable: true,
    message: v2.errors.slice(0, 20).join('; ').slice(0, 1900),
    raw: second.text || null,
    usage,
  };
}
