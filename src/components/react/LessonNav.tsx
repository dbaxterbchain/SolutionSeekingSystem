import { useEffect, useRef, useState } from 'react';
import type { PublicCurriculum } from '../../lib/course/curriculum';
import type { CourseStateView } from '../../lib/courseClient';

interface Props {
  curriculum: PublicCurriculum;
  currentId: string;
  state: CourseStateView | null;
}

/**
 * The lessons drawer. Published lessons link; the rest are named and marked
 * "Coming soon". Focus stays inside while it is open, Esc and the backdrop
 * close it, and focus returns to the button that opened it.
 */
export default function LessonNav({ curriculum, currentId, state }: Props) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const focusable = () =>
      Array.from(panel.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []);
    focusable()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      opener.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Lessons
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex" onMouseDown={() => setOpen(false)}>
          <div className="absolute inset-0 bg-ink-800/50" />
          <div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label="Lessons"
            className="relative ml-auto flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-6 shadow-card-hover"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-xl font-bold text-ink-800">Lessons</h2>
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost" aria-label="Close">
                Close
              </button>
            </div>
            <ol className="mt-6 space-y-6">
              {curriculum.modules.map((m) => (
                <li key={m.id}>
                  <p className="eyebrow">Module {m.order}</p>
                  <p className="mt-1 font-semibold text-ink-800">{m.title}</p>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {m.lessons.map((l) => {
                      const done = state?.lessons[l.id]?.completed;
                      const current = l.id === currentId;
                      return (
                        <li key={l.id} className="flex items-baseline justify-between gap-3">
                          {l.status === 'published' ? (
                            <a
                              href={`/course/learn/lessons/${l.id}`}
                              aria-current={current ? 'page' : undefined}
                              className={`hover:underline ${current ? 'font-semibold text-ink-800' : 'text-brand-700'}`}
                            >
                              {l.title}
                            </a>
                          ) : (
                            <span className="text-slate-500">{l.title}</span>
                          )}
                          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            {l.status !== 'published' ? 'Coming soon' : done ? 'Done' : current ? 'Now' : ''}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
