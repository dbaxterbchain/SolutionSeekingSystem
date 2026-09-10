import { TOKEN_TTL_SECONDS, embedUrl, posterUrl, shouldReuse } from './streamUrls';

/**
 * Prepare playback for one video: reuse the shared token from memory or the
 * store, or mint a fresh one from Cloudflare. Every dependency is injected so
 * the whole path is unit-tested without credentials; src/lib/server/course/
 * stream.ts supplies the real ones.
 */

export interface Playback {
  embed_url: string;
  poster_url: string;
  expires_at: string;
}

export interface TokenStore {
  get(uid: string): Promise<{ token: string; expires_at: string } | null>;
  put(uid: string, token: string, expiresAt: Date): Promise<void>;
}

export interface PlaybackDeps {
  fetch: typeof fetch;
  store: TokenStore;
  now: () => Date;
  customerCode: string;
  accountId: string;
  apiToken: string;
  /** Per-instance cache; the Netlify function keeps it between requests. */
  memo: Map<string, { token: string; expiresAt: Date }>;
}

const build = (customerCode: string, token: string, expiresAt: Date): Playback => ({
  embed_url: embedUrl(customerCode, token),
  poster_url: posterUrl(customerCode, token),
  expires_at: expiresAt.toISOString(),
});

/** Null means "no video right now": the lesson still works, the island says so. Never throws. */
export async function resolvePlayback(deps: PlaybackDeps, uid: string): Promise<Playback | null> {
  if (!deps.customerCode || !deps.accountId || !deps.apiToken) {
    console.error('Stream is not configured (CLOUDFLARE_STREAM_CUSTOMER_CODE, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_STREAM_API_TOKEN)');
    return null;
  }
  try {
    const now = deps.now();

    const cached = deps.memo.get(uid);
    if (cached && shouldReuse(cached.expiresAt, now)) return build(deps.customerCode, cached.token, cached.expiresAt);

    const stored = await deps.store.get(uid).catch((err) => {
      console.error('stream token lookup failed', err);
      return null;
    });
    if (stored) {
      const expiresAt = new Date(stored.expires_at);
      if (shouldReuse(expiresAt, now)) {
        deps.memo.set(uid, { token: stored.token, expiresAt });
        return build(deps.customerCode, stored.token, expiresAt);
      }
    }

    const exp = Math.floor(now.getTime() / 1000) + TOKEN_TTL_SECONDS;
    const res = await deps.fetch(
      `https://api.cloudflare.com/client/v4/accounts/${deps.accountId}/stream/${uid}/token`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${deps.apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ exp, downloadable: false }),
      }
    );
    const body = (await res.json()) as { success?: boolean; result?: { token?: string }; errors?: unknown };
    const token = body.success ? body.result?.token : undefined;
    if (!token) {
      console.error('stream token mint failed', res.ok ? JSON.stringify(body.errors ?? body) : `http ${res.status}`);
      return null;
    }
    const expiresAt = new Date(exp * 1000);
    deps.memo.set(uid, { token, expiresAt });
    await deps.store.put(uid, token, expiresAt).catch((err) => {
      // The next instance mints again; the learner is unaffected.
      console.error('stream token store failed', err);
    });
    return build(deps.customerCode, token, expiresAt);
  } catch (err) {
    console.error('stream playback failed', err);
    return null;
  }
}
