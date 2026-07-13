/**
 * Sign-in round-trip helpers: tools link to /account with a ?next= param, and
 * the account page sends the user back there once they're signed in.
 */

interface AccountLinkOptions {
  /** Open the panel on Register rather than Sign in (for CTAs that mean "join"). */
  mode?: 'register';
  /** Where to return after auth. Defaults to the current page. */
  next?: string;
}

/** Link to /account that returns the user to the current page after sign-in. */
export function accountLink(options: AccountLinkOptions = {}): string {
  if (typeof window === 'undefined') return '/account';
  const next = options.next ?? window.location.pathname + window.location.search;
  const params = new URLSearchParams({ next });
  if (options.mode) params.set('mode', options.mode);
  return `/account?${params.toString()}`;
}

/** Validate a ?next= value: same-site paths only (guards open redirects). */
export function safeNext(value: string | null): string | null {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
}
