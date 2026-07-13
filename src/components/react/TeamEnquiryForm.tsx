import { useState } from 'react';
import { useSession } from '../../lib/useSession';
import { track } from '../../lib/analytics';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100';

/** Team plan enquiries. Fulfilment is by hand, which is the point: it tells us
 *  whether self-serve seats are worth building before we build them. */
export default function TeamEnquiryForm() {
  const { session } = useSession();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/team-enquiry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          name: form.get('name'),
          email: form.get('email'),
          team_size: form.get('team_size'),
          note: form.get('note'),
          website: form.get('website'), // honeypot
        }),
      });
      if (!res.ok) {
        throw new Error(
          res.status === 429
            ? 'That is a few enquiries in a row. Please try again a little later.'
            : 'Something went wrong. Please check the form and try again.'
        );
      }
      track({ event: 'team_enquiry_submitted' });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-6 text-center">
        <p className="text-2xl" aria-hidden="true">✉️</p>
        <h3 className="mt-2 font-heading text-lg font-bold text-ink-800">Thank you</h3>
        <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate-600">
          We have your details and will get back to you personally. If it's urgent, the
          Guide and Mentor are already free to try in the meantime.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {/* Honeypot: hidden from people, irresistible to bots. Hidden with an
          inline style rather than a class so the server and client markup match
          exactly (a class-only rule left React warning about a hydration
          mismatch on this input). */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ display: 'none' }}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <input name="name" required placeholder="Your name" className={inputClass} />
        <input
          name="email"
          type="email"
          required
          placeholder="Work email"
          className={inputClass}
        />
      </div>
      <input
        name="team_size"
        placeholder="How many people? (e.g. 12)"
        className={inputClass}
      />
      <textarea
        name="note"
        rows={3}
        placeholder="What are you hoping to change? (optional)"
        className={`${inputClass} resize-none`}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-60">
        {busy ? 'Sending…' : 'Talk to us about a team'}
      </button>
      <p className="text-xs text-slate-500">
        A real person reads these. No sales sequence, no spam.
      </p>
    </form>
  );
}
