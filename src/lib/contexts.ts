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
  // Demo scenarios (kind: 'scenario')
  'workplace-lateness',
  'manager-overload',
  'coworker-snapped',
  'home-chores',
  'team-one-on-ones',
  'coop-scheduling',
  'possible-harassment',
  // Modes (kind: 'mode') — the assistant adapted to a relationship dynamic
  'parent',
  'teacher',
  'partner',
  'family',
  'friend',
  'manager',
  'coworker',
  'organizer',
] as const;

export type ContextId = (typeof CONTEXT_IDS)[number];

export interface ChatContextMeta {
  id: ContextId;
  /**
   * 'scenario' = demo-library handoff (label reads "Scenario: ...");
   * 'mode' = relationship-dynamic orientation (label reads "{Role} mode").
   */
  kind: 'scenario' | 'mode';
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
    kind: 'scenario',
    agents: ['guide'],
    label: 'Scenario: an employee keeps arriving late',
    description:
      'The Guide will start from this scenario and ask about your actual situation.',
  },
  {
    id: 'manager-overload',
    kind: 'scenario',
    agents: ['guide'],
    label: 'Scenario: my manager keeps adding work',
    description:
      'The Guide will start from this scenario and ask about your actual situation.',
  },
  {
    id: 'coworker-snapped',
    kind: 'scenario',
    agents: ['guide'],
    label: 'Scenario: a coworker snapped at me',
    description:
      'The Guide will start from this scenario and ask about your actual situation.',
  },
  {
    id: 'home-chores',
    kind: 'scenario',
    agents: ['guide'],
    label: 'Scenario: we keep fighting about chores',
    description:
      'The Guide will start from this scenario and ask about your actual situation.',
  },
  {
    id: 'team-one-on-ones',
    kind: 'scenario',
    agents: ['mentor'],
    label: 'Scenario: build better one-on-ones for my team',
    description:
      'The Mentor will start from this scenario and adapt it to your team.',
  },
  {
    id: 'coop-scheduling',
    kind: 'scenario',
    agents: ['mentor'],
    label: 'Scenario: make scheduling decisions fair in a cooperative',
    description:
      'The Mentor will start from this scenario and adapt it to your organization.',
  },
  {
    id: 'possible-harassment',
    kind: 'scenario',
    agents: ['guide'],
    label: 'Scenario: this may be more than a misunderstanding',
    description:
      'The Guide will start with your safety and options, not by assuming a conversation is the answer.',
  },
  {
    id: 'parent',
    kind: 'mode',
    agents: ['guide', 'mentor'],
    label: 'Parent mode',
    description:
      'Adapted to a parent-child dynamic: your responsibility, their age, and solutions that fit a family.',
  },
  {
    id: 'teacher',
    kind: 'mode',
    agents: ['guide', 'mentor'],
    label: 'Teacher mode',
    description:
      'Adapted to a teacher-student dynamic: your duty of care, their development, and the classroom around you.',
  },
  {
    id: 'partner',
    kind: 'mode',
    agents: ['guide'],
    label: 'Partner mode',
    description:
      'Adapted to a couple’s dynamic: shared life, deep history, and safety first.',
  },
  {
    id: 'family',
    kind: 'mode',
    agents: ['guide'],
    label: 'Family mode',
    description:
      'Adapted to adult family dynamics: siblings, aging parents, in-laws, and long histories.',
  },
  {
    id: 'friend',
    kind: 'mode',
    agents: ['guide'],
    label: 'Friend mode',
    description:
      'Adapted to a friendship: no authority to lean on, just the relationship itself.',
  },
  {
    id: 'manager',
    kind: 'mode',
    agents: ['guide', 'mentor'],
    label: 'Manager mode',
    description:
      'Adapted to a manager-report dynamic: your power in the room, and agreements that stick.',
  },
  {
    id: 'coworker',
    kind: 'mode',
    agents: ['guide'],
    label: 'Co-worker mode',
    description:
      'Adapted to a peer dynamic: influence without authority.',
  },
  {
    id: 'organizer',
    kind: 'mode',
    agents: ['guide', 'mentor'],
    label: 'Organizer mode',
    description:
      'Adapted to organizing dynamics: volunteers, coalitions, and conflict inside a shared cause.',
  },
];

/** The modes subset, in registry order — used by picker sections and the modes hub. */
export const MODE_CONTEXTS = CHAT_CONTEXTS.filter((c) => c.kind === 'mode');

/** Resolve a context id (e.g. from ?context=) for a given assistant; null if unknown or mismatched. */
export function getContextMeta(id: string | null | undefined, agent: AgentId): ChatContextMeta | null {
  if (!id) return null;
  return CHAT_CONTEXTS.find((c) => c.id === id && c.agents.includes(agent)) ?? null;
}
