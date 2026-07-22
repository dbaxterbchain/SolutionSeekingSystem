import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MODE_CONTEXTS } from '../../../lib/contexts';
import type { AgentId } from '../../../lib/chatSessions';
import type { Assistant } from '../../../lib/assistantsClient';
import {
  fetchPages,
  createPage,
  updatePage,
  setPageStatus,
  deletePage,
  uploadLogo,
  type WhiteLabelPageView,
  type WhiteLabelInput,
} from '../../../lib/whiteLabelClient';
import { useDialog } from '../Dialog';

/** CNAME target for a customer subdomain (the Netlify site). */
const CNAME_TARGET = 'solutionseeking.netlify.app';
const ORIGIN = 'https://solutionseeking.com';

/**
 * Manager-only: create and manage the organization's white-label pages. Each is
 * a branded chat page at /a/<org-id>/<slug> for a shared assistant or a standard
 * agent, with a logo, and optional customer-subdomain instructions.
 */
export default function WhiteLabelPanel({
  open,
  onClose,
  assistants,
  orgId,
  orgName,
}: {
  open: boolean;
  onClose: () => void;
  assistants: Assistant[];
  orgId: string | null;
  orgName: string | null;
}) {
  const [pages, setPages] = useState<WhiteLabelPageView[] | null>(null);
  const [editing, setEditing] = useState<WhiteLabelPageView | null | undefined>(undefined); // undefined = list view
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useDialog();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const reload = () => {
    if (!orgId) {
      setPages([]);
      return;
    }
    fetchPages(orgId)
      .then((d) => setPages(d.rows))
      .catch(() => setPages([]));
  };

  useEffect(() => {
    if (open) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orgId]);

  if (!open || typeof document === 'undefined') return null;

  // Only assistants shared to THIS org can back a page (members must be able to use it).
  const sharedAssistants = assistants.filter((a) => a.org_id === orgId);

  const remove = async (p: WhiteLabelPageView) => {
    if (!orgId) return;
    const ok = await confirm({
      title: 'Delete this page?',
      message: `"${p.title}" at ${p.path} will be removed. This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deletePage(orgId, p.id);
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggleStatus = async (p: WhiteLabelPageView) => {
    if (!orgId) return;
    try {
      await setPageStatus(orgId, p.id, p.status === 'active' ? 'inactive' : 'active');
      reload();
    } catch (e) {
      setError((e as Error).message);
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
        aria-label="White-label pages"
        className="my-8 w-full max-w-2xl rounded-3xl bg-white p-6 shadow-card-hover"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl font-bold text-ink-800">
            White-label pages{orgName ? ` · ${orgName}` : ''}
          </h2>
          <button type="button" onClick={onClose} className="btn-ghost px-2" aria-label="Close">
            ✕
          </button>
        </div>

        {editing === undefined ? (
          <>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              Branded chat pages your whole organization can use. Each lives at a shareable link and
              can go on your own subdomain.
            </p>
            <button
              type="button"
              onClick={() => setEditing(null)}
              disabled={sharedAssistants.length === 0}
              className="btn-secondary mt-4 w-full text-sm disabled:opacity-60"
            >
              + New page
            </button>
            {sharedAssistants.length === 0 && (
              <p className="mt-2 text-xs text-slate-400">
                Share an assistant with your organization first, or use a standard Guide/Mentor page.
              </p>
            )}
            {error && <p className="mt-3 text-sm text-amber-700">{error}</p>}

            <div className="mt-4 space-y-3">
              {pages === null ? (
                <p className="text-sm text-slate-400">Loading…</p>
              ) : pages.length === 0 ? (
                <p className="text-sm text-slate-500">No pages yet.</p>
              ) : (
                pages.map((p) => (
                  <PageRow
                    key={p.id}
                    page={p}
                    onEdit={() => setEditing(p)}
                    onDelete={() => remove(p)}
                    onToggle={() => toggleStatus(p)}
                    onLogo={reload}
                  />
                ))
              )}
            </div>
          </>
        ) : (
          <PageForm
            editing={editing}
            orgId={orgId}
            sharedAssistants={sharedAssistants}
            onCancel={() => setEditing(undefined)}
            onSaved={() => {
              setEditing(undefined);
              reload();
            }}
          />
        )}
      </div>
      {dialog}
    </div>,
    document.body
  );
}

function PageRow({
  page,
  onEdit,
  onDelete,
  onToggle,
  onLogo,
}: {
  page: WhiteLabelPageView;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onLogo: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showDns, setShowDns] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const url = `${ORIGIN}${page.path}`;

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      await uploadLogo(page.id, files[0]);
      onLogo();
    } catch {
      // surfaced on the panel-level error otherwise; keep the row quiet
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="rounded-2xl border border-slate-100 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {page.logo_url ? (
            <img src={page.logo_url} alt="" className="h-8 w-8 shrink-0 rounded object-contain" />
          ) : (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-slate-100 text-slate-400">🏷️</span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink-800">{page.title}</p>
            <button
              type="button"
              onClick={copy}
              className="truncate text-xs text-brand-600 hover:text-brand-700"
              title="Copy link"
            >
              {copied ? 'Copied ✓' : page.path}
            </button>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
            page.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
          }`}
        >
          {page.status}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        <a href={page.path} target="_blank" rel="noopener" className="font-semibold text-brand-600 hover:text-brand-700">
          Open ↗
        </a>
        <button type="button" onClick={onEdit} className="text-slate-500 hover:text-ink-800">
          Edit
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => upload(e.target.files)} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="text-slate-500 hover:text-ink-800 disabled:opacity-50">
          {busy ? 'Uploading…' : 'Logo'}
        </button>
        <button type="button" onClick={onToggle} className="text-slate-500 hover:text-ink-800">
          {page.status === 'active' ? 'Deactivate' : 'Activate'}
        </button>
        <button type="button" onClick={() => setShowDns((v) => !v)} className="text-slate-500 hover:text-ink-800">
          Custom domain
        </button>
        <button type="button" onClick={onDelete} className="text-slate-400 hover:text-red-600">
          Delete
        </button>
      </div>

      {showDns && (
        <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
          To serve this at your own address (e.g. <code>assistant.yourcompany.com</code>):
          <ol className="ml-4 mt-1 list-decimal space-y-0.5">
            <li>
              Add a DNS <strong>CNAME</strong> record: your subdomain → <code>{CNAME_TARGET}</code>
            </li>
            <li>
              Then <a href="/pricing#team" className="font-semibold text-brand-600">contact us to activate it</a> — we add the domain and point it at this page (HTTPS included).
            </li>
          </ol>
          <p className="mt-1 text-slate-400">The link above always works in the meantime.</p>
        </div>
      )}
    </div>
  );
}

