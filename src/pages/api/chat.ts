import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { getUserFromRequest, json } from '../../lib/server/auth';
import { supabaseAdmin } from '../../lib/server/supabaseAdmin';
import { serverEnv } from '../../lib/server/env';
import { checkEntitlement } from '../../lib/server/entitlement';
import { buildSystem, AGENT_IDS, type AgentId } from '../../lib/server/agents';
import {
  clientIp,
  isRateLimited,
  ANON_CHAT_PER_IP,
  ANON_CHAT_WINDOW_SECONDS,
} from '../../lib/server/rateLimit';

export const prerender = false;

let anthropicClient: Anthropic | null = null;
const getAnthropic = () => (anthropicClient ??= new Anthropic({ apiKey: serverEnv('ANTHROPIC_API_KEY') }));

// Server-side guards; the client also trims to its last 30 turns.
const MAX_MESSAGES = 60;
const MAX_CHARS_PER_MESSAGE = 8_000;

interface ChatBody {
  agent: AgentId;
  messages: { role: 'user' | 'assistant'; content: string }[];
  /** Optional named-context id (src/lib/contexts.ts); unknown ids are ignored. */
  context?: string;
}

/**
 * Streaming chat with the Guide or Mentor. Auth: Supabase JWT. Gate: active
 * subscription, or the 10 lifetime free messages. Streams plain text chunks.
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const isAnon = user.is_anonymous === true;

  // Kill switch: if the anonymous trial ever costs more than it earns, set
  // ANON_TRIAL_ENABLED=false and redeploy. Anonymous callers then get the same
  // "create an account" response as an exhausted trial, and the UI falls back
  // to the sign-in wall.
  if (isAnon && serverEnv('ANON_TRIAL_ENABLED') === 'false') {
    return json({ error: 'account_required', freeUsed: 0 }, 403);
  }

  // The allowance below is per user id, and anonymous ids are free to mint, so
  // the only thing actually bounding cost is a per-IP cap on messages.
  if (isAnon) {
    const limited = await isRateLimited(
      'anon_chat',
      clientIp(request, clientAddress),
      ANON_CHAT_PER_IP,
      ANON_CHAT_WINDOW_SECONDS
    );
    if (limited) {
      return json({ error: 'rate_limited' }, 429);
    }
  }

  const body = (await request.json().catch(() => null)) as ChatBody | null;
  if (!body || !AGENT_IDS.includes(body.agent) || !Array.isArray(body.messages)) {
    return json({ error: 'bad_request' }, 400);
  }
  const messages = body.messages.slice(-MAX_MESSAGES).map((m) => ({
    role: m?.role === 'assistant' ? ('assistant' as const) : ('user' as const),
    content: String(m?.content ?? '').slice(0, MAX_CHARS_PER_MESSAGE),
  }));
  if (
    messages.length === 0 ||
    messages[messages.length - 1].role !== 'user' ||
    messages.some((m) => m.content.trim() === '')
  ) {
    return json({ error: 'bad_request' }, 400);
  }

  const entitlement = await checkEntitlement(user);
  if (entitlement.kind === 'blocked') {
    // Two very different dead ends, and the client shows a different card for
    // each: an anonymous visitor needs an account (and still has free messages
    // waiting), while a registered user needs a subscription.
    return entitlement.tier === 'anon'
      ? json({ error: 'account_required', freeUsed: entitlement.used }, 403)
      : json({ error: 'subscription_required', freeUsed: entitlement.used }, 403);
  }

  const stream = getAnthropic().messages.stream({
    model: 'claude-sonnet-5',
    max_tokens: 2048,
    // Omitting `thinking` on Sonnet 5 runs adaptive thinking — a silent
    // pause and extra tokens we don't need for empathetic chat.
    thinking: { type: 'disabled' },
    system: await buildSystem(body.agent, typeof body.context === 'string' ? body.context : undefined),
    messages,
  });

  // Await the first event so auth/validation/rate-limit failures surface as a
  // JSON error response instead of a committed-then-broken 200 stream.
  const iterator = stream[Symbol.asyncIterator]();
  let first: IteratorResult<Anthropic.MessageStreamEvent>;
  try {
    first = await iterator.next();
  } catch (err) {
    return upstreamError(err);
  }

  // Count the free message only after the upstream call is accepted. Anonymous
  // and registered users share this counter but not the limit, so remaining is
  // measured against whichever allowance applies to this user.
  let remaining: number | null = null;
  if (entitlement.kind === 'free') {
    const { data, error } = await supabaseAdmin.rpc('increment_free_messages', {
      uid: user.id,
    });
    if (error) console.error('free-message increment failed', error);
    const used = typeof data === 'number' ? data : entitlement.used + 1;
    remaining = Math.max(0, entitlement.limit - used);
  }

  const encoder = new TextEncoder();
  const enqueueText = (controller: ReadableStreamDefaultController<Uint8Array>, event: unknown) => {
    const e = event as Anthropic.MessageStreamEvent;
    if (e.type === 'content_block_delta' && e.delta.type === 'text_delta') {
      controller.enqueue(encoder.encode(e.delta.text));
    }
  };

  const bodyStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done) enqueueText(controller, first.value);
        for (let next = await iterator.next(); !next.done; next = await iterator.next()) {
          enqueueText(controller, next.value);
        }
        controller.close();
      } catch (err) {
        console.error('chat stream failed mid-flight', err);
        controller.error(err);
      }
    },
    cancel() {
      // User hit Stop or navigated away.
      stream.abort();
    },
  });

  return new Response(bodyStream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(remaining !== null ? { 'X-Free-Messages-Remaining': String(remaining) } : {}),
      // The client needs the tier to know which allowance the count refers to.
      'X-Free-Tier': isAnon ? 'anon' : 'account',
    },
  });
};

function upstreamError(err: unknown): Response {
  if (err instanceof Anthropic.RateLimitError) {
    return json(
      { error: 'busy', message: 'The assistant is busy right now. Please try again in a moment.' },
      429
    );
  }
  if (err instanceof Anthropic.APIError && err.status === 529) {
    return json(
      { error: 'overloaded', message: 'The assistant is temporarily overloaded. Please retry shortly.' },
      503
    );
  }
  console.error('anthropic request failed', err);
  return json(
    { error: 'upstream', message: 'Something went wrong talking to the assistant. Please try again.' },
    502
  );
}
