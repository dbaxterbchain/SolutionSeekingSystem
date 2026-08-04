import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useSession } from '../../lib/useSession';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { accountLink } from '../../lib/accountLink';
import { fetchEntitlement, type ClientEntitlement } from '../../lib/entitlement';
import { readOAuthRedirectError } from '../../lib/authErrors';
import {
  createChatSession,
  getChatSession,
  listChatSessions,
  updateChatSession,
  type AgentId,
  type ChatMessage,
  type ChatSession,
} from '../../lib/chatSessions';
import { getContextMeta, modeUrl, MODE_CONTEXTS } from '../../lib/contexts';
import { useDialog } from './Dialog';
import { track, getGaIds, type Tier } from '../../lib/analytics';
import { getFirstTouch } from '../../lib/attribution';
import UpgradeAnonCard from './UpgradeAnonCard';
import FeedbackPrompt from './FeedbackPrompt';
import { FREE_ACCOUNT_MESSAGES, FREE_ANON_MESSAGES, priceCopy } from '../../data/pricing';
import { getCaptchaToken, prewarmCaptcha } from '../../lib/turnstile';
import MessageBubble, { looksLikeDocument } from './chat/MessageBubble';
import Composer from './chat/Composer';
import Starters from './chat/Starters';
import { streamChat } from '../../lib/chatStream';

const FREE_LIMIT = FREE_ACCOUNT_MESSAGES;
const ANON_LIMIT = FREE_ANON_MESSAGES;
/** Client-side truncation guard: send at most the last N messages. */
const SENT_HISTORY_LIMIT = 30;

/**
 * Chats we have already asked about, so nobody is nagged twice for the same
 * conversation (including after a reload, or when reopening it from History).
 */
const FEEDBACK_ASKED_KEY = 'sss-feedback-asked';

const feedbackAsked = (chatId: string): boolean => {
  try {
    const raw = window.localStorage.getItem(FEEDBACK_ASKED_KEY);
    return raw ? (JSON.parse(raw) as string[]).includes(chatId) : false;
  } catch {
    return false;
  }
};

const rememberFeedbackAsked = (chatId: string): void => {
  try {
    const raw = window.localStorage.getItem(FEEDBACK_ASKED_KEY);
    const all = raw ? (JSON.parse(raw) as string[]) : [];
    if (all.includes(chatId)) return;
    // Keep the tail: this is a nag-guard, not an archive.
    const next = [...all, chatId].slice(-50);
    window.localStorage.setItem(FEEDBACK_ASKED_KEY, JSON.stringify(next));
  } catch {
    // Storage disabled: worst case we ask once more. Not worth handling.
  }
};

interface Props {
  agent: AgentId;
  agentName: string;
  /** One-line welcome shown above the empty conversation. */
  welcome: string;
  /**
   * Named context (src/lib/contexts.ts) to seed new conversations with, for
   * dedicated variant pages. A ?context= URL param takes precedence.
   */
  initialContext?: string;
  /**
   * First-person openers offered in the empty conversation. Passed in by the
   * page (from src/data/modes.ts on a mode page) rather than looked up here, so
   * the landing copy stays out of the chat client bundle.
   */
  starters?: string[];
}

type Gate =
  /**
   * Nothing known yet. This is what the SERVER renders, so it must never block
   * the composer: see the note above the render below.
   */
  | { kind: 'loading' }
  /** No session yet. The composer is live: sending signs them in anonymously. */
  | { kind: 'anon-idle' }
  /** Anonymous trial in progress. */
  | { kind: 'anon'; remaining: number }
  /** Trial spent (or IP-limited): an account is the way forward, not a payment. */
  | { kind: 'anon-exhausted'; rateLimited: boolean }
  | { kind: 'subscriber' }
  | { kind: 'free'; remaining: number }
  | { kind: 'paywalled' }
  /**
   * The entitlement lookup failed. Live composer, no badge, no paywall.
   *
   * We must NEVER show a paywall because a request failed. The server is the
   * gate and it still refuses anyone who is genuinely out of messages (the 403
   * handler below flips them to `paywalled` then). Failing open here costs, at
   * worst, one message from someone who had none left. Failing closed would lock
   * out a paying customer on a flaky connection, which is far more expensive.
   */
  | { kind: 'open' }
  /** Supabase missing, or anonymous sign-in refused: fall back to the old wall. */
  | { kind: 'unavailable' };

