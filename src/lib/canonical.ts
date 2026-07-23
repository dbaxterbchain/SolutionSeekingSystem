/**
 * The canonical origin where all Turnstile-gated / Supabase-redirect auth happens.
 * It is the ONLY host that needs to be in the Turnstile hostname list and the Supabase
 * redirect allowlist, no matter how many white-label custom domains exist. A custom
 * domain sends users here to sign in, then receives the session back via a one-time code.
 *
 * Overridable for local two-origin testing (set PUBLIC_CANONICAL_ORIGIN=http://localhost:4321).
 */
export const CANONICAL_ORIGIN =
  (import.meta.env.PUBLIC_CANONICAL_ORIGIN as string | undefined)?.replace(/\/$/, '') ||
  'https://solutionseeking.com';
