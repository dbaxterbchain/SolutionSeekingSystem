import { getCollection, type CollectionEntry } from 'astro:content';
import { glossary, pillars, systemDefinition } from '../data/concepts';
import { COURSE } from '../data/course';
import {
  CERTIFICATION_METHOD,
  CERTIFICATION_TITLE,
  CERTIFICATION_VERSION,
  CRITERIA,
  PASS_MIN_CRITERION,
  PASS_TOTAL,
  SCORE_ANCHORS,
} from '../data/certification';
import { COVERAGE_CAP, MISCONCEPTION_CAP } from './server/course/rubric';
import type { PublicCurriculum } from './course/curriculum';

/**
 * Serializers that turn content-collection entries into clean, standalone
 * markdown. Single source of truth for /llms.txt, /llms-full.txt, the
 * per-page .md endpoints, and (later) AI-agent grounding context — the prose
 * always comes from the collections, never duplicated here.
 */

const SITE_NAME = 'Solution Seeking System';

export function attributionFooter(site: URL | undefined): string {
  const origin = site?.origin ?? 'https://solutionseeking.com';
  return [
    '---',
    '',
    `Part of the ${SITE_NAME} (${origin}) by David & Shannon Baxter, ` +
      'Beanchain Coffee LLC. Please attribute quotations to the Solution Seeking System.',
  ].join('\n');
}

export function principleToMarkdown(entry: CollectionEntry<'principles'>): string {
  const p = entry.data;
  return [
    `# ${p.title}: Wisdom Principle ${p.order} of 12`,
    '',
    `> ${p.tagline}`,
    '',
    '## What it is',
    '',
    p.whatItIs,
    '',
    "## How it's used in the system",
    '',
    p.howUsed,
    '',
    '## Best practices',
    '',
    ...p.bestPractices.map((b) => `- ${b}`),
    '',
    '## Goals',
    '',
    ...p.goals.map((g) => `- ${g}`),
    '',
    "## Antigoals (what we don't want)",
    '',
    ...p.antigoals.map((a) => `- ${a}`),
    '',
    '## Practice patterns',
    '',
    ...p.practices.flatMap((pr) => [`### ${pr.title}`, '', pr.body, '']),
    '## FAQ & common issues',
    '',
    ...p.faq.flatMap((f) => [`**Q: ${f.q}**`, '', `A: ${f.a}`, '']),
    '## Worked example',
    '',
    p.example,
  ].join('\n');
}

export function protocolToMarkdown(entry: CollectionEntry<'protocol'>): string {
  const s = entry.data;
  return [
    `# Communication Protocol, Step ${s.step} of 3: ${s.title}`,
    '',
    `> ${s.oneLine}`,
    '',
    s.summary,
    '',
    '## Wisdom Principles this step requires',
    '',
    ...s.requires.map((r) => `- **${r.name}**: ${r.why}`),
    '',
    (entry.body ?? '').trim(),
  ].join('\n');
}

export function toolToMarkdown(entry: CollectionEntry<'tools'>): string {
  const t = entry.data;
  return [
    `# ${t.title}: Leadership Tool ${t.order} of 4`,
    '',
    `> ${t.summary}`,
    '',
    '## Desired outcomes',
    '',
    ...t.outcomes.map((o) => `- ${o}`),
    '',
    '## When to use it',
    '',
    ...t.triggers.map((tr) => `- ${tr}`),
    '',
    (entry.body ?? '').trim(),
  ].join('\n');
}

/**
 * The Communication Protocol overview (the /protocol index) as standalone
 * markdown: the three-step intro plus each step's one-line and link.
 */
export function protocolOverviewToMarkdown(
  entries: CollectionEntry<'protocol'>[],
  site: URL | undefined
): string {
  const origin = site?.origin ?? 'https://solutionseeking.com';
  const steps = [...entries].sort((a, b) => a.data.step - b.data.step);
  return [
    '# The Communication Protocol',
    '',
    '> The repeatable three-step communication pattern at the core of the Solution Seeking System.',
    '',
    'Worked in order, the steps replace reactive, adversarial conversations with a structured,',
    'respectful path from conflict to understanding to actionable results.',
    '',
    '## The three steps',
    '',
    ...steps.map(
      (s) =>
        `${s.data.step}. **${s.data.title}**: ${s.data.oneLine} (${origin}/protocol/${s.id})`
    ),
  ].join('\n');
}

/**
 * A demo conversation as citable markdown: the setup, before/after, and expected
 * behavior from the frontmatter, with a link to the full annotated transcript.
 * The transcript body is MDX with custom components, so we emit the clean
 * summary rather than the raw MDX source.
 */