/**
 * Server entitlement -> the gate this component renders.
 *
 * A null entitlement means the lookup failed, NOT that they are out of
 * messages. That distinction is the whole point of the `open` gate.
 */
function toGate(entitlement: ClientEntitlement | null): Gate {
  if (!entitlement) return { kind: 'open' };
  switch (entitlement.kind) {
    case 'subscriber':
      return { kind: 'subscriber' };
    case 'free':
      return entitlement.tier === 'anon'
        ? { kind: 'anon', remaining: entitlement.remaining }
        : { kind: 'free', remaining: entitlement.remaining };
    case 'blocked':
      return entitlement.tier === 'anon'
        ? { kind: 'anon-exhausted', rateLimited: false }
        : { kind: 'paywalled' };
  }
}

export default function ChatView({
  agent,
  agentName,
  welcome,
  initialContext,
  starters,
}: Props) {
  const { session, user, loading } = useSession();
  const [gate, setGate] = useState<Gate>({ kind: 'loading' });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  /**
   * Named context seeding the conversation. New conversations take it from
   * ?context= (falling back to the initialContext prop); resumed ones take it
   * from the saved row, which is authoritative whenever ?chat= is present.
   *
   * The initial value MUST NOT depend on `window`. This component is
   * server-rendered, and the URL only exists on one of the two sides: reading it
   * here made the client's first render disagree with the server's (mode band
   * present vs absent), and React threw the server HTML away and rebuilt the
   * whole island. That was invisible while a "Loading…" card short-circuited
   * both renders, and became a hydration error the moment the real chat shipped
   * in the HTML. The prop is the one seed both sides can agree on; the URL
   * override is applied on mount, below.
   */
  const [contextId, setContextId] = useState<string | null>(() =>
    getContextMeta(initialContext, agent) ? (initialContext ?? null) : null
  );
  const [input, setInput] = useState('');
  /** Bumped to move the cursor into the composer (see Composer's focusToken). */
  const [focusToken, setFocusToken] = useState(0);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ChatSession[] | null>(null);
  const [feedbackDone, setFeedbackDone] = useState(false);
  /*
   * UpgradeAnonCard links a Google identity to the trial user and sends them
   * back to THIS page, so when that fails (usually because the Google address
   * already has an account of its own) the provider bounces them here with the
   * reason in the URL. Nothing read it, so the card simply appeared to do
   * nothing. Read it on mount and say what happened.
   *
   * Set from an effect, not a state initializer: it reads the URL (server and
   * client would disagree) and rewrites it with replaceState, which is a side
   * effect that has no business running during a render.
   */
  const [authNotice, setAuthNotice] = useState<{ code: string | null; message: string } | null>(
    null
  );
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { confirm, dialog } = useDialog();

  /**
   * Ask the SERVER what this user is allowed to do.
   *
   * This used to read `subscriptions` and `ai_usage` from the browser and work
   * it out here, which was a second copy of the server's rules. It broke as soon
   * as entitlement could come from anywhere but a personal Stripe row: a member
   * of an organization has no `subscriptions` record, so the browser called them
   * a free user and, once their 10 free messages were gone, swapped the composer
   * for a paywall. Locked out of a product their employer pays for, with no
   * request ever reaching the server to say otherwise.
   *
   * One authority now (/api/entitlement, the same function /api/chat enforces),
   * so the client cannot hold a different opinion from the server.
   */
  useEffect(() => {
    if (loading) return;
    if (!isSupabaseConfigured) {
      setGate({ kind: 'unavailable' });
      return;
    }
    // No session: the composer stays live and the first Send creates an
    // anonymous one. Nobody has to sign up to find out whether this works. No
    // round trip here, so nothing is added to the "just start typing" latency.
    if (!session || !user) {
      setGate({ kind: 'anon-idle' });
      // Load the captcha now, while they're reading and typing, so it isn't
      // ~1.5s of dead time between hitting Send and the reply starting.
      prewarmCaptcha();
      return;
    }
    let active = true;
    fetchEntitlement(session.access_token).then((entitlement) => {
      if (!active) return;
      setGate(toGate(entitlement));
    });
    return () => {
      active = false;
    };
  }, [loading, session?.access_token, user?.id]);

  /**
   * Everything that has to read the URL, done once on mount so the first client
   * render can stay identical to the server's. See the note on contextId.
   */
  useEffect(() => {
    setAuthNotice(readOAuthRedirectError());
    const params = new URLSearchParams(window.location.search);
    // A resumed conversation carries its own context on the saved row, which is
    // authoritative; the effect below applies it.
    if (params.get('chat')) {
      setContextId(null);
      return;
    }
    const id = params.get('context');
    if (id && getContextMeta(id, agent)) setContextId(id);
  }, []);

  // Resume a conversation from ?chat=<id>.
  useEffect(() => {
    if (!user) return;
    const id = new URLSearchParams(window.location.search).get('chat');
    if (!id) return;
    getChatSession(id)
      .then((saved) => {
        if (saved && saved.agent === agent) {
          setChatId(saved.id);
          setMessages(saved.messages);
          setContextId(saved.context ?? null);
        }
      })
      .catch(() => {});
  }, [user?.id, agent]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);

  const persist = async (next: ChatMessage[]) => {
    try {
      if (chatId) {
        await updateChatSession(chatId, { messages: next });
      } else {
        const title = next.find((m) => m.role === 'user')?.content.slice(0, 60) ?? 'Untitled';
        const created = await createChatSession({ agent, title, messages: next, context: contextId });
        setChatId(created.id);
        const url = new URL(window.location.href);
        url.searchParams.set('chat', created.id);
        window.history.replaceState(null, '', url);
      }
    } catch {
      // Persistence is best-effort; the conversation still lives in state.
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    // First message from a visitor with no account: create an anonymous session
    // so they can try the assistant before being asked for anything. Supabase
    // gives them a real auth.users row, so RLS, history, and the usage counter
    // all work unchanged — and the id survives conversion to a real account.
    let active = session;
    if (!active) {
      setError(null);
      // Supabase enforces captcha on anonymous sign-in. The Turnstile widget is
      // invisible unless Cloudflare actually wants a challenge, so the "just
      // start typing" promise holds for almost everyone.
      let captchaToken: string | undefined;
      try {
        captchaToken = await getCaptchaToken();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'The captcha failed. Please try again.');
        return;
      }

      const { data, error: anonError } = await supabase.auth.signInAnonymously({
        options: { captchaToken },
      });
      if (anonError || !data.session) {
        setGate({ kind: 'unavailable' });
        setError('Could not start a conversation. Please sign in and try again.');
        return;
      }
      active = data.session;
      track({ event: 'anon_chat_started', agent, mode: contextId ?? undefined });
    }

    setInput('');
    // Pass the session explicitly: useSession() has not re-rendered yet, so
    // `session` is still null on this pass.
    void deliver([...messages, { role: 'user', content: text }], active);
  };

  /**
   * A suggested opener was tapped. Fill the composer and hand over the cursor;
   * deliberately NOT a send. See the note in chat/Starters.tsx.
   */
  const pickStarter = (text: string, index: number) => {
    setInput(text);
    setFocusToken((n) => n + 1);
    track({ event: 'starter_clicked', agent, mode: contextId ?? undefined, index });
  };

  /** Re-send the transcript after a failure (the user message is already in it). */
  const retry = () => {
    if (streaming || messages[messages.length - 1]?.role !== 'user') return;
    void deliver(messages);
  };

  const deliver = async (next: ChatMessage[], sessionOverride?: Session) => {
    const active = sessionOverride ?? session;
    if (!active) return;
    setError(null);
    setMessages([...next, { role: 'assistant', content: '' }]);
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const tier: Tier =
      gate.kind === 'subscriber'
        ? 'subscriber'
        : gate.kind === 'anon' || gate.kind === 'anon-idle'
          ? 'anon'
          : 'free';
    const userMessages = next.filter((m) => m.role === 'user').length;
    if (userMessages === 1) {
      track({ event: 'first_message_sent', agent, tier, mode: contextId ?? undefined });
    }
    track({ event: 'message_sent', agent, tier, message_index: userMessages });

    try {
      const result = await streamChat({
        accessToken: active.access_token,
        payload: {
          agent,
          messages: next.slice(-SENT_HISTORY_LIMIT),
          // Sent on every request (it's state, not a message) so the seed
          // survives the history trim above.
          ...(contextId ? { context: contextId } : {}),
        },
        signal: ctrl.signal,
        onMeta: (meta) => {
          if (meta.freeRemaining !== null) {
            setGate(
              meta.freeTier === 'anon'
                ? { kind: 'anon', remaining: meta.freeRemaining }
                : { kind: 'free', remaining: meta.freeRemaining }
            );
          }
        },
        onDelta: (text) => setMessages([...next, { role: 'assistant', content: text }]),
      });

      switch (result.kind) {
        case 'unauthorized':
          // The anonymous JWT expired; the next send mints a fresh one.
          setGate({ kind: 'anon-idle' });
          setMessages(next);
          return;
        case 'rate_limited':
          // Too many anonymous messages from this network today. Convert rather
          // than scold: an account gets them going again immediately.
          track({ event: 'free_limit_reached', tier: 'anon', agent });
          setGate({ kind: 'anon-exhausted', rateLimited: true });
          setMessages(next);
          return;
        case 'account_required':
          // An anonymous visitor who still has free messages waiting behind an
          // account.
          track({ event: 'free_limit_reached', tier: 'anon', agent });
          setGate({ kind: 'anon-exhausted', rateLimited: false });
          setMessages(next);
          return;
        case 'subscription_required':
          // A registered user out of free messages: this one needs to pay.
          track({ event: 'free_limit_reached', tier: 'free', agent });
          setGate({ kind: 'paywalled' });
          setMessages(next);
          return;
        case 'assistant_not_found':
          // ChatView never sends assistant_id, so this is unreachable here; be
          // safe rather than silent if the contract ever changes.
          setMessages(next);
          setError('Something went wrong. Please retry.');
          return;
        case 'done': {
          const finished: ChatMessage[] = [...next, { role: 'assistant', content: result.text }];
          setMessages(finished);
          await persist(finished);
          return;
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // Keep whatever streamed before Stop; persist it.
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
      cta_location: 'paywall_card',
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
        // The GA ids let the server-side conversion be attributed back to this
        // session; returnPath brings an abandoned checkout back to this page.
        body: JSON.stringify({
          plan: 'monthly',
          ga: getGaIds(),
          // Which ad, if any, bought this customer. Captured on their first page
          // view and kept across the OAuth redirect that happens in between.
          attribution: getFirstTouch() ?? undefined,
          returnPath: window.location.pathname + window.location.search,
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

  const newConversation = () => {
    setMessages([]);
    setChatId(null);
    // On a dedicated mode/variant page (initialContext prop) a fresh chat
    // re-seeds with the page's context; elsewhere it resets to a plain chat.
    setContextId(getContextMeta(initialContext, agent) ? initialContext! : null);
    setError(null);
    setShowHistory(false);
    setFeedbackDone(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('chat');
    url.searchParams.delete('context');
    window.history.replaceState(null, '', url);
  };

  /** Modes this assistant offers, for the status-bar selector. */
  const agentModes = MODE_CONTEXTS.filter((m) => m.agents.includes(agent));

  /**
   * Switch the conversation mode by GOING TO THAT MODE'S PAGE, rather than
   * quietly rewriting `?context=` on whatever page we happen to be on.
   *
   * The old behaviour let the page and the mode disagree: pick Parent from the
   * dropdown while sitting on /practice/modes/coworker and you kept all of the
   * Co-worker copy around a Parent-seeded assistant. Navigating means choosing a
   * mode here lands you in exactly the same place as clicking its button, which
   * is the only way the two stay honest. modeUrl() is the single definition.
   */
  const switchMode = async (nextId: string) => {
    const next = nextId || null;
    // A scenario context (from a demo CTA) is not a mode, so it counts as "no mode".
    const active = getContextMeta(contextId, agent);
    const current = active?.kind === 'mode' ? active.id : null;
    if (streaming || next === current) return;

    // Modes apply from the first message, so an in-flight conversation can't
    // adopt one. Warn before we navigate away from it.
    if (messages.length > 0) {
      const label = next ? agentModes.find((m) => m.id === next)?.label : null;
      const ok = await confirm({
        title: label ? `Switch to ${label}?` : 'Turn off this mode?',
        message: label
          ? `Modes apply from the start of a conversation, so this opens ${label} and begins a fresh one. This conversation is saved, and you can reopen it from History.`
          : 'This opens a plain conversation with no mode, and begins a fresh one. This conversation is saved, and you can reopen it from History.',
        confirmLabel: 'Start new conversation',
      });
      // On cancel there is nothing to undo: the <select> is controlled by the
      // active context, so React snaps it back to the current mode on re-render.
      if (!ok) return;
    }
    window.location.href = modeUrl(agent, next);
  };

  const toggleHistory = () => {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setShowHistory(true);
    // Public practice chats live in the Personal workspace (org_id null).
    listChatSessions(null)
      .then((all) => setHistory(all.filter((c) => c.agent === agent)))
      .catch(() => setHistory([]));
  };

  const openSaved = (saved: ChatSession) => {
    if (streaming) return;
    setChatId(saved.id);
    setMessages(saved.messages);
    setContextId(saved.context ?? null);
    setError(null);
    setShowHistory(false);
    setFeedbackDone(false);
    const url = new URL(window.location.href);
    url.searchParams.set('chat', saved.id);
    window.history.replaceState(null, '', url);
  };

  const contextMeta = getContextMeta(contextId, agent);
  /**
   * Nobody we can attach history to (yet). Includes the pre-hydration pass,
   * where there is no user because the session hasn't been read: showing a
   * History button in the server-rendered HTML and then taking it away is worse
   * than showing it a beat late.
   */
  const isAnonUser = !user || user.is_anonymous === true || gate.kind === 'anon-idle';

  const currentTier: Tier =
    gate.kind === 'subscriber' ? 'subscriber' : isAnonUser ? 'anon' : 'free';

  // Ask for feedback only once the conversation actually landed: the assistant
  // produced a prep summary, so the protocol ran to the end. Asking earlier would
  // measure our nagging, not our quality.
  const last = messages[messages.length - 1];
  const showFeedback =
    !feedbackDone &&
    !streaming &&
    Boolean(session) &&
    last?.role === 'assistant' &&
    last.content !== '' &&
    looksLikeDocument(last.content) &&
    !(chatId !== null && feedbackAsked(chatId));

  const finishFeedback = () => {
    setFeedbackDone(true);
    if (chatId) rememberFeedbackAsked(chatId);
  };

  /*
   * There is deliberately NO "Loading…" early return here.
   *
   * This component is server-rendered (client:load) while useSession() is still
   * loading, so whatever it returns on that first pass is what ships in the
   * static HTML of every mode page, /practice/guide and /practice/mentor. It
   * used to return a grey "Loading…" card, which meant a visitor arriving from
   * an ad that says "type your situation" got a hero and a placeholder box, with
   * no composer anywhere on the page, until the React chunk downloaded and
   * Supabase read localStorage. On a cold phone that is the whole visit.
   *
   * So `loading` renders the real thing instead: a live composer, no badge (the
   * badges below all require a resolved gate), and no History button. Sending is
   * safe from that state, because send() creates the anonymous session itself
   * and /api/chat is the only thing that decides what anyone may do.
   */

  // Only when anonymous chat isn't possible at all (Supabase unconfigured, or
  // the anonymous sign-in was refused). Everyone else gets a live composer.
  if (gate.kind === 'unavailable') {
    return (
      <div className="rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-card">
        <span className="text-3xl" aria-hidden="true">🔐</span>
        <h2 className="mt-3 font-heading text-xl font-bold text-ink-800">
          Sign in to talk to the {agentName}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
          {priceCopy.generic}
        </p>
        <a href={accountLink()} className="btn-primary mt-5 inline-block">
          Sign in or create an account
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-slate-100 bg-white shadow-card">
      {/* Status bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <div className="flex items-center gap-2.5">
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
        <div className="flex items-center gap-3">
          {gate.kind === 'free' && (
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              {gate.remaining} of {FREE_LIMIT} free messages left
            </span>
          )}
          {gate.kind === 'anon-idle' && (
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              {ANON_LIMIT} free messages, no account needed
            </span>
          )}
          {gate.kind === 'anon' && (
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              {gate.remaining} of {ANON_LIMIT} free messages left
            </span>
          )}
          {/* History belongs to an account; an anonymous visitor has nothing
              to browse yet, and offering it before signup only confuses. */}
          {!isAnonUser && (
            <button type="button" onClick={toggleHistory} className="btn-ghost text-xs">
              {showHistory ? 'Close history' : 'History'}
            </button>
          )}
          {messages.length > 0 && (
            <button type="button" onClick={newConversation} className="btn-ghost text-xs">
              New conversation
            </button>
          )}
        </div>
      </div>

      {/* Past conversations */}
      {showHistory && (
        <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Past conversations
          </p>
          {history === null ? (
            <p className="mt-2 text-sm text-slate-400">Loading…</p>
          ) : history.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              Nothing here yet. Your conversations save automatically as you chat.
            </p>
          ) : (
            <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto">
              {history.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => openSaved(c)}
                    className="flex w-full items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white"
                  >
                    <span className="truncate font-medium text-ink-800">{c.title}</span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {new Date(c.updated_at).toLocaleDateString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <a
            href="/account"
            className="mt-2 inline-block text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            Manage all conversations in your account →
          </a>
        </div>
      )}

      {/*
        Active named context, but NOT when it only repeats the page around it.
        A mode page already says "Parent mode" in its eyebrow and its H1, and the
        status bar above carries the mode selector, so a third announcement of it
        was pure chrome sitting between a visitor and the composer, on the one
        screen where that space decides whether they ever type. It still shows on
        /practice/guide and after a demo hand-off, where the context is genuinely
        news.
      */}
      {contextMeta && contextId !== initialContext && (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-slate-100 bg-brand-50/60 px-5 py-2.5">
          <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
            {contextMeta.label}
          </span>
          <span className="text-xs text-slate-500">{contextMeta.description}</span>
        </div>
      )}

      {/* Transcript */}
      <div className="max-h-[32rem] space-y-4 overflow-y-auto px-5 py-4 sm:py-6">
        {messages.length === 0 && (
          <>
            <p className="text-sm leading-relaxed text-slate-500">{welcome}</p>
            {starters && <Starters starters={starters} onPick={pickStarter} />}
          </>
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

      {/* A Google sign-in that bounced back. Without this the upgrade card looks
          like it silently did nothing. */}
      {authNotice && (
        <div className="mx-5 mb-3 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <span>{authNotice.message}</span>{' '}
          <a
            href={accountLink()}
            className="font-semibold text-amber-900 underline hover:text-amber-950"
          >
            Sign in
          </a>
        </div>
      )}

      {/* Did this help? Asked once, when the conversation reached a summary. */}
      {showFeedback && (
        <FeedbackPrompt
          agent={agent}
          agentName={agentName}
          tier={currentTier}
          context={contextId}
          chatId={chatId}
          messageCount={messages.filter((m) => m.role === 'user').length}
          onDone={finishFeedback}
        />
      )}

      {/* Account prompt / paywall / composer */}
      {gate.kind === 'anon-exhausted' ? (
        <UpgradeAnonCard rateLimited={gate.rateLimited} />
      ) : gate.kind === 'paywalled' ? (
        <div className="border-t border-slate-100 p-6 text-center">
          <h3 className="font-heading text-lg font-bold text-ink-800">
            {priceCopy.paywallHeading}
          </h3>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate-600">
            {priceCopy.paywallBody}
          </p>
          <button
            type="button"
            onClick={startCheckout}
            disabled={checkoutBusy}
            className="btn-primary mt-4 disabled:opacity-60"
          >
            {checkoutBusy ? 'Opening checkout…' : priceCopy.subscribeCta}
          </button>
          <p className="mt-3 text-xs text-slate-500">
            Or{' '}
            <a href="/pricing" className="font-semibold text-brand-600 hover:text-brand-700">
              see all plans
            </a>
            , including annual.
          </p>
        </div>
      ) : (
        <Composer
          value={input}
          onChange={setInput}
          onSend={send}
          onStop={() => abortRef.current?.abort()}
          streaming={streaming}
          focusToken={focusToken}
          placeholder={`Message the ${agentName}…`}
        />
      )}
      {dialog}
    </div>
  );
}
