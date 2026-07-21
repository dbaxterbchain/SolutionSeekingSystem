import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../lib/useSession';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useEntitlement } from '../../lib/entitlement';
import { accountLink } from '../../lib/accountLink';
import {
  createChatSession,
  getChatSession,
  listChatSessions,
  updateChatSession,
  deleteChatSession,
  type AgentId,
  type ChatMessage,
  type ChatSession,
} from '../../lib/chatSessions';
import { getContextMeta, MODE_CONTEXTS } from '../../lib/contexts';
import { track, getGaIds, type Tier } from '../../lib/analytics';
import { getFirstTouch } from '../../lib/attribution';
import { streamChat } from '../../lib/chatStream';
import { useDialog } from './Dialog';
import MessageBubble from './chat/MessageBubble';
import Composer from './chat/Composer';
import Sidebar from './dashboard/Sidebar';

/** Client-side truncation guard: send at most the last N messages. */
const SENT_HISTORY_LIMIT = 30;

const AGENT_LABEL: Record<AgentId, string> = { guide: 'Guide', mentor: 'Mentor' };

/**
 * The subscriber dashboard: the full Guide/Mentor toolset in one place, with a
 * conversation launcher, in-place mode switching (no page navigation, unlike
 * the public mode pages), and cross-agent history.
 *
 * Gating mirrors the rest of the site: the UI fails OPEN (a failed entitlement
 * lookup still renders the dashboard) because /api/chat is the real gate. Only
 * a confirmed non-subscriber sees the upsell instead.
 */
