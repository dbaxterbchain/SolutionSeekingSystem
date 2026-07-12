import type { AgentId } from './server/agents';

/**
 * Named conversation contexts — the client-safe half of the context registry.
 *
 * A context orients a brand-new Guide/Mentor conversation toward a known
 * scenario (today: the demo library's "Use this process with my situation"
 * handoff; later: specialized assistant variants). The model-facing seed text
 * lives server-side in src/lib/server/contexts.ts and never ships to the
 * browser; this module only carries the ids and the copy shown in the chat UI.
 *
 * Ids are append-preferred: retiring one is safe (server and client both
 * ignore unknown ids so old saved conversations degrade to plain chats), but
 * reusing a retired id for a different meaning would silently re-orient them.
 */

export const CONTEXT_IDS = [
  'workplace-lateness',
  'manager-overload',
  'coworker-snapped',
  'home-chores',
  'team-one-on-ones',
  'coop-scheduling',
  'possible-harassment',
] as const;

export type ContextId = (typeof CONTEXT_IDS)[number];

export interface ChatContextMeta {
  id: ContextId;
  /** Which assistant(s) this context may seed. */
  agents: AgentId[];
  /** Short chip text shown above the conversation. */
  label: string;
  /** One-line explanation shown alongside the chip. */
  description: string;
}

export const CHAT_CONTEXTS: ChatContextMeta[] = [
  {
    id: 'workplace-lateness',
    agents: ['guide'],
    label: 'Scenario: an employee keeps arriving late',
    description:
      'The Guide will start from this scenario and ask about your actual situation.',
  },
  {
    id: 'manager-overload',
    agents: ['guide'],
    label: 'Scenario: my manager keeps adding work',
    description:
      'The Guide will start from this scenario and ask about your actual situation.',
  },
  {
    id: 'coworker-snapped',
    agents: ['guide'],
    label: 'Scenario: a coworker snapped at me',
    description:
      'The Guide will start from this scenario and ask about your actual situation.',
  },
  {
    id: 'home-chores',
    agents: ['guide'],
    label: 'Scenario: we keep fighting about chores',
    description:
      'The Guide will start from this scenario and ask about your actual situation.',
  },
  {
    id: 'team-one-on-ones',
    agents: ['mentor'],
    label: 'Scenario: build better one-on-ones for my team',
    description:
      'The Mentor will start from this scenario and adapt it to your team.',
  },
  {
    id: 'coop-scheduling',
    agents: ['mentor'],
    label: 'Scenario: make scheduling decisions fair in a cooperative',
    description:
      'The Mentor will start from this scenario and adapt it to your organization.',
  },
  {
    id: 'possible-harassment',
    agents: ['guide'],
    label: 'Scenario: this may be more than a misunderstanding',
    description:
      'The Guide will start with your safety and options — not by assuming a conversation is the answer.',
  },
];

/** Resolve a context id (e.g. from ?context=) for a given assistant; null if unknown or mismatched. */
export function getContextMeta(id: string | null | undefined, agent: AgentId): ChatContextMeta | null {
  if (!id) return null;
  return CHAT_CONTEXTS.find((c) => c.id === id && c.agents.includes(agent)) ?? null;
}
