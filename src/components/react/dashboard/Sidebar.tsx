import type { AgentId, ChatSession } from '../../../lib/chatSessions';
import { getContextMeta } from '../../../lib/contexts';

/**
 * The dashboard's left rail: pick an assistant, start a new chat, or reopen a
 * recent conversation. Presentational only — DashboardView owns all state and
 * passes callbacks. Specialized-assistant sections arrive in Phase C.
 */

const AGENTS: { id: AgentId; label: string; blurb: string }[] = [
  { id: 'guide', label: 'Guide', blurb: 'Walk through a real conversation, step by step.' },
  { id: 'mentor', label: 'Mentor', blurb: 'Learn and apply the whole system.' },
];

export default function Sidebar({
  agent,
  onSelectAgent,
  onNewChat,
  onOpenDocuments,
  recents,
  activeChatId,
  onOpenChat,
  onDeleteChat,
}: {
  agent: AgentId;
  onSelectAgent: (agent: AgentId) => void;
  onNewChat: () => void;
  onOpenDocuments: () => void;
  recents: ChatSession[] | null;
  activeChatId: string | null;
  onOpenChat: (c: ChatSession) => void;
  onDeleteChat: (c: ChatSession) => void;
}) {
  return (
    <div className="flex h-full flex-col gap-5 rounded-3xl border border-slate-100 bg-white p-4 shadow-card">
      <div>
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Assistants
        </p>
        <div className="mt-2 space-y-1">
          {AGENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onSelectAgent(a.id)}
              aria-current={agent === a.id ? 'true' : undefined}
              className={`block w-full rounded-xl px-3 py-2 text-left transition-colors ${
                agent === a.id
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-ink-800'
              }`}
            >
              <span className="block text-sm font-semibold">{a.label}</span>
              <span className="mt-0.5 block text-xs text-slate-400">{a.blurb}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <button type="button" onClick={onNewChat} className="btn-secondary w-full text-sm">
          + New chat
        </button>
        <button
          type="button"
          onClick={onOpenDocuments}
          className="w-full rounded-xl px-3 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-50 hover:text-ink-800"
        >
          📎 Documents
        </button>
      </div>

      <div className="min-h-0 flex-1">
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Recent conversations
        </p>
        {recents === null ? (
          <p className="mt-2 px-1 text-sm text-slate-400">Loading…</p>
        ) : recents.length === 0 ? (
          <p className="mt-2 px-1 text-sm text-slate-500">
            Nothing yet. Your conversations save automatically as you chat.
          </p>
        ) : (
          <ul className="mt-2 space-y-0.5 overflow-y-auto">
            {recents.map((c) => {
              const mode = getContextMeta(c.context, c.agent);
              return (
                <li key={c.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onOpenChat(c)}
                    aria-current={activeChatId === c.id ? 'true' : undefined}
                    className={`block w-full rounded-lg px-2 py-1.5 pr-8 text-left transition-colors ${
                      activeChatId === c.id ? 'bg-brand-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className="block truncate text-sm font-medium text-ink-800">
                      {c.title}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                      <span className="capitalize">{c.agent}</span>
                      {mode && (
                        <span className="rounded-full bg-brand-50 px-1.5 py-0.5 font-semibold text-brand-600">
                          {mode.label}
                        </span>
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteChat(c)}
                    aria-label={`Delete ${c.title}`}
                    className="absolute right-1.5 top-1.5 rounded-md px-1.5 py-1 text-xs text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-600 focus:opacity-100 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <a
        href="/account"
        className="border-t border-slate-100 px-1 pt-3 text-xs font-semibold text-brand-600 hover:text-brand-700"
      >
        Account & billing →
      </a>
    </div>
  );
}
