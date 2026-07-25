import { useState } from 'react';
import { useSession } from '../../lib/useSession';
import { accountLink } from '../../lib/accountLink';
import { track, getGaIds } from '../../lib/analytics';
import { getFirstTouch } from '../../lib/attribution';
import { PLANS, TEAM_MIN_SEATS, TEAM_MAX_SEATS } from '../../data/pricing';
import TeamEnquiryForm from './TeamEnquiryForm';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100';

/**
 * Self-serve Teams checkout on /pricing: name the organization, pick seats,
 * pay. The Stripe webhook creates the org and seats the buyer as its first
 * manager; the dashboard picks it up on arrival (?org_checkout=success).
 * The enquiry form stays available underneath for custom deals.
 */
export default function TeamCheckout() {
  const { session, user } = useSession();
  const [orgName, setOrgName] = useState('');
  const [seats, setSeats] = useState(TEAM_MIN_SEATS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEnquiry, setShowEnquiry] = useState(false);

  const unit = Number(PLANS.team.priceAmount);
  const total = seats * unit;

  const start = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    track({
      event: 'checkout_started',
      plan: 'team',
      cta_location: 'pricing_team',
      value: total,
      currency: 'USD',
    });

    // Anonymous trial users have no billable account; register first, then
    // land straight back on this section.
    if (!session || user?.is_anonymous) {
      window.location.href = accountLink({ mode: 'register', next: '/pricing#team' });
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/team-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          org_name: orgName.trim(),
          seats,
          ga: getGaIds(),
          attribution: getFirstTouch() ?? undefined,
          returnPath: '/pricing#team',
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }
      if (res.status === 403 && data?.error === 'email_unconfirmed') {
        throw new Error('Confirm your email address first, then come back to start your team.');
      }
      throw new Error(data?.message ?? 'Something went wrong. Please try again.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <form onSubmit={start} className="space-y-3">
        <input
          className={inputClass}
          placeholder="Your organization's name"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          maxLength={120}
          required
          minLength={2}
          aria-label="Organization name"
        />
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">Seats</span>
          <button
            type="button"
            className="btn-ghost px-3 text-lg"
            disabled={busy || seats <= TEAM_MIN_SEATS}
            onClick={() => setSeats((s) => Math.max(s - 1, TEAM_MIN_SEATS))}
            aria-label="Fewer seats"
          >
            −
          </button>
          <span className="w-10 text-center text-sm font-semibold text-ink-800">{seats}</span>
          <button
            type="button"
            className="btn-ghost px-3 text-lg"
            disabled={busy || seats >= TEAM_MAX_SEATS}
            onClick={() => setSeats((s) => Math.min(s + 1, TEAM_MAX_SEATS))}
            aria-label="More seats"
          >
            +
          </button>
          <span className="ml-auto text-sm text-slate-600">
            {seats} seats × ${unit} ={' '}
            <span className="font-semibold text-ink-800">${total} per month</span>
          </span>
        </div>
        <button
          type="submit"
          className="btn-primary w-full disabled:opacity-60"
          disabled={busy || orgName.trim().length < 2}
          data-track-label="Start your team plan"
        >
          {busy ? 'Opening checkout…' : 'Start your team plan'}
        </button>
        {error && <p className="text-sm text-amber-700">{error}</p>}
        <p className="text-xs leading-relaxed text-slate-500">
          You become the first manager, add teammates by email, and can change seats or cancel
          anytime. Billing adjusts automatically.
        </p>
      </form>

      <div className="mt-4 border-t border-slate-100 pt-3">
        <button
          type="button"
          className="text-sm font-medium text-brand-600 hover:text-brand-700"
          onClick={() => setShowEnquiry((v) => !v)}
        >
          Prefer to talk first, or need a custom setup? Send an enquiry{' '}
          <span aria-hidden="true">{showEnquiry ? '↑' : '↓'}</span>
        </button>
        {showEnquiry && (
          <div className="mt-3">
            <TeamEnquiryForm />
          </div>
        )}
      </div>
    </div>
  );
}
