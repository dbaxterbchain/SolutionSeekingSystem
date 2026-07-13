import { useState } from 'react';
import { useSession } from '../../lib/useSession';
import { track, type EmailSource } from '../../lib/analytics';

interface Props {
  source: EmailSource;
  /** Button text. */
  cta?: string;
  /** Shown once the email is on its way. */
  successMessage?: string;
  compact?: boolean;
}

/**
 * Email capture. The confirmation email carries the guide, so submitting this is
 * the whole transaction: no second step, and only a real address gets the PDF.
 */
export default function SubscribeForm({
  source,
  cta = 'Send me the guide',
  successMessage = 'Check your inbox. The guide is on its way, and the download link is in the email.',
  compact = false,
}: Props) {
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
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          email: form.get('email'),
          source,
          website: form.get('website'), // honeypot
        }),
      });
      if (!res.ok) {
        throw new Error(
          res.status === 400
            ? "That email address doesn't look right. Could you check it?"
            : 'Something went wrong. Please try again in a moment.'
        );
      }
      track({ event: 'email_captured', source });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <p
        className={`rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ${
          compact ? '' : 'text-center'
        }`}
      >
        {successMessage}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className={compact ? 'space-y-2' : 'space-y-3'}>
      {/* Honeypot. Inline style so the server and client markup match exactly. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ display: 'none' }}
      />
      <div className={compact ? 'flex flex-wrap gap-2' : 'flex flex-wrap gap-3'}>
        <input
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          aria-label="Email address"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button type="submit" disabled={busy} className="btn-primary shrink-0 disabled:opacity-60">
          {busy ? 'Sending…' : cta}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-slate-500">
        One email with the guide. No sequence, no spam, unsubscribe in one click.
      </p>
    </form>
  );
}