export default function DashboardView() {
  const { session, user, loading: sessionLoading } = useSession();
  const { entitlement, loading: entLoading, failed } = useEntitlement();

  const [agent, setAgent] = useState<AgentId>('guide');
  const [contextId, setContextId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [recents, setRecents] = useState<ChatSession[] | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { confirm, dialog } = useDialog();

  const isSubscriber = entitlement?.kind === 'subscriber';
  // Fail open: render the dashboard unless we have a definite non-subscriber
  // verdict. A failed lookup (failed === true) must never lock a subscriber out.
  const canUseDashboard = isSubscriber || failed;

  const refreshRecents = () => {
    listChatSessions()
      .then(setRecents)
      .catch(() => setRecents([]));
  };

  // Load the conversation list once we know who the user is.
  useEffect(() => {
    if (!user || !canUseDashboard) return;
    refreshRecents();
  }, [user?.id, canUseDashboard]);

  // Resume a conversation from ?chat=<id> on first load.
  useEffect(() => {
    if (!user || !canUseDashboard) return;
    const id = new URLSearchParams(window.location.search).get('chat');
    if (!id) return;
    getChatSession(id)
      .then((saved) => {
        if (!saved) return;
        setChatId(saved.id);
        setAgent(saved.agent);
        setMessages(saved.messages);
        setContextId(saved.context ?? null);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, canUseDashboard]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);

  const setChatUrl = (id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('chat', id);
    else url.searchParams.delete('chat');
    window.history.replaceState(null, '', url);
  };

  const persist = async (next: ChatMessage[]) => {
    try {
      if (chatId) {
        await updateChatSession(chatId, { messages: next });
        refreshRecents();
      } else {
        const title = next.find((m) => m.role === 'user')?.content.slice(0, 60) ?? 'Untitled';
        const created = await createChatSession({ agent, title, messages: next, context: contextId });
        setChatId(created.id);
        setChatUrl(created.id);
        refreshRecents();
      }
    } catch {
      // Persistence is best-effort; the conversation still lives in state.
    }
  };

  /** Start a fresh conversation with a given agent (used by New chat + agent picker). */
  const startFresh = (nextAgent: AgentId) => {
    if (streaming) return;
    setAgent(nextAgent);
    setContextId(null);
    setMessages([]);
    setChatId(null);
    setError(null);
    setInput('');
    setChatUrl(null);
    setSidebarOpen(false);
  };

  const openSaved = (saved: ChatSession) => {
    if (streaming) return;
    setChatId(saved.id);
    setAgent(saved.agent);
    setMessages(saved.messages);
    setContextId(saved.context ?? null);
    setError(null);
    setChatUrl(saved.id);
    setSidebarOpen(false);
  };

  const removeChat = async (c: ChatSession) => {
    const ok = await confirm({
      title: 'Delete this conversation?',
      message: `"${c.title}" will be permanently removed. This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteChatSession(c.id);
      if (c.id === chatId) startFresh(agent);
      refreshRecents();
    } catch {
      setError('Could not delete that conversation. Please try again.');
    }
  };

  const agentModes = MODE_CONTEXTS.filter((m) => m.agents.includes(agent));
  const contextMeta = getContextMeta(contextId, agent);

  /**
   * Switch mode WITHOUT leaving the page. The public mode pages navigate (so the
   * page copy can't disagree with the mode); the dashboard has no per-mode copy,
   * so it just reseeds a fresh conversation in place. Modes apply from the first
   * message, so an in-flight conversation can't adopt one: confirm, then reset.
   */
  const switchMode = async (nextId: string) => {
    const next = nextId || null;
    const active = getContextMeta(contextId, agent);
    const current = active?.kind === 'mode' ? active.id : null;
    if (streaming || next === current) return;

    if (messages.length > 0) {
      const label = next ? agentModes.find((m) => m.id === next)?.label : null;
      const ok = await confirm({
        title: label ? `Switch to ${label}?` : 'Turn off this mode?',
        message: label
          ? `Modes apply from the start of a conversation, so this begins a fresh one. This conversation is saved in Recent conversations.`
          : `This begins a fresh conversation with no mode. The current one is saved in Recent conversations.`,
        confirmLabel: 'Start new conversation',
      });
      if (!ok) return;
    }
    setContextId(next);
    setMessages([]);
    setChatId(null);
    setError(null);
    setChatUrl(null);
  };

  const send = () => {
    const text = input.trim();
    if (!text || streaming || !session) return;
    setInput('');
    void deliver([...messages, { role: 'user', content: text }]);
  };

  const retry = () => {
    if (streaming || messages[messages.length - 1]?.role !== 'user') return;
    void deliver(messages);
  };

  const deliver = async (next: ChatMessage[]) => {
    if (!session) return;
    setError(null);
    setMessages([...next, { role: 'assistant', content: '' }]);
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const tier: Tier = 'subscriber';
    const userMessages = next.filter((m) => m.role === 'user').length;
    if (userMessages === 1) {
      track({ event: 'first_message_sent', agent, tier, mode: contextId ?? undefined });
    }
    track({ event: 'message_sent', agent, tier, message_index: userMessages });

    try {
      const result = await streamChat({
        accessToken: session.access_token,
        payload: {
          agent,
          messages: next.slice(-SENT_HISTORY_LIMIT),
          ...(contextId ? { context: contextId } : {}),
        },
        signal: ctrl.signal,
        onDelta: (textSoFar) => setMessages([...next, { role: 'assistant', content: textSoFar }]),
      });

      switch (result.kind) {
        case 'done': {
          const finished: ChatMessage[] = [...next, { role: 'assistant', content: result.text }];
          setMessages(finished);
          await persist(finished);
          return;
        }
        case 'subscription_required':
          // Their access lapsed mid-session (e.g. a cancelled card). Send them
          // to billing rather than pretend the message failed.
          setMessages(next);
          setError('Your subscription is no longer active. Check your account to restore access.');
          return;
        case 'unauthorized':
          setMessages(next);
          setError('Your session expired. Please reload the page and sign in again.');
          return;
        default:
          // rate_limited / account_required / assistant_not_found don't apply to
          // a signed-in subscriber on a standard agent; surface a safe retry.
          setMessages(next);
          setError('Something went wrong. Please retry.');
          return;
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setMessages((current) => {
          const kept = current.filter((m, i) => !(i === current.length - 1 && m.content === ''));
          void persist(kept);
          return kept;
        });
      } else {
        setMessages(next);
        const message = (err as Error).message;
        setError(
          message === 'Failed to fetch'
            ? 'Connection problem: your message wasn’t sent. Check your internet and retry.'
            : message || 'Something went wrong. Please retry.'
        );
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const startCheckout = async () => {
    if (!session) return;
    setCheckoutBusy(true);
    setError(null);
    track({
      event: 'checkout_started',
      plan: 'monthly',
      cta_location: 'dashboard_upsell',
      value: 5,
      currency: 'USD',
    });
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          plan: 'monthly',
          ga: getGaIds(),
          attribution: getFirstTouch() ?? undefined,
          returnPath: '/dashboard',
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error('Could not start checkout. Please try again.');
    } catch (err) {
      setError((err as Error).message);
      setCheckoutBusy(false);
    }
  };

  // ── Gate states ────────────────────────────────────────────────────────────

  if (!isSupabaseConfigured) {
    return (
      <Card>
        <p className="text-sm text-slate-600">
          The dashboard is unavailable right now. Please try again later.
        </p>
      </Card>
    );
  }

  if (sessionLoading || (session && entLoading && !failed)) {
    return (
      <Card>
        <p className="text-center text-sm text-slate-500">Loading your dashboard…</p>
      </Card>
    );
  }

  if (!session || !user || user.is_anonymous) {
    return (
      <Card>
        <span className="text-3xl" aria-hidden="true">🔐</span>
        <h2 className="mt-3 font-heading text-xl font-bold text-ink-800">
          Sign in to open your dashboard
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
          The dashboard is where subscribers keep their assistants, conversations, and documents together.
        </p>
        <a href={accountLink({ next: '/dashboard' })} className="btn-primary mt-5 inline-block">
          Sign in or create an account
        </a>
      </Card>
    );
  }

  if (!canUseDashboard) {
    return (
      <Card>
        <span className="text-3xl" aria-hidden="true">✨</span>
        <h2 className="mt-3 font-heading text-xl font-bold text-ink-800">
          The dashboard is part of a subscription
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
          Subscribe for unlimited conversations with the Guide and Mentor, every mode, saved
          history, and the assistant tools we are adding here. It is $5 a month, cancel anytime.
        </p>
        <button
          type="button"
          onClick={startCheckout}
          disabled={checkoutBusy}
          className="btn-primary mt-5 disabled:opacity-60"
        >
          {checkoutBusy ? 'Opening checkout…' : 'Subscribe for $5/month'}
        </button>
        <p className="mt-3 text-xs text-slate-500">
          Or{' '}
          <a href="/pricing" className="font-semibold text-brand-600 hover:text-brand-700">
            see all plans
          </a>
          , including annual.
        </p>
        {error && <p className="mt-3 text-sm text-amber-700">{error}</p>}
        {dialog}
      </Card>
    );
  }

  // ── The dashboard ───────────────────────────────────────────────────────────

  const agentName = AGENT_LABEL[agent];

  return (
    <div className="grid gap-6 lg:h-[calc(100vh-8rem)] lg:grid-cols-[280px_1fr]">
      {/* Sidebar: a left column on desktop, a toggle-able panel on mobile. */}
      <div className={`${sidebarOpen ? 'block' : 'hidden'} lg:block lg:min-h-0`}>
        <Sidebar
          agent={agent}
          onSelectAgent={startFresh}
          onNewChat={() => startFresh(agent)}
          recents={recents}
          activeChatId={chatId}
          onOpenChat={openSaved}
          onDeleteChat={removeChat}
        />
      </div>

      {/* Chat surface */}
      <div className="flex min-h-0 flex-col rounded-3xl border border-slate-100 bg-white shadow-card">
        {/* Status bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              className="btn-ghost px-2 text-xs lg:hidden"
              aria-label="Toggle conversations panel"
            >
              ☰
            </button>
            <p className="text-sm font-semibold text-ink-800">{agentName}</p>
            {agentModes.length > 0 && (
              <select
                value={contextMeta?.kind === 'mode' ? contextMeta.id : ''}
                onChange={(e) => void switchMode(e.target.value)}
                disabled={streaming}
                aria-label="Conversation mode"
                className="max-w-[11rem] cursor-pointer rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:border-brand-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:cursor-default disabled:opacity-60"
              >
                <option value="">No mode</option>
                {agentModes.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          {messages.length > 0 && (
            <button type="button" onClick={() => startFresh(agent)} className="btn-ghost text-xs">
              New conversation
            </button>
          )}
        </div>

        {/* Active named context */}
        {contextMeta && (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-slate-100 bg-brand-50/60 px-5 py-2.5">
            <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
              {contextMeta.label}
            </span>
            <span className="text-xs text-slate-500">{contextMeta.description}</span>
          </div>
        )}

        {/* Transcript */}
        <div className="min-h-[50vh] flex-1 space-y-4 overflow-y-auto px-5 py-6 lg:min-h-0">
          {messages.length === 0 && (
            <p className="text-sm leading-relaxed text-slate-500">
              {agent === 'guide'
                ? 'Describe a conversation you need to have, and the Guide will help you prepare for it, step by step.'
                : 'Ask the Mentor anything about the system: the protocol, the Wisdom Principles, or the Leadership Tools.'}
            </p>
          )}
          {messages.map((m, i) => (
            <MessageBubble
              key={i}
              message={m}
              streaming={streaming && i === messages.length - 1}
              agentName={agentName}
            />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            <span>{error}</span>
            {!streaming && messages[messages.length - 1]?.role === 'user' && (
              <button
                type="button"
                onClick={retry}
                className="shrink-0 rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-900 hover:bg-amber-200"
              >
                Retry
              </button>
            )}
          </div>
        )}

        <Composer
          value={input}
          onChange={setInput}
          onSend={send}
          onStop={() => abortRef.current?.abort()}
          streaming={streaming}
          placeholder={`Message the ${agentName}…`}
        />
      </div>
      {dialog}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-card">
      {children}
    </div>
  );
}
