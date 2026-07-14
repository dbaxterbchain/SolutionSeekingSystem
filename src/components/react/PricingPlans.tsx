import { useState } from 'react';
import { useSession } from '../../lib/useSession';
import { accountLink } from '../../lib/accountLink';
import { useEntitlement } from '../../lib/entitlement';
import { track, getGaIds } from '../../lib/analytics';
import { getFirstTouch } from '../../lib/attribution';
import { SELF_SERVE_PLANS, PLANS, type PlanId } from '../../data/pricing';

/**
 * The buy buttons on /pricing. An island (rather than static links) because
 * checkout needs the session, and because `checkout_started` has to fire with
 * the plan the user actually chose.
 *
 * Entitlement comes from the server, not from a `subscriptions` read here. That
 * matters most for the person whose employer already pays: they have no
 * subscription row of their own, and selling them a second, personal one would
 * be a refund request with extra steps.
 */
export default function PricingPlans() {
  const { session, user } = useSession();
  const { entitlement } = useEntitlement();
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justSubscribed, setJustSubscribed] = useState(false);

  const viaOrg = entitlement?.kind === 'subscriber' && entitlement.via === 'org';
  const subscribed = justSubscribed || entitlement?.kind === 'subscriber';

  const choose = async (plan: PlanId) => {
    const chosen = PLANS[plan];
    track({
      event: 'checkout_started',
      plan,
      cta_location: plan === 'annual' ? 'pricing_annual' : 'pricing_monthly',
      value: Number(chosen.priceAmount),
      currency: 'USD',
    });

    // An anonymous trial user has no email, so Stripe can't bill them: send them
    // to register first, then straight back here.
    if (!session || user?.is_anonymous) {
      window.location.href = accountLink({ mode: 'register', next: '/pricing' });
      return;
    }

    setBusy(plan);
    setError(null);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          plan,
          ga: getGaIds(),
          attribution: getFirstTouch() ?? undefined,
          returnPath: '/pricing',
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }
      if (res.status === 409) {
        setJustSubscribed(true);
        return;
      }
      throw new Error('Could not start checkout. Please try again.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="grid gap-6 md:grid-cols-2">
        {SELF_SERVE_PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`flex flex-col rounded-2xl border bg-white p-7 shadow-card ${
              plan.id === 'annual' ? 'border-brand-200 ring-1 ring-brand-100' : 'border-slate-100'
            }`}
          >
            <div className="flex items-center gap-2">
              <h3 className="font-heading text-xl font-bold text-ink-800">{plan.name}</h3>
              {plan.note && (
                <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                  {plan.note}
                </span>
              )}
            </div>

            <p className="mt-4 flex items-baseline gap-1.5">
              <span className="font-heading text-4xl font-extrabold text-ink-800">
                {plan.priceLabel}
              </span>
              <span className="text-sm text-slate-500">{plan.cadence}</span>
            </p>

            <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-700">
              {plan.features.map((f) => (
                <li key={f} className="relative pl-5">
                  <span className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {f}
                </li>
              ))}
            </ul>

            {/* No buy button for someone whose organization already pays: a second,
                personal subscription would be a refund request with extra steps. */}
            {viaOrg ? (
              <p className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-700">
                Already covered by your organization
              </p>
            ) : subscribed ? (
              <a href="/account" className="btn-secondary mt-6 text-center">
                Manage your subscription
              </a>
            ) : (
              <button
                type="button"
                onClick={() => choose(plan.id)}
                disabled={busy !== null}
                className="btn-primary mt-6 disabled:opacity-60"
              >
                {busy === plan.id ? 'Opening checkout…' : `Choose ${plan.name}`}
              </button>
            )}
          </div>
        ))}
      </div>

      {viaOrg ? (
        <p className="mt-4 text-sm text-emerald-700">
          {entitlement?.kind === 'subscriber' && entitlement.orgName
            ? `${entitlement.orgName} already pays for your access, so there is nothing for you to buy.`
            : 'Your organization already pays for your access, so there is nothing for you to buy.'}
        </p>
      ) : (
        subscribed && (
          <p className="mt-4 text-sm text-emerald-700">You're already subscribed. Thank you.</p>
        )
      )}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </div>
  );
}
