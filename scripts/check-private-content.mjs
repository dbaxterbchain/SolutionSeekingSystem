#!/usr/bin/env node
/**
 * Rules that keep private course content from leaking into the wrong file.
 * Runs inside `npm run check`.
 *
 *  1. The collection `assessmentForms` is referenced by exactly two files:
 *     src/content/config.ts (its definition) and src/lib/server/course/forms.ts
 *     (its single reader). Any other reference under src/ fails, and no page
 *     or component may reach into the forms directory.
 *  2. `getModuleForLearner` (the module-check reader, key included) is called by
 *     exactly two files: src/lib/server/course/content.ts (its definition) and
 *     src/pages/api/course/check.ts (the only route allowed to call it). Any
 *     other reference under src/ fails.
 *  3. Every module reachable from netlify/functions/*.mts and from
 *     src/lib/server/course/gradingJob.ts is bundler-clean: no astro:content,
 *     no import.meta.env, no env.ts, supabaseAdmin.ts, rateLimit.ts and no
 *     src/data/course.ts. The Netlify function bundle is built by esbuild
 *     outside Vite, where none of those exist.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const rel = (p) => relative(ROOT, p).split('\\').join('/');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '__tests__') continue;
      walk(p, out);
    } else if (/\.(ts|tsx|mts|mjs|js|astro)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const problems = [];

// Rule 1: the collection has one definition and one reader.
const COLLECTION_ALLOWED = new Set(['src/content/config.ts', 'src/lib/server/course/forms.ts']);
for (const file of walk(join(ROOT, 'src'))) {
  const r = rel(file);
  const text = readFileSync(file, 'utf8');
  if (text.includes('assessmentForms') && !COLLECTION_ALLOWED.has(r)) {
    problems.push(`${r}: references the assessmentForms collection (only config.ts and forms.ts may)`);
  }
  if ((r.startsWith('src/pages/') || r.startsWith('src/components/')) && text.includes('assessment-forms')) {
    problems.push(`${r}: reaches into src/content/course/assessment-forms`);
  }
}

// Rule 2: getModuleForLearner has one definition and one caller.
const GET_MODULE_FOR_LEARNER_ALLOWED = new Set([
  'src/lib/server/course/content.ts',
  'src/pages/api/course/check.ts',
]);
for (const file of walk(join(ROOT, 'src'))) {
  const r = rel(file);
  const text = readFileSync(file, 'utf8');
  if (text.includes('getModuleForLearner') && !GET_MODULE_FOR_LEARNER_ALLOWED.has(r)) {
    problems.push(`${r}: references getModuleForLearner (only content.ts and check.ts may)`);
  }
}

// Rule 3: the worker's import closure.
const FORBIDDEN = [
  { re: /from\s+['"]astro:content['"]/, why: 'imports astro:content' },
  { re: /import\.meta\.env/, why: 'reads import.meta.env' },
  { re: /from\s+['"][^'"]*\/env['"]/, why: 'imports src/lib/server/env.ts' },
  { re: /from\s+['"][^'"]*\/supabaseAdmin['"]/, why: 'imports supabaseAdmin.ts' },
  { re: /from\s+['"][^'"]*\/rateLimit['"]/, why: 'imports rateLimit.ts' },
  { re: /from\s+['"][^'"]*\/data\/course['"]/, why: 'imports src/data/course.ts (it reads import.meta.env)' },
];
const roots = [];
const fnDir = join(ROOT, 'netlify', 'functions');
if (existsSync(fnDir)) for (const n of readdirSync(fnDir)) if (n.endsWith('.mts')) roots.push(join(fnDir, n));
const jobFile = join(ROOT, 'src', 'lib', 'server', 'course', 'gradingJob.ts');
if (existsSync(jobFile)) roots.push(jobFile);

function resolveImport(from, spec) {
  if (!spec.startsWith('.')) return null; // packages are fine
  const base = resolve(dirname(from), spec);
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, join(base, 'index.ts')]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

const seen = new Set();
const queue = [...roots];
while (queue.length) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  const text = readFileSync(file, 'utf8');
  const r = rel(file);
  for (const { re, why } of FORBIDDEN) if (re.test(text)) problems.push(`${r}: ${why} (reachable from the grading worker)`);
  for (const m of text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
    const target = resolveImport(file, m[1]);
    if (target) queue.push(target);
  }
}

if (problems.length) {
  console.error('check-private-content: FAILED');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`check-private-content: ok (${seen.size} worker-reachable modules checked)`);
