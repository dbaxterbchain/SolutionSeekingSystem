import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from './useSession';
import { fetchCourseEntitlement, type CourseEntitlementView } from './courseClient';

export interface CourseEntitlementState {
  entitlement: CourseEntitlementView | null;
  loading: boolean;
  /** The lookup failed. Fail OPEN in the UI: the server is still the gate. */
  failed: boolean;
  /** Ask again (the checkout return page polls with this). */
  refetch: () => Promise<CourseEntitlementView | null>;
}

/** Mirrors useEntitlement() for the course. Null means "ask the server", never "deny". */
export function useCourseEntitlement(): CourseEntitlementState {
  const { session, user, loading: sessionLoading } = useSession();
  const [state, setState] = useState<Omit<CourseEntitlementState, 'refetch'>>({
    entitlement: null,
    loading: true,
    failed: false,
  });

  // The latest session, so refetch never closes over a stale token.
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Every request takes a generation number. Only the newest request may
  // commit its result; an older one that resolves late (a user switch, an
  // unmount, an overlapping poll) is discarded.
  const generation = useRef(0);

  const refetch = useCallback(async () => {
    const current = sessionRef.current;
    const mine = ++generation.current;
    if (!current) {
      setState({ entitlement: null, loading: false, failed: false });
      return null;
    }
    const entitlement = await fetchCourseEntitlement(current.access_token);
    if (mine !== generation.current) return entitlement;
    setState({ entitlement, loading: false, failed: entitlement === null });
    return entitlement;
  }, []);

  useEffect(() => {
    if (sessionLoading) return;
    if (!session) {
      setState({ entitlement: null, loading: false, failed: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    void refetch();
    return () => {
      // Anything still in flight belongs to the previous user or a gone component.
      generation.current += 1;
    };
    // Keyed on the user, not the session object: a token refresh replaces the
    // session and would otherwise refetch on a timer for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading, user?.id]);

  return { ...state, refetch };
}
