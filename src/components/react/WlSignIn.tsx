import { useState } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { getCaptchaToken } from '../../lib/turnstile';

/**
 * Branded white-label sign-in, rendered on the CANONICAL host (the only host with
 * Turnstile + Supabase configured). On success it either:
 *   - hands the session to the page's custom domain via a one-time code (/wl-callback), or
 *   - (no custom domain) just returns to the page on this same origin, session already set.
 * The user never sees the main site chrome — this page is the bare white-label layout.
 */
export default function WlSignIn({
  customDomain,
  returnPath,
  orgLabel,
}: {
  /** The page's custom domain to hand the session to, or null for a same-origin return. */
  customDomain: string | null;
  /** Same-origin fallback path (the /a/<org>/<slug> page) when there's no custom domain. */
  returnPath: string;
  /** What to call the destination in copy (assistant/page title). */
  orgLabel: string;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password || busy) return;
    if (!isSupabaseConfigured) {
      setError('Sign-in is unavailable right now. Please try again later.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const captchaToken = await getCaptchaToken();
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
        options: { captchaToken },
      });
      if (authErr || !data.session) {
        setError('That email or password was not recognized.');
        setBusy(false);
        return;
      }

      if (!customDomain) {
        // The page lives on this same origin — the session is already here.
        window.location.replace(returnPath);
        return;
      }

      // Hand the session to the custom domain via a single-use code.
      const res = await fetch('/api/wl-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'issue',
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          domain: customDomain,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.code) {
        setError('Could not complete sign-in. Please try again.');
        setBusy(false);
        return;
      }
      // Deliberately do NOT sign out here: signOut (even scope:'local') revokes the
      // session server-side, which would kill the tokens we just handed off. The
      // background session left on the canonical host is harmless — the user is
      // redirected to their own domain and never sees the main site.
      const proto = window.location.protocol; // http locally, https in prod
      window.location.href = `${proto}//${customDomain}/wl-callback?t=${encodeURIComponent(body.code)}`;
    } catch {
      setError('Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto mt-6 max-w-sm space-y-3 text-left">
      <div>
        <label htmlFor="wl-email" className="mb-1 block text-sm font-semibold text-ink-800">
          Email
        </label>
        <input
          id="wl-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@yourcompany.com"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div>
        <label htmlFor="wl-password" className="mb-1 block text-sm font-semibold text-ink-800">
          Password
        </label>
        <input
          id="wl-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      {error && <p className="text-sm text-amber-700">{error}</p>}
      <button
        type="submit"
        disabled={busy || !email.trim() || !password}
        className="btn-primary w-full disabled:opacity-60"
      >
        {busy ? 'Signing in…' : `Sign in to ${orgLabel}`}
      </button>
      <p className="pt-1 text-center text-xs text-slate-400">
        Use the email your organization gave you.
      </p>
    </form>
  );
}
