import type { Session } from '@supabase/supabase-js';

/**
 * Carrying a trial conversation into an account the person already had.
 *
 * Registering from a trial keeps the same user id, so the conversation follows
 * along by itself. SIGNING IN does not: that is a different user, and the trial
 * conversation would be left behind with nothing to say so. Nobody expects the
 * thing they were in the middle of to vanish because they turned out to already
 * have an account.
 *
 * So before we hand the session away, we stash the trial's JWT. Once the real
 * session appears, that JWT is what proves the trial was theirs, and the server
 * re-parents the work (see /api/claim-trial-work).
 *
 * localStorage, not sessionStorage: signing in with Google leaves the site
 * entirely and comes back, and an email confirmation link can open a new tab.
 */

const KEY = 'sss-trial-session';

/** Short: this only has to survive a sign-in round trip, and it is a credential. */
const TTL_MS = 30 * 60 * 1000;

interface Stash {
  token: string;
  userId: string;
  at: number;
}

/** Call immediately BEFORE a sign-in that will replace an anonymous session. */
export function stashTrialSession(session: Session | null | undefined): void {
  if (typeof window === 'undefined') return;
  if (!session || session.user.is_anonymous !== true) return;
  try {
    const stash: Stash = {
      token: session.access_token,
      userId: session.user.id,
      at: Date.now(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(stash));
  } catch {
    // Private mode: we lose the hand-off, not the sign-in.
  }
}

/** Read and remove the stash. Consumed once, whether or not the claim succeeds. */
function takeStash(): Stash | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    window.localStorage.removeItem(KEY);
    const stash = JSON.parse(raw) as Stash;
    if (!stash.token || !stash.at || Date.now() - stash.at > TTL_MS) return null;
    return stash;
  } catch {
    return null;
  }
}

export function hasTrialStash(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Ask the server to move the stashed trial's work onto this account.
 * Returns the number of conversations moved, or 0 when there was nothing to do.
 */
export async function claimTrialWork(accessToken: string, userId: string): Promise<number> {
  const stash = takeStash();
  if (!stash) return 0;
  // They registered rather than signed in: the id never changed, so the work is
  // already theirs and there is nothing to move.
  if (stash.userId === userId) return 0;

  try {
    const res = await fetch('/api/claim-trial-work', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ anon_token: stash.token }),
    });
    if (!res.ok) return 0;
    const data = (await res.json().catch(() => null)) as { conversations?: number } | null;
    return data?.conversations ?? 0;
  } catch {
    return 0;
  }
}
