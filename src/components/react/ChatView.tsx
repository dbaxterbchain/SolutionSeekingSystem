import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSession } from '../../lib/useSession';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { accountLink } from '../../lib/accountLink';
import { ENTITLED_STATUSES } from '../../lib/subscription';
import {
  createChatSession,
  getChatSession,
  listChatSessions,
  updateChatSession,
  type AgentId,
  type ChatMessage,
  type ChatSession,
} from '../../lib/chatSessions';
import { getContextMeta } from '../../lib/contexts';

const FREE_LIMIT = 10;
/** Client-side truncation guard: send at most the last N messages. */
const SENT_HISTORY_LIMIT = 30;

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
}

type Gate =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'subscriber' }
  | { kind: 'free'; remaining: number }
  | { kind: 'paywalled' };

export default function ChatView({ agent, agentName, welcome, initialContext }: Props) {
  const { session, user, loading } = useSession();
  const [gate, setGate] = useState<Gate>({ kind: 'loading' });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  // Named context seeding the conversation. New conversations take it from
  // ?context= (falling back to the initialContext prop); resumed ones take it
  // from the saved row, which is authoritative whenever ?chat= is present.
  const [contextId, setContextId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    if (params.get('chat')) return null;
    const id = params.get('context') ?? initialContext ?? null;
    return getContextMeta(id, agent) ? id : null;
  });
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ChatSession[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // On touch devices Enter should insert a newline; sending is the button's job.
  const [coarsePointer] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  );

  // Grow the composer with its content (up to ~6 lines), shrink when cleared.
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  // Resolve the entitlement gate whenever auth state settles.
  useEffect(() => {
    if (loading) return;
    if (!user || !isSupabaseConfigured) {
      setGate({ kind: 'signed-out' });
      return;
    }
    let active = true;
    (async () => {
      const [{ data: sub }, { data: usage }] = await Promise.all([
        supabase.from('subscriptions').select('status').maybeSingle(),
        supabase.from('ai_usage').select('free_messages_used').maybeSingle(),
      ]);
      if (!active) return;
      if (sub && ENTITLED_STATUSES.includes(sub.status)) {
        setGate({ kind: 'subscriber' });
      } else {
        const used = usage?.free_messages_used ?? 0;
        setGate(
          used < FREE_LIMIT
            ? { kind: 'free', remaining: FREE_LIMIT - used }
            : { kind: 'paywalled' }
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [loading, user?.id]);

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

  const send = () => {
    const text = input.trim();
    if (!text || streaming || !session) return;
    setInput('');
    void deliver([...messages, { role: 'user', content: text }]);
  };

  /** Re-send the transcript after a failure (the user message is already in it). */
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

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          agent,
          messages: next.slice(-SENT_HISTORY_LIMIT),
          // Sent on every request (it's state, not a message) so the seed
          // survives the history trim above.
          ...(contextId ? { context: contextId } : {}),
        }),
      });

      if (res.status === 401) {
        setGate({ kind: 'signed-out' });
        setMessages(next);
        return;
      }
      if (res.status === 403) {
        setGate({ kind: 'paywalled' });
        setMessages(next);
        return;
      }
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message ?? 'Something went wrong. Please try again.');
      }

      const remainingHeader = res.headers.get('X-Free-Messages-Remaining');
      if (remainingHeader !== null) {
        setGate({ kind: 'free', remaining: Number(remainingHeader) });
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistant = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        assistant += decoder.decode(value, { stream: true });
        setMessages([...next, { role: 'assistant', content: assistant }]);
      }
      const finished: ChatMessage[] = [...next, { role: 'assistant', content: assistant }];
      setMessages(finished);
      await persist(finished);
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
            ? 'Connection problem — your message wasn’t sent. Check your internet and retry.'
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
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
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
    const url = new URL(window.location.href);
    url.searchParams.delete('chat');
    url.searchParams.delete('context');
    window.history.replaceState(null, '', url);
  };

  const toggleHistory = () => {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setShowHistory(true);
    listChatSessions()
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
    const url = new URL(window.location.href);
    url.searchParams.set('chat', saved.id);
    window.history.replaceState(null, '', url);
  };

  const contextMeta = getContextMeta(contextId, agent);

  if (loading || (user && gate.kind === 'loading')) {
    return (
      <div className="rounded-3xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-500 shadow-card">
        Loading…
      </div>
    );
  }

  if (gate.kind === 'signed-out') {
    return (
      <div className="rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-card">
        <span className="text-3xl" aria-hidden="true">🔐</span>
        <h2 className="mt-3 font-heading text-xl font-bold text-ink-800">
          Sign in to talk to the {agentName}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
          Accounts are free, and your first {FREE_LIMIT} messages are on us. After that, a
          $5/month subscription unlocks unlimited conversations with both assistants.
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
        <p className="text-sm font-semibold text-ink-800">{agentName}</p>
        <div className="flex items-center gap-3">
          {gate.kind === 'free' && (
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              {gate.remaining} of {FREE_LIMIT} free messages left
            </span>
          )}
          <button type="button" onClick={toggleHistory} className="btn-ghost text-xs">
            {showHistory ? 'Close history' : 'History'}
          </button>
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
              Nothing here yet — your conversations save automatically as you chat.
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
      <div className="max-h-[32rem] space-y-4 overflow-y-auto px-5 py-6">
        {messages.length === 0 && (
          <p className="text-sm leading-relaxed text-slate-500">{welcome}</p>
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

      {/* Paywall / composer */}
      {gate.kind === 'paywalled' ? (
        <div className="border-t border-slate-100 p-6 text-center">
          <h3 className="font-heading text-lg font-bold text-ink-800">
            You've used your {FREE_LIMIT} free messages
          </h3>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate-600">
            Subscribe for $5/month to get unlimited conversations with both the Guide and the
            Mentor. Cancel anytime.
          </p>
          <button
            type="button"
            onClick={startCheckout}
            disabled={checkoutBusy}
            className="btn-primary mt-4 disabled:opacity-60"
          >
            {checkoutBusy ? 'Opening checkout…' : 'Subscribe — $5/month'}
          </button>
        </div>
      ) : (
        <form
          className="flex items-end gap-3 border-t border-slate-100 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Desktop: Enter sends, Shift+Enter for a newline. Touch
              // devices: Enter is always a newline; the button sends.
              if (e.key === 'Enter' && !e.shiftKey && !coarsePointer) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={`Message the ${agentName}…`}
            className="max-h-40 min-h-[2.75rem] flex-1 resize-none overflow-y-auto rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {streaming ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="btn-secondary shrink-0"
            >
              Stop
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} className="btn-primary shrink-0 disabled:opacity-60">
              Send
            </button>
          )}
        </form>
      )}
    </div>
  );
}

