import { useEffect, useState } from 'react';
import { useSession } from './useSession';

/**
 * The client's view of what the server will allow.
 *
 * Mirrors src/lib/server/entitlement.ts, and is fetched from it rather than
 * recomputed. The browser MUST NOT work this out for itself: entitlement can
 * come from a personal subscription or from an organization paying for you, and
 * the org tables are deliberately unreadable from a browser (migration 0012).
 * Any client-side guess would be wrong for org members in the one direction that
 * matters, locking them out of a product somebody is paying for.
 */
export type ClientEntitlement =
  | { kind: 'subscriber'; via: 'stripe' | 'org'; orgName?: string }
  | { kind: 'free'; tier: 'anon' | 'account'; used: number; remaining: number; limit: number }
  | { kind: 'blocked'; tier: 'anon' | 'account'; used: number; limit: number };

/** Null on any failure. Callers must treat null as "ask the server", never as "deny". */
export async function fetchEntitlement(accessToken: string): Promise<ClientEntitlement | null> {
  try {
    const res = await fetch('/api/entitlement', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as ClientEntitlement;
  } catch {
    return null;
  }
}

export interface EntitlementState {
  entitlement: ClientEntitlement | null;
  loading: boolean;
  /** The lookup failed. Fail OPEN in the UI: the server is still the gate. */
  failed: boolean;
}

export function useEntitlement(): EntitlementState {
  const { session, user, loading: sessionLoading } = useSession();
  const [state, setState] = useState<EntitlementState>({
    entitlement: null,
    loading: true,
    failed: false,
  });

  useEffect(() => {
    if (sessionLoading) return;
    if (!session) {
      setState({ entitlement: null, loading: false, failed: false });
      return;
    }
    let active = true;
    setState((s) => ({ ...s, loading: true }));
    fetchEntitlement(session.access_token).then((entitlement) => {
      if (!active) return;
      setState({ entitlement, loading: false, failed: entitlement === null });
    });
    return () => {
      active = false;
    };
    // Keyed on the user, not the session object: a token refresh replaces the
    // session and would otherwise refetch on a timer for no reason.
  }, [sessionLoading, user?.id]);

  return state;
}
