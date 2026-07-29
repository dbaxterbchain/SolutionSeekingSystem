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
import {
  setDomain as apiSetDomain,
  verifyDomain,
  domainStatus,
  removeDomain,
  type DomainState,
  type DomainStatus,
} from '../../../lib/whiteLabelDomainClient';
import { useDialog } from '../Dialog';

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

  // Any assistant in THIS org workspace can back a page; access follows its
  // sharing (org-wide, or the specific people it is shared with). A fully
  // private draft can only back a page for its own owner, so the server
  // rejects those unless the caller owns them.
  const eligibleAssistants = assistants.filter((a) => a.org_id === orgId);

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
              className="btn-secondary mt-4 w-full text-sm"
            >
              + New page
            </button>
            {eligibleAssistants.length === 0 && (
              <p className="mt-2 text-xs text-slate-400">
                No assistants in this workspace yet, but a page can also use the standard Guide or Mentor.
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
                    orgId={orgId}
                    onEdit={() => setEditing(p)}
                    onDelete={() => remove(p)}
                    onToggle={() => toggleStatus(p)}
                    onReload={reload}
                  />
                ))
              )}
            </div>
          </>
        ) : (
          <PageForm
            editing={editing}
            orgId={orgId}
            eligibleAssistants={eligibleAssistants}
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
  orgId,
  onEdit,
  onDelete,
  onToggle,
  onReload,
}: {
  page: WhiteLabelPageView;
  orgId: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onReload: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showDomain, setShowDomain] = useState(false);
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
      onReload();
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
        <button type="button" onClick={() => setShowDomain((v) => !v)} className="text-slate-500 hover:text-ink-800">
          {page.domain_status === 'active' ? '🔗 Live domain' : 'Custom domain'}
        </button>
        <button type="button" onClick={onDelete} className="text-slate-400 hover:text-red-600">
          Delete
        </button>
      </div>

      {showDomain && orgId && <DomainWizard page={page} orgId={orgId} onReload={onReload} />}
    </div>
  );
}

type TargetValue = `agent:${AgentId}` | `assistant:${string}`;

