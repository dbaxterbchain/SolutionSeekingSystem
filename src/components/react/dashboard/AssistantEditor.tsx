import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MODE_CONTEXTS } from '../../../lib/contexts';
import type { AgentId } from '../../../lib/chatSessions';
import type { DocumentMeta } from '../../../lib/documents';
import {
  createAssistant,
  updateAssistant,
  deleteAssistant,
  shareAssistant,
  unshareAssistant,
  type Assistant,
} from '../../../lib/assistantsClient';
import { useDialog } from '../Dialog';

const MAX_INSTRUCTIONS = 8000;
const MAX_DOCS = 5;
const SETUP_BUDGET = 120_000;

/**
 * Create or edit a specialized assistant: name, base agent (locked after
 * create), an optional mode, custom instructions, and up to five knowledge
 * documents. Managers get a Share toggle for assistants they own.
 */
export default function AssistantEditor({
  open,
  onClose,
  editing,
  owned,
  documents,
  canShare,
  orgName,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** The assistant being edited, or null to create a new one. */
  editing: Assistant | null;
  /** Whether the current user owns `editing` (only owners can share). */
  owned: boolean;
  documents: DocumentMeta[] | null;
  canShare: boolean;
  orgName: string | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [agent, setAgent] = useState<AgentId>(editing?.base_agent ?? 'guide');
  const [context, setContext] = useState<string>(editing?.context ?? '');
  const [instructions, setInstructions] = useState(editing?.instructions ?? '');
  const [docIds, setDocIds] = useState<string[]>(editing?.documents.map((d) => d.id) ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useDialog();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!open || typeof document === 'undefined') return null;

  const modes = MODE_CONTEXTS.filter((m) => m.agents.includes(agent));
  const selectedDocs = (documents ?? []).filter((d) => docIds.includes(d.id));
  const usedChars = instructions.length + selectedDocs.reduce((s, d) => s + d.char_count, 0);
  const overBudget = usedChars > SETUP_BUDGET;

  const toggleDoc = (id: string) => {
    setDocIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < MAX_DOCS ? [...cur, id] : cur
    );
  };

  const save = async () => {
    if (!name.trim() || overBudget) return;
    setBusy(true);
    setError(null);
    try {
      const input = {
        name: name.trim(),
        base_agent: agent,
        context: context || null,
        instructions,
        document_ids: docIds,
      };
      if (editing) await updateAssistant(editing.id, input);
      else await createAssistant(input);
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleShare = async () => {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      if (editing.org_id) await unshareAssistant(editing.id);
      else await shareAssistant(editing.id);
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    const ok = await confirm({
      title: 'Delete this assistant?',
      message: `"${editing.name}" will be permanently removed${editing.org_id ? ' for everyone in the organization' : ''}. This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAssistant(editing.id);
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-ink-800/50 p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Edit assistant' : 'New assistant'}
        className="my-8 w-full max-w-lg rounded-3xl bg-white p-6 shadow-card-hover"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl font-bold text-ink-800">
            {editing ? 'Edit assistant' : 'New assistant'}
          </h2>
          <button type="button" onClick={onClose} className="btn-ghost px-2" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink-800" htmlFor="a-name">
              Name
            </label>
            <input
              id="a-name"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 80))}
              placeholder="e.g. Manager's Assistant"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div>
            <span className="mb-1 block text-sm font-semibold text-ink-800">Based on</span>
            <div className="flex gap-2">
              {(['guide', 'mentor'] as AgentId[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  disabled={Boolean(editing)}
                  onClick={() => {
                    setAgent(a);
                    setContext('');
                  }}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm capitalize ${
                    agent === a
                      ? 'border-brand-400 bg-brand-50 font-semibold text-brand-700'
                      : 'border-slate-200 text-slate-600 hover:border-brand-300'
                  } ${editing ? 'cursor-not-allowed opacity-70' : ''}`}
                >
                  {a}
                </button>
              ))}
            </div>
            {editing && (
              <p className="mt-1 text-xs text-slate-400">The base assistant can't change after creating.</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-ink-800" htmlFor="a-mode">
              Mode <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <select
              id="a-mode"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="">No mode</option>
              {modes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <label className="text-sm font-semibold text-ink-800" htmlFor="a-instructions">
                Instructions <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <span className="text-xs text-slate-400">
                {instructions.length.toLocaleString()} / {MAX_INSTRUCTIONS.toLocaleString()}
              </span>
            </div>
            <textarea
              id="a-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value.slice(0, MAX_INSTRUCTIONS))}
              rows={4}
              placeholder="How should this assistant behave? e.g. Always answer using our policies, and output plans as a numbered checklist."
              className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-sm font-semibold text-ink-800">
                Knowledge documents <span className="font-normal text-slate-400">(up to {MAX_DOCS})</span>
              </span>
              <span className={`text-xs ${overBudget ? 'text-red-600' : 'text-slate-400'}`}>
                {Math.round(usedChars / 1000)}k / {SETUP_BUDGET / 1000}k chars
              </span>
            </div>
            {documents === null ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : documents.length === 0 ? (
              <p className="text-sm text-slate-500">
                No documents yet. Upload some from the Documents panel first.
              </p>
            ) : (
              <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-xl border border-slate-100 p-1">
                {documents.map((d) => {
                  const on = docIds.includes(d.id);
                  const full = !on && docIds.length >= MAX_DOCS;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleDoc(d.id)}
                      disabled={full}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
                        on ? 'bg-brand-50 text-brand-700' : full ? 'text-slate-300' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span aria-hidden="true">{on ? '☑' : '☐'}</span>
                      <span className="truncate">{d.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-slate-400">
                        {Math.round(d.char_count / 1000)}k
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {editing && owned && canShare && (
            <button
              type="button"
              onClick={toggleShare}
              disabled={busy}
              className="w-full rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-60"
            >
              {editing.org_id
                ? `Stop sharing with ${orgName ?? 'the organization'}`
                : `Share with ${orgName ?? 'my organization'}`}
            </button>
          )}
          {editing && editing.org_id && (
            <p className="text-xs text-brand-600">
              Shared with {orgName ?? 'the organization'} — everyone with a seat can use it.
            </p>
          )}

          {error && <p className="text-sm text-amber-700">{error}</p>}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          {editing ? (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="text-sm font-semibold text-slate-400 hover:text-red-600 disabled:opacity-60"
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-ghost">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy || !name.trim() || overBudget}
              className="btn-primary disabled:opacity-60"
            >
              {busy ? 'Saving…' : editing ? 'Save' : 'Create'}
            </button>
          </div>
        </div>
      </div>
      {dialog}
    </div>,
    document.body
  );
}
