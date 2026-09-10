import { createHash } from 'node:crypto';

/**
 * sha256 over the ordered [prompt_id, text] pairs. The same rows give the
 * same hash whatever order they arrive in; a changed character changes it.
 * The submit action stores it and the worker recomputes it before grading,
 * so a row edited after submission is an integrity failure, never a grade.
 */
export function hashSubmission(rows: { prompt_id: string; text: string }[]): string {
  const ordered = [...rows]
    .sort((a, b) => (a.prompt_id < b.prompt_id ? -1 : a.prompt_id > b.prompt_id ? 1 : 0))
    .map((r) => [r.prompt_id, r.text]);
  return createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
}
