import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { safeNext } from '../../lib/accountLink';
import { ENTITLED_STATUSES } from '../../lib/subscription';
import { useEntitlement } from '../../lib/entitlement';
import { claimTrialWork, hasTrialStash } from '../../lib/trialClaim';
import { track, getGaIds, consumeSignupCompleted } from '../../lib/analytics';
import { getFirstTouch } from '../../lib/attribution';
import { FREE_ACCOUNT_MESSAGES, priceCopy } from '../../data/pricing';
import { usePasswordRecovery } from '../../lib/usePasswordRecovery';
import AuthPanel, { NewPasswordForm, RecoveryPanel } from './AuthPanel';

/**
 * The /account page island. Signed out → an email/password + Google auth panel.
 * Signed in → account settings: profile, password, and subscription/billing.
 * (Saved practice work lives at /saved; AI conversations live in the dashboard.)
 */
const checkoutSuccessParam = () =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('checkout') === 'success';

export default function AccountView() {
  const { session, user, loading } = useSession();
  const { recovering, linkExpired, finishRecovery } = usePasswordRecovery();

  /*
   * If they chatted anonymously and then signed in to an account they already
   * had, their trial conversation belongs to a different user and would simply
   * be gone. AuthPanel stashed the trial's JWT before handing the session over;
   * claim the work now that a real session exists.
   *
   * `claimDone` gates the ?next= redirect below. Without it, a sign-in that came
   * from the chat page would navigate away mid-request and cancel the claim,
   * which is a silent, unrecoverable loss of the thing they were working on.
   */
  const [claimDone, setClaimDone] = useState(!hasTrialStash());
  const [claimed, setClaimed] = useState(0);

  useEffect(() => {
    if (loading) return;
    if (!session || !user || user.is_anonymous) {
      setClaimDone(true);
      return;
    }
    let active = true;
    claimTrialWork(session.access_token, user.id).then((n) => {
      if (!active) return;
      setClaimed(n);
      setClaimDone(true);
    });
    return () => {
      active = false;
    };
  }, [loading, session?.access_token, user?.id]);

  // Tools link here with ?next=<path> — once signed in, send the user back.
  const next =
    typeof window !== 'undefined'
      ? safeNext(new URLSearchParams(window.location.search).get('next'))
      : null;

  // Returning from Stripe Checkout, the persisted session can take a moment
  // to rehydrate — hold a neutral screen instead of flashing the sign-in
  // form, with a grace window before giving up.
  const [fromCheckout] = useState(checkoutSuccessParam);
  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => {
    if (!fromCheckout) return;
    const t = window.setTimeout(() => setGraceOver(true), 6000);
    return () => window.clearTimeout(t);
  }, [fromCheckout]);

  // A session appearing here is where a signup lands, whether it came back from
  // Google or from an email confirmation link in a fresh tab.
  useEffect(() => {
    if (user) consumeSignupCompleted();
  }, [user]);

  useEffect(() => {
    // A recovery session is a signed-in user — don't bounce away before the
    // set-new-password form has been shown. An anonymous user carries a session
    // too, but bouncing them back would skip the registration they came for.
    // And never navigate away while a trial claim is still in flight.
    if (user && !user.is_anonymous && next && !recovering && claimDone) {
      window.location.replace(next);
    }
  }, [user, next, recovering, claimDone]);

  if (user && recovering) {
    return <RecoveryPanel onDone={finishRecovery} />;
  }

  // Only a real account gets bounced back; an anonymous user still has to
  // register, so they fall through to the auth panel below.
  if (user && !user.is_anonymous && next) {
    return <div className="text-sm text-slate-400">Taking you back…</div>;
  }

  if (fromCheckout && !user && (loading || !graceOver)) {
    return (
      <div className="mx-auto max-w-md rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-card">
        <p className="text-3xl" aria-hidden="true">✨</p>
        <h1 className="mt-3 font-heading text-xl font-bold text-ink-800">
          Finalizing your subscription…
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Thanks for subscribing! One moment while we confirm your payment.
        </p>
      </div>
    );
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        Accounts aren’t configured yet. Set <code>PUBLIC_SUPABASE_URL</code> and{' '}
        <code>PUBLIC_SUPABASE_ANON_KEY</code> to enable sign-in.
      </div>
    );
  }

  if (loading) {
    return <div className="text-sm text-slate-400">Loading…</div>;
  }

  // An anonymous trial user has a session but not an account: they came here to
  // create one, so show the auth panel (which converts them in place) rather
  // than account settings they don't have.
  return user && !user.is_anonymous ? (
    <>
      {claimed > 0 && (
        <p className="mb-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm leading-relaxed text-emerald-800">
          We moved {claimed === 1 ? 'the conversation' : `the ${claimed} conversations`} from your
          trial into this account.
        </p>
      )}
      <Library email={user.email ?? ''} />
    </>
  ) : (
    <AuthPanel linkExpired={linkExpired} />
  );
}

