import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A compact overflow menu ("...") for list rows, following the AuthMenu
 * dropdown idiom (aria-haspopup + full-screen click-catcher + role="menu").
 * The panel is portaled to <body> and positioned from the trigger because the
 * sidebar rows live inside an overflow-y-auto container that would clip an
 * absolutely-positioned menu. It closes on scroll, resize, Escape, or any
 * outside click.
 */

export interface RowMenuItem {
  label: string;
  onSelect: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  /** Small second line under the label, e.g. why an item is disabled. */
  hint?: string;
}

const MENU_WIDTH = 208; // w-52
/** Rough panel height used to decide whether to flip upward near the bottom. */
const FLIP_MARGIN = 240;

export default function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean }>({
    top: 0,
    left: 0,
    up: false,
  });
  const triggerRef = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const up = window.innerHeight - rect.bottom < FLIP_MARGIN;
    setPos({
      top: up ? rect.top - 4 : rect.bottom + 4,
      left: Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
      up,
    });
    setOpen(true);
  };

  // The panel is position:fixed, so any scroll would detach it from its row.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className={`rounded-md px-1.5 py-1 text-sm leading-none transition-colors hover:bg-slate-100 hover:text-slate-600 focus:opacity-100 ${
          open
            ? 'bg-slate-100 text-slate-600'
            : 'text-slate-400 opacity-100 lg:opacity-0 lg:group-hover:opacity-100'
        }`}
      >
        ⋯
      </button>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <button
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[60] cursor-default"
            />
            <div
              role="menu"
              aria-label={label}
              className="fixed z-[65] w-52 overflow-hidden rounded-2xl border border-slate-100 bg-white py-1 shadow-card-hover"
              style={{
                top: pos.top,
                left: pos.left,
                transform: pos.up ? 'translateY(-100%)' : undefined,
              }}
            >
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                  className={`block w-full px-4 py-2 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    item.tone === 'danger'
                      ? 'text-red-600 hover:bg-red-50'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="block">{item.label}</span>
                  {item.hint && (
                    <span className="mt-0.5 block text-xs font-normal text-slate-400">{item.hint}</span>
                  )}
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </>
  );
}
