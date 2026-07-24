import { useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { usePasswordRecovery } from '../../lib/usePasswordRecovery';
import { friendlyAuthError, readOAuthRedirectError, MIN_PASSWORD_LENGTH } from '../../lib/authErrors';
import { PasswordInput, PasswordChecklist } from './PasswordInput';
import { NewPasswordForm } from './AuthPanel';
import { getCaptchaToken, prewarmCaptcha } from '../../lib/turnstile';

/**
 * Branded white-label auth, rendered on the CANONICAL host (the only host with
 * Turnstile + Supabase configured). It offers the same methods as the main site
 * (Google, email+password, register, forgot password, recovery) minus the
 * anonymous-trial machinery, all wearing the org's branding, never the site chrome.
 *
 * One rule ties it together: the moment a real session exists here, however it was
 * obtained, it is handed to the page's custom domain via a single-use code
 * (/wl-callback), or, for a same-origin page, we just return to it. Google and the
 * password-reset link therefore "just work": both round-trip back to this page on
 * solutionseeking.com (the only Supabase redirect host), and the session that lands
 * is what gets handed off.
 */

type Mode = 'signin' | 'register' | 'verify';

const ALREADY_REGISTERED = ['email_exists', 'user_already_exists', 'identity_already_exists'];
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100';

export default function WlSignIn({
  customDomain,
  returnPath,
  orgLabel,
  pageId,
}: {
  /** The page's custom domain to hand the session to, or null for a same-origin return. */
  customDomain: string | null;
  /** Same-origin fallback path (the /a/<org>/<slug> page) when there's no custom domain. */
  returnPath: string;
  /** What to call the destination in copy (assistant/page title). */
  orgLabel: string;
  /** This page's id, so Google/reset links round-trip back to /wl/signin?page=<id>. */
  pageId: string;
}) {
  const { session } = useSession();
  const { recovering, linkExpired, finishRecovery } = usePasswordRecovery();
  const [oauthError] = useState(() => readOAuthRedirectError());
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    linkExpired ? 'That link has expired or was already used. Request a new one below.' : null
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [handing, setHanding] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);
  const handed = useRef(false);

  // Solve a captcha token ahead of time so the first click (sign in, forgot password,
  // register) isn't stuck behind a cold Turnstile load with no visible feedback.
  useEffect(() => {
    prewarmCaptcha();
  }, []);

  const brandedRedirect =
    typeof window !== 'undefined'
      ? `${window.location.origin}/wl/signin?page=${encodeURIComponent(pageId)}`
      : undefined;

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  // The single hand-off path: any real session (password, Google return, a completed
  // reset, or an already-signed-in canonical session) gets sent on to the custom domain.
  useEffect(() => {
    if (!session || recovering || handed.current || mode === 'verify') return;
    handed.current = true;
    setHanding(true);
    void proceed(session.access_token, session.refresh_token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, recovering, mode]);

  async function proceed(accessToken: string, refreshToken: string) {
    try {
      if (!customDomain) {
        // The page lives on this same origin; the session is already here.
        window.location.replace(returnPath);
        return;
      }
      const res = await fetch('/api/wl-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'issue',
          access_token: accessToken,
          refresh_token: refreshToken,
          domain: customDomain,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.code) throw new Error('issue failed');
      // Deliberately do NOT sign out here: signOut (even scope:'local') revokes the
      // session server-side, which would kill the tokens we just handed off. The
      // background session on the canonical host is harmless.
      const proto = window.location.protocol;
      window.location.href = `${proto}//${customDomain}/wl-callback?t=${encodeURIComponent(body.code)}`;
    } catch {
      handed.current = false;
      setHanding(false);
      setError('Could not complete sign-in. Please try again.');
    }
  }

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const google = async () => {
    setError(null);
    if (!isSupabaseConfigured) {
      setError('Sign-in is unavailable right now. Please try again later.');
      return;
    }
    // No captcha on OAuth. The redirect returns here (a Supabase-allowed host), and the
    // hand-off effect above sends the resulting session on to the custom domain.
    const { error: authErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: brandedRedirect },
    });
    if (authErr) setError(friendlyAuthError(authErr).message);
  };

  const forgot = async () => {
    if (forgotBusy) return; // ignore repeat clicks while a request is in flight
    if (!email.trim()) {
      setError('Enter your email above first, then tap Forgot password.');
      return;
    }
    setError(null);
    setNotice(null);
    setForgotBusy(true); // immediate feedback: the button reads "Sending…" and disables
    let captchaToken: string | undefined;
    try {
      captchaToken = await getCaptchaToken();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The captcha failed. Please try again.');
      setForgotBusy(false);
      return;
    }
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: brandedRedirect,
      captchaToken,
    });
    setForgotBusy(false);
    if (resetErr) setError(friendlyAuthError(resetErr).message);
    else setNotice(`If ${email.trim()} has an account, a reset link is on its way. Check your inbox, including spam.`);
  };

  const resend = async () => {
    setError(null);
    setNotice(null);
    let captchaToken: string | undefined;
    try {
      captchaToken = await getCaptchaToken();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The captcha failed. Please try again.');
      return;
    }
    const { error: resendErr } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: brandedRedirect, captchaToken },
    });
    if (resendErr) setError(friendlyAuthError(resendErr).message);
    else {
      setNotice(`Confirmation email re-sent to ${email}.`);
      setCooldown(60);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email.trim() || !password || busy) return;
    if (!isSupabaseConfigured) {
      setError('Sign-in is unavailable right now. Please try again later.');
      return;
    }
    if (mode === 'register') {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(`Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
        return;
      }
      if (password !== confirm) {
        setError('Passwords do not match. Double-check both fields.');
        return;
      }
    }
    setBusy(true);
    try {
      const captchaToken = await getCaptchaToken();
      if (mode === 'register') {
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: brandedRedirect, captchaToken },
        });
        if (signUpErr) throw signUpErr;
        // With confirmations on, an already-confirmed email returns an empty identities array.
        if (data.user && data.user.identities?.length === 0) {
          setMode('signin');
          setError('That email is already registered. Sign in, or use Forgot password.');
          setBusy(false);
          return;
        }
        if (!data.session) {
          setMode('verify');
          setCooldown(60);
          setBusy(false);
          return;
        }
        // A session came back (confirmations off): the hand-off effect takes over.
      } else {
        const { data, error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
          options: { captchaToken },
        });
        if (signInErr || !data.session) {
          setError('That email or password was not recognized.');
          setBusy(false);
          return;
        }
        // Session is set: the hand-off effect takes over (leave busy on for the spinner).
      }
    } catch (err) {
      const friendly = friendlyAuthError(err);
      if (friendly.code === 'email_not_confirmed') {
        setMode('verify');
        setNotice('This account has not been confirmed yet.');
      }
      setError(friendly.message);
      setBusy(false);
    }
  };

  if (handing) {
    return <p className="mx-auto mt-10 max-w-sm text-center text-sm text-slate-500">Signing you in…</p>;
  }

  if (recovering) {
    return (
      <div className="mx-auto mt-6 max-w-sm text-left">
        <p className="mb-3 text-sm text-slate-600">Choose a new password to finish signing in.</p>
        <NewPasswordForm submitLabel="Save & continue" onSuccess={finishRecovery} />
      </div>
    );
  }

  if (mode === 'verify') {
    return (
      <div className="mx-auto mt-8 max-w-sm text-center">
        <p className="text-3xl" aria-hidden="true">📬</p>
        <h2 className="mt-3 font-heading text-lg font-bold text-ink-800">Check your inbox</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          We sent a confirmation link to <strong className="text-ink-800">{email}</strong>. Click it and
          you'll land right back here, signed in.
        </p>
        {notice && <p className="mt-3 text-sm text-brand-700">{notice}</p>}
        {error && <p className="mt-3 text-sm text-amber-700">{error}</p>}
        <button type="button" onClick={resend} disabled={cooldown > 0} className="btn-secondary mt-5 disabled:opacity-50">
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
    <div className="mx-auto mt-6 max-w-sm text-left">
      {oauthError && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm leading-relaxed text-amber-800">
          {ALREADY_REGISTERED.includes(oauthError.code ?? '')
            ? 'You already have an account with that Google address. Press Continue with Google again to sign in to it.'
            : oauthError.message}
        </p>
      )}

      <button type="button" onClick={google} className="btn-secondary w-full">
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

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="wl-email" className="mb-1 block text-sm font-semibold text-ink-800">
            Email
          </label>
          <input
            id="wl-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@yourcompany.com"
            className={inputClass}
          />
        </div>

        {mode === 'signin' ? (
          <PasswordInput id="wl-password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
        ) : (
          <>
            <PasswordInput id="wl-password" label="Password" value={password} onChange={setPassword} autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} />
            <PasswordInput id="wl-confirm" label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} />
            <PasswordChecklist password={password} confirm={confirm} />
          </>
        )}

        {error && <p className="text-sm text-amber-700">{error}</p>}
        {notice && <p className="rounded-xl bg-brand-50 px-4 py-2.5 text-sm text-brand-700">{notice}</p>}

        <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-60">
          {busy ? 'Working…' : mode === 'signin' ? `Sign in to ${orgLabel}` : 'Create account'}
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
          <button
            type="button"
            onClick={forgot}
            disabled={forgotBusy}
            className="text-slate-500 hover:text-ink-800 disabled:opacity-50"
          >
            {forgotBusy ? 'Sending…' : 'Forgot password?'}
          </button>
        )}
      </div>

      <p className="pt-4 text-center text-xs text-slate-400">Use the email your organization gave you.</p>
    </div>
  );
}
