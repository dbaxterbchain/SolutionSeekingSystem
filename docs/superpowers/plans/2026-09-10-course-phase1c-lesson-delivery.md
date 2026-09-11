# Course Phase 1c: Lesson Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An enrolled learner opens a published lesson, watches its video (or sees an honest note while the recording does not exist yet), works the exercise with an autosaved response, reveals the model response, marks the lesson complete, prints the module worksheet, and finds their place again from the dashboard.

**Architecture:** Lesson prose and video tokens never enter HTML. The prerendered lesson shell carries public metadata and mounts `LessonView`, which fetches `GET /api/course/lesson` with the bearer token and writes progress through `POST /api/course/progress`. The rules that decide completion, the allowed actions, the resume pointer and module completion are pure modules under `src/lib/course/` with unit tests; `src/lib/server/course/` binds them to Supabase and to the request. Cloudflare Stream playback uses one signed token per video, cached in `course_stream_tokens` and refreshed every twelve hours; the minting logic takes its fetch and store as inputs so it is tested without credentials.

**Tech Stack:** Astro 5 (static shells, `prerender = false` API routes), React islands, Supabase service role on the server, Cloudflare Stream signed tokens, vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-paid-video-course-design.md`, sections "Content model and authoring format", "Server modules", "API contract", "Progress rules", "Video delivery" and Phase 1 tasks 10 and 11. Sub-plans 1a (foundations) and 1b (commerce) are complete on branch `course`; this plan consumes `requireEnrolled`, `privateJson`, `courseClient.ts`, `useCourseEntitlement`, the catalog and the migration `0030_course.sql` tables `course_progress`, `course_check_attempts` and `course_stream_tokens`.

## Global Constraints

- **No em dashes (`—`) or en dashes between words** in any copy, comment, error message or commit message. Fix the sentence, never the character. Audit every new file with `grep -n "—" <file>`.
- **No machine tells, no counted-pair headings.** Learner-facing labels use lesson titles, never ids.
- **Lesson prose never appears in prerendered HTML.** Shells carry titles, the outcome sentence, module metadata and `PublicCurriculum` only. The model response is never in a `GET`; only the `reveal_model` action returns it.
- **Every `/api/course/*` route:** `prerender = false`, bearer auth, hand-rolled validation, snake_case error codes, every response through `privateJson`. Learners see `published` lessons only; an admin with `?preview=1` may also open `staged` lessons.
- **Progress never regresses.** The database trigger keeps flags monotone; the rules never clear a timestamp; `content_version` is written when a row is created and never updated; a content correction bumps `contentVersion` in the lesson file and touches no progress.
- **Pure modules stay pure.** `src/lib/course/*` imports nothing from `astro:content`, Supabase, `fetch` or the server directory. Tests live in `src/lib/course/__tests__/` and `src/lib/server/course/__tests__/`; nothing under test imports Supabase, Stripe, Resend, real `fetch` or `astro:content`.
- **Placeholder video.** The UID of the stand-in clip is configured once (`COURSE.placeholderStreamUid`, null until David uploads it). A lesson with `videoPlaceholder: true` and no `streamUid` plays the configured clip; with neither, the island shows "The video for this lesson is being filmed." and everything else works. A placeholder lesson cannot ship while the course is open (existing validator rule).
- **Gates for every task:** `npm test`, `npm run check` (0 errors), `npm run build` (green). New files CRLF via `unix2dos -q`; existing files edited with the Edit tool only (`sed -i` strips carriage returns on this machine).
- **Commit trailer** names the authoring model, for example `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- **Secrets:** never print `.env` or `.env.local` values. No Cloudflare credentials exist locally; the Stream path is verified by unit tests with an injected fetch, and against a real video in sub-plan 1e.
- **Local test environment** (from 1b): local Supabase on `127.0.0.1:55321` with keys from `npx supabase status -o env`; accounts `course-admin@example.com` and `course-learner@example.com` (password `course-test-password-1`); `.env.local` holds `ADMIN_EMAILS=course-admin@example.com`. The dev server starts on the first free port from 4321 (4321 to 4326 are held by unrelated processes; read the port from its output). Stop the dev server by PID; never `taskkill //IM node.exe`.
- **Docs** (`status.md`, `deployment.md`, `content-guide.md`, `course-production.md`) stay with sub-plan 1e. `.env.example` and `src/env.d.ts` are the only documentation edits here.

## File structure

Created:

| File | Responsibility |
|---|---|
| `src/lib/course/streamUrls.ts` | Pure: `shouldReuse`, `embedUrl`, `posterUrl`, the TTL constants |
| `src/lib/course/streamPlayback.ts` | Pure core: `resolvePlayback(deps, uid)` with injected `fetch`, token store and clock |
| `src/lib/server/course/stream.ts` | Binding: `getPlayback(uid)` on Supabase and the real fetch, memoised per instance, never throws |
| `src/lib/course/progressRules.ts` | Pure: `ProgressRow`, `newProgressRow`, `applyAction`, `missingForComplete`, `hasPractice`, `progressView` |
| `src/lib/course/stateRules.ts` | Pure: `deriveCourseState` (per-lesson flags, module completion, resume pointer, eligibility) |
| `src/lib/course/lessonView.ts` | Pure: `learnerSections`, `videoUidFor`, `neighbour` |
| `src/lib/server/course/progress.ts` | Binding: `loadProgress`, `saveProgress`, `loadAllProgress`, `loadCheckAttempts` |
| `src/lib/server/course/state.ts` | Binding: `computeCourseState(userId)` |
| `src/lib/server/course/content.ts` | Astro-only reads of the catalog for the API: `getLessonForLearner`, `getWorksheet` |
| `src/pages/api/course/lesson.ts`, `progress.ts`, `state.ts`, `worksheet.ts` | The four endpoints |
| `src/components/react/LessonSections.tsx` | One renderer for the markdown sections (used by the lesson island; the preview page reuses it in Phase 2) |
| `src/components/react/StreamPlayer.tsx` | The iframe, the pending note, the unavailable state with Retry, the expiry refetch |
| `src/components/react/LessonNav.tsx` | The lessons drawer: focus trap, Esc, current lesson, completion marks, "Coming soon" |
| `src/components/react/LessonView.tsx` | The lesson island: fetch, video, sections, response editor with autosave and conflict handling, completion flow |
| `src/components/react/WorksheetView.tsx` | The worksheet island with Print |
| `src/pages/course/learn/worksheets/[id].astro` | Worksheet shells (`noindex`) |
| Tests | `streamUrls.test.ts`, `streamPlayback.test.ts`, `progressRules.test.ts`, `stateRules.test.ts`, `lessonView.test.ts` under `src/lib/course/__tests__/` |

Modified:

| File | Change |
|---|---|
| `src/data/course.ts` | `placeholderStreamUid` |
| `src/lib/course/ids.ts` | `checkId(moduleId, n)` |
| `.env.example`, `src/env.d.ts` | `CLOUDFLARE_STREAM_API_TOKEN`, `CLOUDFLARE_STREAM_CUSTOMER_CODE` |
| `src/lib/courseClient.ts` | lesson, progress, state and worksheet calls; `CourseActionError.extra` |
| `src/lib/analytics.ts` | `lesson_completed`, `module_completed` |
| `src/components/react/chat/Markdown.tsx` | `headings="semantic"` |
| `src/pages/course/learn/lessons/[id].astro` | mounts `LessonView` and `LessonNav` |
| `src/components/react/CourseDashboard.tsx` | resume pointer and completion marks from `/api/course/state` |
| `src/pages/og/[...route].ts` | worksheet shell cards |
| `src/styles/global.css` | print rules |
| `src/content/course/lessons/v04.md` | `status: published`, `videoPlaceholder: true` |

## Shapes shared across tasks

```ts
// A course_progress row as the rules see it (src/lib/course/progressRules.ts).
interface ProgressRow {
  lesson_id: string;
  content_version: number;
  studied_at: string | null;
  practice_state: 'none' | 'in_site' | 'offline';
  response_text: string;
  previous_response_text: string | null;
  model_revealed_at: string | null;
  acknowledged_at: string | null;
  completed_at: string | null;
  revision: number;
  first_opened_at: string;
  last_opened_at: string;
}

// What the browser sees of a row (snake_case, JSON).
interface ProgressView {
  lesson_id: string;
  content_version: number;
  studied: boolean;
  practice_state: 'none' | 'in_site' | 'offline';
  response_text: string;
  previous_response_text: string | null;
  revision: number;
  model_revealed: boolean;
  acknowledged: boolean;
  completed: boolean;
  completed_at: string | null;
  last_opened_at: string;
}

// GET /api/course/lesson
interface LessonPayload {
  lesson: {
    id: string; title: string; kind: 'standard' | 'orientation' | 'plan';
    module_id: string; module_title: string; module_order: number; order: number;
    content_version: number; duration_min: number; status: string;
    video_placeholder: boolean; worksheet_id: string;
    has_exercise: boolean; has_model_response: boolean;
    sections: { outcome: string; key_points: string; exercise: string; self_review: string; transcript: string };
    prev: { id: string; title: string; available: boolean } | null;
    next: { id: string; title: string; available: boolean } | null;
  };
  video: { embed_url: string; poster_url: string; expires_at: string } | null;
  /** A video exists but playback could not be prepared (token failure). */
  video_unavailable: boolean;
  progress: ProgressView | null;
}

// POST /api/course/progress
interface ProgressResponse {
  progress: ProgressView;
  lesson_completed: boolean;   // this action moved the lesson to complete
  module_completed: boolean;   // and the module is now complete
  next_lesson_id: string | null;
  model_response?: string;     // reveal_model only
}

// GET /api/course/state
interface CourseStateView {
  lessons: Record<string, { completed: boolean; studied: boolean; practice_state: string; model_revealed: boolean; acknowledged: boolean; last_opened_at: string }>;
  modules: Record<string, { complete: boolean; lessons_published: number; lessons_completed: number; checks_complete: boolean }>;
  resume_lesson_id: string | null;
  assessment_eligible: boolean;
  plan_complete: boolean;
  course_complete: boolean;
  certification: { version: string; status: 'none' };
}
```

Error codes added by this plan: `bad_request` (with `field`), `not_found`, `too_long`, `revision_conflict` (with `server: { text, revision }`), `practice_required`, `reveal_required`, `studied_required`, `no_exercise`, `no_model_response`, `incomplete` (with `missing: string[]`), `progress_unavailable`.

---

### Task 1: Stream playback, pure and bound, plus the placeholder configuration

**Files:**
- Create: `src/lib/course/streamUrls.ts`, `src/lib/course/streamPlayback.ts`, `src/lib/server/course/stream.ts`
- Test: `src/lib/course/__tests__/streamUrls.test.ts`, `src/lib/course/__tests__/streamPlayback.test.ts`
- Modify: `src/data/course.ts`, `.env.example`, `src/env.d.ts`

**Interfaces:**
- Produces: `TOKEN_TTL_SECONDS = 43200`, `REUSE_MARGIN_SECONDS = 3600`, `shouldReuse(expiresAt: Date, now: Date): boolean`, `embedUrl(customerCode, token)`, `posterUrl(customerCode, token)`; `resolvePlayback(deps, uid): Promise<Playback | null>` with `Playback = { embed_url; poster_url; expires_at }`; `getPlayback(uid): Promise<Playback | null>`; `COURSE.placeholderStreamUid: string | null`.

- [ ] **Step 1: Write the failing tests**

`src/lib/course/__tests__/streamUrls.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { REUSE_MARGIN_SECONDS, TOKEN_TTL_SECONDS, embedUrl, posterUrl, shouldReuse } from '../streamUrls';

const NOW = new Date('2026-09-10T12:00:00Z');
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

describe('shouldReuse', () => {
  it('reuses a token that has more than the margin left, and mints otherwise', () => {
    expect(shouldReuse(at(REUSE_MARGIN_SECONDS + 1), NOW)).toBe(true);
    expect(shouldReuse(at(REUSE_MARGIN_SECONDS), NOW)).toBe(false);
    expect(shouldReuse(at(-10), NOW)).toBe(false);
  });
  it('keeps the ttl above the margin', () => {
    expect(TOKEN_TTL_SECONDS).toBeGreaterThan(REUSE_MARGIN_SECONDS * 2);
  });
});

