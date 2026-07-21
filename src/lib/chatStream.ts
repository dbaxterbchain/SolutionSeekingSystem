import type { AgentId } from './chatSessions';

/**
 * The wire contract for POST /api/chat, in one place so every caller (public
 * ChatView, the dashboard, white-label pages) sends the same shape and it only
 * ever changes here. Fields beyond `agent`/`messages` are optional and arrive
 * across phases: `context` (named mode), `assistant_id` (specialized
 * assistants), per-message `attachments` (uploaded documents).
 */
export interface ChatAttachmentRef {
  id: string;
  name: string;
}

export interface StreamChatMessage {
  role: 'user' | 'assistant';
  content: string;
  attachments?: ChatAttachmentRef[];
}

export interface StreamChatPayload {
  agent: AgentId;
  messages: StreamChatMessage[];
  context?: string;
  assistant_id?: string;
}

/** Per-send metadata read from the response headers before the body streams. */
export interface StreamChatMeta {
  /** Free messages left, or null for subscribers (who get no counter). */
  freeRemaining: number | null;
  /** Which allowance the count refers to: 'anon' | 'account', or null. */
  freeTier: string | null;
  /** The server's entitlement verdict: 'subscriber' | 'free' | 'blocked', or null. */
  entitlement: string | null;
  /** For subscribers, whether access is via 'stripe' or 'org'. */
  via: string | null;
}

/**
 * The well-defined outcomes of a send. Network failures and aborts are NOT in
 * here: `streamChat` lets those throw so the caller's own try/catch keeps the
 * partial transcript (abort) or shows a retry banner (network), exactly as the
 * inline version did.
 */
export type StreamChatResult =
  | { kind: 'done'; text: string }
  | { kind: 'unauthorized' }
  | { kind: 'rate_limited' }
  | { kind: 'account_required' }
  | { kind: 'subscription_required' }
  | { kind: 'assistant_not_found' };

/**
 * POST to /api/chat and stream the reply. `onDelta` receives the full assistant
 * text so far on every chunk (the caller renders it); `onMeta` fires once, after
 * the headers arrive and before the body streams, so the free-message badge
 * updates at the same moment it always has.
 *
 * Throws on network error and on abort (AbortError) — the caller handles those.
 */
export async function streamChat(opts: {
  accessToken: string;
  payload: StreamChatPayload;
  signal: AbortSignal;
  onMeta?: (meta: StreamChatMeta) => void;
  onDelta: (assistantText: string) => void;
}): Promise<StreamChatResult> {
  const { accessToken, payload, signal, onMeta, onDelta } = opts;

  const res = await fetch('/api/chat', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  // The anonymous JWT expired; the next send mints a fresh one.
  if (res.status === 401) return { kind: 'unauthorized' };
  // Too many anonymous messages from this network today.
  if (res.status === 429) return { kind: 'rate_limited' };
  if (res.status === 404) {
    // A specialized assistant the caller can no longer reach.
    const err = await res.json().catch(() => null);
    if (err?.error === 'assistant_not_found') return { kind: 'assistant_not_found' };
    throw new Error(err?.message ?? 'Something went wrong. Please try again.');
  }
  if (res.status === 403) {
    // Two different dead ends: an anonymous visitor needs an account (and still
    // has free messages waiting); a registered user needs to pay.
    const err = await res.json().catch(() => null);
    return err?.error === 'account_required'
      ? { kind: 'account_required' }
      : { kind: 'subscription_required' };
  }
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message ?? 'Something went wrong. Please try again.');
  }

  const remainingHeader = res.headers.get('X-Free-Messages-Remaining');
  onMeta?.({
    freeRemaining: remainingHeader !== null ? Number(remainingHeader) : null,
    freeTier: res.headers.get('X-Free-Tier'),
    entitlement: res.headers.get('X-Entitlement'),
    via: res.headers.get('X-Entitlement-Via'),
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let assistant = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    assistant += decoder.decode(value, { stream: true });
    onDelta(assistant);
  }
  return { kind: 'done', text: assistant };
}
