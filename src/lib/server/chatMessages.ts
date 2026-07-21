import type Anthropic from '@anthropic-ai/sdk';

/**
 * Assemble the Anthropic `messages` array. This is the ONE place chat content
 * blocks and cache breakpoints are constructed, so the prompt-cache invariant
 * lives here and nowhere else (system blocks are built separately in agents.ts).
 *
 *  - `setup` (Phase C: an assistant's instructions + knowledge documents) becomes
 *    a single cache_control'd text block at the very head of the first message,
 *    making (system + setup) the stable cached prefix for that assistant. It is
 *    the 4th and final breakpoint (grounding + persona + context seed are the
 *    other three).
 *  - per-message `attachments` become plain text blocks inside their own user
 *    turn and are NEVER cache-marked: they vary from send to send.
 *
 * With neither setup nor attachments (the public Guide/Mentor path) the output is
 * exactly `window.map(m => ({ role, content: m.text }))` — identical to before.
 */

export interface ResolvedAttachment {
  name: string;
  text: string;
}

export interface WindowMessage {
  role: 'user' | 'assistant';
  text: string;
  attachments?: ResolvedAttachment[];
}

const CACHE: Anthropic.CacheControlEphemeral = { type: 'ephemeral' };

/** A document's text as an XML-ish block the model can attribute to a source. */
function attachmentBlock(a: ResolvedAttachment): Anthropic.TextBlockParam {
  const safeName = a.name.replace(/[\r\n"]/g, ' ').slice(0, 200);
  return {
    type: 'text',
    text: `<attached_document name="${safeName}">\n${a.text}\n</attached_document>`,
  };
}

export function buildMessages(opts: {
  window: WindowMessage[];
  setup?: string;
}): Anthropic.MessageParam[] {
  const { window, setup } = opts;

  const out: Anthropic.MessageParam[] = window.map((m) => {
    if (m.role === 'assistant') {
      return { role: 'assistant', content: m.text };
    }
    const attachments = m.attachments ?? [];
    if (attachments.length === 0) {
      return { role: 'user', content: m.text };
    }
    // Attachments first, then the typed message, so the model reads the source
    // before the request about it.
    return {
      role: 'user',
      content: [...attachments.map(attachmentBlock), { type: 'text', text: m.text }],
    };
  });

  if (!setup) return out;

  const setupBlock: Anthropic.TextBlockParam = { type: 'text', text: setup, cache_control: CACHE };
  const first = out[0];
  if (first && first.role === 'user') {
    // Merge the setup block ahead of whatever this user turn already carries.
    const existing =
      typeof first.content === 'string'
        ? [{ type: 'text' as const, text: first.content }]
        : (first.content as Anthropic.TextBlockParam[]);
    first.content = [setupBlock, ...existing];
    return out;
  }

  // The window starts with an assistant message (long conversation, post-trim):
  // the API needs a leading user turn, so carry the setup on a standalone one.
  return [
    {
      role: 'user',
      content: [setupBlock, { type: 'text', text: '(Conversation continues from earlier turns.)' }],
    },
    ...out,
  ];
}
