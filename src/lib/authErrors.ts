import { isAuthApiError } from '@supabase/supabase-js';

/** Enforced inline in the forms AND in Supabase settings (hosted + config.toml). */
export const MIN_PASSWORD_LENGTH = 8;

const MESSAGES: Record<string, string> = {
  invalid_credentials:
    'That email and password don’t match. Try again, or tap “Forgot password?”.',
  email_not_confirmed:
    'Please confirm your email address first. Check your inbox for the link.',
  user_already_exists: 'That email is already registered. Sign in instead, or reset your password.',
  email_exists: 'That email is already registered. Sign in instead, or reset your password.',
  // Returned when we try to attach a Google identity to a trial user, but that
  // Google address already has an account of its own. The honest answer is
  // "sign into the account you already have", so say that rather than the
  // generic line above, which reads as an error the user caused.
  identity_already_exists:
    'That Google account is already registered here. Sign in with it to continue.',
  over_email_send_rate_limit: 'We’ve emailed that address very recently. Wait a minute, then try again.',
  over_request_rate_limit: 'Too many attempts. Please wait a few minutes and try again.',
  weak_password: `Please choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
  same_password: 'Your new password needs to be different from your current one.',
  email_address_invalid: 'That doesn’t look like a valid email address.',
  captcha_failed: 'The captcha check didn’t pass. Please reload the page and try again.',
};

/**
 * Read an error handed back by an OAuth provider redirect, and strip it from the URL.
 *
 * These failures do not arrive as a thrown error: the provider bounces the
 * browser back to /account with the reason in the query string AND the hash, e.g.
 *
 *   /account?error=invalid_request&error_code=email_exists&...#error=...
 *
 * Nothing used to read either, so a failed Google sign-in dumped the user back on
 * an empty login form with no explanation and nothing in the console. Silent is
 * the worst possible way for auth to fail.
 *
 * The query string is the reliable source: supabase-js clears the hash on load
 * while it looks for a session there. We check both anyway.
 */
export function readOAuthRedirectError(): { code: string | null; message: string } | null {
  if (typeof window === 'undefined') return null;

  const fromSearch = new URLSearchParams(window.location.search);
  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const source = fromSearch.get('error') || fromSearch.get('error_code') ? fromSearch : fromHash;

  const code = source.get('error_code');
  const description = source.get('error_description');
  if (!code && !description && !source.get('error')) return null;

  // Leave the address bar clean, so a refresh does not replay the error.
  const url = new URL(window.location.href);
  for (const key of ['error', 'error_code', 'error_description', 'sb']) {
    url.searchParams.delete(key);
  }
  url.hash = '';
  window.history.replaceState(null, '', url);

  const fallback = description
    ? description.replace(/\+/g, ' ')
    : 'That sign-in did not complete. Please try again.';
  return { code, message: (code && MESSAGES[code]) || fallback };
}

/** Map a Supabase auth error to human copy; `code` lets callers react (e.g. offer resend). */
export function friendlyAuthError(err: unknown): { code: string | null; message: string } {
  if (isAuthApiError(err) && err.code) {
    return { code: err.code, message: MESSAGES[err.code] ?? err.message };
  }
  // Older GoTrue responses may omit `code` — fall back to message sniffing.
  const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
  if (/invalid login credentials/i.test(msg)) {
    return { code: 'invalid_credentials', message: MESSAGES.invalid_credentials };
  }
  if (/email not confirmed/i.test(msg)) {
    return { code: 'email_not_confirmed', message: MESSAGES.email_not_confirmed };
  }
  // Supabase phrases a rejected token as "captcha protection: request disallowed",
  // which tells a user nothing about what to do.
  if (/captcha/i.test(msg)) {
    return { code: 'captcha_failed', message: MESSAGES.captcha_failed };
  }
  return { code: null, message: msg };
}
