import type { ModuleCheck } from './types';
import { checkId } from './ids';

/**
 * The module-check rules, pure and shared by the API route and the island's
 * types. A check reaches the browser as its id, question and two choices; the
 * key and the explanation stay on the server until an answer is graded.
 */

/** Modules that carry checks. Module 9 holds the orientation and the plan, no checks. */
export const CHECK_MODULE_ID_RE = /^m0[1-8]$/;
/** `m02-c1`: the module id, then the 1-based check number. */
export const CHECK_ID_RE = /^m0[1-8]-c[1-9]$/;

export interface PublicCheck {
  id: string;
  question: string;
  choices: [string, string];
}

export const publicChecks = (moduleId: string, checks: ModuleCheck[]): PublicCheck[] =>
  checks.map((c, i) => ({ id: checkId(moduleId, i + 1), question: c.question, choices: c.choices }));

export interface CheckAnswer {
  module_id: string;
  check_id: string;
  choice: 1 | 2;
}

export type ParsedCheckAnswer = { ok: true; value: CheckAnswer } | { ok: false; field: string };

/** The POST body, validated by hand. The first bad field is named, in the order a reader would fix them. */
export function parseCheckAnswer(body: unknown): ParsedCheckAnswer {
  const b = (body ?? {}) as Record<string, unknown>;
  const moduleId = b.module_id;
  if (typeof moduleId !== 'string' || !CHECK_MODULE_ID_RE.test(moduleId)) return { ok: false, field: 'module_id' };
  const id = b.check_id;
  if (typeof id !== 'string' || !CHECK_ID_RE.test(id) || !id.startsWith(`${moduleId}-c`)) {
    return { ok: false, field: 'check_id' };
  }
  const choice = b.choice;
  if (choice !== 1 && choice !== 2) return { ok: false, field: 'choice' };
  return { ok: true, value: { module_id: moduleId, check_id: id, choice } };
}

/** The check a well-formed id names, or null when the module has no check with that number. */
export function findCheck(
  moduleId: string,
  checks: ModuleCheck[],
  id: string
): { index: number; check: ModuleCheck } | null {
  const index = checks.findIndex((_, i) => checkId(moduleId, i + 1) === id);
  return index === -1 ? null : { index, check: checks[index] };
}

export interface CheckVerdict {
  correct: boolean;
  explanation: string;
}

export const gradeCheck = (check: ModuleCheck, choice: 1 | 2): CheckVerdict => ({
  correct: check.answer === choice,
  explanation: check.explanation,
});
