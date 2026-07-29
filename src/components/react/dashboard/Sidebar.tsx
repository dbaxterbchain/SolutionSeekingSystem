import type { AgentId, ChatSession } from '../../../lib/chatSessions';
import { getContextMeta } from '../../../lib/contexts';
import type { Assistant } from '../../../lib/assistantsClient';
import RowMenu, { type RowMenuItem } from './RowMenu';

/**
 * The dashboard's left rail: pick a standard agent or a specialized assistant,
 * start a new chat, manage documents, or reopen a recent conversation.
 * Presentational only — DashboardView owns all state and passes callbacks.
 */

const AGENTS: { id: AgentId; label: string; blurb: string }[] = [
  { id: 'guide', label: 'Guide', blurb: 'Walk through a real conversation, step by step.' },
  { id: 'mentor', label: 'Mentor', blurb: 'Learn and apply the whole system.' },
];

export type Selection = { kind: 'agent'; agent: AgentId } | { kind: 'assistant'; id: string };

interface OrgOption {
  orgId: string;
  orgName: string;
  role: 'member' | 'manager';
}

export default function Sidebar({
  onClose,
  selection,
  onSelectAgent,
  onSelectAssistant,
  onEditAssistant,
  onDuplicateAssistant,
  onDeleteAssistant,
  onNewAssistant,
  onOpenDocuments,
  onOpenWhiteLabel,
  onOpenOrgSettings,
  canManageOrg,
  memberships,
  activeOrgId,
  onSelectOrg,
  mine,
  shared,
  onOpenSharing,
  orgName,
  recents,
  activeChatId,
  onOpenChat,
  onDeleteChat,
}: {
  /** Close the mobile drawer (no-op on desktop). */
  onClose: () => void;
  selection: Selection;
  onSelectAgent: (agent: AgentId) => void;
  onSelectAssistant: (a: Assistant) => void;
  onEditAssistant: (a: Assistant) => void;
  onDuplicateAssistant: (a: Assistant) => void;
  onDeleteAssistant: (a: Assistant) => void;
  onNewAssistant: () => void;
  onOpenDocuments: () => void;
  onOpenWhiteLabel: () => void;
  onOpenOrgSettings: () => void;
  canManageOrg: boolean;
  memberships: OrgOption[];
  /** The active workspace: null = Personal, else an org id. */
  activeOrgId: string | null;
  onSelectOrg: (orgId: string | null) => void;
  mine: Assistant[];
  shared: Assistant[];
  /** Open the sharing dialog for an assistant in the active org workspace. */
  onOpenSharing: (a: Assistant) => void;
  orgName: string | null;
  recents: ChatSession[] | null;
  activeChatId: string | null;
  onOpenChat: (c: ChatSession) => void;
  onDeleteChat: (c: ChatSession) => void;
}) {
  const assistantsById = new Map<string, Assistant>();
  for (const a of [...mine, ...shared]) assistantsById.set(a.id, a);

  const assistantActive = (id: string) => selection.kind === 'assistant' && selection.id === id;

  const AssistantRow = ({ a, editable }: { a: Assistant; editable: boolean }) => {
    // Managers co-manage rows that are shared somehow (org-wide or with
    // specific people); a fully private draft stays its owner's alone.
    const manageable =
      editable ||
      (canManageOrg && activeOrgId !== null && (a.shared || a.member_share_ids.length > 0));
    // Sharing is manager-only, and only meaningful inside an org workspace.
    const canShare = manageable && activeOrgId !== null && canManageOrg;
    const items: RowMenuItem[] = [];
    if (manageable) {
      items.push({ label: 'Edit', onSelect: () => onEditAssistant(a) });
      items.push({ label: 'Duplicate', onSelect: () => onDuplicateAssistant(a) });
    }
    if (canShare) {
      items.push({ label: 'Sharing…', onSelect: () => onOpenSharing(a) });
    }
    if (manageable) {
      items.push({ label: 'Delete', tone: 'danger', onSelect: () => onDeleteAssistant(a) });
    }
    return (
      <div className="group relative">
        <button
          type="button"
          onClick={() => onSelectAssistant(a)}
          aria-current={assistantActive(a.id) ? 'true' : undefined}
          className={`block w-full rounded-xl px-3 py-2 ${items.length > 0 ? 'pr-9' : 'pr-3'} text-left transition-colors ${
            assistantActive(a.id) ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-ink-800'
          }`}
        >
          <span className="block truncate text-sm font-semibold">{a.name}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs capitalize text-slate-400">
            {a.base_agent}
            {a.shared ? (
              <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[0.65rem] font-semibold normal-case text-brand-600">
                Shared
              </span>
            ) : a.member_share_ids.length > 0 ? (
              <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[0.65rem] font-semibold normal-case text-brand-600">
                Shared with {a.member_share_ids.length}
              </span>
            ) : a.member_shared ? (
              <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[0.65rem] font-semibold normal-case text-brand-600">
                Shared with you
              </span>
            ) : null}
          </span>
        </button>
        {items.length > 0 && (
          <div className="absolute right-1.5 top-1.5">
            <RowMenu label={`Actions for ${a.name}`} items={items} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden rounded-3xl border border-slate-100 bg-white p-4 shadow-card">
      <button
        type="button"
        onClick={onClose}
        className="self-end rounded-full px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600 lg:hidden"
        aria-label="Close menu"
      >
        ✕
      </button>
      {memberships.length >= 1 && (
        <div>
          <label
            htmlFor="org-switch"
            className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400"
          >
            Workspace
          </label>
          <select
            id="org-switch"
            value={activeOrgId ?? ''}
            onChange={(e) => onSelectOrg(e.target.value || null)}
            className="mt-1 w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-ink-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="">Personal</option>
            {memberships.map((m) => (
              <option key={m.orgId} value={m.orgId}>
                {m.orgName}
                {m.role === 'manager' ? ' (manager)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        <div>
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Assistants</p>
          <div className="mt-2 space-y-1">
            {AGENTS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onSelectAgent(a.id)}
                aria-current={selection.kind === 'agent' && selection.agent === a.id ? 'true' : undefined}
                className={`block w-full rounded-xl px-3 py-2 text-left transition-colors ${
                  selection.kind === 'agent' && selection.agent === a.id
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

        {mine.length > 0 && (
          <div>
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">My assistants</p>
            <div className="mt-2 space-y-1">
              {mine.map((a) => (
                <AssistantRow key={a.id} a={a} editable />
              ))}
            </div>
          </div>
        )}

        {shared.length > 0 && (
          <div>
            <p className="truncate px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Shared with {orgName ?? 'your org'}
            </p>
            <div className="mt-2 space-y-1">
              {shared.map((a) => (
                <AssistantRow key={a.id} a={a} editable={false} />
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Recent conversations</p>
          {recents === null ? (
            <p className="mt-2 px-1 text-sm text-slate-400">Loading…</p>
          ) : recents.length === 0 ? (
            <p className="mt-2 px-1 text-sm text-slate-500">
              Nothing yet. Your conversations save automatically as you chat.
            </p>
          ) : (
            <ul className="mt-2 space-y-0.5">
              {recents.map((c) => {
                const mode = getContextMeta(c.context, c.agent);
                const viaAssistant = c.assistant_id ? assistantsById.get(c.assistant_id) : undefined;
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
                      <span className="block truncate text-sm font-medium text-ink-800">{c.title}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                        <span className="truncate">{viaAssistant ? viaAssistant.name : c.agent}</span>
                        {!viaAssistant && mode && (
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
                      className="absolute right-1.5 top-1.5 rounded-md px-1.5 py-1 text-xs text-slate-400 opacity-100 transition-opacity hover:bg-slate-100 hover:text-slate-600 focus:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-1.5 border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={onNewAssistant}
          className="btn-secondary w-full text-sm"
        >
          ✨ Create assistant
        </button>
        <button
          type="button"
          onClick={onOpenDocuments}
          className="w-full rounded-xl px-3 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-50 hover:text-ink-800"
        >
          📎 Documents
        </button>
        {canManageOrg && (
          <button
            type="button"
            onClick={onOpenWhiteLabel}
            className="w-full rounded-xl px-3 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-50 hover:text-ink-800"
          >
            🏷️ White-label pages
          </button>
        )}
        {canManageOrg && (
          <button
            type="button"
            onClick={onOpenOrgSettings}
            className="w-full rounded-xl px-3 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-50 hover:text-ink-800"
          >
            🏢 Organization settings
          </button>
        )}
        <a
          href="/account"
          className="block px-3 pt-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
        >
          Account & billing →
        </a>
      </div>
    </div>
  );
}
