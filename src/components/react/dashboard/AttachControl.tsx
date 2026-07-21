import { useRef, useState } from 'react';
import type { ChatAttachment } from '../../../lib/chatSessions';
import type { DocumentMeta } from '../../../lib/documents';

/**
 * The composer's attach control: a popover to pick documents for the next
 * message (or upload one inline), plus the pending-attachment chips. Rendered in
 * the Composer's children slot, so it sits just above the input.
 */
export default function AttachControl({
  documents,
  selected,
  onChange,
  onUpload,
  onManage,
  disabled = false,
  max = 3,
}: {
  documents: DocumentMeta[] | null;
  selected: ChatAttachment[];
  onChange: (next: ChatAttachment[]) => void;
  /** Upload + register a file, returning the new document (auto-selected). */
  onUpload: (file: File) => Promise<DocumentMeta>;
  /** Open the full documents manager. */
  onManage: () => void;
  disabled?: boolean;
  max?: number;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const selectedIds = new Set(selected.map((s) => s.id));

  const toggle = (doc: DocumentMeta) => {
    if (selectedIds.has(doc.id)) {
      onChange(selected.filter((s) => s.id !== doc.id));
    } else if (selected.length < max) {
      onChange([...selected, { id: doc.id, name: doc.name }]);
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      const doc = await onUpload(files[0]);
      if (selected.length < max) onChange([...selected, { id: doc.id, name: doc.name }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="mb-2">
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700"
            >
              <span aria-hidden="true">📎</span>
              <span className="max-w-[10rem] truncate">{s.name}</span>
              <button
                type="button"
                onClick={() => onChange(selected.filter((x) => x.id !== s.id))}
                aria-label={`Remove ${s.name}`}
                className="text-brand-400 hover:text-brand-700"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={disabled}
          className="btn-ghost text-xs disabled:opacity-50"
        >
          📎 Attach
        </button>

        {open && (
          <div className="absolute bottom-full left-0 z-20 mb-2 w-72 rounded-2xl border border-slate-100 bg-white p-2 shadow-card-hover">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => upload(e.target.files)}
            />
            <div className="max-h-48 space-y-0.5 overflow-y-auto">
              {documents === null ? (
                <p className="px-2 py-1 text-xs text-slate-400">Loading…</p>
              ) : documents.length === 0 ? (
                <p className="px-2 py-1 text-xs text-slate-500">No documents yet. Upload one below.</p>
              ) : (
                documents.map((d) => {
                  const on = selectedIds.has(d.id);
                  const full = !on && selected.length >= max;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggle(d)}
                      disabled={full}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
                        on
                          ? 'bg-brand-50 text-brand-700'
                          : full
                            ? 'text-slate-300'
                            : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span aria-hidden="true">{on ? '☑' : '☐'}</span>
                      <span className="truncate">{d.name}</span>
                    </button>
                  );
                })
              )}
            </div>

            {error && <p className="mt-1 px-2 text-xs text-amber-700">{error}</p>}

            <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-1.5">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="text-xs font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50"
              >
                {busy ? 'Uploading…' : '+ Upload'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onManage();
                }}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                Manage
              </button>
            </div>
            <p className="mt-1 px-2 text-[11px] text-slate-400">Up to {max} per message.</p>
          </div>
        )}
      </div>
    </div>
  );
}
