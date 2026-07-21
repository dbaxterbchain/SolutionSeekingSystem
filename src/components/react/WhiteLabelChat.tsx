import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../lib/useSession';
import { isSupabaseConfigured } from '../../lib/supabase';
import { accountLink } from '../../lib/accountLink';
import { streamChat } from '../../lib/chatStream';
import {
  createChatSession,
  updateChatSession,
  listChatSessions,
  type AgentId,
  type ChatMessage,
  type ChatSession,
} from '../../lib/chatSessions';
import MessageBubble from './chat/MessageBubble';
import Composer from './chat/Composer';

const SENT_HISTORY_LIMIT = 30;

interface Props {
  slug: string;
  orgId: string;
  assistantId: string | null;
  agent: AgentId | null;
  context: string | null;
  title: string;
  assistantName: string | null;
}

/**
 * The chat surface on a white-label page. Sign-in is required (no anonymous
 * trial here); the page's assistant or agent is fixed by the org. History is the
 * signed-in user's own (chat_sessions RLS), filtered to this page.
 */
export default function WhiteLabelChat({
  slug,
  orgId,
  assistantId,
  agent,
  context,
  title,
  assistantName,
}: Props) {
  const { session, user, loading } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ChatSession[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const displayName = assistantName ?? title;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);

  /** A saved conversation belongs to this page if its target matches. */
  const matchesPage = (c: ChatSession) =>
    assistantId
      ? c.assistant_id === assistantId
      : c.assistant_id === null && c.agent === agent && (c.context ?? null) === (context ?? null);

  const persist = async (next: ChatMessage[]) => {
    try {
      if (chatId) {
        await updateChatSession(chatId, { messages: next });
      } else {
        const t = next.find((m) => m.role === 'user')?.content.slice(0, 60) ?? 'Untitled';
        const created = await createChatSession({
          agent: agent ?? 'guide',
          title: t,
          messages: next,
          context,
          assistant_id: assistantId,
        });
        setChatId(created.id);
      }
    } catch {
      // Best-effort; the conversation still lives in state.
    }
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
    try {
      const result = await streamChat({
        accessToken: session.access_token,
        payload: {
          agent: agent ?? 'guide',
          messages: next.slice(-SENT_HISTORY_LIMIT),
          ...(assistantId ? { assistant_id: assistantId } : context ? { context } : {}),
        },
        signal: ctrl.signal,
        onDelta: (t) => setMessages([...next, { role: 'assistant', content: t }]),
      });
      switch (result.kind) {
        case 'done': {
          const finished: ChatMessage[] = [...next, { role: 'assistant', content: result.text }];
          setMessages(finished);
          await persist(finished);
          return;
        }
        case 'assistant_not_found':
        case 'subscription_required':
          setMessages(next);
          setDenied(true);
          return;
        case 'unauthorized':
          setMessages(next);
          setError('Your session expired. Please reload the page and sign in again.');
          return;
        default:
          setMessages(next);
          setError('Something went wrong. Please retry.');
          return;
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setMessages((cur) => {
          const kept = cur.filter((m, i) => !(i === cur.length - 1 && m.content === ''));
          void persist(kept);
          return kept;
        });
      } else {
        setMessages(next);
        setError((err as Error).message || 'Something went wrong. Please retry.');
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const toggleHistory = () => {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setShowHistory(true);
    listChatSessions()
      .then((all) => setHistory(all.filter(matchesPage)))
      .catch(() => setHistory([]));
  };

  const openSaved = (c: ChatSession) => {
    setChatId(c.id);
    setMessages(c.messages);
    setShowHistory(false);
    setDenied(false);
    setError(null);
  };

  if (loading) {
    return <Card>Loading…</Card>;
  }
  if (!isSupabaseConfigured) {
    return <Card>This page is unavailable right now. Please try again later.</Card>;
  }

  if (!session || !user || user.is_anonymous) {
    return (
      <Card>
        <h2 className="font-heading text-lg font-bold text-ink-800">Sign in to use {title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
          Sign in with the email your organization gave you. Your conversations stay private to you.
        </p>
        <a href={accountLink({ next: `/a/${orgId}/${slug}` })} className="btn-primary mt-4 inline-block">
          Sign in
        </a>
      </Card>
    );
  }

  if (denied) {
    return (
      <Card>
        <h2 className="font-heading text-lg font-bold text-ink-800">You don't have access yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
          Ask your organization to add your email address, or subscribe to use the assistants yourself.
        </p>
        <a href="/pricing" className="btn-secondary mt-4 inline-block">
          See plans
        </a>
      </Card>
    );
  }

  return (
    <div className="rounded-3xl border border-slate-100 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <p className="text-sm font-semibold text-ink-800">{displayName}</p>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                setChatId(null);
                setError(null);
              }}
              className="btn-ghost text-xs"
            >
              New conversation
            </button>
          )}
          <button type="button" onClick={toggleHistory} className="btn-ghost text-xs">
            {showHistory ? 'Close history' : 'History'}
          </button>
        </div>
      </div>

      {showHistory && (
        <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-3">
          {history === null ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing here yet. Your conversations save as you chat.</p>
          ) : (
            <ul className="max-h-48 space-y-0.5 overflow-y-auto">
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
        </div>
      )}

      <div className="max-h-[28rem] min-h-[16rem] space-y-4 overflow-y-auto px-5 py-6">
        {messages.length === 0 && (
          <p className="text-sm leading-relaxed text-slate-500">Start a conversation with {displayName}.</p>
        )}
        {messages.map((m, i) => (
          <MessageBubble
            key={i}
            message={m}
            streaming={streaming && i === messages.length - 1}
            agentName={displayName}
          />
        ))}
        <div ref={bottomRef} />
      </div>

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
        placeholder={`Message ${displayName}…`}
      />
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-card">{children}</div>
  );
}
