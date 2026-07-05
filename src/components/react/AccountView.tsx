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

/**
 * The /account page island. Signed out → an email/password + Google auth panel.
 * Signed in → the user's saved-session library (view, open in the tool, delete).
 */
export default function AccountView() {
  const { user, loading } = useSession();

  // Tools link here with ?next=<path> — once signed in, send the user back.
  const next =
    typeof window !== 'undefined'
      ? safeNext(new URLSearchParams(window.location.search).get('next'))
      : null;

  useEffect(() => {
    if (user && next) window.location.replace(next);
  }, [user, next]);

  if (user && next) {
    return <div className="text-sm text-slate-400">Taking you back…</div>;
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

  return user ? <Library email={user.email ?? ''} /> : <AuthPanel />;
}

/* ------------------------------------------------------------------ */
/* Auth panel (signed out)                                            */
/* ------------------------------------------------------------------ */

function AuthPanel() {
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Preserve the query string (?next=...) so OAuth and email flows land back
  // here and the post-sign-in redirect can complete the round trip.
  const redirectTo =
    typeof window !== 'undefined'
      ? `${window.location.origin}/account${window.location.search}`
      : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        // When email confirmation is on, there's no active session yet.
        if (!data.session) {
          setNotice('Check your email to confirm your account, then sign in.');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // onAuthStateChange re-renders this island into the Library.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) setError(error.message);
  };

  const forgot = async () => {
    if (!email) {
      setError('Enter your email above first, then tap “Forgot password”.');
      return;
    }
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (error) setError(error.message);
    else setNotice('If that email has an account, a reset link is on its way.');
  };

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-slate-100 bg-white p-6 shadow-card sm:p-8">
      <h1 className="font-heading text-2xl font-bold text-ink-800">
        {mode === 'signin' ? 'Sign in' : 'Create your account'}
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        {mode === 'signin'
          ? 'Sign in to save your introspections, plans, and solutions.'
          : 'Register to save and revisit your work. It’s free.'}
      </p>

      <button
        type="button"
        onClick={google}
        className="btn-secondary mt-6 w-full"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
          <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
        </svg>
        Continue with Google
      </button>

      <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-100" />
        or
        <span className="h-px flex-1 bg-slate-100" />
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-ink-800">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-ink-800">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="text-sm text-brand-700">{notice}</p>}

        <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-50">
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <div className="mt-5 flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === 'signin' ? 'register' : 'signin'));
            setError(null);
            setNotice(null);
          }}
          className="font-medium text-brand-600 hover:text-brand-700"
        >
          {mode === 'signin' ? 'Create an account' : 'I already have an account'}
        </button>
        {mode === 'signin' && (
          <button type="button" onClick={forgot} className="text-slate-500 hover:text-ink-800">
            Forgot password?
          </button>
        )}
      </div>
    </div>
  );
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
        <div>
          <h1 className="font-heading text-2xl font-bold text-ink-800">Your account</h1>
          <p className="mt-1 text-sm text-slate-600">Signed in as {email}</p>
        </div>
        <button type="button" onClick={signOut} className="btn-ghost text-slate-500 hover:text-red-600">
          Sign out
        </button>
      </div>

      <SubscriptionSection />

      <ToolLinks />

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <ChatHistorySection formatDate={formatDate} />

      <h2 className="mt-10 font-heading text-xl font-bold text-ink-800">Your saved work</h2>
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
/* Tool quick links (signed in)                                       */
/* ------------------------------------------------------------------ */

const TOOL_LINKS = [
  { label: 'Guided Introspection', href: '/practice/introspection', hint: 'worksheet' },
  { label: 'Conversation Planner', href: '/practice/conversation-planner', hint: 'worksheet' },
  { label: 'Solution Builder', href: '/practice/solution-builder', hint: 'worksheet' },
];

function ToolLinks() {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Free practice tools
      </h2>
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

const ENTITLED = ['active', 'trialing', 'past_due'];
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
  const [activating, setActivating] = useState(
    typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('checkout') === 'success'
  );

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
    return subRow ? ENTITLED.includes((subRow as SubRow).status) : false;
  };

  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const poll = async () => {
      const entitled = await load();
      if (cancelled) return;
      // After checkout, the webhook can lag a moment — refetch a few times.
      if (activating && !entitled && tries < 5) {
        tries += 1;
        window.setTimeout(poll, 2000);
      } else {
        setActivating(false);
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

  const entitled = sub ? ENTITLED.includes(sub.status) : false;
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
    <section className="mt-10">
      <h2 className="font-heading text-xl font-bold text-ink-800">AI conversations</h2>
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
