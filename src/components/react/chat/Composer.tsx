import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The message composer: an auto-growing textarea with a Send/Stop button.
 * Extracted from ChatView so the dashboard and white-label pages share the
 * exact same input behaviour (Enter-to-send on desktop, newline on touch,
 * grow-to-~6-lines).
 *
 * `children` renders above the input row: the attachment button and pending
 * attachment chips hang there on surfaces that allow uploads (Phase B+).
 */
export default function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  placeholder,
  disabled = false,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  placeholder: string;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // On touch devices Enter should insert a newline; sending is the button's job.
  const [coarsePointer] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  );

  // Grow the composer with its content (up to ~6 lines), shrink when cleared.
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [value]);

  return (
    <form
      className="border-t border-slate-100 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      {children}
      <div className="flex items-end gap-3">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Desktop: Enter sends, Shift+Enter for a newline. Touch
            // devices: Enter is always a newline; the button sends.
            if (e.key === 'Enter' && !e.shiftKey && !coarsePointer) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={1}
          placeholder={placeholder}
          className="max-h-40 min-h-[2.75rem] flex-1 resize-none overflow-y-auto rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        {streaming ? (
          <button type="button" onClick={onStop} className="btn-secondary shrink-0">
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={disabled || !value.trim()}
            className="btn-primary shrink-0 disabled:opacity-60"
          >
            Send
          </button>
        )}
      </div>
    </form>
  );
}
