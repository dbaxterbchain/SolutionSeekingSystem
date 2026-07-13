import type { ContextId } from '../lib/contexts';

/**
 * Landing-page content for the conversation Modes — the Guide/Mentor adapted
 * to a relationship dynamic. One entry per registry entry with kind 'mode'
 * (src/lib/contexts.ts); pages under /practice/modes/ are generated from this
 * array, and getStaticPaths cross-checks every id against the registry.
 *
 * This file is imported only by Astro pages at build time — keep it out of
 * React islands so landing copy never ships in the chat client bundle.
 *
 * Authoring rule: `welcome` must be written TOGETHER with the mode's server
 * seed (src/lib/server/contexts.ts) and must not promise behavior the seed
 * doesn't produce.
 */

export interface ModeLanding {
  /** Registry id — must exist in CHAT_CONTEXTS with kind 'mode'. */
  id: ContextId;
  /** Role name for cards and breadcrumbs, e.g. 'Parent'. */
  name: string;
  /** Emoji for picker cards. */
  icon: string;
  /** H1 + OG title — targets situation intent, not the product name. */
  heroTitle: string;
  /** 1–2 sentences under the hero. */
  heroIntro: string;
  /** <meta> + OG description (unique per page). */
  metaDescription: string;
  /** One-liner for picker cards. */
  pickerBlurb: string;
  /** 3–5 concrete "when this helps" bullets. */
  exampleSituations: string[];
  /** ChatView welcome line for the embedded chat. */
  welcome: string;
  /** Demo collection ids to link as worked examples. */
  relatedDemoIds?: string[];
  /** Secondary Mentor CTA copy — only valid when the registry entry allows the mentor. */
  mentorCta?: string;
}

