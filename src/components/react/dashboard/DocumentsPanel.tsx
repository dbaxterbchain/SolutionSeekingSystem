import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { uploadAndRegister, deleteDocument, type DocumentMeta } from '../../../lib/documents';
import { useDialog } from '../Dialog';

/**
 * Manage the subscriber's uploaded documents: upload new ones, see what's stored,
 * delete. The picker in the composer (AttachControl) reads the same list; this
 * panel is where the library is curated.
 */
export default function DocumentsPanel({
  open,
  onClose,
  documents,
  orgId,
  orgName,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  documents: DocumentMeta[] | null;
  /** The active workspace new uploads belong to: null = Personal, else an org id. */
  orgId: string | null;
  orgName: string | null;
  /** Refetch the list after an upload or delete. */
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { confirm, dialog } = useDialog();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        await uploadAndRegister(file, orgId);
      }
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async (doc: DocumentMeta) => {
    const ok = await confirm({
      title: 'Delete this document?',
      message: `"${doc.name}" will be removed from your documents and detached from any assistant using it.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setError(null);
    try {
      await deleteDocument(doc.id);
      onChanged();
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
        aria-label="Your documents"
        className="my-8 w-full max-w-lg rounded-3xl bg-white p-6 shadow-card-hover"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl font-bold text-ink-800">
            Documents{orgName ? ` · ${orgName}` : ' · Personal'}
          </h2>
          <button type="button" onClick={onClose} className="btn-ghost px-2" aria-label="Close">
            ✕
          </button>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          Upload PDF, Word (.docx), .txt, or .md. Their text becomes available to attach to any
          chat in {orgName ?? 'your Personal workspace'}. 10 MB per file, 50 documents.
        </p>

        <div className="mt-4">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="btn-secondary w-full disabled:opacity-60"
          >
            {busy ? 'Uploading…' : '+ Upload a document'}
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-amber-700">{error}</p>}

        <div className="mt-4 max-h-72 space-y-1.5 overflow-y-auto">
          {documents === null ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-slate-500">No documents yet.</p>
          ) : (
            documents.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-800">{d.name}</p>
                  <p className="text-xs text-slate-400">
                    {formatBytes(d.size_bytes)} · {d.char_count.toLocaleString()} chars
                    {d.truncated ? ' · truncated' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(d)}
                  className="shrink-0 text-xs font-semibold text-slate-400 hover:text-red-600"
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
      {dialog}
    </div>,
    document.body
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
