import { useState } from 'react';
import { useSession } from '../../lib/useSession';
import { track, type Tier } from '../../lib/analytics';
import type { AgentId } from '../../lib/chatSessions';

interface Props {
  agent: AgentId;
  agentName: string;
  tier: Tier;
  context: string | null;
  chatId: string | null;
  messageCount: number;
  /** Called once the prompt is finished with, so it is never shown twice. */
  onDone: () => void;
}

type Step = 'ask' | 'praise' | 'miss' | 'sent';

/**
 * "Did this help?", asked once, at the only moment we have earned an answer:
 * the conversation reached a prep summary, so it actually finished the protocol.
 *
 * The rating posts the instant they click, before any form appears. Recording it
 * on form-submit instead would silently discard the opinion of everyone who
 * cannot be bothered to write prose, and those people are most of them.
 *
 * The "Not yet" path is not a dead end: it asks what was missing, which is the
 * most useful sentence anyone can send us and one nobody would send unprompted.
 */
export default function FeedbackPrompt({
  agent,
  agentName,
  tier,
  context,
  chatId,
  messageCount,
  onDone,
}: Props) {
  const { session } = useSession();
  const [step, setStep] = useState<Step>('ask');
  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [text, setText] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const post = async (payload: Record<string, unknown>) => {
    if (!session) return null;
    const res = await fetch('/api/testimonial', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    return data?.id ?? null;
  };

  const rate = async (helpful: boolean) => {
    setStep(helpful ? 'praise' : 'miss');
    track({ event: 'feedback_given', helpful, agent, tier });
    // Fire and forget: the rating is already banked, and a failed request must
    // not block the follow-up question. If it fails there is simply no row to
    // attach words to, and `submit` degrades to a thank-you.
    const rowId = await post({
      helpful,
      agent,
      context: context ?? undefined,
      chat_id: chatId ?? undefined,
      message_count: messageCount,
    });
    setId(rowId);
  };

  const submit = async (kind: 'praise' | 'miss') => {
    const written = text.trim();
    if (!written || busy) return;
    setBusy(true);
    setFailed(false);

    // No id means the rating POST failed. Insert the words as a fresh row rather
    // than dropping what they took the time to write.
    const payload =
      kind === 'praise'
        ? {
            quote: written,
            display_name: name.trim() || undefined,
            role_title: role.trim() || undefined,
            consent_publish: consent,
          }
        : { note: written };
    const ok = await post(
      id
        ? { id, ...payload }
        : {
            helpful: kind === 'praise',
            agent,
            context: context ?? undefined,
            chat_id: chatId ?? undefined,
            message_count: messageCount,
            ...payload,
          }
    );

    setBusy(false);
    if (!ok && !id) {
      setFailed(true);
      return;
    }
    if (kind === 'praise') {
      track({ event: 'testimonial_submitted', agent, consented: consent });
    }
    setStep('sent');
  };

  const dismiss = () => {
    setStep('sent');
    onDone();
  };

  if (step === 'sent') {
    return (
      <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3">
        <p className="text-sm text-slate-600">
          Thank you. That genuinely helps us.{' '}
          <button
            type="button"
            onClick={onDone}
            className="font-semibold text-brand-600 hover:text-brand-700"
          >
            Close
          </button>
        </p>
      </div>
    );
  }

  if (step === 'ask') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
        <p className="text-sm font-medium text-ink-800">Did this help?</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void rate(true)}
            className="rounded-full bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => void rate(false)}
            className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-300"
          >
            Not yet
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="px-1 text-lg leading-none text-slate-300 hover:text-slate-500"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  const praise = step === 'praise';

  return (
    <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink-800">
            {praise ? 'Would you tell other people that?' : 'What was missing?'}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            {praise
              ? `We have no testimonials, and we will not invent any. If the ${agentName} helped, a sentence in your own words is the most useful thing you could give us.`
              : 'One sentence is plenty. This goes straight to the two people who built the system.'}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 px-1 text-lg leading-none text-slate-300 hover:text-slate-500"
        >
          ×
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder={
          praise
            ? 'What changed for you?'
            : 'What did you need that you did not get?'
        }
        className="mt-3 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />

      {praise && (
        <>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="First name (optional)"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Role, e.g. team lead (optional)"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs leading-relaxed text-slate-600">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-500 focus:ring-brand-400"
            />
            <span>
              You may quote this on the site, with my first name and role. Nothing else from
              my conversation is ever published. Leave this unticked and your words stay
              private, just between us.
            </span>
          </label>
        </>
      )}

      {failed && (
        <p className="mt-2 text-xs text-amber-700">
          That did not send. Please try once more.
        </p>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void submit(praise ? 'praise' : 'miss')}
          disabled={!text.trim() || busy}
          className="btn-primary px-4 py-1.5 text-xs disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send'}
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          No thanks
        </button>
      </div>
    </div>
  );
}
