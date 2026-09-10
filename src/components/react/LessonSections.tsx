import Markdown from './chat/Markdown';

export interface LessonSection {
  id: string;
  title: string;
  markdown: string;
}

/**
 * The one renderer for lesson prose. The enrolled lesson island feeds it
 * sections from the API; the public preview page (Phase 2) feeds it the free
 * lesson at build time. Sections with no text render nothing.
 */
export default function LessonSections({ sections }: { sections: LessonSection[] }) {
  return (
    <div className="space-y-10">
      {sections
        .filter((s) => s.markdown.trim() !== '')
        .map((s) => (
          <section
            key={s.id}
            id={s.id}
            aria-labelledby={s.title ? `${s.id}-title` : undefined}
            aria-label={s.title ? undefined : s.id.replace(/-/g, ' ')}
          >
            {s.title && (
              <h2 id={`${s.id}-title`} className="font-heading text-2xl font-bold text-ink-800">
                {s.title}
              </h2>
            )}
            <div className={`prose-sss ${s.title ? 'mt-4' : ''}`}>
              <Markdown text={s.markdown} headings="semantic" />
            </div>
          </section>
        ))}
    </div>
  );
}