type TargetValue = `agent:${AgentId}` | `assistant:${string}`;

function PageForm({
  editing,
  orgId,
  sharedAssistants,
  onCancel,
  onSaved,
}: {
  editing: WhiteLabelPageView | null;
  orgId: string | null;
  sharedAssistants: Assistant[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const initialTarget: TargetValue = editing
    ? editing.assistant_id
      ? `assistant:${editing.assistant_id}`
      : `agent:${editing.agent ?? 'guide'}`
    : sharedAssistants[0]
      ? `assistant:${sharedAssistants[0].id}`
      : 'agent:guide';

  const [slug, setSlug] = useState(editing?.slug ?? '');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [instructions, setInstructions] = useState(editing?.display_instructions ?? '');
  const [target, setTarget] = useState<TargetValue>(initialTarget);
  const [context, setContext] = useState(editing?.context ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAgentTarget = target.startsWith('agent:');
  const agent = (isAgentTarget ? target.slice('agent:'.length) : 'guide') as AgentId;
  const modes = MODE_CONTEXTS.filter((m) => m.agents.includes(agent));

  const save = async () => {
    if (!orgId) return;
    if (!title.trim() || (!editing && !/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(slug))) {
      setError('Give the page a title and a valid address (3-48 lowercase letters, numbers, hyphens).');
      return;
    }
    setBusy(true);
    setError(null);
    const input: WhiteLabelInput = {
      title: title.trim(),
      description,
      display_instructions: instructions,
      assistant_id: isAgentTarget ? null : target.slice('assistant:'.length),
      agent: isAgentTarget ? agent : null,
      context: isAgentTarget ? context || null : null,
    };
    try {
      if (editing) await updatePage(orgId, editing.id, input);
      else await createPage(orgId, { ...input, slug });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 space-y-4">
      <div>
        <label className="mb-1 block text-sm font-semibold text-ink-800" htmlFor="wl-title">
          Title
        </label>
        <input
          id="wl-title"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 120))}
          placeholder="e.g. Manager's Assistant"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-ink-800" htmlFor="wl-slug">
          Address
        </label>
        <div className="flex items-center rounded-xl border border-slate-200 px-3 py-2 text-sm">
          <span className="text-slate-400">/a/…/</span>
          <input
            id="wl-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            disabled={Boolean(editing)}
            placeholder="managers-assistant"
            className="flex-1 bg-transparent focus:outline-none disabled:text-slate-400"
          />
        </div>
        {editing && <p className="mt-1 text-xs text-slate-400">The address can't change after creating (it may be tied to a domain).</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-ink-800" htmlFor="wl-target">
          Assistant
        </label>
        <select
          id="wl-target"
          value={target}
          onChange={(e) => setTarget(e.target.value as TargetValue)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          {sharedAssistants.map((a) => (
            <option key={a.id} value={`assistant:${a.id}`}>
              {a.name} (shared)
            </option>
          ))}
          <option value="agent:guide">Standard Guide</option>
          <option value="agent:mentor">Standard Mentor</option>
        </select>
      </div>

      {isAgentTarget && modes.length > 0 && (
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink-800" htmlFor="wl-mode">
            Mode <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <select
            id="wl-mode"
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
      )}

      <div>
        <label className="mb-1 block text-sm font-semibold text-ink-800" htmlFor="wl-desc">
          Description <span className="font-normal text-slate-400">(shown under the title)</span>
        </label>
        <input
          id="wl-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 600))}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-ink-800" htmlFor="wl-instr">
          Displayed instructions <span className="font-normal text-slate-400">(a "how this works" note)</span>
        </label>
        <textarea
          id="wl-instr"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value.slice(0, 4000))}
          rows={3}
          className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {error && <p className="text-sm text-amber-700">{error}</p>}

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={busy} className="btn-primary disabled:opacity-60">
          {busy ? 'Saving…' : editing ? 'Save' : 'Create page'}
        </button>
      </div>
    </div>
  );
}
