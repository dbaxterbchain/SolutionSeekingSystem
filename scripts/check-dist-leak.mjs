#!/usr/bin/env node
/**
 * After `astro build`, nothing private from an assessment form may exist in
 * dist/ (the static output; the SSR bundle is written under .netlify/ and is
 * server-only by construction). Needles: the private marker, every note,
 * every reveal, every reference response, every scoring anchor, and every
 * intro and prompt of a stage after the first, each cut to its first 60
 * characters. Files are compared raw, HTML-decoded and JS-unescaped so an
 * escaped quote cannot hide a leak. Runs inside `npm run build`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FORMS_DIR = join(ROOT, 'src', 'content', 'course', 'assessment-forms');
const DIST = join(ROOT, 'dist');
const TEXT_EXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.txt', '.xml', '.md', '.svg', '.map']);
const rel = (p) => relative(ROOT, p).split('\\').join('/');

const normalise = (s) => s.replace(/\s+/g, ' ').trim();
const needles = new Map(); // needle -> label
const add = (label, s) => {
  if (typeof s !== 'string') return;
  const n = normalise(s).slice(0, 60);
  if (n.length >= 12) needles.set(n, label);
};

if (!existsSync(DIST)) {
  console.error('check-dist-leak: dist/ is missing; run astro build first');
  process.exit(1);
}
for (const name of readdirSync(FORMS_DIR)) {
  if (!name.endsWith('.json')) continue;
  const form = JSON.parse(readFileSync(join(FORMS_DIR, name), 'utf8'));
  const id = form.form_id ?? name;
  add(`${id} private_marker`, form.private_marker);
  add(`${id} notes`, form.notes);
  (form.stages ?? []).forEach((stage, i) => {
    add(`${id} ${stage.id} reveal`, stage.reveal);
    if (i > 0) {
      add(`${id} ${stage.id} intro`, stage.intro);
      for (const p of stage.prompts ?? []) add(`${id} prompt ${p.prompt_id}`, p.text);
    }
  });
  for (const r of form.reference_responses ?? []) add(`${id} reference ${r.prompt_id}`, r.text);
  for (const a of form.scoring_anchors ?? []) add(`${id} anchor ${a.criterion_id}`, a.note);
}

const decodeHtml = (s) =>
  s
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
const decodeJs = (s) => s.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\n/g, ' ');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (TEXT_EXT.has(extname(name))) out.push(p);
  }
  return out;
}

const leaks = [];
for (const file of walk(DIST)) {
  const raw = readFileSync(file, 'utf8');
  const variants = [normalise(raw), normalise(decodeHtml(raw)), normalise(decodeJs(raw))];
  for (const [needle, label] of needles) {
    if (variants.some((v) => v.includes(needle))) leaks.push(`${rel(file)}: ${label} ("${needle.slice(0, 20)}...")`);
  }
}

if (leaks.length) {
  console.error('check-dist-leak: FAILED, private assessment text is in the static output');
  for (const l of leaks) console.error(`  ${l}`);
  process.exit(1);
}
console.log(`check-dist-leak: ok (${needles.size} needles, none in dist/)`);
