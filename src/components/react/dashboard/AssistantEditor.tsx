import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MODE_CONTEXTS } from '../../../lib/contexts';
import type { AgentId } from '../../../lib/chatSessions';
import type { DocumentMeta } from '../../../lib/documents';
import {
  createAssistant,
  updateAssistant,
  shareAssistant,
  unshareAssistant,
  moveAssistant,
  type Assistant,
  type OrgMembershipView,
} from '../../../lib/assistantsClient';

const MAX_INSTRUCTIONS = 8000;
const MAX_DOCS = 5;
const SETUP_BUDGET = 120_000;

/**
 * Create or edit a specialized assistant: name, base agent (locked after
 * create), an optional mode, custom instructions, and up to five knowledge
 * documents. A new assistant can start from a template (inheriting its setup
 * live); an owned one can be turned INTO a template. Managers get a Share
 * toggle for assistants they own.
 */
export default function AssistantEditor({
  open,
  onClose,
  editing,
  owned,
  documents,
  onUpload,
  memberships,
  activeOrgId,
  templates,
  startFromTemplate,
  onSaved,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  /** The assistant being edited, or null to create a new one. */
  editing: Assistant | null;
  /** Whether the current user owns `editing` (only owners can move/share). */
  owned: boolean;
  documents: DocumentMeta[] | null;
  /** Upload + register a file, returning the new document (auto-selected). */
  onUpload: (file: File) => Promise<DocumentMeta>;
  /** Every org the user belongs to (workspace targets: Personal + these). */
  memberships: OrgMembershipView[];
  /** The active workspace (null = Personal) — the default for a new assistant. */
  activeOrgId: string | null;
  /** Templates visible in the active workspace ("Start from" options). */
  templates: Assistant[];
  /** Pre-selected template for the "New from template" shortcut. */
  startFromTemplate: Assistant | null;
  onSaved: () => void;
  /**
   * Confirm + delete `editing` (owned by DashboardView so the sidebar and the
   * editor share one flow, including the page-attached confirmation). Resolves
   * true when deleted, false when the user cancelled.
   */
  onDelete?: () => Promise<boolean>;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [agent, setAgent] = useState<AgentId>(
    editing?.base_agent ?? startFromTemplate?.base_agent ?? 'guide'
  );
  const [context, setContext] = useState<string>(
    editing?.context ?? startFromTemplate?.context ?? ''
  );
  const [instructions, setInstructions] = useState(editing?.instructions ?? '');
  const [docIds, setDocIds] = useState<string[]>(editing?.documents.map((d) => d.id) ?? []);
  // Create only: the template this assistant is built on ('' = blank start).
  const [startFrom, setStartFrom] = useState<string>(startFromTemplate?.id ?? '');
  // Edit only (owners): whether this assistant is offered as a template.
  const [isTemplate, setIsTemplate] = useState<boolean>(editing?.is_template ?? false);
  // The workspace this assistant lives in (null = Personal). New → the active workspace.
  const [workspace, setWorkspace] = useState<string | null>(editing ? editing.org_id : activeOrgId);
  const [shareOn, setShareOn] = useState<boolean>(editing?.shared ?? false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Whether the user manages the selected workspace (only then can they share into it).
  const canManageWorkspace =
    workspace !== null && memberships.some((m) => m.orgId === workspace && m.role === 'manager');
  const workspaceName = memberships.find((m) => m.orgId === workspace)?.orgName ?? null;

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

  // The template whose setup this assistant inherits: the "Start from" choice
  // while creating, or the stored link while editing a child. Its footprint is
  // reserved in the budget (documents it already carries are not counted twice).
  const templateRow = editing
    ? editing.template_id
      ? (templates.find((t) => t.id === editing.template_id) ?? null)
      : null
    : startFrom
      ? (templates.find((t) => t.id === startFrom) ?? null)
      : null;
  const templateDocIds = new Set(templateRow?.documents.map((d) => d.id) ?? []);
  const templateReserve = templateRow
    ? templateRow.instructions.length + templateRow.documents.reduce((s, d) => s + d.char_count, 0)
    : 0;
  const usedChars =
    instructions.length +
    templateReserve +
    selectedDocs.reduce((s, d) => s + (templateDocIds.has(d.id) ? 0 : d.char_count), 0);
  const overBudget = usedChars > SETUP_BUDGET;

  const pickTemplate = (id: string) => {
    setStartFrom(id);
    const t = templates.find((x) => x.id === id);
    if (t) {
      // Composition assumes one persona: the base agent follows the template,
      // and the mode starts from the template's (still overridable).
      setAgent(t.base_agent);
      setContext(t.context ?? '');
      setWorkspace(activeOrgId);
    }
  };

  const toggleDoc = (id: string) => {
    setDocIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < MAX_DOCS ? [...cur, id] : cur
    );
  };

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const doc = await onUpload(files[0]);
      setDocIds((cur) => (cur.includes(doc.id) || cur.length >= MAX_DOCS ? cur : [...cur, doc.id]));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
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
      if (!editing) {
        // New assistants are created in the chosen workspace, never auto-shared.
        await createAssistant({ ...input, template_id: startFrom || null }, workspace);
      } else {
        await updateAssistant(editing.id, {
          ...input,
          ...(owned && !editing.template_id ? { is_template: isTemplate } : {}),
        });
        // A workspace change moves the assistant (server resets sharing on a move).
        const moved = workspace !== editing.org_id;
        if (moved) await moveAssistant(editing.id, workspace);
        // Reconcile sharing with the toggle: only meaningful for an org the user manages.
        const currentlyShared = moved ? false : editing.shared;
        const wantShared = workspace !== null && shareOn && canManageWorkspace;
        if (wantShared && !currentlyShared) await shareAssistant(editing.id);
        else if (!wantShared && currentlyShared) await unshareAssistant(editing.id);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing || !onDelete) return;
    setBusy(true);
    setError(null);
    try {
      const deleted = await onDelete();
      if (deleted) {
        onClose();
        return;
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
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
          {!editing && templates.length > 0 && (
            <div>
              <label className="mb-1 block text-sm font-semibold text-ink-800" htmlFor="a-template">
                Start from
              </label>
              <select
                id="a-template"
                value={startFrom}
                onChange={(e) => pickTemplate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                <option value="">Blank assistant</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (template)
                  </option>
                ))}
              </select>
              {startFrom && (
                <p className="mt-1 text-xs text-slate-400">
                  Inherits the template's instructions and documents, now and whenever the template
                  changes. Add this assistant's own on top.
                </p>
              )}
            </div>
          )}

          {editing && templateRow && (
            <p className="rounded-xl bg-violet-50 px-3 py-2 text-xs leading-relaxed text-violet-700">
              Built on <span className="font-semibold">{templateRow.name}</span>. It inherits that
              template's instructions and documents; edits to the template reach this assistant
              automatically.
            </p>
          )}
          {editing && !templateRow && editing.template_id && (
            <p className="rounded-xl bg-violet-50 px-3 py-2 text-xs leading-relaxed text-violet-700">
              Built on a template it inherits instructions and documents from.
            </p>
          )}

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
                  disabled={Boolean(editing) || Boolean(startFrom)}
                  onClick={() => {
                    setAgent(a);
                    setContext('');
                  }}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm capitalize ${
                    agent === a
                      ? 'border-brand-400 bg-brand-50 font-semibold text-brand-700'
                      : 'border-slate-200 text-slate-600 hover:border-brand-300'
                  } ${editing || startFrom ? 'cursor-not-allowed opacity-70' : ''}`}
                >
                  {a}
                </button>
              ))}
            </div>
            {editing && (
              <p className="mt-1 text-xs text-slate-400">The base assistant can't change after creating.</p>
            )}
            {!editing && startFrom && (
              <p className="mt-1 text-xs text-slate-400">Follows the template's base assistant.</p>
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
                {templateReserve > 0 && ` (incl. ${Math.round(templateReserve / 1000)}k template)`}
              </span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => upload(e.target.files)}
            />
            {documents !== null && documents.length > 0 && (
              <div className="mb-1 max-h-40 space-y-0.5 overflow-y-auto rounded-xl border border-slate-100 p-1">
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
            {documents !== null && documents.length === 0 && (
              <p className="mb-1 text-sm text-slate-500">No documents yet.</p>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="text-xs font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : '+ Upload a document'}
            </button>
          </div>

          {/* Workspace + sharing. Owners choose which workspace an assistant lives in;
              a manager of that org can also share it with everyone there. */}
          {owned && (memberships.length > 0 || workspace !== null) && (
            <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-800" htmlFor="a-workspace">
                  Workspace
                </label>
                <select
                  id="a-workspace"
                  value={workspace ?? ''}
                  disabled={Boolean(startFrom)}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setWorkspace(v);
                    if (v === null) setShareOn(false);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:opacity-60"
                >
                  <option value="">Personal (only you)</option>
                  {/* Client seats consume, they don't author into the org. */}
                  {memberships
                    .filter((m) => m.role !== 'client')
                    .map((m) => (
                      <option key={m.orgId} value={m.orgId}>
                        {m.orgName}
                        {m.role === 'manager' ? ' (manager)' : ''}
                      </option>
                    ))}
                </select>
                <p className="mt-1 text-xs text-slate-400">
                  {startFrom
                    ? 'Lives in the same workspace as its template.'
                    : 'Only shows in this workspace. Documents you attach follow the same rule.'}
                </p>
              </div>
              {editing && workspace !== null && (
                <label
                  className={`flex items-start gap-2 text-xs ${canManageWorkspace ? 'text-ink-700' : 'text-slate-400'}`}
                >
                  <input
                    type="checkbox"
                    checked={shareOn && canManageWorkspace}
                    disabled={!canManageWorkspace}
                    onChange={(e) => setShareOn(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    Share with everyone in {workspaceName ?? 'this organization'}
                    {!canManageWorkspace && ' (managers only)'}
                  </span>
                </label>
              )}
              {!editing && workspace !== null && (
                <p className="text-xs text-slate-400">You can share it with the organization after creating it.</p>
              )}
            </div>
          )}

          {editing && owned && !editing.template_id && (
            <label className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 text-xs text-ink-700">
              <input
                type="checkbox"
                checked={isTemplate}
                disabled={isTemplate && editing.child_count > 0}
                onChange={(e) => setIsTemplate(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-semibold">Use as a template.</span> New assistants can be
                built on it and inherit its instructions and documents. Editing the template
                updates all of them.
                {isTemplate && editing.child_count > 0 && (
                  <span className="text-slate-400">
                    {' '}
                    (In use by {editing.child_count}{' '}
                    {editing.child_count === 1 ? 'assistant' : 'assistants'}.)
                  </span>
                )}
              </span>
            </label>
          )}

          {error && <p className="text-sm text-amber-700">{error}</p>}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          {editing && onDelete ? (
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
    </div>,
    document.body
  );
}