describe('stream urls', () => {
  it('builds the iframe url from the customer code and the token, with the poster encoded', () => {
    const url = embedUrl('abc123', 'tok.en');
    expect(url.startsWith('https://customer-abc123.cloudflarestream.com/tok.en/iframe?')).toBe(true);
    expect(url).toContain('preload=metadata');
    expect(url).toContain('defaultTextTrack=en');
    expect(url).toContain('primaryColor=%235271FF');
    expect(url).toContain(`poster=${encodeURIComponent(posterUrl('abc123', 'tok.en'))}`);
    expect(url).not.toContain('autoplay');
  });
  it('builds the poster from the same token', () => {
    expect(posterUrl('abc123', 'tok.en')).toBe(
      'https://customer-abc123.cloudflarestream.com/tok.en/thumbnails/thumbnail.jpg?time=2s'
    );
  });
});
```

`src/lib/course/__tests__/streamPlayback.test.ts`:

```ts
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
  return vi.fn(async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/course/__tests__/streamUrls.test.ts src/lib/course/__tests__/streamPlayback.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Create `src/lib/course/streamUrls.ts`**

```ts
/**
 * Cloudflare Stream signed playback, the pure part. Tokens are not bound to a
 * viewer, so one token per video is shared by every learner and refreshed
 * long before it expires; the mint rate stays at a handful a day regardless
 * of how many people watch.
 */

/** A minted token lives twelve hours. */
export const TOKEN_TTL_SECONDS = 12 * 60 * 60;

/** A stored token is reused while more than an hour remains, so a long lesson never sees it expire mid-watch. */
export const REUSE_MARGIN_SECONDS = 60 * 60;

export const shouldReuse = (expiresAt: Date, now: Date): boolean =>
  expiresAt.getTime() - now.getTime() > REUSE_MARGIN_SECONDS * 1000;

const host = (customerCode: string) => `https://customer-${customerCode}.cloudflarestream.com`;

/** The poster frame two seconds in, through the same token. */
export const posterUrl = (customerCode: string, token: string): string =>
  `${host(customerCode)}/${token}/thumbnails/thumbnail.jpg?time=2s`;

/** The player iframe. No autoplay: the learner presses play. */
export const embedUrl = (customerCode: string, token: string): string =>
  `${host(customerCode)}/${token}/iframe?preload=metadata&defaultTextTrack=en&primaryColor=%235271FF&poster=${encodeURIComponent(posterUrl(customerCode, token))}`;
```

- [ ] **Step 4: Create `src/lib/course/streamPlayback.ts`**

```ts
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
```

- [ ] **Step 5: Create `src/lib/server/course/stream.ts`**

```ts
import { supabaseAdmin } from '../supabaseAdmin';
import { serverEnv } from '../env';
import { resolvePlayback, type Playback, type TokenStore } from '../../course/streamPlayback';

/** The shared-token store on course_stream_tokens (service role only). */
const store: TokenStore = {
  async get(uid) {
    const { data, error } = await supabaseAdmin
      .from('course_stream_tokens')
      .select('token, expires_at')
      .eq('stream_uid', uid)
      .maybeSingle();
    if (error) throw new Error(`course_stream_tokens read failed: ${error.message}`);
    return data ?? null;
  },
  async put(uid, token, expiresAt) {
    const { error } = await supabaseAdmin.from('course_stream_tokens').upsert({
      stream_uid: uid,
      token,
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`course_stream_tokens write failed: ${error.message}`);
  },
};

const memo = new Map<string, { token: string; expiresAt: Date }>();

/** Playback for one Stream video, or null when it cannot be prepared. Never throws. */
export function getPlayback(uid: string): Promise<Playback | null> {
  return resolvePlayback(
    {
      fetch,
      store,
      now: () => new Date(),
      customerCode: serverEnv('CLOUDFLARE_STREAM_CUSTOMER_CODE'),
      accountId: serverEnv('CLOUDFLARE_ACCOUNT_ID'),
      apiToken: serverEnv('CLOUDFLARE_STREAM_API_TOKEN'),
      memo,
    },
    uid
  );
}

export type { Playback };
```

- [ ] **Step 6: Configuration and env plumbing**

In `src/data/course.ts`, inside `COURSE` after `planLessonId`, add:

```ts
  /**
   * The Stream UID of the stand-in clip (scripts/render-placeholder-video.mjs)
   * that every lesson with `videoPlaceholder: true` and no `streamUid` plays.
   * Null until the clip is uploaded; the lesson then shows a "being filmed" note.
   */
  placeholderStreamUid: null as string | null,
```

In `.env.example`, after the `WL_AUTH_ENC_KEY=` line, add:

```
# Cloudflare Stream (the paid video course). A SEPARATE token from
# CLOUDFLARE_API_TOKEN above, scoped to Stream only (Stream: Edit), so the
# white-label token never grows a video permission. Signed playback tokens are
# minted server-side, one per video, and cached in course_stream_tokens.
CLOUDFLARE_STREAM_API_TOKEN=
# The customer subdomain code from the Stream dashboard: the <code> in
# customer-<code>.cloudflarestream.com. Not a secret (it is in every embed).
CLOUDFLARE_STREAM_CUSTOMER_CODE=
```

In `src/env.d.ts`, after `STRIPE_PRICE_ID_COURSE`, add:

```ts
  /** Cloudflare Stream, for the course videos; see src/lib/server/course/stream.ts. */
  readonly CLOUDFLARE_STREAM_API_TOKEN?: string;
  readonly CLOUDFLARE_STREAM_CUSTOMER_CODE?: string;
```

- [ ] **Step 7: Gates**

Run: `npm test` (81 + 11 = 92 passing), `npm run check`, `npm run build`.

- [ ] **Step 8: Commit**

```bash
unix2dos -q src/lib/course/streamUrls.ts src/lib/course/streamPlayback.ts src/lib/server/course/stream.ts src/lib/course/__tests__/streamUrls.test.ts src/lib/course/__tests__/streamPlayback.test.ts
git add src/lib/course/streamUrls.ts src/lib/course/streamPlayback.ts src/lib/server/course/stream.ts src/lib/course/__tests__/streamUrls.test.ts src/lib/course/__tests__/streamPlayback.test.ts src/data/course.ts .env.example src/env.d.ts
git commit -m "Add signed Stream playback with a shared token per video"
```

---

### Task 2: Progress rules

**Files:**
- Create: `src/lib/course/progressRules.ts`
- Test: `src/lib/course/__tests__/progressRules.test.ts`

**Interfaces:**
- Produces: `ProgressRow`, `ProgressView`, `PracticeState`, `ProgressAction`, `PROGRESS_ACTIONS`, `RESPONSE_MAX = 20000`, `newProgressRow(lessonId, contentVersion, now)`, `hasPractice(row)`, `missingForComplete(row, kind)`, `lessonComplete(row, kind)`, `applyAction(row, kind, hasExercise, action, input, now)`, `progressView(row)`.

- [ ] **Step 1: Write the failing tests**

`src/lib/course/__tests__/progressRules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  RESPONSE_MAX,
  applyAction,
  hasPractice,
  lessonComplete,
  missingForComplete,
  newProgressRow,
  progressView,
  type ProgressRow,
} from '../progressRules';

const T0 = new Date('2026-09-10T10:00:00Z');
const T1 = new Date('2026-09-10T10:05:00Z');
const T2 = new Date('2026-09-10T10:10:00Z');

const fresh = () => newProgressRow('v04', 1, T0);

/** Run a sequence of actions and return the final row. */
function run(kind: 'standard' | 'orientation' | 'plan', steps: Array<[string, Record<string, unknown>?]>, hasExercise = true): ProgressRow {
  let row = fresh();
  for (const [action, input] of steps) {
    const result = applyAction(row, kind, hasExercise, action, input ?? {}, T1);
    if (!result.ok) throw new Error(`${action} failed: ${result.error}`);
    row = result.row;
  }
  return row;
}

describe('newProgressRow', () => {
  it('starts empty with the content version and both opened timestamps', () => {
    expect(fresh()).toEqual({
      lesson_id: 'v04', content_version: 1, studied_at: null, practice_state: 'none', response_text: '',
      previous_response_text: null, model_revealed_at: null, acknowledged_at: null, completed_at: null,
      revision: 0, first_opened_at: T0.toISOString(), last_opened_at: T0.toISOString(),
    });
  });
});

describe('open and studied', () => {
  it('open moves last_opened_at only', () => {
    const r = applyAction(fresh(), 'standard', true, 'open', {}, T1);
    expect(r.ok && r.row.last_opened_at).toBe(T1.toISOString());
    expect(r.ok && r.row.first_opened_at).toBe(T0.toISOString());
    expect(r.ok && r.row.revision).toBe(0);
  });
  it('studied is recorded once and never moves', () => {
    const once = run('standard', [['studied']]);
    expect(once.studied_at).toBe(T1.toISOString());
    const again = applyAction(once, 'standard', true, 'studied', {}, T2);
    expect(again.ok && again.row.studied_at).toBe(T1.toISOString());
    expect(again.ok && again.changed).toBe(false);
  });
});

describe('save_response', () => {
  it('is a compare-and-set on the revision and marks in-site practice', () => {
    const r = applyAction(fresh(), 'standard', true, 'save_response', { text: 'my answer', expected_revision: 0 }, T1);
    expect(r.ok && r.row).toMatchObject({ response_text: 'my answer', revision: 1, practice_state: 'in_site', previous_response_text: null });
  });
  it('rejects a stale revision with the server copy', () => {
    const row = run('standard', [['save_response', { text: 'first', expected_revision: 0 }]]);
    const r = applyAction(row, 'standard', true, 'save_response', { text: 'second tab', expected_revision: 0 }, T2);
    expect(r).toMatchObject({ ok: false, status: 409, error: 'revision_conflict', extra: { server: { text: 'first', revision: 1 } } });
  });
  it('keeps the server text as the previous version when asked', () => {
    const row = run('standard', [['save_response', { text: 'first', expected_revision: 0 }]]);
    const r = applyAction(row, 'standard', true, 'save_response', { text: 'mine', expected_revision: 1, keep_previous: true }, T2);
    expect(r.ok && r.row).toMatchObject({ response_text: 'mine', previous_response_text: 'first', revision: 2 });
  });
  it('rejects a missing text, a non-integer revision, and an over-long response', () => {
    expect(applyAction(fresh(), 'standard', true, 'save_response', { expected_revision: 0 }, T1)).toMatchObject({ ok: false, status: 400, error: 'bad_request' });
    expect(applyAction(fresh(), 'standard', true, 'save_response', { text: 'x', expected_revision: '0' }, T1)).toMatchObject({ ok: false, status: 400, error: 'bad_request' });
    expect(applyAction(fresh(), 'standard', true, 'save_response', { text: 'x'.repeat(RESPONSE_MAX + 1), expected_revision: 0 }, T1)).toMatchObject({ ok: false, status: 400, error: 'too_long' });
  });
  it('a blank save keeps the practice state and still bumps the revision', () => {
    const row = run('standard', [['save_response', { text: 'draft', expected_revision: 0 }]]);
    const r = applyAction(row, 'standard', true, 'save_response', { text: '   ', expected_revision: 1 }, T2);
    expect(r.ok && r.row).toMatchObject({ response_text: '   ', practice_state: 'in_site', revision: 2 });
  });
  it('refuses a response on a lesson without an exercise', () => {
    expect(applyAction(fresh(), 'orientation', false, 'save_response', { text: 'x', expected_revision: 0 }, T1)).toMatchObject({ ok: false, status: 400, error: 'no_exercise' });
  });
});

describe('practiced_offline', () => {
  it('moves none to offline and leaves in_site alone', () => {
    expect(run('standard', [['practiced_offline']]).practice_state).toBe('offline');
    expect(run('standard', [['save_response', { text: 'x', expected_revision: 0 }], ['practiced_offline']]).practice_state).toBe('in_site');
  });
  it('is refused without an exercise', () => {
    expect(applyAction(fresh(), 'orientation', false, 'practiced_offline', {}, T1)).toMatchObject({ ok: false, status: 400, error: 'no_exercise' });
  });
});

describe('reveal_model and acknowledge', () => {
  it('reveal needs an attempt first and then returns the reveal flag', () => {
    expect(applyAction(fresh(), 'standard', true, 'reveal_model', {}, T1)).toMatchObject({ ok: false, status: 409, error: 'practice_required' });
    const r = applyAction(run('standard', [['practiced_offline']]), 'standard', true, 'reveal_model', {}, T2);
    expect(r.ok && r.reveal).toBe(true);
    expect(r.ok && r.row.model_revealed_at).toBe(T2.toISOString());
  });
  it('a typed response also counts as an attempt', () => {
    const r = applyAction(run('standard', [['save_response', { text: 'my go', expected_revision: 0 }]]), 'standard', true, 'reveal_model', {}, T2);
    expect(r.ok).toBe(true);
  });
  it('orientation and plan lessons have no model response', () => {
    expect(applyAction(fresh(), 'orientation', false, 'reveal_model', {}, T1)).toMatchObject({ ok: false, status: 400, error: 'no_model_response' });
    expect(applyAction(fresh(), 'plan', true, 'reveal_model', {}, T1)).toMatchObject({ ok: false, status: 400, error: 'no_model_response' });
  });
  it('acknowledge needs the reveal on standard lessons and studied elsewhere', () => {
    expect(applyAction(fresh(), 'standard', true, 'acknowledge', {}, T1)).toMatchObject({ ok: false, status: 409, error: 'reveal_required' });
    expect(applyAction(fresh(), 'orientation', false, 'acknowledge', {}, T1)).toMatchObject({ ok: false, status: 409, error: 'studied_required' });
    expect(run('orientation', [['studied'], ['acknowledge']], false).acknowledged_at).toBe(T1.toISOString());
  });
});

describe('complete', () => {
  it('names what is missing on a standard lesson', () => {
    expect(missingForComplete(fresh(), 'standard')).toEqual(['studied', 'practice', 'model', 'acknowledge']);
    const r = applyAction(fresh(), 'standard', true, 'complete', {}, T1);
    expect(r).toMatchObject({ ok: false, status: 409, error: 'incomplete', extra: { missing: ['studied', 'practice', 'model', 'acknowledge'] } });
  });
  it('completes a standard lesson after the full path', () => {
    const row = run('standard', [['studied'], ['save_response', { text: 'answer', expected_revision: 0 }], ['reveal_model'], ['acknowledge'], ['complete']]);
    expect(row.completed_at).toBe(T1.toISOString());
    expect(lessonComplete(row, 'standard')).toBe(true);
  });
  it('orientation needs studied and acknowledge only', () => {
    expect(missingForComplete(fresh(), 'orientation')).toEqual(['studied', 'acknowledge']);
    expect(lessonComplete(run('orientation', [['studied'], ['acknowledge'], ['complete']], false), 'orientation')).toBe(true);
  });
  it('plan needs studied, a written response and acknowledge', () => {
    expect(missingForComplete(fresh(), 'plan')).toEqual(['studied', 'response', 'acknowledge']);
    const row = run('plan', [['studied'], ['save_response', { text: 'my plan', expected_revision: 0 }], ['acknowledge'], ['complete']]);
    expect(lessonComplete(row, 'plan')).toBe(true);
  });
  it('completing twice keeps the first timestamp and reports no change', () => {
    const row = run('orientation', [['studied'], ['acknowledge'], ['complete']], false);
    const again = applyAction(row, 'orientation', false, 'complete', {}, T2);
    expect(again.ok && again.row.completed_at).toBe(T1.toISOString());
    expect(again.ok && again.changed).toBe(false);
  });
});

describe('unknown actions and the view', () => {
  it('rejects an unknown action', () => {
    expect(applyAction(fresh(), 'standard', true, 'delete', {}, T1)).toMatchObject({ ok: false, status: 400, error: 'bad_request', extra: { field: 'action' } });
  });
  it('the view flattens timestamps to booleans and keeps the text', () => {
    expect(progressView(run('standard', [['studied'], ['save_response', { text: 'a', expected_revision: 0 }]]))).toEqual({
      lesson_id: 'v04', content_version: 1, studied: true, practice_state: 'in_site', response_text: 'a',
      previous_response_text: null, revision: 1, model_revealed: false, acknowledged: false, completed: false,
      completed_at: null, last_opened_at: T0.toISOString(),
    });
    expect(hasPractice(fresh())).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/lib/course/__tests__/progressRules.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Create `src/lib/course/progressRules.ts`**

```ts
import type { LessonKind } from './types';

/**
 * The rules of lesson progress, with no I/O. POST /api/course/progress loads a
 * row, applies one action here, and persists the result; the database trigger
 * refuses any regression the rules might miss. Every decision that decides
 * whether a lesson is complete lives in this file.
 */

export type PracticeState = 'none' | 'in_site' | 'offline';

export interface ProgressRow {
  lesson_id: string;
  content_version: number;
  studied_at: string | null;
  practice_state: PracticeState;
  response_text: string;
  previous_response_text: string | null;
  model_revealed_at: string | null;
  acknowledged_at: string | null;
  completed_at: string | null;
  revision: number;
  first_opened_at: string;
  last_opened_at: string;
}

/** What the browser is told. Timestamps become booleans except the two it renders. */
export interface ProgressView {
  lesson_id: string;
  content_version: number;
  studied: boolean;
  practice_state: PracticeState;
  response_text: string;
  previous_response_text: string | null;
  revision: number;
  model_revealed: boolean;
  acknowledged: boolean;
  completed: boolean;
  completed_at: string | null;
  last_opened_at: string;
}

export const PROGRESS_ACTIONS = [
  'open',
  'studied',
  'save_response',
  'practiced_offline',
  'reveal_model',
  'acknowledge',
  'complete',
] as const;
export type ProgressAction = (typeof PROGRESS_ACTIONS)[number];

/** Matches the check constraint on course_progress.response_text. */
export const RESPONSE_MAX = 20000;

export type MissingStep = 'studied' | 'practice' | 'model' | 'acknowledge' | 'response';

export type ActionResult =
  | { ok: true; row: ProgressRow; changed: boolean; reveal?: boolean }
  | { ok: false; status: 400 | 409; error: string; extra?: Record<string, unknown> };

export function newProgressRow(lessonId: string, contentVersion: number, now: Date): ProgressRow {
  const at = now.toISOString();
  return {
    lesson_id: lessonId,
    content_version: contentVersion,
    studied_at: null,
    practice_state: 'none',
    response_text: '',
    previous_response_text: null,
    model_revealed_at: null,
    acknowledged_at: null,
    completed_at: null,
    revision: 0,
    first_opened_at: at,
    last_opened_at: at,
  };
}

/** An attempt at the exercise: something typed, or the offline confirmation. */
export const hasPractice = (row: ProgressRow): boolean =>
  row.practice_state !== 'none' || row.response_text.trim() !== '';

/** What still stands between this row and completion, in the order the lesson presents them. */
export function missingForComplete(row: ProgressRow, kind: LessonKind): MissingStep[] {
  const missing: MissingStep[] = [];
  if (!row.studied_at) missing.push('studied');
  if (kind === 'standard') {
    if (!hasPractice(row)) missing.push('practice');
    if (!row.model_revealed_at) missing.push('model');
  }
  if (kind === 'plan' && row.response_text.trim() === '') missing.push('response');
  if (!row.acknowledged_at) missing.push('acknowledge');
  return missing;
}

export const lessonComplete = (row: ProgressRow, kind: LessonKind): boolean =>
  missingForComplete(row, kind).length === 0;

const fail = (status: 400 | 409, error: string, extra?: Record<string, unknown>): ActionResult => ({
  ok: false,
  status,
  error,
  ...(extra ? { extra } : {}),
});

/**
 * Apply one learner action. `hasExercise` comes from the lesson content (an
 * empty Exercise section means nothing to practice). Timestamps are set once
 * and never cleared; `revision` moves only on save_response.
 */
export function applyAction(
  row: ProgressRow,
  kind: LessonKind,
  hasExercise: boolean,
  action: string,
  input: Record<string, unknown>,
  now: Date
): ActionResult {
  const at = now.toISOString();
  const next: ProgressRow = { ...row };

  switch (action) {
    case 'open':
      next.last_opened_at = at;
      return { ok: true, row: next, changed: true };

    case 'studied':
      if (row.studied_at) return { ok: true, row, changed: false };
      next.studied_at = at;
      return { ok: true, row: next, changed: true };

    case 'save_response': {
      if (!hasExercise) return fail(400, 'no_exercise');
      const text = input.text;
      if (typeof text !== 'string') return fail(400, 'bad_request', { field: 'text' });
      if (text.length > RESPONSE_MAX) return fail(400, 'too_long', { max: RESPONSE_MAX });
      const expected = input.expected_revision;
      if (typeof expected !== 'number' || !Number.isInteger(expected)) {
        return fail(400, 'bad_request', { field: 'expected_revision' });
      }
      if (expected !== row.revision) {
        return fail(409, 'revision_conflict', { server: { text: row.response_text, revision: row.revision } });
      }
      if (input.keep_previous === true) next.previous_response_text = row.response_text;
      next.response_text = text;
      next.revision = row.revision + 1;
      if (text.trim() !== '') next.practice_state = 'in_site';
      return { ok: true, row: next, changed: true };
    }

    case 'practiced_offline':
      if (!hasExercise) return fail(400, 'no_exercise');
      if (row.practice_state !== 'none') return { ok: true, row, changed: false };
      next.practice_state = 'offline';
      return { ok: true, row: next, changed: true };

    case 'reveal_model':
      if (kind !== 'standard') return fail(400, 'no_model_response');
      if (!hasPractice(row)) return fail(409, 'practice_required');
      if (row.model_revealed_at) return { ok: true, row, changed: false, reveal: true };
      next.model_revealed_at = at;
      return { ok: true, row: next, changed: true, reveal: true };

    case 'acknowledge':
      if (kind === 'standard' && !row.model_revealed_at) return fail(409, 'reveal_required');
      if (kind !== 'standard' && !row.studied_at) return fail(409, 'studied_required');
      if (row.acknowledged_at) return { ok: true, row, changed: false };
      next.acknowledged_at = at;
      return { ok: true, row: next, changed: true };

    case 'complete': {
      if (row.completed_at) return { ok: true, row, changed: false };
      const missing = missingForComplete(row, kind);
      if (missing.length > 0) return fail(409, 'incomplete', { missing });
      next.completed_at = at;
      return { ok: true, row: next, changed: true };
    }

    default:
      return fail(400, 'bad_request', { field: 'action' });
  }
}

export function progressView(row: ProgressRow): ProgressView {
  return {
    lesson_id: row.lesson_id,
    content_version: row.content_version,
    studied: Boolean(row.studied_at),
    practice_state: row.practice_state,
    response_text: row.response_text,
    previous_response_text: row.previous_response_text,
    revision: row.revision,
    model_revealed: Boolean(row.model_revealed_at),
    acknowledged: Boolean(row.acknowledged_at),
    completed: Boolean(row.completed_at),
    completed_at: row.completed_at,
    last_opened_at: row.last_opened_at,
  };
}
```

- [ ] **Step 4: Run the tests, then the gates**

Run: `npx vitest run src/lib/course/__tests__/progressRules.test.ts` (PASS, 22 tests), then `npm test` (114), `npm run check`, `npm run build`.

- [ ] **Step 5: Commit**

```bash
unix2dos -q src/lib/course/progressRules.ts src/lib/course/__tests__/progressRules.test.ts
git add src/lib/course/progressRules.ts src/lib/course/__tests__/progressRules.test.ts
git commit -m "Add the lesson progress rules"
```

---

### Task 3: Course state rules and the state endpoint

**Files:**
- Create: `src/lib/course/stateRules.ts`, `src/lib/server/course/progress.ts`, `src/lib/server/course/state.ts`, `src/pages/api/course/state.ts`
- Test: `src/lib/course/__tests__/stateRules.test.ts`
- Modify: `src/lib/course/ids.ts` (`checkId`)

**Interfaces:**
- Consumes: `ProgressRow`, `lessonComplete` (Task 2); `requireEnrolled`, `privateJson`; `getCourseCatalog`, `isLearnerVisible`; `COURSE`, `CERTIFICATION_VERSION`.
- Produces: `checkId(moduleId, n)`; `StateLesson`, `StateModule`, `CheckAttemptLite`, `CourseStateView`, `deriveCourseState(input)`; `loadProgress(userId, lessonId)`, `saveProgress(userId, row)`, `loadAllProgress(userId)`, `loadCheckAttempts(userId)`; `computeCourseState(userId)`; `GET /api/course/state`.

- [ ] **Step 1: `checkId` in `src/lib/course/ids.ts`**

Append:

```ts
/** The id a module check is recorded under: `m03-c2` is the second check of module 3. */
export const checkId = (moduleIdValue: string, n: number): string => `${moduleIdValue}-c${n}`;
```

- [ ] **Step 2: Write the failing tests**

`src/lib/course/__tests__/stateRules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deriveCourseState, type StateInput, type StateLesson, type StateModule } from '../stateRules';
import { newProgressRow, type ProgressRow } from '../progressRules';

const T = (minute: number) => new Date(Date.UTC(2026, 8, 10, 10, minute)).toISOString();

/** Three modules: m01 (v01 v02, two checks), m02 (v03 v04, two checks), m09 (v39 orientation, v40 plan, no checks). */
const lessons: StateLesson[] = [
  { id: 'v01', module: 'm01', kind: 'standard', status: 'published', seq: 1 },
  { id: 'v02', module: 'm01', kind: 'standard', status: 'published', seq: 2 },
  { id: 'v03', module: 'm02', kind: 'standard', status: 'published', seq: 3 },
  { id: 'v04', module: 'm02', kind: 'standard', status: 'draft', seq: 4 },
  { id: 'v39', module: 'm09', kind: 'orientation', status: 'published', seq: 5 },
  { id: 'v40', module: 'm09', kind: 'plan', status: 'published', seq: 6 },
];
const modules: StateModule[] = [
  { id: 'm01', checkIds: ['m01-c1', 'm01-c2'] },
  { id: 'm02', checkIds: ['m02-c1', 'm02-c2'] },
  { id: 'm09', checkIds: [] },
];

function done(id: string, kind: 'standard' | 'orientation' | 'plan', openedMinute: number): ProgressRow {
  const row = newProgressRow(id, 1, new Date(Date.UTC(2026, 8, 10, 10, openedMinute)));
  return {
    ...row,
    studied_at: row.first_opened_at,
    practice_state: kind === 'standard' ? 'in_site' : 'none',
    response_text: kind === 'orientation' ? '' : 'answer',
    model_revealed_at: kind === 'standard' ? row.first_opened_at : null,
    acknowledged_at: row.first_opened_at,
    completed_at: row.first_opened_at,
  };
}

function input(rows: ProgressRow[], attempts: StateInput['attempts'] = []): StateInput {
  return { lessons, modules, rows, attempts, orientationLessonId: 'v39', planLessonId: 'v40', assessmentSubmitted: false, certificationVersion: '1' };
}

describe('resume pointer', () => {
  it('starts at the first published lesson', () => {
    expect(deriveCourseState(input([])).resume_lesson_id).toBe('v01');
  });
  it('returns to the most recently opened lesson while it is incomplete', () => {
    const rows = [newProgressRow('v03', 1, new Date(T(5))), newProgressRow('v01', 1, new Date(T(1)))];
    expect(deriveCourseState(input(rows)).resume_lesson_id).toBe('v03');
  });
  it('moves to the first incomplete published lesson after a completed one', () => {
    expect(deriveCourseState(input([done('v01', 'standard', 1)])).resume_lesson_id).toBe('v02');
  });
  it('skips unpublished lessons and wraps to the first incomplete overall', () => {
    const rows = [done('v03', 'standard', 9), done('v39', 'orientation', 8), done('v40', 'plan', 7)];
    expect(deriveCourseState(input(rows)).resume_lesson_id).toBe('v01');
  });
  it('is null when every published lesson is complete', () => {
    const rows = [done('v01', 'standard', 1), done('v02', 'standard', 2), done('v03', 'standard', 3), done('v39', 'orientation', 4), done('v40', 'plan', 5)];
    expect(deriveCourseState(input(rows)).resume_lesson_id).toBeNull();
  });
});

describe('modules', () => {
  it('needs every published lesson complete and every check answered correctly at least once', () => {
    const rows = [done('v01', 'standard', 1), done('v02', 'standard', 2)];
    const noChecks = deriveCourseState(input(rows)).modules.m01;
    expect(noChecks).toEqual({ complete: false, lessons_published: 2, lessons_completed: 2, checks_complete: false });
    const oneRight = deriveCourseState(input(rows, [
      { module_id: 'm01', check_id: 'm01-c1', correct: false },
      { module_id: 'm01', check_id: 'm01-c1', correct: true },
    ])).modules.m01;
    expect(oneRight.checks_complete).toBe(false);
    const bothRight = deriveCourseState(input(rows, [
      { module_id: 'm01', check_id: 'm01-c1', correct: true },
      { module_id: 'm01', check_id: 'm01-c2', correct: true },
    ])).modules.m01;
    expect(bothRight).toMatchObject({ complete: true, checks_complete: true });
  });
  it('counts only published lessons, and a module with none published is not complete', () => {
    const state = deriveCourseState(input([done('v03', 'standard', 1)], [
      { module_id: 'm02', check_id: 'm02-c1', correct: true },
      { module_id: 'm02', check_id: 'm02-c2', correct: true },
    ]));
    expect(state.modules.m02).toMatchObject({ complete: true, lessons_published: 1, lessons_completed: 1 });
    const empty = deriveCourseState({ ...input([]), lessons: lessons.map((l) => (l.module === 'm09' ? { ...l, status: 'draft' as const } : l)) });
    expect(empty.modules.m09.complete).toBe(false);
  });
});

describe('eligibility and completion', () => {
  const allChecks: StateInput['attempts'] = [
    { module_id: 'm01', check_id: 'm01-c1', correct: true }, { module_id: 'm01', check_id: 'm01-c2', correct: true },
    { module_id: 'm02', check_id: 'm02-c1', correct: true }, { module_id: 'm02', check_id: 'm02-c2', correct: true },
  ];
  it('assessment eligibility needs the study modules and the orientation lesson', () => {
    const rows = [done('v01', 'standard', 1), done('v02', 'standard', 2), done('v03', 'standard', 3)];
    expect(deriveCourseState(input(rows, allChecks)).assessment_eligible).toBe(false);
    expect(deriveCourseState(input([...rows, done('v39', 'orientation', 4)], allChecks)).assessment_eligible).toBe(true);
  });
  it('course completion needs everything, the submitted assessment, and the plan lesson', () => {
    const rows = [done('v01', 'standard', 1), done('v02', 'standard', 2), done('v03', 'standard', 3), done('v39', 'orientation', 4), done('v40', 'plan', 5)];
    const notYet = deriveCourseState({ ...input(rows, allChecks), lessons: lessons.filter((l) => l.status === 'published') });
    expect(notYet.plan_complete).toBe(true);
    expect(notYet.course_complete).toBe(false);
    const complete = deriveCourseState({ ...input(rows, allChecks), lessons: lessons.filter((l) => l.status === 'published'), assessmentSubmitted: true });
    expect(complete.course_complete).toBe(true);
  });
  it('a lesson that is not published never counts, even with a complete row', () => {
    const state = deriveCourseState(input([done('v04', 'standard', 1)]));
    expect(state.lessons.v04).toBeUndefined();
    expect(state.certification).toEqual({ version: '1', status: 'none' });
  });
});
```

- [ ] **Step 3: Run to see it fail**

Run: `npx vitest run src/lib/course/__tests__/stateRules.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Create `src/lib/course/stateRules.ts`**

```ts
import { lessonComplete, type ProgressRow } from './progressRules';
import type { LessonKind, LessonStatus } from './types';

/**
 * The learner's place in the course, derived at read time from at most 40
 * progress rows and the check attempts. Nothing here is stored: there is no
 * course_state table to drift.
 */

export interface StateLesson {
  id: string;
  module: string;
  kind: LessonKind;
  status: LessonStatus;
  /** Position in the chain, 1-based. */
  seq: number;
}

export interface StateModule {
  id: string;
  checkIds: string[];
}

export interface CheckAttemptLite {
  module_id: string;
  check_id: string;
  correct: boolean;
}

export interface StateInput {
  lessons: StateLesson[];
  modules: StateModule[];
  rows: ProgressRow[];
  attempts: CheckAttemptLite[];
  orientationLessonId: string;
  planLessonId: string;
  assessmentSubmitted: boolean;
  certificationVersion: string;
}

export interface LessonStateView {
  completed: boolean;
  studied: boolean;
  practice_state: string;
  model_revealed: boolean;
  acknowledged: boolean;
  last_opened_at: string;
}

export interface ModuleStateView {
  complete: boolean;
  lessons_published: number;
  lessons_completed: number;
  checks_complete: boolean;
}

export interface CourseStateView {
  lessons: Record<string, LessonStateView>;
  modules: Record<string, ModuleStateView>;
  resume_lesson_id: string | null;
  assessment_eligible: boolean;
  plan_complete: boolean;
  course_complete: boolean;
  certification: { version: string; status: 'none' };
}

export function deriveCourseState(input: StateInput): CourseStateView {
  const published = [...input.lessons]
    .filter((l) => l.status === 'published')
    .sort((a, b) => a.seq - b.seq);
  const byId = new Map(published.map((l) => [l.id, l]));
  const rowFor = new Map(input.rows.map((r) => [r.lesson_id, r]));

  const isComplete = (id: string): boolean => {
    const lesson = byId.get(id);
    const row = rowFor.get(id);
    return Boolean(lesson && row && lessonComplete(row, lesson.kind));
  };

  const lessons: Record<string, LessonStateView> = {};
  for (const l of published) {
    const row = rowFor.get(l.id);
    if (!row) continue;
    lessons[l.id] = {
      completed: isComplete(l.id),
      studied: Boolean(row.studied_at),
      practice_state: row.practice_state,
      model_revealed: Boolean(row.model_revealed_at),
      acknowledged: Boolean(row.acknowledged_at),
      last_opened_at: row.last_opened_at,
    };
  }

  const correct = new Set(input.attempts.filter((a) => a.correct).map((a) => `${a.module_id}:${a.check_id}`));
  const modules: Record<string, ModuleStateView> = {};
  for (const m of input.modules) {
    const own = published.filter((l) => l.module === m.id);
    const completed = own.filter((l) => isComplete(l.id)).length;
    const checksComplete = m.checkIds.every((c) => correct.has(`${m.id}:${c}`));
    modules[m.id] = {
      complete: own.length > 0 && completed === own.length && checksComplete,
      lessons_published: own.length,
      lessons_completed: completed,
      checks_complete: checksComplete,
    };
  }

  // Resume: the most recently opened lesson while it is incomplete, else the
  // first incomplete lesson after it, else the first incomplete overall.
  let resume: string | null = null;
  const opened = published
    .filter((l) => rowFor.has(l.id))
    .sort((a, b) => rowFor.get(b.id)!.last_opened_at.localeCompare(rowFor.get(a.id)!.last_opened_at));
  const latest = opened[0];
  if (latest && !isComplete(latest.id)) {
    resume = latest.id;
  } else {
    const after = latest ? published.filter((l) => l.seq > latest.seq) : published;
    resume = after.find((l) => !isComplete(l.id))?.id ?? published.find((l) => !isComplete(l.id))?.id ?? null;
  }

  const studyModules = input.modules.filter((m) => m.id !== 'm09');
  const assessmentEligible =
    studyModules.length > 0 && studyModules.every((m) => modules[m.id]?.complete) && isComplete(input.orientationLessonId);
  const planComplete = isComplete(input.planLessonId);
  const courseComplete =
    published.length === input.lessons.length &&
    published.every((l) => isComplete(l.id)) &&
    input.assessmentSubmitted &&
    planComplete;

  return {
    lessons,
    modules,
    resume_lesson_id: resume,
    assessment_eligible: assessmentEligible,
    plan_complete: planComplete,
    course_complete: courseComplete,
    certification: { version: input.certificationVersion, status: 'none' },
  };
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/course/__tests__/stateRules.test.ts` (PASS, 10 tests).

- [ ] **Step 6: Create `src/lib/server/course/progress.ts`**

```ts
import { supabaseAdmin } from '../supabaseAdmin';
import { COURSE } from '../../../data/course';
import type { ProgressRow } from '../../course/progressRules';
import type { CheckAttemptLite } from '../../course/stateRules';

/** The progress tables, service role only. Every error throws with a prefix; the routes answer 503. */

const COLUMNS =
  'lesson_id, content_version, studied_at, practice_state, response_text, previous_response_text, ' +
  'model_revealed_at, acknowledged_at, completed_at, revision, first_opened_at, last_opened_at';

export async function loadProgress(userId: string, lessonId: string): Promise<ProgressRow | null> {
  const { data, error } = await supabaseAdmin
    .from('course_progress')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('course_id', COURSE.id)
    .eq('lesson_id', lessonId)
    .maybeSingle();
  if (error) throw new Error(`course_progress read failed: ${error.message}`);
  return (data as ProgressRow | null) ?? null;
}

export async function loadAllProgress(userId: string): Promise<ProgressRow[]> {
  const { data, error } = await supabaseAdmin
    .from('course_progress')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('course_id', COURSE.id);
  if (error) throw new Error(`course_progress list failed: ${error.message}`);
  return (data as ProgressRow[]) ?? [];
}

/** Upsert the whole row. The monotone trigger refuses any regression on update. */
export async function saveProgress(userId: string, row: ProgressRow): Promise<ProgressRow> {
  const { data, error } = await supabaseAdmin
    .from('course_progress')
    .upsert({ user_id: userId, course_id: COURSE.id, ...row }, { onConflict: 'user_id,course_id,lesson_id' })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`course_progress write failed: ${error.message}`);
  return data as ProgressRow;
}

export async function loadCheckAttempts(userId: string): Promise<CheckAttemptLite[]> {
  const { data, error } = await supabaseAdmin
    .from('course_check_attempts')
    .select('module_id, check_id, correct')
    .eq('user_id', userId)
    .eq('course_id', COURSE.id);
  if (error) throw new Error(`course_check_attempts list failed: ${error.message}`);
  return (data as CheckAttemptLite[]) ?? [];
}
```

Note on `saveProgress`: the upsert sends `content_version` and `first_opened_at` from the row; on an existing row the trigger keeps `first_opened_at`, and `content_version` is whatever the loaded row carried, so neither ever changes after creation.

- [ ] **Step 7: Create `src/lib/server/course/state.ts`**

```ts
import { getCourseCatalog } from '../../course/catalog';
import { checkId } from '../../course/ids';
import { deriveCourseState, type CourseStateView } from '../../course/stateRules';
import { COURSE } from '../../../data/course';
import { loadAllProgress, loadCheckAttempts } from './progress';

/** The dashboard state for one learner, derived from the catalog and their rows. Astro-only (reads the catalog). */
export async function computeCourseState(userId: string): Promise<CourseStateView> {
  const [catalog, rows, attempts] = await Promise.all([getCourseCatalog(), loadAllProgress(userId), loadCheckAttempts(userId)]);
  return deriveCourseState({
    lessons: catalog.lessons.map((l) => ({ id: l.id, module: l.module, kind: l.kind, status: l.status, seq: l.seq })),
    modules: catalog.modules.map((m) => ({ id: m.id, checkIds: m.checks.map((_, i) => checkId(m.id, i + 1)) })),
    rows,
    attempts,
    orientationLessonId: COURSE.orientationLessonId,
    planLessonId: COURSE.planLessonId,
    // Sub-plan 1d records submissions; until then nothing has been submitted.
    assessmentSubmitted: false,
    certificationVersion: COURSE.certificationVersion,
  });
}
```

- [ ] **Step 8: Create `src/pages/api/course/state.ts`**

```ts
import type { APIRoute } from 'astro';
import { privateJson } from '../../../lib/server/auth';
import { requireEnrolled } from '../../../lib/server/course/enrollment';
import { computeCourseState } from '../../../lib/server/course/state';

export const prerender = false;

/** The learner's place in the course: per-lesson flags, module completion and the resume pointer. */
export const GET: APIRoute = async ({ request }) => {
  const auth = await requireEnrolled(request);
  if ('error' in auth) return privateJson({ error: auth.error, reason: auth.reason }, auth.status);
  try {
    return privateJson(await computeCourseState(auth.user.id));
  } catch (err) {
    console.error('course state failed', err);
    return privateJson({ error: 'progress_unavailable' }, 503);
  }
};
```

- [ ] **Step 9: Gates and a curl check**

Run: `npm test` (124), `npm run check`, `npm run build`.

Curl (local environment; grant the admin an enrollment by hand as in 1b: `POST /rest/v1/course_enrollments` with `{"user_id": ..., "course_id": "sss-course-v1", "source": "admin"}` using the service key):

```
GET /api/course/state without a bearer      -> 401 {"error":"unauthorized"}
GET /api/course/state as the learner        -> 403 {"error":"enrollment_required","reason":"none"}
GET /api/course/state as the enrolled admin -> 200 {"lessons":{},"modules":{"m01":{...},...},"resume_lesson_id":null,...}
```

(`resume_lesson_id` is null today because no lesson is published yet; Task 7 publishes V04.) Leave the admin's enrollment row in place for Task 4; delete it at the end of Task 7's verification.

- [ ] **Step 10: Commit**

```bash
unix2dos -q src/lib/course/stateRules.ts src/lib/server/course/progress.ts src/lib/server/course/state.ts src/pages/api/course/state.ts src/lib/course/__tests__/stateRules.test.ts
git add src/lib/course/ids.ts src/lib/course/stateRules.ts src/lib/server/course/progress.ts src/lib/server/course/state.ts src/pages/api/course/state.ts src/lib/course/__tests__/stateRules.test.ts
git commit -m "Derive the learner's course state and serve it"
```

---

### Task 4: The lesson, progress and worksheet endpoints

**Files:**
- Create: `src/lib/course/lessonView.ts`, `src/lib/server/course/content.ts`, `src/pages/api/course/lesson.ts`, `src/pages/api/course/progress.ts`, `src/pages/api/course/worksheet.ts`
- Test: `src/lib/course/__tests__/lessonView.test.ts`

**Interfaces:**
- Consumes: `getPlayback` (Task 1), `applyAction`, `newProgressRow`, `progressView`, `lessonComplete` (Task 2), `loadProgress`, `saveProgress`, `computeCourseState` (Task 3), `requireEnrolled`, `requireAdmin`, `privateJson`, `getCourseCatalog`, `isVisibleTo`, `isLearnerVisible`, `LESSON_ID_RE`, `WORKSHEET_ID_RE`, `COURSE`.
- Produces: `learnerSections(sections)`, `videoUidFor(lesson, placeholderUid)`, `neighbour(catalog lesson | undefined, adminPreview)`; `getLessonForLearner(id, adminPreview)`, `getWorksheet(id)`; the three endpoints per "Shapes shared across tasks".

- [ ] **Step 1: Write the failing test**

`src/lib/course/__tests__/lessonView.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { learnerSections, neighbour, videoUidFor } from '../lessonView';

const sections = { outcome: 'o', keyPoints: 'k', exercise: 'e', modelResponse: 'SECRET', selfReview: 's', transcript: 't' };

describe('learnerSections', () => {
  it('never includes the model response and uses snake_case keys', () => {
    expect(learnerSections(sections)).toEqual({ outcome: 'o', key_points: 'k', exercise: 'e', self_review: 's', transcript: 't' });
    expect(JSON.stringify(learnerSections(sections))).not.toContain('SECRET');
  });
});

describe('videoUidFor', () => {
  it('prefers the lesson video, falls back to the placeholder clip for placeholder lessons, else nothing', () => {
    expect(videoUidFor({ streamUid: 'a'.repeat(32), videoPlaceholder: false }, 'p'.repeat(32))).toBe('a'.repeat(32));
    expect(videoUidFor({ streamUid: null, videoPlaceholder: true }, 'p'.repeat(32))).toBe('p'.repeat(32));
    expect(videoUidFor({ streamUid: null, videoPlaceholder: true }, null)).toBeNull();
    expect(videoUidFor({ streamUid: null, videoPlaceholder: false }, 'p'.repeat(32))).toBeNull();
  });
});

describe('neighbour', () => {
  it('links published lessons for learners and staged ones only for an admin preview', () => {
    expect(neighbour(undefined, false)).toBeNull();
    expect(neighbour({ id: 'v05', title: 'Five', status: 'published' }, false)).toEqual({ id: 'v05', title: 'Five', available: true });
    expect(neighbour({ id: 'v05', title: 'Five', status: 'staged' }, false)).toEqual({ id: 'v05', title: 'Five', available: false });
    expect(neighbour({ id: 'v05', title: 'Five', status: 'staged' }, true)).toEqual({ id: 'v05', title: 'Five', available: true });
    expect(neighbour({ id: 'v05', title: 'Five', status: 'draft' }, true)).toEqual({ id: 'v05', title: 'Five', available: false });
  });
});
```

- [ ] **Step 2: Create `src/lib/course/lessonView.ts`**

```ts
import type { LessonSections } from './lessonSections';
import type { LessonStatus } from './types';
import { isVisibleTo } from './visibility';

/** The pure pieces of the lesson payload, so the split "what a learner may see" is testable. */

export interface LearnerSections {
  outcome: string;
  key_points: string;
  exercise: string;
  self_review: string;
  transcript: string;
}

/** Everything except the model response, which only the reveal action returns. */
export const learnerSections = (s: LessonSections): LearnerSections => ({
  outcome: s.outcome,
  key_points: s.keyPoints,
  exercise: s.exercise,
  self_review: s.selfReview,
  transcript: s.transcript,
});

/** The video to play: the lesson's own, else the stand-in clip for placeholder lessons, else none. */
export const videoUidFor = (
  lesson: { streamUid: string | null; videoPlaceholder: boolean },
  placeholderUid: string | null
): string | null => lesson.streamUid ?? (lesson.videoPlaceholder ? placeholderUid : null);

export interface Neighbour {
  id: string;
  title: string;
  available: boolean;
}

/** A prev or next link. Unavailable lessons are named so the island can say "coming soon". */
export const neighbour = (
  lesson: { id: string; title: string; status: LessonStatus } | undefined,
  adminPreview: boolean
): Neighbour | null =>
  lesson ? { id: lesson.id, title: lesson.title, available: isVisibleTo(lesson, adminPreview) } : null;
```

- [ ] **Step 3: Create `src/lib/server/course/content.ts`**

```ts
import { getCourseCatalog } from '../../course/catalog';
import type { CatalogLesson, CatalogModule } from '../../course/validate';
import type { WorksheetInput } from '../../course/types';
import { isVisibleTo } from '../../course/visibility';

/**
 * Server-side reads of the course catalog for the API routes. Astro-only:
 * the catalog reads astro:content. Checks and answer keys are read here too
 * when Phase 2 adds the module checks.
 */

export interface LessonWithModule {
  lesson: CatalogLesson;
  module: CatalogModule;
  prev: CatalogLesson | undefined;
  next: CatalogLesson | undefined;
}

/** A lesson the caller may see, or null (draft, unknown, or staged without an admin preview). */
export async function getLessonForLearner(id: string, adminPreview: boolean): Promise<LessonWithModule | null> {
  const catalog = await getCourseCatalog();
  const lesson = catalog.byId[id];
  if (!lesson || !isVisibleTo(lesson, adminPreview)) return null;
  return {
    lesson,
    module: catalog.modules[lesson.moduleOrder - 1],
    prev: lesson.prevId ? catalog.byId[lesson.prevId] : undefined,
    next: lesson.nextId ? catalog.byId[lesson.nextId] : undefined,
  };
}

export async function getWorksheet(id: string): Promise<WorksheetInput | null> {
  const catalog = await getCourseCatalog();
  return catalog.worksheets.find((w) => w.id === id) ?? null;
}
```

- [ ] **Step 4: Create `src/pages/api/course/lesson.ts`**

```ts
import type { APIRoute } from 'astro';
import { privateJson } from '../../../lib/server/auth';
import { requireAdmin } from '../../../lib/server/adminAuth';
import { requireEnrolled } from '../../../lib/server/course/enrollment';
import { getLessonForLearner } from '../../../lib/server/course/content';
import { getPlayback } from '../../../lib/server/course/stream';
import { loadProgress } from '../../../lib/server/course/progress';
import { LESSON_ID_RE } from '../../../lib/course/ids';
import { learnerSections, neighbour, videoUidFor } from '../../../lib/course/lessonView';
import { progressView } from '../../../lib/course/progressRules';
import { COURSE } from '../../../data/course';

export const prerender = false;

/**
 * One lesson for an enrolled learner: the five learner-facing sections, the
 * signed video, neighbours and their progress. The model response is never
 * here; POST /api/course/progress with reveal_model returns it. An admin may
 * add ?preview=1 to open a staged lesson without being enrolled.
 */
export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const id = url.searchParams.get('id') ?? '';
  if (!LESSON_ID_RE.test(id)) return privateJson({ error: 'bad_request', field: 'id' }, 400);

  let userId: string;
  let adminPreview = false;
  if (url.searchParams.get('preview') === '1') {
    const admin = await requireAdmin(request);
    if (!admin) return privateJson({ error: 'forbidden' }, 403);
    userId = admin.id;
    adminPreview = true;
  } else {
    const auth = await requireEnrolled(request);
    if ('error' in auth) return privateJson({ error: auth.error, reason: auth.reason }, auth.status);
    userId = auth.user.id;
  }

  const found = await getLessonForLearner(id, adminPreview);
  if (!found) return privateJson({ error: 'not_found' }, 404);
  const { lesson, module, prev, next } = found;

  const uid = videoUidFor(lesson, COURSE.placeholderStreamUid);
  const [video, row] = await Promise.all([
    uid ? getPlayback(uid) : Promise.resolve(null),
    loadProgress(userId, id).catch((err) => {
      console.error('course lesson progress read failed', err);
      return null;
    }),
  ]);

  return privateJson({
    lesson: {
      id: lesson.id,
      title: lesson.title,
      kind: lesson.kind,
      module_id: module.id,
      module_title: module.title,
      module_order: module.order,
      order: lesson.order,
      content_version: lesson.contentVersion,
      duration_min: lesson.durationMin,
      status: lesson.status,
      video_placeholder: lesson.videoPlaceholder,
      worksheet_id: lesson.worksheet,
      has_exercise: lesson.sections.exercise.trim() !== '',
      has_model_response: lesson.kind === 'standard' && lesson.sections.modelResponse.trim() !== '',
      sections: learnerSections(lesson.sections),
      prev: neighbour(prev, adminPreview),
      next: neighbour(next, adminPreview),
    },
    video,
    video_unavailable: Boolean(uid) && video === null,
    progress: row ? progressView(row) : null,
  });
};
```

- [ ] **Step 5: Create `src/pages/api/course/progress.ts`**

```ts
import type { APIRoute } from 'astro';
import { privateJson } from '../../../lib/server/auth';
import { requireEnrolled } from '../../../lib/server/course/enrollment';
import { getLessonForLearner } from '../../../lib/server/course/content';
import { loadProgress, saveProgress } from '../../../lib/server/course/progress';
import { computeCourseState } from '../../../lib/server/course/state';
import { LESSON_ID_RE } from '../../../lib/course/ids';
import { PROGRESS_ACTIONS, applyAction, newProgressRow, progressView } from '../../../lib/course/progressRules';

export const prerender = false;

/**
 * One learner action on one published lesson. The rules decide; this route
 * loads, applies, persists, and reports what changed. Nothing here resets.
 */
export const POST: APIRoute = async ({ request }) => {
  const auth = await requireEnrolled(request);
  if ('error' in auth) return privateJson({ error: auth.error, reason: auth.reason }, auth.status);

  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const lessonId = typeof body.lesson_id === 'string' ? body.lesson_id : '';
  if (!LESSON_ID_RE.test(lessonId)) return privateJson({ error: 'bad_request', field: 'lesson_id' }, 400);
  const action = typeof body.action === 'string' ? body.action : '';
  if (!(PROGRESS_ACTIONS as readonly string[]).includes(action)) {
    return privateJson({ error: 'bad_request', field: 'action' }, 400);
  }

  // Learners act on published lessons only; an admin preview reads but never writes.
  const found = await getLessonForLearner(lessonId, false);
  if (!found) return privateJson({ error: 'not_found' }, 404);
  const { lesson, next } = found;

  try {
    const now = new Date();
    const before = (await loadProgress(auth.user.id, lessonId)) ?? newProgressRow(lessonId, lesson.contentVersion, now);
    const result = applyAction(before, lesson.kind, lesson.sections.exercise.trim() !== '', action, body, now);
    if (!result.ok) return privateJson({ error: result.error, ...(result.extra ?? {}) }, result.status);

    const row = result.changed ? await saveProgress(auth.user.id, result.row) : before;
    const lessonCompleted = !before.completed_at && Boolean(row.completed_at);

    let moduleCompleted = false;
    if (lessonCompleted) {
      const state = await computeCourseState(auth.user.id);
      moduleCompleted = Boolean(state.modules[lesson.module]?.complete);
    }

    return privateJson({
      progress: progressView(row),
      lesson_completed: lessonCompleted,
      module_completed: moduleCompleted,
      next_lesson_id: next && next.status === 'published' ? next.id : null,
      ...(result.reveal ? { model_response: lesson.sections.modelResponse } : {}),
    });
  } catch (err) {
    console.error('course progress failed', err);
    return privateJson({ error: 'progress_unavailable' }, 503);
  }
};
```

- [ ] **Step 6: Create `src/pages/api/course/worksheet.ts`**

```ts
import type { APIRoute } from 'astro';
import { privateJson } from '../../../lib/server/auth';
import { requireEnrolled } from '../../../lib/server/course/enrollment';
import { getWorksheet } from '../../../lib/server/course/content';
import { WORKSHEET_ID_RE } from '../../../lib/course/ids';

export const prerender = false;

/** A module worksheet's markdown, for enrolled learners. Printed from the browser; no PDF is stored. */
export const GET: APIRoute = async ({ request }) => {
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!WORKSHEET_ID_RE.test(id)) return privateJson({ error: 'bad_request', field: 'id' }, 400);
  const auth = await requireEnrolled(request);
  if ('error' in auth) return privateJson({ error: auth.error, reason: auth.reason }, auth.status);
  const worksheet = await getWorksheet(id);
  if (!worksheet) return privateJson({ error: 'not_found' }, 404);
  return privateJson({ id: worksheet.id, title: worksheet.title, module_id: worksheet.module, markdown: worksheet.body });
};
```

- [ ] **Step 7: Gates and the curl matrix**

Run: `npm test` (127), `npm run check`, `npm run build`.

For the curl checks a published lesson is needed. Temporarily set `status: staged` on `src/content/course/lessons/v04.md` for the admin-preview case and `status: published` plus `videoPlaceholder: true` for the learner cases (this is Task 7's final content change; make it now and keep it), restart the dev server, and with the enrolled admin's bearer (`TOKEN`) and the unenrolled learner's (`TOKEN2`):

```
GET /api/course/lesson?id=zzz  (admin)        -> 400 {"error":"bad_request","field":"id"}
GET /api/course/lesson?id=v04  (learner)      -> 403 {"error":"enrollment_required","reason":"none"}
GET /api/course/lesson?id=v05  (admin)        -> 404 {"error":"not_found"}          (draft)
GET /api/course/lesson?id=v04  (admin)        -> 200: lesson.sections has outcome, key_points, exercise, self_review, transcript and NO model response; the body does not contain "Brian interrupted the sentence"; video null; video_unavailable false; lesson.video_placeholder true; progress null; prev {v03, available false}; next {v05, available false}
GET /api/course/lesson?id=v04&preview=1 (learner) -> 403 {"error":"forbidden"}
POST /api/course/progress {"lesson_id":"v04","action":"reveal_model"}          -> 409 {"error":"practice_required"}
POST /api/course/progress {"lesson_id":"v04","action":"complete"}              -> 409 {"error":"incomplete","missing":["studied","practice","model","acknowledge"]}
POST ... {"lesson_id":"v04","action":"open"}                                    -> 200, progress.revision 0
POST ... {"lesson_id":"v04","action":"studied"}                                 -> 200, progress.studied true
POST ... {"lesson_id":"v04","action":"save_response","text":"first","expected_revision":0} -> 200, revision 1, practice_state in_site
POST ... {"lesson_id":"v04","action":"save_response","text":"second","expected_revision":0} -> 409 {"error":"revision_conflict","server":{"text":"first","revision":1}}
POST ... {"lesson_id":"v04","action":"reveal_model"}                            -> 200 with model_response containing "Brian interrupted the sentence"
POST ... {"lesson_id":"v04","action":"acknowledge"}                             -> 200 acknowledged true
POST ... {"lesson_id":"v04","action":"complete"}                                -> 200 lesson_completed true, module_completed false, next_lesson_id null
GET /api/course/lesson?id=v04 (admin)                                           -> progress.completed true; model response still absent
GET /api/course/state (admin)                                                   -> lessons.v04.completed true; resume_lesson_id null (the only published lesson is complete)
GET /api/course/worksheet?id=w-m02 (admin)                                      -> 200 with markdown containing "Alex"; ?id=w-x -> 400; learner -> 403
```

The monotone trigger, through REST with the service key: `PATCH /rest/v1/course_progress?lesson_id=eq.v04&user_id=eq.<admin>` with `{"completed_at": null, "studied_at": null}` returns the row with both timestamps unchanged.

Record every response. Then delete the admin's `course_progress` row (REST DELETE) so the browser walkthrough in Task 8 starts clean; keep the enrollment row.

- [ ] **Step 8: Commit**

```bash
unix2dos -q src/lib/course/lessonView.ts src/lib/server/course/content.ts src/pages/api/course/lesson.ts src/pages/api/course/progress.ts src/pages/api/course/worksheet.ts src/lib/course/__tests__/lessonView.test.ts
git add src/lib/course/lessonView.ts src/lib/server/course/content.ts src/pages/api/course/lesson.ts src/pages/api/course/progress.ts src/pages/api/course/worksheet.ts src/lib/course/__tests__/lessonView.test.ts src/content/course/lessons/v04.md
git commit -m "Serve lessons, progress and worksheets to enrolled learners"
```

---

### Task 5: Browser client, semantic markdown, the sections renderer and the player

**Files:**
- Modify: `src/lib/courseClient.ts`, `src/lib/analytics.ts`, `src/components/react/chat/Markdown.tsx`
- Create: `src/components/react/LessonSections.tsx`, `src/components/react/StreamPlayer.tsx`

**Interfaces:**
- Produces: in `courseClient.ts` the types `LessonPayload`, `ProgressView`, `ProgressResponse`, `CourseStateView`, `WorksheetPayload` (shapes from "Shapes shared across tasks"), `CourseActionError.extra`, `fetchLesson(token, id, preview?)`, `postProgress(token, body)`, `fetchCourseState(token)`, `fetchWorksheet(token, id)`; analytics events `lesson_completed { lesson_id; module_id; content_version }` and `module_completed { module_id }`; `Markdown` prop `headings?: 'compact' | 'semantic'`; `LessonSections` props `{ sections: Array<{ id: string; title: string; markdown: string }> }`; `StreamPlayer` props `{ video: { embed_url; poster_url; expires_at } | null; unavailable: boolean; pending: boolean; placeholder: boolean; title: string; onRefresh: () => void }`.

- [ ] **Step 1: Client additions in `src/lib/courseClient.ts`**

Add `extra` to the error class:

```ts
export class CourseActionError extends Error {
  code: string;
  status: number;
  /** The rest of the error body (for example `server` on a revision conflict, `missing` on incomplete). */
  extra: Record<string, unknown>;

  constructor(code: string, status: number, message?: string, extra: Record<string, unknown> = {}) {
    super(message ?? courseErrorMessage(code));
    this.name = 'CourseActionError';
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}
```

Append the types and calls:

```ts
export interface ProgressView {
  lesson_id: string;
  content_version: number;
  studied: boolean;
  practice_state: 'none' | 'in_site' | 'offline';
  response_text: string;
  previous_response_text: string | null;
  revision: number;
  model_revealed: boolean;
  acknowledged: boolean;
  completed: boolean;
  completed_at: string | null;
  last_opened_at: string;
}

export interface LessonNeighbour {
  id: string;
  title: string;
  available: boolean;
}

export interface LessonPayload {
  lesson: {
    id: string;
    title: string;
    kind: 'standard' | 'orientation' | 'plan';
    module_id: string;
    module_title: string;
    module_order: number;
    order: number;
    content_version: number;
    duration_min: number;
    status: string;
    video_placeholder: boolean;
    worksheet_id: string;
    has_exercise: boolean;
    has_model_response: boolean;
    sections: { outcome: string; key_points: string; exercise: string; self_review: string; transcript: string };
    prev: LessonNeighbour | null;
    next: LessonNeighbour | null;
  };
  video: { embed_url: string; poster_url: string; expires_at: string } | null;
  video_unavailable: boolean;
  progress: ProgressView | null;
}

export interface ProgressResponse {
  progress: ProgressView;
  lesson_completed: boolean;
  module_completed: boolean;
  next_lesson_id: string | null;
  model_response?: string;
}

export interface CourseStateView {
  lessons: Record<string, { completed: boolean; studied: boolean; practice_state: string; model_revealed: boolean; acknowledged: boolean; last_opened_at: string }>;
  modules: Record<string, { complete: boolean; lessons_published: number; lessons_completed: number; checks_complete: boolean }>;
  resume_lesson_id: string | null;
  assessment_eligible: boolean;
  plan_complete: boolean;
  course_complete: boolean;
  certification: { version: string; status: 'none' };
}

export interface WorksheetPayload {
  id: string;
  title: string;
  module_id: string;
  markdown: string;
}

/** GET with the bearer; throws CourseActionError with the server's code (or network_error). */
async function getJson<T>(accessToken: string, path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { headers: { Authorization: `Bearer ${accessToken}` } });
  } catch {
    throw new CourseActionError('network_error', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const { error, message, ...extra } = (data ?? {}) as Record<string, unknown>;
    throw new CourseActionError(typeof error === 'string' ? error : 'request_failed', res.status, typeof message === 'string' ? message : undefined, extra);
  }
  return data as T;
}

export const fetchLesson = (accessToken: string, id: string, preview = false): Promise<LessonPayload> =>
  getJson(accessToken, `/api/course/lesson?id=${encodeURIComponent(id)}${preview ? '&preview=1' : ''}`);

export const fetchCourseState = (accessToken: string): Promise<CourseStateView> => getJson(accessToken, '/api/course/state');

export const fetchWorksheet = (accessToken: string, id: string): Promise<WorksheetPayload> =>
  getJson(accessToken, `/api/course/worksheet?id=${encodeURIComponent(id)}`);

export interface ProgressBody {
  lesson_id: string;
  action: 'open' | 'studied' | 'save_response' | 'practiced_offline' | 'reveal_model' | 'acknowledge' | 'complete';
  text?: string;
  expected_revision?: number;
  keep_previous?: boolean;
}

export async function postProgress(accessToken: string, body: ProgressBody): Promise<ProgressResponse> {
  let res: Response;
  try {
    res = await fetch('/api/course/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new CourseActionError('network_error', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const { error, message, ...extra } = (data ?? {}) as Record<string, unknown>;
    throw new CourseActionError(typeof error === 'string' ? error : 'request_failed', res.status, typeof message === 'string' ? message : undefined, extra);
  }
  return data as ProgressResponse;
}
```

Add to `courseErrorMessage` before `default`:

```ts
    case 'enrollment_required':
      return 'This lesson is for enrolled learners.';
    case 'not_found':
      return 'This lesson is not available yet.';
    case 'progress_unavailable':
      return 'Your progress could not be saved just now. Please try again in a moment.';
    case 'incomplete':
      return 'A few steps are still open in this lesson.';
    case 'practice_required':
      return 'Try the exercise first, then compare with the model response.';
```

- [ ] **Step 2: Analytics events in `src/lib/analytics.ts`**

After the `enrollment_ready` member add:

```ts
  /** A lesson reached complete (fired once, by the action that completed it). */
  | { event: 'lesson_completed'; lesson_id: string; module_id: string; content_version: number }
  /** The lesson that completed also completed its module. */
  | { event: 'module_completed'; module_id: string }
```

- [ ] **Step 3: Semantic headings in `src/components/react/chat/Markdown.tsx`**

Change the signature to `export default function Markdown({ text, headings = 'compact' }: { text: string; headings?: 'compact' | 'semantic' })` and replace the heading branch with:

```tsx
    const heading = /^(#{2,4})\s+(.*)/.exec(line);
    if (heading) {
      const level = heading[1].length;
      if (headings === 'semantic') {
        // Real headings, for long-form lesson text a screen reader navigates by.
        const Tag = (`h${level}` as unknown) as 'h2';
        const cls =
          level === 2
            ? 'mt-6 font-heading text-lg font-bold text-ink-800'
            : 'mt-4 font-heading text-base font-semibold text-ink-800';
        blocks.push(
          <Tag key={i} className={cls}>
            {inline(heading[2])}
          </Tag>
        );
        return;
      }
      const cls =
        level === 2
          ? 'mt-4 font-heading text-base font-bold text-ink-800'
          : 'mt-3 font-heading text-sm font-bold text-ink-800';
      blocks.push(
        <p key={i} className={cls}>
          {inline(heading[2])}
        </p>
      );
      return;
    }
```

The chat surfaces pass nothing and render exactly as before.

- [ ] **Step 4: Create `src/components/react/LessonSections.tsx`**

```tsx
import Markdown from './chat/Markdown';

export interface LessonSection {
  id: string;
  title: string;
  markdown: string;
}

/**
 * The one renderer for lesson prose. The enrolled lesson island feeds it
 * sections from the API; the public preview page (Phase 2) feeds it the free
 * lesson at build time. Sections with no text render nothing.
 */
export default function LessonSections({ sections }: { sections: LessonSection[] }) {
  return (
    <div className="space-y-10">
      {sections
        .filter((s) => s.markdown.trim() !== '')
        .map((s) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`}>
            <h2 id={`${s.id}-title`} className="font-heading text-2xl font-bold text-ink-800">
              {s.title}
            </h2>
            <div className="prose-sss mt-4">
              <Markdown text={s.markdown} headings="semantic" />
            </div>
          </section>
        ))}
    </div>
  );
}
```

- [ ] **Step 5: Create `src/components/react/StreamPlayer.tsx`**

```tsx
import { useEffect } from 'react';

interface Props {
  video: { embed_url: string; poster_url: string; expires_at: string } | null;
  /** A video exists but its token could not be prepared. */
  unavailable: boolean;
  /** No recording exists yet (a placeholder lesson before the stand-in clip is configured). */
  pending: boolean;
  /** The clip playing is the stand-in, not this lesson's recording. */
  placeholder: boolean;
  title: string;
  /** Ask the parent to fetch the lesson again (a fresh token, or a retry). */
  onRefresh: () => void;
}

/**
 * The Cloudflare Stream iframe. No autoplay, captions on by default, and a
 * token that outlives any sitting: if a tab comes back after the token
 * expired, the parent fetches a fresh one before the learner presses play.
 */
export default function StreamPlayer({ video, unavailable, pending, placeholder, title, onRefresh }: Props) {
  useEffect(() => {
    if (!video) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() > new Date(video.expires_at).getTime()) onRefresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [video, onRefresh]);

  if (video) {
    return (
      <figure className="not-prose">
        <div className="overflow-hidden rounded-2xl bg-ink-900 shadow-card" style={{ aspectRatio: '16 / 9' }}>
          <iframe
            src={video.embed_url}
            title={title}
            className="h-full w-full"
            allow="accelerometer; gyroscope; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
        {placeholder && (
          <figcaption className="mt-2 text-sm text-slate-500">
            This lesson plays a short stand-in clip until its recording is ready.
          </figcaption>
        )}
      </figure>
    );
  }

  if (unavailable) {
    return (
      <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 text-amber-900">
        <p className="font-semibold">The video is unavailable right now.</p>
        <p className="mt-1 text-sm">The transcript, the exercise and everything else in this lesson still work.</p>
        <button type="button" onClick={onRefresh} className="btn-secondary mt-4">
          Retry
        </button>
      </div>
    );
  }

  if (pending) {
    return (
      <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-5 text-slate-700">
        <p className="font-semibold text-ink-800">The video for this lesson is being filmed.</p>
        <p className="mt-1 text-sm">Everything else in the lesson is ready to use now.</p>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 6: Gates**

Run: `npm run check`, `npm test`, `npm run build`.

- [ ] **Step 7: Commit**

```bash
unix2dos -q src/components/react/LessonSections.tsx src/components/react/StreamPlayer.tsx
git add src/lib/courseClient.ts src/lib/analytics.ts src/components/react/chat/Markdown.tsx src/components/react/LessonSections.tsx src/components/react/StreamPlayer.tsx
git commit -m "Add the lesson client, sections renderer and Stream player"
```

---

### Task 6: `LessonView`, `LessonNav` and the lesson shell

**Files:**
- Create: `src/components/react/LessonNav.tsx`, `src/components/react/LessonView.tsx`
- Modify: `src/pages/course/learn/lessons/[id].astro`

**Interfaces:**
- Consumes: everything from Task 5, `useSession`, `useCourseEntitlement`, `accountLink`, `track`, `PublicCurriculum`.
- Produces: `LessonNav` props `{ curriculum: PublicCurriculum; currentId: string; state: CourseStateView | null }`; `LessonView` props `{ lessonId: string; title: string; curriculum: PublicCurriculum; supportContact: string }`.

- [ ] **Step 1: Create `src/components/react/LessonNav.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import type { PublicCurriculum } from '../../lib/course/curriculum';
import type { CourseStateView } from '../../lib/courseClient';

interface Props {
  curriculum: PublicCurriculum;
  currentId: string;
  state: CourseStateView | null;
}

/**
 * The lessons drawer. Published lessons link; the rest are named and marked
 * "Coming soon". Focus stays inside while it is open, Esc and the backdrop
 * close it, and focus returns to the button that opened it.
 */
export default function LessonNav({ curriculum, currentId, state }: Props) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const focusable = () =>
      Array.from(panel.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []);
    focusable()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      opener.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Lessons
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex" onMouseDown={() => setOpen(false)}>
          <div className="absolute inset-0 bg-ink-800/50" />
          <div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label="Lessons"
            className="relative ml-auto flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-6 shadow-card-hover"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-xl font-bold text-ink-800">Lessons</h2>
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost" aria-label="Close">
                Close
              </button>
            </div>
            <ol className="mt-6 space-y-6">
              {curriculum.modules.map((m) => (
                <li key={m.id}>
                  <p className="eyebrow">Module {m.order}</p>
                  <p className="mt-1 font-semibold text-ink-800">{m.title}</p>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {m.lessons.map((l) => {
                      const done = state?.lessons[l.id]?.completed;
                      const current = l.id === currentId;
                      return (
                        <li key={l.id} className="flex items-baseline justify-between gap-3">
                          {l.status === 'published' ? (
                            <a
                              href={`/course/learn/lessons/${l.id}`}
                              aria-current={current ? 'page' : undefined}
                              className={`hover:underline ${current ? 'font-semibold text-ink-800' : 'text-brand-700'}`}
                            >
                              {l.title}
                            </a>
                          ) : (
                            <span className="text-slate-500">{l.title}</span>
                          )}
                          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            {l.status !== 'published' ? 'Coming soon' : done ? 'Done' : current ? 'Now' : ''}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Create `src/components/react/LessonView.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../../lib/useSession';
import { accountLink } from '../../lib/accountLink';
import {
  CourseActionError,
  courseErrorMessage,
  fetchCourseState,
  fetchLesson,
  postProgress,
  type CourseStateView,
  type LessonPayload,
  type ProgressBody,
  type ProgressView,
} from '../../lib/courseClient';
import { track } from '../../lib/analytics';
import type { PublicCurriculum } from '../../lib/course/curriculum';
import LessonNav from './LessonNav';
import LessonSections from './LessonSections';
import StreamPlayer from './StreamPlayer';

interface Props {
  lessonId: string;
  title: string;
  curriculum: PublicCurriculum;
  supportContact: string;
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: Date }
  | { kind: 'failed'; keptFrom: Date | null }
  | { kind: 'conflict'; server: { text: string; revision: number } };

const SAVE_DEBOUNCE_MS = 1500;
const draftKey = (userId: string, lessonId: string) => `sss-course-draft:${userId}:${lessonId}`;
const clock = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * The enrolled lesson. Everything paid comes from /api/course/lesson with
 * the bearer token: the shell around this island carries only the title and
 * the outcome. Progress writes go one action at a time through
 * /api/course/progress, and the response text is autosaved with a revision
 * check so two tabs never silently overwrite each other.
 */
export default function LessonView({ lessonId, title, curriculum, supportContact }: Props) {
  const { session, user, loading: sessionLoading } = useSession();
  const [payload, setPayload] = useState<LessonPayload | null>(null);
  const [loadError, setLoadError] = useState<CourseActionError | null>(null);
  const [state, setState] = useState<CourseStateView | null>(null);
  const [progress, setProgress] = useState<ProgressView | null>(null);
  const [modelResponse, setModelResponse] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [completedNow, setCompletedNow] = useState(false);
  const [nextId, setNextId] = useState<string | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const revision = useRef(0);
  const textRef = useRef('');
  textRef.current = text;

  const token = session?.access_token ?? null;

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchLesson(token, lessonId);
      setPayload(data);
      setLoadError(null);
      if (data.progress) {
        setProgress(data.progress);
        revision.current = data.progress.revision;
      }
    } catch (err) {
      setLoadError(err instanceof CourseActionError ? err : new CourseActionError('request_failed', 0));
    }
  }, [token, lessonId]);

  // First load, the open action, the drawer's state, and the local draft.
  useEffect(() => {
    if (sessionLoading || !token || !user) return;
    void load();
    void fetchCourseState(token).then(setState).catch(() => setState(null));
    void postProgress(token, { lesson_id: lessonId, action: 'open' }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading, user?.id, lessonId]);

  // Seed the editor: the local draft wins over the server copy if it is newer than the last save.
  useEffect(() => {
    if (!payload || !user) return;
    const server = payload.progress?.response_text ?? '';
    let draft: { text: string; revision: number } | null = null;
    try {
      const raw = window.localStorage.getItem(draftKey(user.id, lessonId));
      draft = raw ? (JSON.parse(raw) as { text: string; revision: number }) : null;
    } catch {
      draft = null;
    }
    const serverRevision = payload.progress?.revision ?? 0;
    setText(draft && draft.revision === serverRevision && draft.text !== server ? draft.text : server);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload?.lesson.id]);

  const act = useCallback(
    async (body: Omit<ProgressBody, 'lesson_id'>) => {
      if (!token) return null;
      setBusy(body.action);
      setActionError(null);
      try {
        const res = await postProgress(token, { lesson_id: lessonId, ...body });
        setProgress(res.progress);
        revision.current = res.progress.revision;
        return res;
      } catch (err) {
        if (err instanceof CourseActionError) {
          if (err.code === 'incomplete' && Array.isArray(err.extra.missing)) setMissing(err.extra.missing as string[]);
          setActionError(courseErrorMessage(err.code));
        } else {
          setActionError('Something went wrong. Please try again.');
        }
        return null;
      } finally {
        setBusy(null);
      }
    },
    [token, lessonId]
  );

  const saveNow = useCallback(
    async (opts: { keepPrevious?: boolean; expected?: number } = {}) => {
      if (!token || !user) return;
      const value = textRef.current;
      setSave({ kind: 'saving' });
      try {
        const res = await postProgress(token, {
          lesson_id: lessonId,
          action: 'save_response',
          text: value,
          expected_revision: opts.expected ?? revision.current,
          ...(opts.keepPrevious ? { keep_previous: true } : {}),
        });
        setProgress(res.progress);
        revision.current = res.progress.revision;
        setSave({ kind: 'saved', at: new Date() });
        try {
          window.localStorage.removeItem(draftKey(user.id, lessonId));
        } catch {
          // Nothing to clean up.
        }
      } catch (err) {
        if (err instanceof CourseActionError && err.code === 'revision_conflict') {
          setSave({ kind: 'conflict', server: err.extra.server as { text: string; revision: number } });
        } else {
          setSave((s) => ({ kind: 'failed', keptFrom: s.kind === 'saved' ? s.at : null }));
        }
      }
    },
    [token, user, lessonId]
  );

  const onType = (value: string) => {
    setText(value);
    if (user) {
      try {
        window.localStorage.setItem(draftKey(user.id, lessonId), JSON.stringify({ text: value, revision: revision.current }));
      } catch {
        // Private mode: the server copy is still the record.
      }
    }
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void saveNow(), SAVE_DEBOUNCE_MS);
  };

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  const reveal = async () => {
    const res = await act({ action: 'reveal_model' });
    if (res?.model_response !== undefined) setModelResponse(res.model_response);
  };

  const complete = async () => {
    const res = await act({ action: 'complete' });
    if (!res) return;
    setMissing([]);
    setNextId(res.next_lesson_id);
    if (res.lesson_completed && payload) {
      setCompletedNow(true);
      track({
        event: 'lesson_completed',
        lesson_id: payload.lesson.id,
        module_id: payload.lesson.module_id,
        content_version: payload.lesson.content_version,
      });
      if (res.module_completed) track({ event: 'module_completed', module_id: payload.lesson.module_id });
    }
  };

  if (sessionLoading) return <Note>Loading the lesson…</Note>;
  if (!session || user?.is_anonymous) {
    return (
      <Note>
        Sign in to open this lesson.{' '}
        <a href={accountLink({ next: window.location.pathname })} className="font-semibold text-brand-700 underline">
          Sign in
        </a>
      </Note>
    );
  }
  if (loadError) {
    if (loadError.code === 'enrollment_required') {
      return (
        <Note>
          This lesson is for enrolled learners.{' '}
          <a href="/course/learn/" className="font-semibold text-brand-700 underline">
            Go to your course
          </a>
        </Note>
      );
    }
    return (
      <Note>
        {courseErrorMessage(loadError.code)}{' '}
        <button type="button" onClick={() => void load()} className="font-semibold text-brand-700 underline">
          Try again
        </button>
      </Note>
    );
  }
  if (!payload) return <Note>Loading the lesson…</Note>;

  const { lesson } = payload;
  const p = progress;
  const done = Boolean(p?.completed);
  const hasPractice = (p?.practice_state ?? 'none') !== 'none' || text.trim() !== '';
  const stepClass = (ok: boolean) =>
    `flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
      ok ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-700 hover:border-brand-200'
    }`;
  const mark = (ok: boolean) => (
    <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-slate-300'}`} />
  );

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LessonNav curriculum={curriculum} currentId={lessonId} state={state} />
        <a href={`/course/learn/worksheets/${lesson.worksheet_id}`} className="text-sm font-semibold text-brand-700 hover:underline">
          Module {lesson.module_order} worksheet
        </a>
      </div>

      {p && p.content_version < lesson.content_version && (
        <p className="rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-sm text-slate-700">
          This lesson was updated since you last worked on it. Your progress and your response are kept.
        </p>
      )}

      <StreamPlayer
        video={payload.video}
        unavailable={payload.video_unavailable}
        pending={!payload.video && !payload.video_unavailable}
        placeholder={lesson.video_placeholder}
        title={title}
        onRefresh={() => void load()}
      />

      <section aria-labelledby="studied-title">
        <h2 id="studied-title" className="sr-only">Study</h2>
        <button type="button" onClick={() => void act({ action: 'studied' })} disabled={busy !== null || Boolean(p?.studied)} className={stepClass(Boolean(p?.studied))}>
          {mark(Boolean(p?.studied))}
          I watched the video or studied the transcript
        </button>
      </section>

      <LessonSections sections={[{ id: 'key-points', title: 'Key points', markdown: lesson.sections.key_points }]} />

      {lesson.has_exercise && (
        <section aria-labelledby="exercise-title" className="space-y-4">
          <LessonSections sections={[{ id: 'exercise', title: 'Exercise', markdown: lesson.sections.exercise }]} />
          <label htmlFor="response" className="block text-sm font-semibold text-ink-800">
            Your response
          </label>
          <textarea
            id="response"
            value={text}
            onChange={(e) => onType(e.target.value)}
            rows={8}
            maxLength={20000}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="Write here. Your work saves as you type."
          />
          <p aria-live="polite" className="text-sm text-slate-500">
            {save.kind === 'saving' && 'Saving your response…'}
            {save.kind === 'saved' && `Saved ${clock(save.at)}`}
            {save.kind === 'failed' &&
              (save.keptFrom ? `Could not save. Your last saved version from ${clock(save.keptFrom)} is kept.` : 'Could not save. Your draft is kept on this device.')}
          </p>
          {save.kind === 'conflict' && (
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">This response was changed somewhere else, probably in another tab.</p>
              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white/70 p-3 text-slate-700">{save.server.text}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setText(save.server.text);
                    revision.current = save.server.revision;
                    setSave({ kind: 'saved', at: new Date() });
                  }}
                >
                  Use the other version
                </button>
                <button type="button" className="btn-primary" onClick={() => void saveNow({ keepPrevious: true, expected: save.server.revision })}>
                  Keep mine
                </button>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => void act({ action: 'practiced_offline' })}
            disabled={busy !== null || (p?.practice_state ?? 'none') !== 'none'}
            className={stepClass((p?.practice_state ?? 'none') !== 'none')}
          >
            {mark((p?.practice_state ?? 'none') !== 'none')}
            I did this exercise on paper or out loud
          </button>
        </section>
      )}

      {lesson.has_model_response && (
        <section aria-labelledby="model-title">
          <h2 id="model-title" className="font-heading text-2xl font-bold text-ink-800">Model response</h2>
          {modelResponse === null ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm text-slate-600">Try the exercise first. The model response is here when you are ready to compare.</p>
              <button type="button" onClick={() => void reveal()} disabled={busy !== null || !hasPractice} className="btn-primary mt-4 disabled:opacity-60">
                Reveal the model response
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-8">
              <div className="prose-sss rounded-2xl border border-brand-100 bg-brand-50/40 p-5">
                <LessonSections sections={[{ id: 'model-response', title: 'The model response', markdown: modelResponse }]} />
              </div>
              <LessonSections sections={[{ id: 'self-review', title: 'Self-review', markdown: lesson.sections.self_review }]} />
              <button type="button" onClick={() => void act({ action: 'acknowledge' })} disabled={busy !== null || Boolean(p?.acknowledged)} className={stepClass(Boolean(p?.acknowledged))}>
                {mark(Boolean(p?.acknowledged))}
                I have compared my response with the model
              </button>
            </div>
          )}
        </section>
      )}

      {!lesson.has_model_response && (
        <button type="button" onClick={() => void act({ action: 'acknowledge' })} disabled={busy !== null || Boolean(p?.acknowledged)} className={stepClass(Boolean(p?.acknowledged))}>
          {mark(Boolean(p?.acknowledged))}
          I have taken this in
        </button>
      )}

      {lesson.sections.transcript.trim() !== '' && (
        <details className="rounded-2xl border border-slate-100 bg-white p-5">
          <summary className="cursor-pointer font-heading text-lg font-bold text-ink-800">Transcript</summary>
          <div className="prose-sss mt-4">
            <LessonSections sections={[{ id: 'transcript', title: 'Transcript', markdown: lesson.sections.transcript }]} />
          </div>
        </details>
      )}

      <section aria-labelledby="complete-title" className="rounded-2xl border border-slate-100 bg-white p-6 shadow-card">
        <h2 id="complete-title" className="font-heading text-xl font-bold text-ink-800">
          {done ? 'Lesson complete' : 'Finish this lesson'}
        </h2>
        {!done && (
          <button type="button" onClick={() => void complete()} disabled={busy !== null} className="btn-primary mt-4 disabled:opacity-60">
            Mark this lesson complete
          </button>
        )}
        {missing.length > 0 && !done && (
          <p className="mt-3 text-sm text-slate-600">
            Still to do:{' '}
            {missing
              .map((m) => ({ studied: 'study the lesson', practice: 'try the exercise', model: 'reveal the model response', acknowledge: 'compare your response', response: 'write your response' })[m] ?? m)
              .join(', ')}
            .
          </p>
        )}
        {actionError && missing.length === 0 && <p className="mt-3 text-sm text-red-600">{actionError}</p>}
        {(done || completedNow) && (
          <div className="mt-4 flex flex-wrap gap-3">
            {lesson.next && lesson.next.available ? (
              <a href={`/course/learn/lessons/${lesson.next.id}`} className="btn-primary">
                Next: {lesson.next.title}
              </a>
            ) : lesson.next ? (
              <p className="text-sm text-slate-600">Next up, coming soon: {lesson.next.title}</p>
            ) : null}
            <a href="/course/learn/" className="btn-secondary">
              Back to your course
            </a>
          </div>
        )}
        {nextId === null && completedNow && !lesson.next && (
          <p className="mt-3 text-sm text-slate-600">That is the last lesson available today.</p>
        )}
      </section>

      <p className="text-sm text-slate-500">
        Something not working? Write to{' '}
        <a href={`mailto:${supportContact}`} className="font-semibold text-brand-700 underline">
          {supportContact}
        </a>
        .
      </p>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-slate-100 bg-white p-6 text-slate-700 shadow-card">{children}</div>;
}
```

(The first import line becomes `import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';`.)

- [ ] **Step 3: Rewrite `src/pages/course/learn/lessons/[id].astro`**

```astro
---
import BaseLayout from '../../../../layouts/BaseLayout.astro';
import LessonView from '../../../../components/react/LessonView.tsx';
import { getCourseCatalog } from '../../../../lib/course/catalog';
import { publicCurriculum } from '../../../../lib/course/curriculum';
import { hasShell } from '../../../../lib/course/visibility';
import { courseCopy } from '../../../../lib/course/copy';

/**
 * Prerendered public shell for one lesson, like /dashboard: it carries only
 * public metadata (the sales page lists the same titles) and the curriculum
 * for the drawer. Everything a learner pays for comes from /api/course/lesson
 * behind the bearer token, inside LessonView. Draft lessons have no shell.
 */
export async function getStaticPaths() {
  const catalog = await getCourseCatalog();
  const curriculum = publicCurriculum(catalog);
  return catalog.lessons.filter(hasShell).map((lesson) => ({
    params: { id: lesson.id },
    props: {
      title: lesson.title,
      outcome: lesson.sections.outcome,
      moduleTitle: catalog.modules[lesson.moduleOrder - 1].title,
      moduleOrder: lesson.moduleOrder,
      order: lesson.order,
      curriculum,
    },
  }));
}

const { title, outcome, moduleTitle, moduleOrder, order, curriculum } = Astro.props;
const lessonId = Astro.params.id!;
const supportContact = courseCopy('{{support_contact}}');
---

<BaseLayout title={title} description={outcome} noindex>
  <div class="container-page py-10">
    <p class="eyebrow">Module {moduleOrder}, {moduleTitle}. Lesson {order}</p>
    <h1 class="mt-3 text-3xl font-extrabold tracking-tight text-ink-800 sm:text-4xl">{title}</h1>
    <p class="mt-4 max-w-prose text-lg leading-relaxed text-slate-600">{outcome}</p>
    <div class="mt-8">
      <LessonView client:load lessonId={lessonId} title={title} curriculum={curriculum} supportContact={supportContact} />
    </div>
  </div>
</BaseLayout>
```

`StepNav` is no longer imported here (the island renders next and previous from the API).

- [ ] **Step 4: Gates and HTML checks**

```bash
npm run check && npm test && npm run build
grep -c "Brian interrupted the sentence" dist/course/learn/lessons/v04/index.html   # 0
grep -c "Begin with your own account" dist/course/learn/lessons/v04/index.html     # 0
grep -c 'name="robots" content="noindex"' dist/course/learn/lessons/v04/index.html # 1
grep -n "—" src/components/react/LessonView.tsx src/components/react/LessonNav.tsx "src/pages/course/learn/lessons/[id].astro"   # nothing
```

- [ ] **Step 5: Commit**

```bash
unix2dos -q src/components/react/LessonNav.tsx src/components/react/LessonView.tsx
git add src/components/react/LessonNav.tsx src/components/react/LessonView.tsx "src/pages/course/learn/lessons/[id].astro"
git commit -m "Add the lesson island with the practice flow"
```

---

### Task 7: Worksheets, print styles, the dashboard resume pointer

**Files:**
- Create: `src/components/react/WorksheetView.tsx`, `src/pages/course/learn/worksheets/[id].astro`
- Modify: `src/styles/global.css`, `src/pages/og/[...route].ts`, `src/components/react/CourseDashboard.tsx`

**Interfaces:**
- Consumes: `fetchWorksheet`, `fetchCourseState`, `Markdown` semantic, `useSession`, `accountLink`.
- Produces: `WorksheetView` props `{ worksheetId: string; title: string }`.

- [ ] **Step 1: Create `src/components/react/WorksheetView.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useSession } from '../../lib/useSession';
import { accountLink } from '../../lib/accountLink';
import { CourseActionError, courseErrorMessage, fetchWorksheet, type WorksheetPayload } from '../../lib/courseClient';
import Markdown from './chat/Markdown';

/** A module worksheet for enrolled learners. Printing uses the page's print stylesheet; nothing is generated. */
export default function WorksheetView({ worksheetId, title }: { worksheetId: string; title: string }) {
  const { session, user, loading } = useSession();
  const [sheet, setSheet] = useState<WorksheetPayload | null>(null);
  const [error, setError] = useState<CourseActionError | null>(null);

  useEffect(() => {
    if (loading || !session) return;
    fetchWorksheet(session.access_token, worksheetId)
      .then(setSheet)
      .catch((err) => setError(err instanceof CourseActionError ? err : new CourseActionError('request_failed', 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.id, worksheetId]);

  if (loading) return <p className="text-slate-500">Loading the worksheet…</p>;
  if (!session || user?.is_anonymous) {
    return (
      <p className="text-slate-700">
        Sign in to open this worksheet.{' '}
        <a href={accountLink({ next: window.location.pathname })} className="font-semibold text-brand-700 underline">
          Sign in
        </a>
      </p>
    );
  }
  if (error) {
    return (
      <p className="text-slate-700">
        {courseErrorMessage(error.code)}{' '}
        <a href="/course/learn/" className="font-semibold text-brand-700 underline">
          Go to your course
        </a>
      </p>
    );
  }
  if (!sheet) return <p className="text-slate-500">Loading the worksheet…</p>;

  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => window.print()} className="btn-primary">
          Print this worksheet
        </button>
        <a href="/course/learn/" className="btn-secondary">
          Back to your course
        </a>
      </div>
      <article className="print-sheet prose-sss rounded-2xl border border-slate-100 bg-white p-6 shadow-card sm:p-8" aria-label={title}>
        <Markdown text={sheet.markdown} headings="semantic" />
      </article>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/pages/course/learn/worksheets/[id].astro`**

```astro
---
import BaseLayout from '../../../../layouts/BaseLayout.astro';
import WorksheetView from '../../../../components/react/WorksheetView.tsx';
import { getCourseCatalog } from '../../../../lib/course/catalog';

/** Worksheet shells: title and module only; the sheet itself comes from /api/course/worksheet. */
export async function getStaticPaths() {
  const catalog = await getCourseCatalog();
  return catalog.worksheets.map((w) => {
    const module = catalog.modules.find((m) => m.id === w.module);
    return { params: { id: w.id }, props: { title: w.title, moduleTitle: module?.title ?? '', moduleOrder: module?.order ?? 0 } };
  });
}

const { title, moduleTitle, moduleOrder } = Astro.props;
const worksheetId = Astro.params.id!;
---

<BaseLayout title={title} description={`The worksheet for Module ${moduleOrder}, ${moduleTitle}.`} noindex>
  <div class="container-page py-10">
    <p class="eyebrow no-print">Module {moduleOrder}, {moduleTitle}. Worksheet</p>
    <h1 class="mt-3 text-3xl font-extrabold tracking-tight text-ink-800 sm:text-4xl">{title}</h1>
    <div class="mt-8">
      <WorksheetView client:load worksheetId={worksheetId} title={title} />
    </div>
  </div>
</BaseLayout>
```

- [ ] **Step 3: Print rules at the end of `src/styles/global.css`** (outside every `@layer`)

```css
/* Printing a worksheet: the sheet and its title, nothing else. */
@media print {
  header,
  footer,
  nav,
  .no-print {
    display: none !important;
  }
  body {
    background: #fff;
  }
  .print-sheet {
    border: 0;
    box-shadow: none;
    padding: 0;
  }
  .container-page {
    max-width: none;
    padding: 0;
  }
}
```

- [ ] **Step 4: OG cards for the worksheet shells in `src/pages/og/[...route].ts`**

Next to `courseLessonPages`, add:

```ts
const courseWorksheetPages = Object.fromEntries(
  courseCatalog.worksheets.map((w) => [`course/learn/worksheets/${w.id}`, { title: w.title, description: 'A printable worksheet from the Complete Solution Seeking course.' }])
);
```

and spread `...courseWorksheetPages,` right after `...courseLessonPages,`.

- [ ] **Step 5: The dashboard's resume pointer and completion marks in `src/components/react/CourseDashboard.tsx`**

Import `fetchCourseState` and `type CourseStateView` from `../../lib/courseClient`. Add state `const [courseState, setCourseState] = useState<CourseStateView | null>(null);` and an effect that loads it once the learner is enrolled:

```tsx
  useEffect(() => {
    if (!session || !enrolled) return;
    let active = true;
    fetchCourseState(session.access_token)
      .then((s) => {
        if (active) setCourseState(s);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrolled, user?.id]);
```

Place this effect immediately after the existing `const enrolled = entitlement?.kind === 'enrolled';` line, which sits before the component's first early return: hooks cannot follow a `return`. Replace the `firstLesson` block with:

```tsx
  const allLessons = props.curriculum.modules.flatMap((m) => m.lessons);
  const resumeId = courseState ? courseState.resume_lesson_id : allLessons.find((l) => l.status === 'published')?.id ?? null;
  const resume = resumeId ? allLessons.find((l) => l.id === resumeId) ?? null : null;
  const anyPublished = allLessons.some((l) => l.status === 'published');
  const everythingDone = courseState !== null && anyPublished && courseState.resume_lesson_id === null;
```

and render, in place of the "Open the first lesson" block:

```tsx
        {resume ? (
          <div className="mt-6">
            <a href={`/course/learn/lessons/${resume.id}`} className="btn-primary">
              {courseState?.lessons[resume.id] ? 'Continue' : 'Start here'}
            </a>
            <p className="mt-3 text-sm text-slate-500">{resume.title}</p>
          </div>
        ) : everythingDone ? (
          <p className="mt-4 text-slate-600">You have finished every lesson available so far. More are on the way.</p>
        ) : (
          <p className="mt-4 text-slate-600">The first lessons are being prepared. Check back soon.</p>
        )}
```

In the module list, the status badge on each lesson becomes:

```tsx
                  <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {l.status !== 'published' ? 'Coming soon' : courseState?.lessons[l.id]?.completed ? 'Done' : courseState?.lessons[l.id] ? 'In progress' : ''}
                  </span>
```

(keep the existing published/unpublished link versus span structure; only the badge text changes, and the `Coming soon` span for unpublished lessons stays as it is).

- [ ] **Step 6: Gates and checks**

```bash
npm run check && npm test && npm run build
# the catalog line in the build output reads: course catalog: 40 lessons, 9 modules, 1 published, 0 staged, 8 minutes published
test -e dist/course/learn/worksheets/w-m02/index.html && echo "worksheet shell"
grep -c "Alex" dist/course/learn/worksheets/w-m02/index.html     # 0 (the sheet body is not in the shell)
test -e dist/og/course/learn/worksheets/w-m02.png && echo "og card"
grep -c "course/learn" dist/sitemap-0.xml                         # 0
grep -n "—" src/components/react/WorksheetView.tsx "src/pages/course/learn/worksheets/[id].astro" src/components/react/CourseDashboard.tsx   # nothing
```

Then delete the admin's test enrollment and progress rows (REST, service key) unless the controller says to keep them for Task 8.

- [ ] **Step 7: Commit**

```bash
unix2dos -q src/components/react/WorksheetView.tsx "src/pages/course/learn/worksheets/[id].astro"
git add src/components/react/WorksheetView.tsx "src/pages/course/learn/worksheets/[id].astro" src/styles/global.css "src/pages/og/[...route].ts" src/components/react/CourseDashboard.tsx
git commit -m "Add printable worksheets and the dashboard resume pointer"
```

---

### Task 8: Browser verification (controller-run, Playwright MCP)

With the local stack, the dev server and the admin enrolled by hand (REST insert, `source: admin`):

- [ ] Dashboard shows "Start here" with the V04 title; V04 opens; the shell HTML holds no prose; the island shows the "being filmed" note (no placeholder UID yet), key points, the exercise, the editor.
- [ ] Walk: studied, type (Saving your response… then Saved hh:mm), the offline button stays available until practice, reveal (button enabled after typing), the model response and self-review appear, acknowledge, complete: `lesson_completed` once in the dataLayer, `module_completed` absent (m02 checks unanswered), the completion card offers "Back to your course" and names V05 as coming soon.
- [ ] Reload keeps every state; the response text survives; the model response is fetched again only through reveal (the GET never carries it: confirm from the network log).
- [ ] Two-tab conflict: type in tab A, then in tab B with the stale revision; tab B shows the conflict card; "Keep mine" saves and moves the other text into `previous_response_text` (REST check).
- [ ] Sign out and in: the dashboard shows "Continue" pointing at V04 while incomplete, and "You have finished every lesson available so far" after completion.
- [ ] Drawer: opens, focus lands inside, Tab cycles, Esc closes and returns focus, V04 marked Now or Done, others "Coming soon".
- [ ] Worksheet: `/course/learn/worksheets/w-m02` renders the sheet; print emulation shows only the sheet.
- [ ] A draft lesson URL (`/course/learn/lessons/v06`) is a 404; the learner account gets the enrolled-only note on V04.
- [ ] Screenshots at 1280 and 390 of the lesson (top, editor, completion) and the worksheet to the scratchpad for 1e.
- [ ] Clean up rows; stop the server.

---

## Execution record (2026-09-10)

Executed with subagent-driven development: twelve commits from `cf4f302` to the marker fix that follows `c89d637`, each task reviewed, a whole-branch review, one fix wave and two controller follow-ups. Amendments the reviews forced on this plan, now in the code:

- Write safety. The plan's whole-row upsert let a step click that landed during an in-flight autosave erase the typed response. Three layers now guard it: the `course_progress_monotone` trigger keeps `response_text` and `previous_response_text` unless the revision advances (migration `0030` edited in place while unpushed); the progress route answers 409 `revision_conflict` when the stored text differs from what the save wrote; the island serialises every write through one queue, never lets an action move the revision, flushes a pending save before reveal and complete, and stops those actions when the flush conflicts.
- Completion means the learner's explicit `completed_at` everywhere; the readiness rule only guards the complete action.
- The validator exempts placeholder lessons from the `streamUid` requirement; the stand-in clip's UID is one setting, `COURSE.placeholderStreamUid`.
- The shared 12 hour playback token per video stands for launch; the upgrade path (per-viewer tokens from a Stream signing key) is documented in `streamUrls.ts`.
- `courseErrorMessage` has a neutral default and the lesson codes; a failed action's message renders once beside its control; the restored device draft is saved; the model response re-appears on revisit; a previous link joins the next one; semantic markdown leaves list markers to the prose container.
- The dashboard holds a neutral state until the course state loads.

Browser verification (Task 8) passed on 2026-09-10: the full practice flow with autosave, the reload, the two-tab conflict in both directions, the drawer's focus handling, the finished-state dashboard, the printable worksheet, the draft-lesson 404 and the non-enrolled refusals. Screenshots for `docs/features/course/` are with sub-plan 1e.

Carried forward:

1. When David uploads the stand-in clip: set `COURSE.placeholderStreamUid`, set `CLOUDFLARE_STREAM_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_STREAM_CUSTOMER_CODE`, and verify playback plus the token-substituted poster URL against the real video (1e).
2. Per-viewer short-lived Stream tokens via a signing key, if a shared token is ever found beyond a learner (Phase 2 or later).
3. Product decision for David: every enrolled learner can fetch all nine worksheets from day one; gate on a published lesson in the module if that matters.
4. `/api/course/progress` has no rate limit (each autosave is one auth call, one enrollment read, one load and one upsert); a note for the 1e runbook.
5. No `pagehide` flush; the restored device draft now saves on the next visit, which covers the loss.
6. `lessonComplete` is used only by its tests now; it can go.
7. The analytics four-place rule for `lesson_completed` and `module_completed` (1e).
8. Widen `certification.status` from the literal `'none'` when awards arrive (1d); wire `assessmentSubmitted` to the attempts table (1d).
9. An `open` build has two blockers by design until the videos exist: V04's placeholder and the unpublished free lesson.

## Handoff

Sub-plan 1d (assessment data path) consumes `computeCourseState().assessment_eligible`, `requireEnrolled`, and the `assessmentSubmitted` input of `deriveCourseState` (wire it to the attempts table). Sub-plan 1e wires `/course/learn/` into the nav and AuthMenu, documents the Stream runbook and the placeholder UID setting in `docs/course-production.md` and `deployment.md`, and verifies playback against the real clip once `COURSE.placeholderStreamUid` and the two Stream env vars exist. Phase 2 adds `/api/course/check` (the `checkId` convention from Task 3), the preview page that renders `LessonSections` at build time, and the drawer's module check status.