/* ------------------------------------------------------------------ */
/* Account settings (signed in)                                       */
/* ------------------------------------------------------------------ */

function Library({ email }: { email: string }) {
  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Signed in as <span className="font-semibold text-ink-800">{email}</span>
        </p>
        <button type="button" onClick={signOut} className="btn-ghost text-slate-500 hover:text-red-600">
          Sign out
        </button>
      </div>

      <ProfileSection />

      <ChangePasswordSection />

      <SubscriptionSection />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Profile (signed in)                                                */
/* ------------------------------------------------------------------ */

function ProfileSection() {
  const { user } = useSession();
  // The display name lives in Supabase user_metadata. That is fine here: it is
  // cosmetic and never used for an authorization decision (see CLAUDE.md).
  const [name, setName] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const current = (user?.user_metadata?.display_name as string | undefined) ?? '';
    setName(current);
    setSaved(current);
  }, [user?.id]);

  const dirty = name.trim() !== saved;

  const save = async () => {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const { error: err } = await supabase.auth.updateUser({ data: { display_name: name.trim() } });
      if (err) throw err;
      setSaved(name.trim());
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-8 rounded-3xl border border-slate-100 bg-white p-6 shadow-card">
      <h2 className="font-heading text-lg font-bold text-ink-800">Profile</h2>
      <div className="mt-4 max-w-md space-y-4">
        <div>
          <label htmlFor="profile-name" className="mb-1.5 block text-sm font-semibold text-ink-800">
            Display name
          </label>
          <input
            id="profile-name"
            type="text"
            value={name}
            maxLength={80}
            onChange={(e) => {
              setName(e.target.value);
              setDone(false);
            }}
            placeholder="Your name"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <p className="mb-1.5 block text-sm font-semibold text-ink-800">Email</p>
          <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-sm text-slate-500">
            {user?.email ?? ''}
          </p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {done && <p className="text-sm text-brand-700">Profile saved.</p>}
        <button type="button" onClick={save} disabled={busy || !dirty} className="btn-secondary disabled:opacity-60">
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Change password (signed in)                                        */
/* ------------------------------------------------------------------ */

function ChangePasswordSection() {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  // Google-only accounts have no password; updateUser would silently SET one.
  const hasEmailIdentity = user?.identities?.some((i) => i.provider === 'email');
  if (!hasEmailIdentity) return null;

  return (
    <section className="mt-8 rounded-3xl border border-slate-100 bg-white p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold text-ink-800">Password</h2>
          {done && !open && <p className="mt-1 text-sm text-brand-700">Password updated.</p>}
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen((o) => !o);
            setDone(false);
          }}
          className="btn-secondary"
        >
          {open ? 'Cancel' : 'Change password'}
        </button>
      </div>
      {open && (
        <div className="mt-5 max-w-md">
          <NewPasswordForm
            submitLabel="Update password"
            onSuccess={() => {
              setOpen(false);
              setDone(true);
            }}
          />
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Subscription (signed in)                                           */
/* ------------------------------------------------------------------ */

const FREE_LIMIT = FREE_ACCOUNT_MESSAGES;

interface SubRow {
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
}

function SubscriptionSection() {
  const { session } = useSession();
  // The subscriptions row stays a direct read: the billing panel genuinely needs
  // cancel_at_period_end and current_period_end, which only a personal Stripe
  // subscription has. Entitlement itself comes from the server, because it can
  // also come from an organization.
  const { entitlement } = useEntitlement();
  const [sub, setSub] = useState<SubRow | null>(null);
  const [freeUsed, setFreeUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState(checkoutSuccessParam);
  const [celebrate, setCelebrate] = useState(false);
  const [activationSlow, setActivationSlow] = useState(false);

  const load = async () => {
    const [{ data: subRow }, { data: usage }] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('status, cancel_at_period_end, current_period_end')
        .maybeSingle(),
      supabase.from('ai_usage').select('free_messages_used').maybeSingle(),
    ]);
    setSub((subRow as SubRow) ?? null);
    setFreeUsed(usage?.free_messages_used ?? 0);
    setLoading(false);
    return subRow ? ENTITLED_STATUSES.includes((subRow as SubRow).status) : false;
  };

  const clearCheckoutParam = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('checkout');
    window.history.replaceState(null, '', url);
  };

  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const fromCheckout = checkoutSuccessParam();
    // A funnel step, NOT the conversion: `subscription_completed` is sent
    // server-side from the Stripe webhook, which never misses a payment.
    if (fromCheckout) track({ event: 'checkout_success_viewed' });
    const poll = async () => {
      const entitled = await load();
      if (cancelled) return;
      if (!fromCheckout) return;
      if (entitled) {
        // Confirmed — celebrate, and clean the URL so a refresh doesn't
        // re-trigger the activation flow.
        setActivating(false);
        setCelebrate(true);
        clearCheckoutParam();
      } else if (tries < 12) {
        // The Stripe webhook usually lands within a second or two.
        tries += 1;
        window.setTimeout(poll, 1500);
      } else {
        setActivating(false);
        setActivationSlow(true);
        clearCheckoutParam();
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const post = async (path: string) => {
    if (!session) return;
    setBusy(true);
    setError(null);
    const isCheckout = path === '/api/checkout';
    if (isCheckout) {
      track({
        event: 'checkout_started',
        plan: 'monthly',
        cta_location: 'account_subscription',
        value: 5,
        currency: 'USD',
      });
    }
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        // Attribution ids for the server-side conversion, and where to return
        // the user if they abandon checkout.
        body: isCheckout
          ? JSON.stringify({
              plan: 'monthly',
              ga: getGaIds(),
              attribution: getFirstTouch() ?? undefined,
              returnPath: '/account',
            })
          : undefined,
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error('Something went wrong. Please try again.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  const entitled = sub ? ENTITLED_STATUSES.includes(sub.status) : false;

  // Someone whose organization pays for them has NO subscriptions row, so the
  // read above tells us nothing about them. They get access, but no billing
  // controls: they are not the customer, their organization is.
  const viaOrg = !entitled && entitlement?.kind === 'subscriber' && entitlement.via === 'org';
  const orgName = entitlement?.kind === 'subscriber' ? entitlement.orgName : undefined;

  const formatDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : '';

  return (
    <section className="mt-8 rounded-3xl border border-slate-100 bg-white p-6 shadow-card">
      {celebrate && (
        <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm leading-relaxed text-emerald-800">
          🎉 <strong>You're subscribed!</strong> Unlimited conversations with the Guide and
          Mentor are unlocked. Stripe will email your receipt.
        </p>
      )}
      {activationSlow && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
          Payment received. Your subscription is taking a moment to activate. It will
          appear here shortly; try refreshing in a minute.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold text-ink-800">AI assistants</h2>
          {loading || activating ? (
            <p className="mt-1 text-sm text-slate-500">
              {activating ? 'Activating your subscription…' : 'Loading…'}
            </p>
          ) : entitled ? (
            <p className="mt-1 text-sm text-slate-600">
              <span className="mr-2 inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                Subscriber
              </span>
              {sub?.cancel_at_period_end
                ? `Ends ${formatDate(sub.current_period_end)}`
                : sub?.current_period_end
                  ? `Renews ${formatDate(sub.current_period_end)}`
                  : 'Unlimited conversations with the Guide and Mentor.'}
            </p>
          ) : viaOrg ? (
            <p className="mt-1 text-sm text-slate-600">
              <span className="mr-2 inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                Team access
              </span>
              {orgName
                ? `${orgName} covers your access, so there is nothing to pay and nothing to manage here.`
                : 'Your organization covers your access, so there is nothing to pay and nothing to manage here.'}
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-600">
              Free plan: {Math.min(freeUsed, FREE_LIMIT)} of {FREE_LIMIT} free messages used.
            </p>
          )}
        </div>
        {/* No billing controls for an org member: they are not the customer. */}
        {!loading &&
          !viaOrg &&
          (entitled ? (
            <button
              type="button"
              onClick={() => post('/api/billing-portal')}
              disabled={busy}
              className="btn-secondary disabled:opacity-60"
            >
              {busy ? 'Opening…' : 'Manage subscription'}
            </button>
          ) : (
            !activating && (
              <>
                <button
                  type="button"
                  onClick={() => post('/api/checkout')}
                  disabled={busy}
                  className="btn-primary disabled:opacity-60"
                >
                  {busy ? 'Opening checkout…' : priceCopy.subscribeCta}
                </button>
                <a href="/pricing" className="btn-ghost text-sm">
                  See all plans
                </a>
              </>
            )
          ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        {!loading && (
          <span className="mr-1 text-sm text-slate-600">
            {entitled
              ? 'Unlimited conversations, anytime:'
              : `Try them free. Your first ${FREE_ACCOUNT_MESSAGES} messages are on us:`}
          </span>
        )}
        <a
          href="/practice/guide"
          className="rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100"
        >
          🧭 Talk to the Guide
        </a>
        <a
          href="/practice/mentor"
          className="rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100"
        >
          🎓 Ask the Mentor
        </a>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}
