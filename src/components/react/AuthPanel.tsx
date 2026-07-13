import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { friendlyAuthError, MIN_PASSWORD_LENGTH } from '../../lib/authErrors';
import { PasswordInput, PasswordChecklist } from './PasswordInput';
import { markSignupStarted } from '../../lib/analytics';
import { FREE_MESSAGES_AFTER_SIGNUP } from '../../data/pricing';

/**
 * Signed-out auth panel for /account: sign in, register (with confirmation
 * email), and the awaiting-verification state. Also exports NewPasswordForm
 * (shared with the change-password card) and RecoveryPanel (shown after a
 * password-reset link is opened).
 */

type Mode = 'signin' | 'register' | 'verify';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100';

export default function AuthPanel({ linkExpired = false }: { linkExpired?: boolean }) {
  const { user } = useSession();
  // An anonymous trial user reaching this panel is converting, not registering
  // fresh: we upgrade their existing account so the conversation survives.
  const isAnon = user?.is_anonymous === true;

  // CTAs that mean "join" (the anonymous upgrade card, the paywall) link here
  // with ?mode=register, so the panel doesn't open on Sign in and cost a click.
  const [mode, setMode] = useState<Mode>(() =>
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('mode') === 'register'
      ? 'register'
      : 'signin'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    linkExpired ? 'That link has expired or was already used. Request a new one below.' : null
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  // Preserves ?next= so OAuth and email links land back here and the
  // post-sign-in redirect can complete the round trip.
  const redirectTo =
    typeof window !== 'undefined'
      ? `${window.location.origin}/account${window.location.search}`
      : undefined;

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (mode === 'register') {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(`Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
        return;
      }
      if (password !== confirm) {
        setError('Passwords don’t match. Double-check both fields.');
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'register' && isAnon) {
        // Convert the anonymous user in place. Same auth.users row, same id, so
        // their conversation, history, and free-message count all carry over.
        // Creating a new account here instead would silently orphan all of it.
        markSignupStarted('email', true);
        const { error } = await supabase.auth.updateUser(
          { email, password },
          { emailRedirectTo: redirectTo }
        );
        if (error) throw error;
        // The address still has to be confirmed; until they click the link the
        // user stays anonymous, which is why the copy promises their work is safe.
        setMode('verify');
        setCooldown(60);
      } else if (mode === 'register') {
        markSignupStarted('email');
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        // With confirmations on, registering an already-confirmed email
        // returns an obfuscated user with an empty identities array.
        if (data.user && data.user.identities?.length === 0) {
          setMode('signin');
          setError('That email is already registered. Sign in, or use “Forgot password?”.');
          return;
        }
        if (!data.session) {
          // Confirmation email sent — start the resend cooldown accordingly.
          setMode('verify');
          setCooldown(60);
        }
        // With confirmations off (e.g. local default), onAuthStateChange
        // re-renders the island into the Library.
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      const friendly = friendlyAuthError(err);
      if (friendly.code === 'email_not_confirmed') {
        setMode('verify');
        setNotice('This account hasn’t been confirmed yet.');
      }
      setError(friendly.message);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    setNotice(null);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) {
      setError(friendlyAuthError(error).message);
    } else {
      setNotice(`Confirmation email re-sent to ${email}.`);
      setCooldown(60);
    }
  };

  const google = async () => {
    setError(null);
    // Google is both sign-in and sign-up; the flag is only consumed if a
    // session appears, and a returning user's sign-in is harmless to mark.
    if (mode === 'register') markSignupStarted('google', isAnon);

    // Converting an anonymous user: link the Google identity to the existing
    // account rather than signing into a different one, or their conversation
    // is orphaned.
    if (isAnon) {
      const { error } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: { redirectTo },
      });
      if (!error) return;
      if (error.message?.toLowerCase().includes('already')) {
        setError(
          'That Google account already has a profile here. Sign in with it to continue (this trial conversation will not carry over).'
        );
        return;
      }
      setError(error.message);
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) setError(error.message);
  };

  const forgot = async () => {
    if (!email) {
      setError('Enter your email above first, then tap “Forgot password”.');
      return;
    }
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) setError(friendlyAuthError(error).message);
    else setNotice('If that email has an account, a reset link is on its way.');
  };

  if (mode === 'verify') {
    return (
      <div className="mx-auto max-w-md rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-card">
        <p className="text-3xl" aria-hidden="true">📬</p>
        <h1 className="mt-3 font-heading text-xl font-bold text-ink-800">Check your inbox</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          We sent a confirmation link to <strong className="text-ink-800">{email}</strong>.
          Click it to activate your account, and you’ll land right back here, signed in.
          {isAnon && ' Your conversation is saved and waiting.'}
        </p>
        {notice && <p className="mt-3 text-sm text-brand-700">{notice}</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          type="button"
          onClick={resend}
          disabled={cooldown > 0}
          className="btn-secondary mt-5 disabled:opacity-50"
        >
          {cooldown > 0 ? `Resend email (${cooldown}s)` : 'Resend email'}
        </button>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-slate-100 bg-white p-6 shadow-card sm:p-8">
      <h1 className="font-heading text-2xl font-bold text-ink-800">
        {mode === 'signin' ? 'Sign in' : isAnon ? 'Save your conversation' : 'Create your account'}
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        {mode === 'signin'
          ? 'Sign in to save your work and talk to the AI assistants.'
          : isAnon
            ? `Create a free account and your conversation comes with you, plus ${FREE_MESSAGES_AFTER_SIGNUP} more free messages.`
            : 'Register to save and revisit your work. It’s free.'}
      </p>

      <button type="button" onClick={google} className="btn-secondary mt-6 w-full">
        <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
          <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
        </svg>
        Continue with Google
      </button>

      <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-100" />
        or
        <span className="h-px flex-1 bg-slate-100" />
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-ink-800">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>

        {mode === 'signin' ? (
          <PasswordInput
            id="password"
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />
        ) : (
          <>
            <PasswordInput
              id="password"
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
            />
            <PasswordInput
              id="confirm-password"
              label="Confirm password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
            />
            <PasswordChecklist password={password} confirm={confirm} />
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="text-sm text-brand-700">{notice}</p>}

        <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-50">
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <div className="mt-5 flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => switchMode(mode === 'signin' ? 'register' : 'signin')}
          className="font-medium text-brand-600 hover:text-brand-700"
        >
          {mode === 'signin' ? 'Create an account' : 'I already have an account'}
        </button>
        {mode === 'signin' && (
          <button type="button" onClick={forgot} className="text-slate-500 hover:text-ink-800">
            Forgot password?
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* New-password form (recovery + change-password card)                */
/* ------------------------------------------------------------------ */

export function NewPasswordForm({
  submitLabel,
  onSuccess,
}: {
  submitLabel: string;
  onSuccess: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords don’t match. Double-check both fields.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      onSuccess();
    } catch (err) {
      setError(friendlyAuthError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <PasswordInput
        id="new-password"
        label="New password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
      />
      <PasswordInput
        id="confirm-new-password"
        label="Confirm new password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
      />
      <PasswordChecklist password={password} confirm={confirm} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">
        {busy ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Recovery panel (after a password-reset link is opened)             */
/* ------------------------------------------------------------------ */

export function RecoveryPanel({ onDone }: { onDone: () => void }) {
  const { user } = useSession();
  const [saved, setSaved] = useState(false);

  if (saved) {
    return (
      <div className="mx-auto max-w-md rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-card">
        <p className="text-3xl" aria-hidden="true">✅</p>
        <h1 className="mt-3 font-heading text-xl font-bold text-ink-800">Password updated</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          You’re signed in with your new password.
        </p>
        <button type="button" onClick={onDone} className="btn-primary mt-5">
          Continue to your account
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-slate-100 bg-white p-6 shadow-card sm:p-8">
      <h1 className="font-heading text-2xl font-bold text-ink-800">Set a new password</h1>
      <p className="mt-2 text-sm text-slate-600">
        You followed a reset link for{' '}
        <strong className="text-ink-800">{user?.email ?? 'your account'}</strong>. Choose a new
        password to finish.
      </p>
      <div className="mt-6">
        <NewPasswordForm submitLabel="Save new password" onSuccess={() => setSaved(true)} />
      </div>
    </div>
  );
}
