import { describe, expect, it, vi } from 'vitest';
import { resolvePlayback, type PlaybackDeps, type TokenStore } from '../streamPlayback';
import { REUSE_MARGIN_SECONDS, TOKEN_TTL_SECONDS } from '../streamUrls';

const NOW = new Date('2026-09-10T12:00:00Z');
const UID = 'a'.repeat(32);

function fakeStore(seed: Record<string, { token: string; expires_at: string }> = {}) {
  const rows = { ...seed };
  const store: TokenStore = {
    async get(uid) {
      return rows[uid] ?? null;
    },
    async put(uid, token, expiresAt) {
      rows[uid] = { token, expires_at: expiresAt.toISOString() };
    },
  };
  return { store, rows };
}

function fakeFetch(body: unknown, ok = true) {
  return vi.fn(async () => ({ ok, status: ok ? 200 : 502, json: async () => body })) as unknown as typeof fetch;
}

function deps(overrides: Partial<PlaybackDeps> = {}): PlaybackDeps {
  return {
    fetch: fakeFetch({ success: true, result: { token: 'minted' } }),
    store: fakeStore().store,
    now: () => NOW,
    customerCode: 'code',
    accountId: 'acct',
    apiToken: 'secret',
    memo: new Map(),
    ...overrides,
  };
}

describe('resolvePlayback', () => {
  it('mints a token, stores it with the ttl, and builds the urls', async () => {
    const { store, rows } = fakeStore();
    const d = deps({ store });
    const playback = await resolvePlayback(d, UID);
    expect(playback?.embed_url).toContain('/minted/iframe');
    expect(playback?.expires_at).toBe(new Date(NOW.getTime() + TOKEN_TTL_SECONDS * 1000).toISOString());
    expect(rows[UID]?.token).toBe('minted');
    const call = (d.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe(`https://api.cloudflare.com/client/v4/accounts/acct/stream/${UID}/token`);
    expect(call[1].method).toBe('POST');
    expect(JSON.parse(call[1].body)).toEqual({ exp: Math.floor(NOW.getTime() / 1000) + TOKEN_TTL_SECONDS, downloadable: false });
    expect(call[1].headers.Authorization).toBe('Bearer secret');
  });

  it('reuses a stored token with more than the margin left, without calling Cloudflare', async () => {
    const expires = new Date(NOW.getTime() + (REUSE_MARGIN_SECONDS + 600) * 1000);
    const { store } = fakeStore({ [UID]: { token: 'stored', expires_at: expires.toISOString() } });
    const d = deps({ store });
    const playback = await resolvePlayback(d, UID);
    expect(playback?.embed_url).toContain('/stored/iframe');
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it('mints again when the stored token is inside the margin', async () => {
    const expires = new Date(NOW.getTime() + 60 * 1000);
    const { store, rows } = fakeStore({ [UID]: { token: 'old', expires_at: expires.toISOString() } });
    const playback = await resolvePlayback(deps({ store }), UID);
    expect(playback?.embed_url).toContain('/minted/iframe');
    expect(rows[UID]?.token).toBe('minted');
  });

  it('serves the second call from memory', async () => {
    const d = deps();
    await resolvePlayback(d, UID);
    await resolvePlayback(d, UID);
    expect(d.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns null, never throws, when Cloudflare refuses or the network fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await resolvePlayback(deps({ fetch: fakeFetch({ success: false, errors: [{ message: 'no' }] }) }), UID)).toBeNull();
    expect(await resolvePlayback(deps({ fetch: fakeFetch({ errors: [{ message: 'no' }] }, false) }), UID)).toBeNull();
    const failing = vi.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await resolvePlayback(deps({ fetch: failing }), UID)).toBeNull();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('returns null when Stream is not configured', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await resolvePlayback(deps({ apiToken: '' }), UID)).toBeNull();
    error.mockRestore();
  });

  it('still answers when the store cannot be written', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store: TokenStore = { async get() { return null; }, async put() { throw new Error('db down'); } };
    const playback = await resolvePlayback(deps({ store }), UID);
    expect(playback?.embed_url).toContain('/minted/iframe');
    error.mockRestore();
  });
});
