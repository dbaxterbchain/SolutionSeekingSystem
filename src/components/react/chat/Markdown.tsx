import type { ReactNode } from 'react';

/**
 * Tiny markdown-subset renderer building React elements directly (no
 * dangerouslySetInnerHTML, so XSS-safe by construction). Covers headings,
 * bold/italic, bullet + numbered lists, blockquotes, and horizontal rules;
 * anything else renders as plain paragraphs.
 *
 * Shared by every chat surface (public ChatView, the dashboard, white-label
 * pages), so the assistant renders identically everywhere. Kept deliberately
 * small: the assistants are told to write light markdown.
 */
export default function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split('\n');
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = (key: number) => {
    if (!list) return;
    const items = list.items.map((item, i) => <li key={i}>{inline(item)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={`l${key}`} className="ml-5 list-decimal space-y-1">{items}</ol>
      ) : (
        <ul key={`l${key}`} className="ml-5 list-disc space-y-1">{items}</ul>
      )
    );
    list = null;
  };

  lines.forEach((line, i) => {
    const bullet = /^[-*]\s+(.*)/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) {
        flushList(i);
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]);
      return;
    }
    flushList(i);

    if (/^\s*$/.test(line)) return;
    const heading = /^(#{2,4})\s+(.*)/.exec(line);
    if (heading) {
      const cls =
        heading[1].length === 2
          ? 'mt-4 font-heading text-base font-bold text-ink-800'
          : 'mt-3 font-heading text-sm font-bold text-ink-800';
      blocks.push(
        <p key={i} className={cls}>
          {inline(heading[2])}
        </p>
      );
      return;
    }
    if (/^---+\s*$/.test(line)) {
      blocks.push(<hr key={i} className="my-3 border-slate-200" />);
      return;
    }
    const quote = /^>\s?(.*)/.exec(line);
    if (quote) {
      blocks.push(
        <p key={i} className="border-l-2 border-brand-200 pl-3 italic text-slate-600">
          {inline(quote[1])}
        </p>
      );
      return;
    }
    blocks.push(<p key={i}>{inline(line)}</p>);
  });
  flushList(lines.length);

  return <div className="space-y-2">{blocks}</div>;
}

/** Inline **bold** and *italic* within a line. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}