export function demoToMarkdown(entry: CollectionEntry<'demos'>, site: URL | undefined): string {
  const d = entry.data;
  const origin = site?.origin ?? 'https://solutionseeking.com';
  const agentName = d.agent === 'guide' ? 'Solution Seeking Guide' : 'Solution Seeking Mentor';
  return [
    `# ${d.title}`,
    '',
    `> ${d.scenario}`,
    '',
    `A fictional, annotated example conversation with the ${agentName}.`,
    '',
    '## Where the person started',
    '',
    d.before,
    '',
    '## What they walked away with',
    '',
    ...d.after.map((a) => `- ${a}`),
    '',
    '## What the assistant is expected to do',
    '',
    ...d.spec.expected.map((e) => `- ${e}`),
    '',
    `The full annotated transcript is at ${origin}/practice/demos/${entry.id}`,
  ].join('\n');
}

/**
 * The entire methodology as one coherent markdown document, in teaching order.
 * Shared by /llms-full.txt and the AI assistants' grounding context.
 */
export async function methodologyMarkdown(): Promise<string> {
  const protocol = (await getCollection('protocol')).sort((a, b) => a.data.step - b.data.step);
  const principles = (await getCollection('principles')).sort(
    (a, b) => a.data.order - b.data.order
  );
  const tools = (await getCollection('tools')).sort((a, b) => a.data.order - b.data.order);

  const sections = [
    overviewToMarkdown(),
    [
      '# The Communication Protocol',
      '',
      'The three-step communication pattern at the core of the system. Worked in order,',
      'the steps replace reactive, adversarial conversations with a structured, respectful',
      'path from conflict to understanding to actionable results.',
    ].join('\n'),
    ...protocol.map(protocolToMarkdown),
    [
      '# The 12 Wisdom Principles',
      '',
      'The "source code" of the system: ethical values that guide how the Communication',
      'Protocol is applied. Each principle is documented in the same six-part format.',
    ].join('\n'),
    ...principles.map(principleToMarkdown),
    [
      '# The 4 Leadership Tools',
      '',
      'Practices that apply the Communication Protocol to real-world situations in teams,',
      'workplaces, relationships, and communities.',
    ].join('\n'),
    ...tools.map(toolToMarkdown),
  ];

  return sections.join('\n\n---\n\n');
}

export function overviewToMarkdown(): string {
  return [
    `# What is the ${SITE_NAME}?`,
    '',
    systemDefinition,
    '',
    '## The Four Pillars of Understanding',
    '',
    'The philosophical foundation of the system, treated as practical tools rather than abstract values:',
    '',
    ...pillars.map((p) => `- **${p.name}**: ${p.description}`),
    '',
    '## Key terminology',
    '',
    ...glossary.map((t) => `- **${t.term}**: ${t.definition}`),
  ].join('\n');
}

/** /course.md: the public shape of the course for machines, never lesson prose. */
export function courseToMarkdown(
  site: URL | undefined,
  curriculum: PublicCurriculum,
  opts: { status: 'preview' | 'open'; priceLine: string | null }
): string {
  const link = (path: string) => (site ? new URL(path, site).href : path);
  return [
    `# ${COURSE.title}`,
    '',
    `A paid video course with ${COURSE.presenter}: ${curriculum.totalLessons} short lessons across ${curriculum.modules.length} modules, an exercise and a model response for each, a printable worksheet for every module, and an AI-assessed certification at the end. About ${COURSE.learnerHours} hours of learner time over ${COURSE.suggestedWeeks} weeks.`,
    '',
    opts.status === 'open' && opts.priceLine ? opts.priceLine : 'Not on sale yet.',
    '',
    '## Syllabus',
    '',
    ...curriculum.modules.flatMap((m) => [`### ${m.title}`, '', ...m.lessons.map((l) => `- ${l.title}`), '']),
    '## Certification',
    '',
    `${link('/course/certification')}`,
    '',
    `Course page: ${link('/course')}`,
  ].join('\n');
}

/** /course/certification.md: the published rubric. */
export function certificationToMarkdown(site: URL | undefined): string {
  const link = (path: string) => (site ? new URL(path, site).href : path);
  return [
    `# ${CERTIFICATION_TITLE}`,
    '',
    `${CERTIFICATION_METHOD}. An AI-assessed course credential earned on supplied scenarios. It is not an accreditation and does not verify live behaviour. Version ${CERTIFICATION_VERSION}.`,
    '',
    '## Criteria',
    '',
    ...CRITERIA.map((c) => `- ${c.name} (${c.weight}%): ${c.demonstrates}`),
    '',
    '## Score anchors',
    '',
    ...Object.entries(SCORE_ANCHORS).map(([score, meaning]) => `- ${score}: ${meaning}`),
    '',
    '## Passing',
    '',
    `A weighted total of at least ${PASS_TOTAL} out of 100 with every criterion at ${PASS_MIN_CRITERION} or more. A missing or misapplied Wisdom Principle or Leadership Tool caps its criterion at ${COVERAGE_CAP}, and a material misconception caps the criterion it names at ${MISCONCEPTION_CAP}.`,
    '',
    `Course page: ${link('/course')}`,
  ].join('\n');
}
