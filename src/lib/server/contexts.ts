import type { AgentId } from './agents';
import { getContextMeta, type ContextId } from '../contexts';

/**
 * Server-only half of the context registry: the model-facing seed text for
 * each named context in src/lib/contexts.ts.
 *
 * Every seed becomes a third system block after [grounding, persona] in
 * buildSystem, with its own prompt-cache entry. Seeds MUST be byte-stable
 * compile-time constants — never interpolate user data or anything that
 * varies per request, or the cache entry (and the cost win) is lost.
 */

interface ContextSeed {
  /** Text of the third system block. */
  seed: string;
  /**
   * Optional full persona replacement per agent — the mechanism for future
   * specialized variants (boss, teacher, parent, couples). When set for the
   * requesting agent, it replaces the default persona block entirely.
   */
  persona?: Partial<Record<AgentId, string>>;
}

const SEED_PREAMBLE =
  'The user started this conversation from a fictional example on the site, so they arrive with a scenario in mind. Assume their real situation rhymes with it but is not identical — open by briefly acknowledging the scenario, then ask for their actual specifics before beginning any step of the protocol.';

export const CONTEXT_SEEDS = {
  'workplace-lateness': {
    seed: `${SEED_PREAMBLE}

The example: a team lead whose employee has repeatedly arrived late, who is angry and tempted to jump straight to discipline. Likely themes to listen for: untested assumptions about why the lateness is happening, fear of seeming unfair to the rest of the team, a power difference between the user and the other person, and the need for a concrete, testable, time-bound agreement with a review date rather than a one-time warning.`,
  },
  'manager-overload': {
    seed: `${SEED_PREAMBLE}

The example: an employee whose manager keeps adding work without changing priorities, who is afraid that pushing back will look like they can't handle the job. Likely themes to listen for: separating the observable workload facts from the story the user is telling about them, the fear of being judged, the manager's own unseen pressures, and preparing an opener that states capacity plainly without apology or accusation. Mind the power difference: the user is speaking up toward their manager.`,
  },
  'coworker-snapped': {
    seed: `${SEED_PREAMBLE}

The example: someone whose coworker snapped at them in a meeting when they tried to help, who is replaying the moment and wants an apology. Likely themes to listen for: hurt and embarrassment underneath the anger, what the wish for an apology is really about (often safety or respect in future interactions), a good-faith reading of what the coworker's day may have held, and a low-stakes opener aimed at repair rather than a confrontation engineered to extract an apology.`,
  },
  'home-chores': {
    seed: `${SEED_PREAMBLE}

The example: a couple having the same fight about chores every week, where nothing changes afterward. Likely themes to listen for: the recurring fight as a signal that past "solutions" were never made concrete or reviewed, each partner's underlying need (rest, feeling seen, fairness) rather than the task list itself, choosing a calm moment outside the conflict for the conversation, and designing a specific, testable arrangement with a review date. This is a personal relationship, not a workplace — keep the language warm and domestic.`,
  },
  'team-one-on-ones': {
    seed: `${SEED_PREAMBLE}

The example: a manager of a roughly 12-person team whose one-on-ones have become status meetings nobody values, who wants to rebuild them. Likely goals: reframing the one-on-one as proactive listening and service to the team's health (per the One-on-Ones Leadership Tool), a question bank rooted in the Wisdom Principles, a realistic cadence for a team that size, and a concise written practice the manager can keep — offer a markdown cheat-sheet when the guidance comes together. Adapt everything to their actual team once they describe it.`,
  },
  'coop-scheduling': {
    seed: `${SEED_PREAMBLE}

The example: a worker cooperative where scheduling meetings keep turning into fights about fairness. Likely goals: mapping the recurring fight to a Mutual Understanding failure (people arguing positions without understanding each other's constraints), designing a participatory decision process with explicit fairness criteria, a time-bound pilot with a scheduled review, and facilitation guidance. Remember fairness is not always identical treatment. If one pairing of people is especially hot, suggest the Guide at /practice/guide for that specific conflict. Adapt everything to their actual cooperative once they describe it.`,
  },
  'possible-harassment': {
    seed: `${SEED_PREAMBLE}

The example: someone experiencing repeated comments from a coworker that may be harassment, who has been told to "just talk to him" but senses this is different. IMPORTANT: do not assume the Communication Protocol is the right first step here, and do not route the user toward a private one-on-one conversation by default. Begin with their safety and their read of the situation. Ask what has been happening and how safe they feel. Surface their options plainly: documenting incidents with dates and specifics, formal channels (HR, a trusted manager, external authorities where relevant), and support from people they trust. Good Faith does not require ignoring evidence of harm, and the protocol is for good-faith misunderstandings between willing participants — say so when it matters. Only if the user, fully informed, judges the situation to be a misunderstanding they want to address directly should you offer the protocol, and even then keep documentation and formal options on the table. You are not a therapist, investigator, or lawyer — be clear about that while staying warm and steady.`,
  },
} satisfies Record<ContextId, ContextSeed>;

/**
 * Resolve a context id from a chat request. Returns null for unknown ids or
 * agent mismatches (never throws): retired or garbled ids must degrade to a
 * plain conversation, not an error, so old saved chats keep working.
 */
export function resolveContext(id: string | undefined, agent: AgentId): ContextSeed | null {
  if (!id || !getContextMeta(id, agent)) return null;
  return CONTEXT_SEEDS[id as ContextId] ?? null;
}
