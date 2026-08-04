/**
 * Tappable openers for an empty conversation.
 *
 * The consumer funnel dies on the blank composer, not on the ad and not on the
 * page: visitors arrive on a mode page with a working chat and never type. A
 * cold visitor with a real problem has to compose the first sentence about it
 * from nothing, in a box, on a phone, on a site they met ten seconds ago.
 *
 * So tapping one FILLS the composer rather than sending it. The free anonymous
 * allowance is three messages; spending one of them on a canned line would cost
 * a third of the trial and start the conversation with something the visitor
 * didn't actually say. Filling removes the blank page, which is the real
 * barrier, and leaves the message theirs to finish.
 */
export default function Starters({
  starters,
  onPick,
}: {
  starters: string[];
  /** Put this text in the composer and focus it. Index is for analytics. */
  onPick: (text: string, index: number) => void;
}) {
  if (starters.length === 0) return null;

  return (
    // No margin of its own: the transcript's space-y owns the gap.
    <div>
      {/* Label and instruction in one line: on a phone this block sits between
          the visitor and the composer, so it pays for every row it takes. */}
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Or tap one and add your details
      </p>
      <div className="mt-2 space-y-1.5">
        {starters.map((text, i) => (
          <button
            key={text}
            type="button"
            onClick={() => onPick(text, i)}
            className="group flex w-full items-start gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left text-sm leading-relaxed text-slate-600 transition-colors hover:border-brand-300 hover:bg-brand-50/50 hover:text-ink-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <span
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-slate-300 transition-colors group-hover:text-brand-400"
            >
              ✎
            </span>
            <span>{text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
