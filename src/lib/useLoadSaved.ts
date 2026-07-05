import { useEffect, useState } from 'react';
import { getSession } from './savedSessions';
import { isSupabaseConfigured } from './supabase';

/**
 * When a practice tool is opened as `?load=<id>` (from the account library),
 * fetch that saved session's `data` so the tool can hydrate its own state from
 * it. Returns the data object once, then the tool applies it and clears the URL
 * param so a refresh doesn't re-load it.
 */
export function useLoadSaved(): Record<string, unknown> | null {
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || typeof window === 'undefined') return;
    const id = new URLSearchParams(window.location.search).get('load');
    if (!id) return;

    let active = true;
    getSession(id)
      .then((row) => {
        if (active && row) setData(row.data);
      })
      .catch(() => {
        /* ignore — not signed in, or not found */
      })
      .finally(() => {
        // Drop the ?load= param so refreshing keeps the local draft instead.
        const url = new URL(window.location.href);
        url.searchParams.delete('load');
        window.history.replaceState({}, '', url.toString());
      });

    return () => {
      active = false;
    };
  }, []);

  return data;
}
