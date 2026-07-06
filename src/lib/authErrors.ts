import { isAuthApiError } from '@supabase/supabase-js';

/** Enforced inline in the forms AND in Supabase settings (hosted + config.toml). */
export const MIN_PASSWORD_LENGTH = 8;

const MESSAGES: Record<string, string> = {
  invalid_credentials:
    'That email and password don’t match. Try again, or tap “Forgot password?”.',
  email_not_confirmed:
    'Please confirm your email address first — check your inbox for the link.',
  user_already_exists: 'That email is already registered. Sign in instead, or reset your password.',
  email_exists: 'That email is already registered. Sign in instead, or reset your password.',
  over_email_send_rate_limit: 'We’ve emailed that address very recently. Wait a minute, then try again.',
  over_request_rate_limit: 'Too many attempts. Please wait a few minutes and try again.',
  weak_password: `Please choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
  same_password: 'Your new password needs to be different from your current one.',
  email_address_invalid: 'That doesn’t look like a valid email address.',
};

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
  return { code: null, message: msg };
}
