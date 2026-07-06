import { useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { useDialog } from './Dialog';
import {
  deleteSession,
  listSessions,
  TOOL_META,
  type SavedSession,
  type ToolType,
} from '../../lib/savedSessions';
import {
  deleteChatSession,
  listChatSessions,
  AGENT_META,
  type AgentId,
  type ChatSession,
} from '../../lib/chatSessions';
import { safeNext } from '../../lib/accountLink';
import { ENTITLED_STATUSES } from '../../lib/subscription';
import { usePasswordRecovery } from '../../lib/usePasswordRecovery';
import AuthPanel, { NewPasswordForm, RecoveryPanel } from './AuthPanel';

/**
 * The /account page island. Signed out → an email/password + Google auth panel.
 * Signed in → the user's saved-session library (view, open in the tool, delete).
 */
const checkoutSuccessParam = () =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('checkout') === 'success';

export default function AccountView() {
  const { user, loading } = useSession();
  const { recovering, linkExpired, finishRecovery } = usePasswordRecovery();

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

  useEffect(() => {
    // A recovery session is a signed-in user — don't bounce away before the
    // set-new-password form has been shown.
    if (user && next && !recovering) window.location.replace(next);
  }, [user, next, recovering]);

  if (user && recovering) {
    return <RecoveryPanel onDone={finishRecovery} />;
  }

  if (user && next) {
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

  return user ? <Library email={user.email ?? ''} /> : <AuthPanel linkExpired={linkExpired} />;
}

/* ------------------------------------------------------------------ */
/* Library (signed in)                                                */
/* ------------------------------------------------------------------ */

const TOOL_ORDER: ToolType[] = ['introspection', 'planner', 'solution'];

function Library({ email }: { email: string }) {
  const [items, setItems] = useState<SavedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<SavedSession | null>(null);
  const { confirm, dialog } = useDialog();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listSessions());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your saved work.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => {
    const map: Record<ToolType, SavedSession[]> = {
      introspection: [],
      planner: [],
      solution: [],
    };
    for (const item of items) map[item.tool]?.push(item);
    return map;
  }, [items]);

  const remove = async (item: SavedSession) => {
    const ok = await confirm({
      title: 'Delete this?',
      message: `“${item.title}” will be permanently removed. This can’t be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteSession(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      if (viewing?.id === item.id) setViewing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that item.');
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
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

      <SubscriptionSection />

      <ChangePasswordSection />

      <ToolLinks />

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <ChatHistorySection formatDate={formatDate} />

      <h2 className="mt-8 font-heading text-lg font-bold text-ink-800">Your saved work</h2>
      {loading ? (
        <p className="mt-8 text-sm text-slate-400">Loading your saved work…</p>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center">
          <p className="text-slate-600">You haven’t saved anything yet.</p>
          <p className="mt-1 text-sm text-slate-500">
            Use a{' '}
            <a href="/practice" className="font-medium text-brand-600 hover:text-brand-700">
              practice tool
            </a>{' '}
            and tap “Save to my account” to keep it here.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {TOOL_ORDER.filter((t) => grouped[t].length > 0).map((tool) => (
            <section key={tool}>
              <h2 className="font-heading text-lg font-bold text-ink-800">{TOOL_META[tool].label}</h2>
              <ul className="mt-3 space-y-2.5">
                {grouped[tool].map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-card"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-800">{item.title}</p>
                      <p className="text-xs text-slate-400">{formatDate(item.created_at)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setViewing(item)}
                        className="rounded-full px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
                      >
                        View
                      </button>
                      <a
                        href={`${TOOL_META[tool].path}?load=${item.id}`}
                        className="rounded-full px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
                      >
                        Open in tool
                      </a>
                      <button
                        type="button"
                        onClick={() => remove(item)}
                        className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {viewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-800/50 p-4"
          onClick={() => setViewing(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-card-hover"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <h3 className="truncate font-heading text-lg font-bold text-ink-800">{viewing.title}</h3>
              <button
                type="button"
                onClick={() => setViewing(null)}
                aria-label="Close"
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-ink-800"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap p-5 font-sans text-sm leading-relaxed text-slate-700">
              {viewing.summary}
            </pre>
            <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
              <a href={`${TOOL_META[viewing.tool].path}?load=${viewing.id}`} className="btn-primary">
                Open in tool
              </a>
            </div>
          </div>
        </div>
      )}
      {dialog}
    </div>
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
/* Tool quick links (signed in)                                       */
/* ------------------------------------------------------------------ */

const TOOL_LINKS = [
  { label: 'Guided Introspection', href: '/practice/introspection', hint: 'worksheet' },
  { label: 'Conversation Planner', href: '/practice/conversation-planner', hint: 'worksheet' },
  { label: 'Solution Builder', href: '/practice/solution-builder', hint: 'worksheet' },
];

function ToolLinks() {
  return (
    <section className="mt-8">
      <h2 className="font-heading text-lg font-bold text-ink-800">Free practice tools</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {TOOL_LINKS.map((t) => (
          <a
            key={t.href}
            href={t.href}
            title={t.hint}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-ink-800 shadow-card transition-colors hover:border-brand-300 hover:text-brand-700"
          >
            {t.label}
          </a>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Subscription (signed in)                                           */
/* ------------------------------------------------------------------ */

const FREE_LIMIT = 10;

interface SubRow {
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
}

function SubscriptionSection() {
  const { session } = useSession();
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
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
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
          Payment received — your subscription is taking a moment to activate. It will
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
          ) : (
            <p className="mt-1 text-sm text-slate-600">
              Free plan — {Math.min(freeUsed, FREE_LIMIT)} of {FREE_LIMIT} free messages used.
            </p>
          )}
        </div>
        {!loading &&
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
              <button
                type="button"
                onClick={() => post('/api/checkout')}
                disabled={busy}
                className="btn-primary disabled:opacity-60"
              >
                {busy ? 'Opening checkout…' : 'Subscribe — $5/month'}
              </button>
            )
          ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        {!loading && (
          <span className="mr-1 text-sm text-slate-600">
            {entitled
              ? 'Unlimited conversations, anytime:'
              : 'Try them free — your first 10 messages are on us:'}
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

/* ------------------------------------------------------------------ */
/* Chat history (signed in)                                           */
/* ------------------------------------------------------------------ */

const AGENT_ORDER: AgentId[] = ['guide', 'mentor'];

function ChatHistorySection({ formatDate }: { formatDate: (iso: string) => string }) {
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useDialog();

  useEffect(() => {
    listChatSessions()
      .then(setChats)
      .catch(() => setError('Could not load your conversations.'))
      .finally(() => setLoading(false));
  }, []);

  const remove = async (chat: ChatSession) => {
    const ok = await confirm({
      title: 'Delete this conversation?',
      message: `“${chat.title}” will be permanently removed. This can’t be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteChatSession(chat.id);
      setChats((prev) => prev.filter((c) => c.id !== chat.id));
    } catch {
      setError('Could not delete that conversation.');
    }
  };

  if (loading || (chats.length === 0 && !error)) return null;

  return (
    <section className="mt-8">
      <h2 className="font-heading text-lg font-bold text-ink-800">AI conversations</h2>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-3 space-y-6">
        {AGENT_ORDER.filter((a) => chats.some((c) => c.agent === a)).map((agent) => (
          <div key={agent}>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {AGENT_META[agent].label}
            </h3>
            <ul className="mt-2 space-y-2.5">
              {chats
                .filter((c) => c.agent === agent)
                .map((chat) => (
                  <li
                    key={chat.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-card"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-800">{chat.title}</p>
                      <p className="text-xs text-slate-400">{formatDate(chat.updated_at)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`${AGENT_META[agent].path}?chat=${chat.id}`}
                        className="rounded-full px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
                      >
                        Open
                      </a>
                      <button
                        type="button"
                        onClick={() => remove(chat)}
                        className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
      {dialog}
    </section>
  );
}
