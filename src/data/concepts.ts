/**
 * Canonical definition of the system — the single quotable answer to
 * "What is the Solution Seeking System?". Reused on the homepage, /system,
 * llms.txt, and structured data so every surface says the same thing.
 */
export const systemDefinition =
  'The Solution Seeking System (SSS) is a free framework for democratic problem ' +
  'solving, leadership, and communication, created by David and Shannon Baxter at ' +
  'Beanchain Coffee, a worker-directed cooperative. It combines a three-step ' +
  'Communication Protocol (Introspection, Mutual Understanding, and Solution ' +
  'Seeking) with 12 Wisdom Principles and 4 Leadership Tools to turn conflict ' +
  'into understanding, and understanding into actionable, measurable solutions.';

export interface Term {
  term: string;
  definition: string;
}

/** Key Terminology — the language that supports understanding the system. */
export const glossary: Term[] = [
  {
    term: 'System',
    definition:
      'Any group of people working or interacting together (a team, a relationship, a community, or an organization). A system can contain many other systems within it.',
  },
  {
    term: 'Living System',
    definition:
      'A system that is actively built and improved using Solutions generated through the Communication Protocol, actively changing to better serve the people who are part of it.',
  },
  {
    term: 'Solution',
    definition:
      'An actionable and measurable plan, pattern, or tool that can improve a System.',
  },
  {
    term: 'Leader (Servant)',
    definition:
      'A person who takes responsibility for the health of the System and its people, not for control, but to help it thrive and grow.',
  },
  {
    term: 'Leadership Tools',
    definition:
      'Practices that apply the Communication Protocol to real-world issues in a way that best suits the System in which they are used.',
  },
  {
    term: 'Wisdom Principles',
    definition:
      'Ethical values (such as fairness and understanding) that guide SSS use and are applied within the Communication Protocol.',
  },
  {
    term: 'Communication Protocol',
    definition:
      'The three-step communication pattern at the core of the SSS: Introspection, Mutual Understanding, and Solution Seeking. It produces Solutions that can be applied to a system to make it a Living System.',
  },
];

export interface Pillar {
  name: string;
  description: string;
  icon: string;
}

/** The Four Pillars of Understanding. */
export const pillars: Pillar[] = [
  {
    name: 'Patience',
    description: 'To understand a perspective other than your own takes time.',
    icon: '⏳',
  },
  {
    name: 'Vulnerability',
    description: 'Openness is required to share needs and fears.',
    icon: '🪞',
  },
  {
    name: 'Bravery',
    description: 'Honest conversations often require courage.',
    icon: '🦁',
  },
  {
    name: 'Compassion',
    description: 'Understanding someone does not require agreement, only care.',
    icon: '❤️',
  },
];

export interface ProtocolStepMeta {
  step: number;
  title: string;
  slug: string;
  oneLine: string;
  icon: string;
}

/** Lightweight protocol metadata for diagrams and navigation. */
export const protocolSteps: ProtocolStepMeta[] = [
  {
    step: 1,
    title: 'Introspection',
    slug: 'introspection',
    oneLine: 'Understand yourself first: your feelings, needs, and goals.',
    icon: '🧭',
  },
  {
    step: 2,
    title: 'Mutual Understanding',
    slug: 'mutual-understanding',
    oneLine: "Fully understand the other person's perspective, and ensure they understand yours.",
    icon: '🤝',
  },
  {
    step: 3,
    title: 'Solution Seeking',
    slug: 'solution-seeking',
    oneLine: 'Collaboratively develop and agree on specific, measurable solutions.',
    icon: '💡',
  },
];
