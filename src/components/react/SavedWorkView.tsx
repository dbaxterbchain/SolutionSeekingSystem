import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../../lib/useSession';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useDialog } from './Dialog';
import {
  deleteSession,
  listSessions,
  TOOL_META,
  type SavedSession,
  type ToolType,
} from '../../lib/savedSessions';

/**
 * The /saved page island: everything a signed-in user has saved from the
 * practice tools (introspection, conversation planner, solution builder), with
 * view / open-in-tool / delete. Signed out → a sign-in gate. This used to live
 * on /account; it moved here so the account page stays about the account.
 */

const TOOL_ORDER: ToolType[] = ['introspection', 'planner', 'solution'];

const TOOL_LINKS = [
  { label: 'Guided Introspection', href: '/practice/introspection' },
  { label: 'Conversation Planner', href: '/practice/conversation-planner' },
  { label: 'Solution Builder', href: '/practice/solution-builder' },
];

export default function SavedWorkView() {
  const { user, loading: sessionLoading } = useSession();
  const [items, setItems] = useState<SavedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<SavedSession | null>(null);
  const { confirm, dialog } = useDialog();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listSessions());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your saved work.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionLoading) return;
    if (!user || user.is_anonymous) {
      setLoading(false);
      return;
    }
    load();
  }, [sessionLoading, user?.id]);

  const grouped = useMemo(() => {
    const map: Record<ToolType, SavedSession[]> = { introspection: [], planner: [], solution: [] };
    for (const item of items) map[item.tool]?.push(item);
    return map;
  }, [items]);

  const remove = async (item: SavedSession) => {
    const ok = await confirm({
      title: 'Delete this?',
      message: `“${item.title}” will be permanently removed. This can’t be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteSession(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      if (viewing?.id === item.id) setViewing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that item.');
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  };

  if (!isSupabaseConfigured) {
    return <Card>Saved work is unavailable right now. Please try again later.</Card>;
  }

  if (sessionLoading) {
    return <p className="text-sm text-slate-400">Loading…</p>;
  }

  if (!user || user.is_anonymous) {
    return (
      <Card>
        <h2 className="font-heading text-lg font-bold text-ink-800">Sign in to see your saved work</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
          Your saved introspections, conversation plans, and solution checks are kept to your account.
        </p>
        <a href="/account?next=/saved" className="btn-primary mt-4 inline-block">
          Sign in
        </a>
      </Card>
    );
  }

  return (
    <div>
      <section>
        <h2 className="font-heading text-lg font-bold text-ink-800">Practice tools</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {TOOL_LINKS.map((t) => (
            <a
              key={t.href}
              href={t.href}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-ink-800 shadow-card transition-colors hover:border-brand-300 hover:text-brand-700"
            >
              {t.label}
            </a>
          ))}
        </div>
      </section>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <h2 className="mt-8 font-heading text-lg font-bold text-ink-800">Your saved work</h2>
      {loading ? (
        <p className="mt-8 text-sm text-slate-400">Loading your saved work…</p>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center">
          <p className="text-slate-600">You haven’t saved anything yet.</p>
          <p className="mt-1 text-sm text-slate-500">
            Use a{' '}
            <a href="/practice" className="font-medium text-brand-600 hover:text-brand-700">
              practice tool
            </a>{' '}
            and tap “Save to my account” to keep it here.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {TOOL_ORDER.filter((t) => grouped[t].length > 0).map((tool) => (
            <section key={tool}>
              <h2 className="font-heading text-lg font-bold text-ink-800">{TOOL_META[tool].label}</h2>
              <ul className="mt-3 space-y-2.5">
                {grouped[tool].map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-card"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-800">{item.title}</p>
                      <p className="text-xs text-slate-400">{formatDate(item.created_at)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setViewing(item)}
                        className="rounded-full px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
                      >
                        View
                      </button>
                      <a
                        href={`${TOOL_META[tool].path}?load=${item.id}`}
                        className="rounded-full px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
                      >
                        Open in tool
                      </a>
                      <button
                        type="button"
                        onClick={() => remove(item)}
                        className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {viewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-800/50 p-4"
          onClick={() => setViewing(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-card-hover"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <h3 className="truncate font-heading text-lg font-bold text-ink-800">{viewing.title}</h3>
              <button
                type="button"
                onClick={() => setViewing(null)}
                aria-label="Close"
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-ink-800"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap p-5 font-sans text-sm leading-relaxed text-slate-700">
              {viewing.summary}
            </pre>
            <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
              <a href={`${TOOL_META[viewing.tool].path}?load=${viewing.id}`} className="btn-primary">
                Open in tool
              </a>
            </div>
          </div>
        </div>
      )}
      {dialog}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-card">{children}</div>
  );
}
