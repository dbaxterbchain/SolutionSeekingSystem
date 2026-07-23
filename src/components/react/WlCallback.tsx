import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

/**
 * Runs on the CUSTOM domain at /wl-callback?code=…. Redeems the one-time code from
 * the branded sign-in for the session tokens, sets the session on THIS origin (so the
 * per-origin session now lives on the custom domain), and returns to the assistant.
 */
export default function WlCallback() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // NB: our param is `t`, not `code` — supabase-js (PKCE, detectSessionInUrl) hijacks
    // a `?code=` on load and would try to exchange it as its own auth code.
    const code = new URLSearchParams(window.location.search).get('t');
    if (!code) {
      setError('This sign-in link is missing its code. Please try signing in again.');
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/wl-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'exchange', code, domain: window.location.host }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.access_token || !body?.refresh_token) {
          setError('This sign-in link has expired or was already used. Please sign in again.');
          return;
        }
        const { error: setErr } = await supabase.auth.setSession({
          access_token: body.access_token,
          refresh_token: body.refresh_token,
        });
        if (setErr) {
          setError('Could not complete sign-in. Please try again.');
          return;
        }
        window.location.replace('/');
      } catch {
        setError('Could not complete sign-in. Please try again.');
      }
    })();
  }, []);

  return (
    <div className="mx-auto max-w-sm py-24 text-center">
      {error ? (
        <>
          <p className="text-sm text-amber-700">{error}</p>
          <a href="/" className="btn-secondary mt-4 inline-block">
            Back
          </a>
        </>
      ) : (
        <p className="text-sm text-slate-500">Signing you in…</p>
      )}
    </div>
  );
}
