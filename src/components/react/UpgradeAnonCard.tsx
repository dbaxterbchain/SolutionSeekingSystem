import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { accountLink } from '../../lib/accountLink';
import { markSignupStarted } from '../../lib/analytics';
import { FREE_MESSAGES_AFTER_SIGNUP } from '../../data/pricing';

/**
 * Shown when an anonymous visitor uses up their trial messages. This is the
 * single highest-leverage conversion moment on the site: they have already
 * received value and their conversation is on screen.
 *
 * "Continue with Google" links a Google identity to the SAME anonymous user, so
 * the conversation and the used-message count survive with no data migration
 * and no round trip through an inbox.
 */
export default function UpgradeAnonCard({ rateLimited = false }: { rateLimited?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const google = async () => {
    setBusy(true);
    setError(null);
    markSignupStarted('google', true);
    const { error: linkError } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: window.location.href },
    });
    if (!linkError) return; // Redirecting to Google.

    setBusy(false);
    // The Google account already belongs to a profile. Merging two users'
    // conversations is deliberately out of scope for v1, so be honest about it.
    if (linkError.message?.toLowerCase().includes('already')) {
      setError(
        'That Google account already has a profile here. Sign in with it and we can start a fresh conversation.'
      );
      return;
    }
    setError(linkError.message);
  };

  return (
    <div className="border-t border-slate-100 p-6 text-center">
      <h3 className="font-heading text-lg font-bold text-ink-800">
        Create a free account to keep going
      </h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate-600">
        {rateLimited
          ? "You've used the free trial available on this network today. An account gets you going again right away."
          : `Your conversation is saved. You get ${FREE_MESSAGES_AFTER_SIGNUP} more free messages, and you can come back to this anytime.`}
      </p>

      {error && (
        <p className="mx-auto mt-3 max-w-md rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={google}
          disabled={busy}
          className="btn-primary disabled:opacity-60"
        >
          {busy ? 'Opening Google…' : 'Continue with Google'}
        </button>
        <a
          href={accountLink({ mode: 'register' })}
          onClick={() => markSignupStarted('email', true)}
          className="btn-secondary"
        >
          Use email instead
        </a>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Free, and it keeps this conversation.
      </p>
    </div>
  );
}
