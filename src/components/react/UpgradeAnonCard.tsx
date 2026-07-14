import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { accountLink } from '../../lib/accountLink';
import { markSignupStarted } from '../../lib/analytics';
import { FREE_MESSAGES_AFTER_SIGNUP } from '../../data/pricing';
import SubscribeForm from './SubscribeForm';

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
  const [showEmail, setShowEmail] = useState(false);

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
    // That Google address already has an account of its own, so there is nothing
    // to link it to: they need to sign in. Their conversation is not lost, since
    // signing in now brings the trial's work with them (src/lib/trialClaim.ts).
    if (linkError.message?.toLowerCase().includes('already')) {
      setError(
        'That Google account is already registered here. Sign in with it and this conversation comes with you.'
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

      {/*
        The consolation prize, and deliberately the second-best option.

        Everyone who reaches this card has had three messages of a real
        conversation and hit a wall. Most of them will not make an account, and
        until now they left with nothing and we learned nothing. An email at least
        keeps the door open.

        Subordinate on purpose: an account is worth strictly more (it is a real
        user, it keeps their conversation, and it is the path to a subscription),
        so this sits below both buttons, behind a toggle, closed by default. It
        cannot cannibalise the primary conversion either way, because
        `first_message_sent` fired long before this card could render.
      */}
      <div className="mt-5 border-t border-slate-100 pt-4">
        {showEmail ? (
          <div className="mx-auto max-w-sm text-left">
            <p className="mb-2 text-xs font-semibold text-slate-600">
              We will send the complete guide, free.
            </p>
            <SubscribeForm source="chat_wall" cta="Send it" compact />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowEmail(true)}
            className="text-xs font-medium text-slate-500 underline hover:text-slate-700"
          >
            Not ready for an account? Get the guide by email instead.
          </button>
        )}
      </div>
    </div>
  );
}
