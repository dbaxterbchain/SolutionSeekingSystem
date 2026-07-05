import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Branded, promise-based replacements for window.confirm / window.prompt so every
 * tool asks the user with the same on-brand modal instead of the browser's native
 * chrome. Usage:
 *
 *   const { confirm, prompt, dialog } = useDialog();
 *   // ...
 *   if (await confirm({ title: 'Start over?', tone: 'danger' })) reset();
 *   const name = await prompt({ title: 'Save', defaultValue: '…' }); // string | null
 *   // render {dialog} once anywhere in the component's tree.
 */

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

export interface PromptOptions {
  title: string;
  message?: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

type Active =
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void };

export function useDialog() {
  const [active, setActive] = useState<Active | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setActive({ kind: 'confirm', opts, resolve })),
    []
  );

  const prompt = useCallback(
    (opts: PromptOptions) =>
      new Promise<string | null>((resolve) => setActive({ kind: 'prompt', opts, resolve })),
    []
  );

  const settle = (result: boolean | string | null) => {
    setActive((current) => {
      current?.resolve(result as never);
      return null;
    });
  };

  const dialog = active ? <DialogHost active={active} onSettle={settle} /> : null;

  return { confirm, prompt, dialog };
}

function DialogHost({
  active,
  onSettle,
}: {
  active: Active;
  onSettle: (result: boolean | string | null) => void;
}) {
  const isPrompt = active.kind === 'prompt';
  const cancelValue = isPrompt ? null : false;

  const [value, setValue] = useState(
    isPrompt ? (active.opts as PromptOptions).defaultValue ?? '' : ''
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const focusTarget = isPrompt ? inputRef.current : confirmRef.current;
    const t = window.setTimeout(() => {
      focusTarget?.focus();
      inputRef.current?.select();
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSettle(cancelValue);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (typeof document === 'undefined') return null;

  const danger = !isPrompt && (active.opts as ConfirmOptions).tone === 'danger';
  const confirmLabel = active.opts.confirmLabel ?? (isPrompt ? 'Save' : 'Confirm');
  const cancelLabel = active.opts.cancelLabel ?? 'Cancel';

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    onSettle(isPrompt ? value : true);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-800/50 p-4"
      onMouseDown={() => onSettle(cancelValue)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-card-hover sm:p-7"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <form onSubmit={submit}>
          <h2 id="dialog-title" className="font-heading text-xl font-bold text-ink-800">
            {active.opts.title}
          </h2>
          {active.opts.message && (
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{active.opts.message}</p>
          )}

          {isPrompt && (
            <div className="mt-4">
              {(active.opts as PromptOptions).label && (
                <label htmlFor="dialog-input" className="mb-1.5 block text-sm font-semibold text-ink-800">
                  {(active.opts as PromptOptions).label}
                </label>
              )}
              <input
                id="dialog-input"
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={(active.opts as PromptOptions).placeholder}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
          )}

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button type="button" onClick={() => onSettle(cancelValue)} className="btn-ghost">
              {cancelLabel}
            </button>
            <button
              type="submit"
              ref={confirmRef}
              className={danger ? 'btn bg-red-600 text-white hover:bg-red-700' : 'btn-primary'}
            >
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