function PageForm({
  editing,
  orgId,
  eligibleAssistants,
  onCancel,
  onSaved,
}: {
  editing: WhiteLabelPageView | null;
  orgId: string | null;
  eligibleAssistants: Assistant[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const initialTarget: TargetValue = editing
    ? editing.assistant_id
      ? `assistant:${editing.assistant_id}`
      : `agent:${editing.agent ?? 'guide'}`
    : eligibleAssistants[0]
      ? `assistant:${eligibleAssistants[0].id}`
      : 'agent:guide';

  const shareLabel = (a: Assistant) =>
    a.shared
      ? 'shared with everyone'
      : a.member_share_ids.length > 0
        ? 'shared with specific people'
        : 'private, only you';

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
          {eligibleAssistants.map((a) => (
            <option key={a.id} value={`assistant:${a.id}`}>
              {a.name} ({shareLabel(a)})
            </option>
          ))}
          <option value="agent:guide">Standard Guide</option>
          <option value="agent:mentor">Standard Mentor</option>
        </select>
        <p className="mt-1 text-xs text-slate-400">
          Visitors can chat on the page only if the assistant is shared with them.
        </p>
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

const SSL_LABEL: Record<string, string> = {
  pending_validation: 'validating domain',
  pending_issuance: 'issuing certificate',
  pending_deployment: 'deploying certificate',
  active: 'active',
};
const prettySsl = (s?: string | null): string => (s ? (SSL_LABEL[s] ?? s.replace(/_/g, ' ')) : '');

/**
 * Self-serve custom-domain wizard for one page. Walks the manager through
 * none → pending (enter domain, add the CNAME) → verifying (cert issuing, polled)
 * → active, with Remove available throughout. All state comes from
 * /api/white-label-domain; nothing here needs an operator.
 */
function DomainWizard({
  page,
  orgId,
  onReload,
}: {
  page: WhiteLabelPageView;
  orgId: string;
  onReload: () => void;
}) {
  const [state, setState] = useState<DomainState>({
    status: (page.domain_status as DomainStatus) || 'none',
    domain: page.custom_domain,
    cname_target: null,
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = state.status;

  // On open: hydrate the CNAME target + live cert state for an already-set domain.
  useEffect(() => {
    if (status === 'none') return;
    let cancelled = false;
    domainStatus(orgId, page.id)
      .then((s) => !cancelled && setState(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While the certificate issues, poll until it goes live (or errors).
  useEffect(() => {
    if (status !== 'verifying') return;
    const iv = window.setInterval(() => {
      domainStatus(orgId, page.id)
        .then((s) => {
          setState(s);
          if (s.status !== 'verifying') onReload();
        })
        .catch(() => {});
    }, 6000);
    return () => window.clearInterval(iv);
  }, [status, orgId, page.id, onReload]);

  const act = async (fn: () => Promise<DomainState>) => {
    setBusy(true);
    setError(null);
    try {
      setState(await fn());
      onReload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeBtn = (
    <button
      type="button"
      onClick={() => act(() => removeDomain(orgId, page.id))}
      disabled={busy}
      className="text-slate-400 hover:text-red-600 disabled:opacity-50"
    >
      Remove domain
    </button>
  );

  return (
    <div className="mt-2 rounded-xl bg-slate-50 px-3 py-3 text-xs leading-relaxed text-slate-600">
      {status === 'none' && (
        <div className="space-y-2">
          <p>
            Serve this page on your own address (e.g. <code>assistant.yourcompany.com</code>). It shows only
            this assistant, on your domain, with HTTPS. You add one DNS record; we handle the rest.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, ''))}
              placeholder="assistant.yourcompany.com"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <button
              type="button"
              onClick={() => act(() => apiSetDomain(orgId, page.id, input.trim()))}
              disabled={busy || !input.trim()}
              className="btn-secondary shrink-0 px-3 py-1.5 text-xs disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Connect domain'}
            </button>
          </div>
          <p className="text-slate-400">
            The <code>{page.path}</code> link always works too.
          </p>
        </div>
      )}

      {status === 'pending' && (
        <div className="space-y-2">
          <p className="font-semibold text-ink-800">Add this DNS record at your registrar</p>
          <DnsRecord host={state.domain} target={state.cname_target} />
          {state.dns_ok === false &&
            (state.observed ? (
              <p className="text-amber-700">
                Right now it points at <code>{state.observed}</code>. Update the record, then verify again.
              </p>
            ) : (
              <p className="text-amber-700">Not detected yet. DNS can take a few minutes to propagate.</p>
            ))}
          <div className="flex items-center gap-3 pt-0.5">
            <button
              type="button"
              onClick={() => act(() => verifyDomain(orgId, page.id))}
              disabled={busy}
              className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-60"
            >
              {busy ? 'Checking…' : 'Verify DNS'}
            </button>
            {removeBtn}
          </div>
        </div>
      )}

      {status === 'verifying' && (
        <div className="space-y-2">
          <p className="font-semibold text-emerald-600">DNS verified.</p>
          <p className="animate-pulse text-slate-500">
            Issuing your HTTPS certificate{state.ssl_status ? ` (${prettySsl(state.ssl_status)})` : ''}… This
            usually takes a minute or two.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => act(() => domainStatus(orgId, page.id))}
              disabled={busy}
              className="text-slate-500 hover:text-ink-800 disabled:opacity-50"
            >
              Check now
            </button>
            {removeBtn}
          </div>
        </div>
      )}

      {status === 'active' && state.domain && (
        <div className="space-y-2">
          <p className="font-semibold text-emerald-600">✓ Live on your domain</p>
          <a
            href={`https://${state.domain}`}
            target="_blank"
            rel="noopener"
            className="inline-block font-semibold text-brand-600 hover:text-brand-700"
          >
            https://{state.domain} ↗
          </a>
          <div className="pt-0.5">{removeBtn}</div>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-2">
          <p className="text-amber-700">
            We couldn't finish setting up this domain. Try verifying again, or remove it and start over.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => act(() => verifyDomain(orgId, page.id))}
              disabled={busy}
              className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-60"
            >
              {busy ? 'Retrying…' : 'Try again'}
            </button>
            {removeBtn}
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-amber-700">{error}</p>}
    </div>
  );
}

/** The one CNAME record a customer adds, with the value copyable. */
function DnsRecord({ host, target }: { host: string | null; target: string | null }) {
  const [copied, setCopied] = useState(false);
  const value = target ?? '';
  const copy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-[11px] text-ink-800">
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <span className="text-slate-400">Type</span>
        <span>CNAME</span>
        <span className="text-slate-400">Name</span>
        <span className="break-all">{host ?? 'your subdomain'}</span>
        <span className="text-slate-400">Value</span>
        <span className="flex items-center gap-2 break-all">
          {value || '…'}
          {value && (
            <button type="button" onClick={copy} className="shrink-0 font-sans text-brand-600 hover:text-brand-700">
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
