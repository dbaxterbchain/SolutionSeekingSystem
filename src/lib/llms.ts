import type { CollectionEntry } from 'astro:content';
import { glossary, pillars, systemDefinition } from '../data/concepts';

/**
 * Serializers that turn content-collection entries into clean, standalone
 * markdown. Single source of truth for /llms.txt, /llms-full.txt, the
 * per-page .md endpoints, and (later) AI-agent grounding context — the prose
 * always comes from the collections, never duplicated here.
 */

const SITE_NAME = 'Solution Seeking System';

export function attributionFooter(site: URL | undefined): string {
  const origin = site?.origin ?? 'https://www.solutionseeking.com';
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
    `# ${p.title} — Wisdom Principle ${p.order} of 12`,
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
    ...s.requires.map((r) => `- **${r.name}** — ${r.why}`),
    '',
    (entry.body ?? '').trim(),
  ].join('\n');
}

export function toolToMarkdown(entry: CollectionEntry<'tools'>): string {
  const t = entry.data;
  return [
    `# ${t.title} — Leadership Tool ${t.order} of 4`,
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

export function overviewToMarkdown(): string {
  return [
    `# What is the ${SITE_NAME}?`,
    '',
    systemDefinition,
    '',
    '## The Four Pillars of Understanding',
    '',
    'The philosophical foundation of the system — treated as practical tools, not abstract values:',
    '',
    ...pillars.map((p) => `- **${p.name}** — ${p.description}`),
    '',
    '## Key terminology',
    '',
    ...glossary.map((t) => `- **${t.term}** — ${t.definition}`),
  ].join('\n');
}