export const MODES: ModeLanding[] = [
  {
    id: 'parent',
    name: 'Parent',
    icon: '🧸',
    heroTitle: 'Prepare for a hard conversation with your child',
    heroIntro:
      'The Guide walks you through the Communication Protocol adapted to parenting: your responsibility, their age, and solutions a family can actually keep.',
    metaDescription:
      'An AI guide for parents preparing a hard conversation with their child: understand your own reaction, see their side, and leave with a plan that fits your family.',
    pickerBlurb: 'A conflict with your child, adapted to their age and your role.',
    exampleSituations: [
      'The same fight about screens, chores, or homework keeps repeating',
      'Your teenager has stopped talking to you and you don’t know why',
      'You lost your temper and want to repair it well',
      'You and your child see a rule completely differently',
    ],
    welcome:
      'Hi, I’m the Solution Seeking Guide, in Parent mode. Tell me a bit about what’s going on with your child (how old they are and what’s been happening), and we’ll work through it step by step.',
    mentorCta:
      'Want to build better family communication habits, not just handle this one moment? The Mentor can help you design a repeatable practice.',
  },
  {
    id: 'teacher',
    name: 'Teacher',
    icon: '🍎',
    heroTitle: 'Work through a hard situation with a student',
    heroIntro:
      'The Guide adapts the Communication Protocol to the classroom: your duty of care, the student’s age, and the parents and administrators around you both.',
    metaDescription:
      'An AI guide for teachers navigating a hard situation with a student: sort out your own read, understand theirs, and leave with a plan that fits your classroom.',
    pickerBlurb: 'A situation with a student, adapted to your duty of care.',
    exampleSituations: [
      'A student’s behavior is derailing the class and warnings aren’t working',
      'A capable student has suddenly disengaged',
      'A conversation with a parent is looming and you want to get it right',
      'You reacted in front of the class and want to repair it',
    ],
    welcome:
      'Hi, I’m the Solution Seeking Guide, in Teacher mode. Tell me a bit about the situation (the student’s age and what’s been happening), and we’ll work through it together.',
    mentorCta:
      'Want to build classroom practices that prevent these situations, not just handle this one? The Mentor can help you design them.',
  },
  {
    id: 'partner',
    name: 'Partner',
    icon: '💞',
    heroTitle: 'Work through a recurring conflict with your partner',
    heroIntro:
      'The Guide adapts the Communication Protocol to a relationship between equals sharing a life: the fight that keeps coming back, and the need underneath it.',
    metaDescription:
      'An AI guide for couples: understand what a recurring fight is really about, prepare a conversation your partner can hear, and leave with an arrangement you’ll both keep.',
    pickerBlurb: 'A conflict with your partner: the fight that keeps coming back.',
    exampleSituations: [
      'You have the same argument on repeat and nothing changes after',
      'Something’s been building and you don’t know how to raise it',
      'You want to repair a moment that went badly',
      'A decision you disagree about keeps getting postponed',
    ],
    welcome:
      'Hi, I’m the Solution Seeking Guide, in Partner mode. Tell me a bit about what’s been happening between you two, and we’ll take it one step at a time.',
    relatedDemoIds: ['home-chores'],
  },
  {
    id: 'family',
    name: 'Family',
    icon: '🏡',
    heroTitle: 'Navigate a hard conversation in your family',
    heroIntro:
      'Siblings, aging parents, in-laws: decades of history and no clean exit. The Guide adapts the Communication Protocol to family, where boundaries and old roles are the real terrain.',
    metaDescription:
      'An AI guide for adult family conflict (siblings, aging parents, in-laws): untangle the old patterns, prepare the conversation, and set boundaries that hold.',
    pickerBlurb: 'Adult family conflict: siblings, parents, in-laws, old history.',
    exampleSituations: [
      'Caregiving for a parent is falling unevenly and resentment is building',
      'A holiday blowup is still hanging in the air',
      'Money or inheritance has made every conversation tense',
      'You need a boundary with a family member who won’t hear it',
    ],
    welcome:
      'Hi, I’m the Solution Seeking Guide, in Family mode. Tell me a bit about who this is with and what’s been going on, and we’ll work through it together.',
  },
  {
    id: 'friend',
    name: 'Friend',
    icon: '🤝',
    heroTitle: 'Repair things with a friend',
    heroIntro:
      'No org chart, no shared house. Just the friendship itself. The Guide adapts the Communication Protocol to a bond held up entirely by choice.',
    metaDescription:
      'An AI guide for friendship ruptures and drift: figure out what actually hurt, whether to say something, and how to repair without making it weird.',
    pickerBlurb: 'A rupture or drift with a friend: repair without the weirdness.',
    exampleSituations: [
      'A friend said something that stung and you keep replaying it',
      'You’re always the one who reaches out, and it’s wearing thin',
      'A friendship is drifting and you don’t want to let it go silently',
      'You messed up and want to make it right',
    ],
    welcome:
      'Hi, I’m the Solution Seeking Guide, in Friend mode. Tell me a bit about the friendship and what happened, and we’ll figure out what, if anything, to do about it.',
  },
  {
    id: 'manager',
    name: 'Manager',
    icon: '🧭',
    heroTitle: 'Handle a hard conversation with someone on your team',
    heroIntro:
      'You hold the power in the room, which changes everything about how the conversation should go. The Guide adapts the Communication Protocol to leading people.',
    metaDescription:
      'An AI guide for managers preparing a hard conversation with a report: test your assumptions, make it safe for them to be honest, and leave with an agreement that sticks.',
    pickerBlurb: 'A situation with someone who reports to you.',
    exampleSituations: [
      'Someone’s performance has slipped and you don’t know why yet',
      'You need to give feedback that’s been building for too long',
      'A behavior is affecting the rest of the team',
      'You’re worried a good person is about to quit',
    ],
    welcome:
      'Hi, I’m the Solution Seeking Guide, in Manager mode. Tell me a bit about the situation with your team member, and we’ll prepare a conversation that’s fair to everyone, including you.',
    relatedDemoIds: ['workplace-lateness', 'team-one-on-ones'],
    mentorCta:
      'Want to build leadership practices (one-on-ones, feedback habits, team processes) instead of handling one situation? That’s the Mentor’s specialty.',
  },
  {
    id: 'coworker',
    name: 'Co-worker',
    icon: '🧑‍💼',
    heroTitle: 'Work things out with a co-worker',
    heroIntro:
      'No authority in either direction: just influence, good faith, and a working relationship you need to keep functional. The Guide adapts the Communication Protocol to peers.',
    metaDescription:
      'An AI guide for co-worker friction: test the story you’re telling about them, prepare a low-drama conversation, and land on something you can both count on.',
    pickerBlurb: 'Friction with a peer: influence without authority.',
    exampleSituations: [
      'A co-worker keeps taking credit or dropping handoffs',
      'Someone snapped at you and it’s been awkward since',
      'You disagree about how shared work should be done',
      'You’re tempted to escalate to your manager but not sure you should',
    ],
    welcome:
      'Hi, I’m the Solution Seeking Guide, in Co-worker mode. Tell me a bit about what’s been happening between you two, and we’ll work out a way through it.',
    relatedDemoIds: ['coworker-snapped'],
  },
  {
    id: 'organizer',
    name: 'Organizer',
    icon: '📣',
    heroTitle: 'Keep your movement working through conflict',
    heroIntro:
      'Volunteers can simply leave, so legitimacy and trust are everything. The Guide adapts the Communication Protocol to movements, co-ops, unions, congregations, and volunteer groups.',
    metaDescription:
      'An AI guide for organizers and movement leaders: untangle conflict inside a shared cause, design fair participatory decisions, and keep people from burning out or walking out.',
    pickerBlurb: 'Conflict inside a shared cause, where people can just leave.',
    exampleSituations: [
      'Two committed members are clashing and it’s splitting the group',
      'Meetings keep collapsing into fights about what’s fair',
      'A veteran feels taken for granted and is pulling away',
      'An ideological rift is hiding inside a logistics argument',
    ],
    welcome:
      'Hi, I’m the Solution Seeking Guide, in Organizer mode. Tell me a bit about your group and what’s been happening, and we’ll work through it in a way that keeps people in the room.',
    relatedDemoIds: ['coop-scheduling'],
    mentorCta:
      'Want to build durable conflict processes for your organization: fairness criteria, participatory decisions, review loops? The Mentor can help you design them.',
  },
];
