/**
 * Sign-in round-trip helpers: tools link to /account with a ?next= param, and
 * the account page sends the user back there once they're signed in.
 */

/** Link to /account that returns the user to the current page after sign-in. */
export function accountLink(): string {
  if (typeof window === 'undefined') return '/account';
  const here = window.location.pathname + window.location.search;
  return `/account?next=${encodeURIComponent(here)}`;
}

/** Validate a ?next= value: same-site paths only (guards open redirects). */
export function safeNext(value: string | null): string | null {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
}