function MessageBubble({
  message,
  streaming,
  agentName,
}: {
  message: ChatMessage;
  streaming: boolean;
  agentName: string;
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand-500 px-4 py-2.5 text-sm leading-relaxed text-white">
          {message.content}
        </div>
      </div>
    );
  }

  const looksLikeDocument = /^##\s/m.test(message.content);
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
        {message.content === '' && streaming ? (
          <span className="text-slate-400">{agentName} is thinking…</span>
        ) : (
          <Markdown text={message.content} />
        )}
        {!streaming && message.content !== '' && (
          <MessageActions content={message.content} showDocumentActions={looksLikeDocument} />
        )}
      </div>
    </div>
  );
}

function MessageActions({
  content,
  showDocumentActions,
}: {
  content: string;
  showDocumentActions: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'solution-seeking-summary.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const print = () => {
    const w = window.open('', '_blank', 'width=720,height=900');
    if (!w) return;
    w.document.title = 'Solution Seeking System';
    const body = w.document.body;
    body.style.cssText =
      'font-family:Georgia,serif;max-width:42rem;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#1e293b';
    const pre = w.document.createElement('pre');
    pre.style.cssText = 'white-space:pre-wrap;font-family:inherit';
    pre.textContent = content;
    body.appendChild(pre);
    w.print();
  };

  return (
    <div className="mt-3 flex flex-wrap gap-3 border-t border-slate-200/70 pt-2 text-xs">
      <button type="button" onClick={copy} className="font-semibold text-brand-600 hover:text-brand-700">
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
      {showDocumentActions && (
        <>
          <button type="button" onClick={download} className="font-semibold text-brand-600 hover:text-brand-700">
            Download .md
          </button>
          <button type="button" onClick={print} className="font-semibold text-brand-600 hover:text-brand-700">
            Print
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Tiny markdown-subset renderer building React elements directly (no
 * dangerouslySetInnerHTML, so XSS-safe by construction). Covers headings,
 * bold/italic, bullet + numbered lists, blockquotes, and horizontal rules;
 * anything else renders as plain paragraphs.
 */
function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split('\n');
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = (key: number) => {
    if (!list) return;
    const items = list.items.map((item, i) => <li key={i}>{inline(item)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={`l${key}`} className="ml-5 list-decimal space-y-1">{items}</ol>
      ) : (
        <ul key={`l${key}`} className="ml-5 list-disc space-y-1">{items}</ul>
      )
    );
    list = null;
  };

  lines.forEach((line, i) => {
    const bullet = /^[-*]\s+(.*)/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) {
        flushList(i);
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]);
      return;
    }
    flushList(i);

    if (/^\s*$/.test(line)) return;
    const heading = /^(#{2,4})\s+(.*)/.exec(line);
    if (heading) {
      const cls =
        heading[1].length === 2
          ? 'mt-4 font-heading text-base font-bold text-ink-800'
          : 'mt-3 font-heading text-sm font-bold text-ink-800';
      blocks.push(
        <p key={i} className={cls}>
          {inline(heading[2])}
        </p>
      );
      return;
    }
    if (/^---+\s*$/.test(line)) {
      blocks.push(<hr key={i} className="my-3 border-slate-200" />);
      return;
    }
    const quote = /^>\s?(.*)/.exec(line);
    if (quote) {
      blocks.push(
        <p key={i} className="border-l-2 border-brand-200 pl-3 italic text-slate-600">
          {inline(quote[1])}
        </p>
      );
      return;
    }
    blocks.push(<p key={i}>{inline(line)}</p>);
  });
  flushList(lines.length);

  return <div className="space-y-2">{blocks}</div>;
}

/** Inline **bold** and *italic* within a line. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}
