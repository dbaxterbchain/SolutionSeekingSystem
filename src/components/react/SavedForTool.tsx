import { useEffect, useState } from 'react';
import { useSession } from '../../lib/useSession';
import { isSupabaseConfigured } from '../../lib/supabase';
import { listSessions, TOOL_META, type SavedSession, type ToolType } from '../../lib/savedSessions';

/**
 * "Your saved work" list shown under each practice tool, so signed-in users
 * can reopen past sessions without going through the account page. Renders
 * nothing when signed out or empty.
 */
export default function SavedForTool({ tool }: { tool: ToolType }) {
  const { user } = useSession();
  const [items, setItems] = useState<SavedSession[] | null>(null);

  useEffect(() => {
    if (!user || !isSupabaseConfigured) return;
    listSessions(tool)
      .then(setItems)
      .catch(() => setItems([]));
  }, [user?.id, tool]);

  if (!user || !items || items.length === 0) return null;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Your saved {TOOL_META[tool].label.toLowerCase()}s
      </h2>
      <ul className="mt-3 space-y-2">
        {items.slice(0, 8).map((item) => (
          <li key={item.id}>
            <a
              href={`${TOOL_META[tool].path}?load=${item.id}`}
              className="flex items-baseline justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-card transition-colors hover:border-brand-200"
            >
              <span className="truncate text-sm font-medium text-ink-800">{item.title}</span>
              <span className="shrink-0 text-xs text-slate-400">{formatDate(item.created_at)}</span>
            </a>
          </li>
        ))}
      </ul>
      <a
        href="/saved"
        className="mt-3 inline-block text-xs font-semibold text-brand-600 hover:text-brand-700"
      >
        See all your saved work →
      </a>
    </section>
  );
}
