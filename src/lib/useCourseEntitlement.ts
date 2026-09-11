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

/**
 * Cross-mount cache, keyed by user id. Lets a caller that mounts on every
 * page (the account menu) pass `cacheSeconds` and skip the request while its
 * last result is still fresh.
 */
const cache = new Map<string, { at: number; value: CourseEntitlementView }>();

/**
 * One request in flight per user id, shared by every mount that asks while it
 * is open. The header mounts this hook twice (the desktop menu and the phone
 * menu), and a page island can ask at the same time, so a cold page load would
 * otherwise make the same call three times. It shares a request rather than
 * caching a result: the entry is dropped the moment the promise settles, and
 * only `cache` above, and only for a caller that asks for it, holds an answer.
 */
const inFlight = new Map<string, Promise<CourseEntitlementView | null>>();

/** Mirrors useEntitlement() for the course. Null means "ask the server", never "deny". */
export function useCourseEntitlement(
  options: { cacheSeconds?: number } = {}
): CourseEntitlementState {
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
    // An anonymous account cannot hold an enrollment, so the server's answer is
    // known before it is asked: no entitlement, and nothing purchasable until
    // they register. Skipping the call spares every anonymous page load a
    // request whose result the launch flag already decides.
    if (!current || current.user.is_anonymous === true) {
      setState({ entitlement: null, loading: false, failed: false });
      return null;
    }
    const userId = current.user.id;
    let request = inFlight.get(userId);
    if (!request) {
      request = fetchCourseEntitlement(current.access_token).finally(() => inFlight.delete(userId));
      inFlight.set(userId, request);
    }
    const entitlement = await request;
    if (mine !== generation.current) return entitlement;
    setState({ entitlement, loading: false, failed: entitlement === null });
    if (entitlement !== null) {
      cache.set(userId, { at: Date.now(), value: entitlement });
    }
    return entitlement;
  }, []);

  useEffect(() => {
    if (sessionLoading) return;
    if (!session) {
      setState({ entitlement: null, loading: false, failed: false });
      return;
    }
    if (options.cacheSeconds) {
      const cached = cache.get(session.user.id);
      if (cached && Date.now() - cached.at < options.cacheSeconds * 1000) {
        setState({ entitlement: cached.value, loading: false, failed: false });
        return;
      }
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
