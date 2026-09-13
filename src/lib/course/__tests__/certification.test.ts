import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CERTIFICATION_MEANING,
  CRITERIA,
  CRITERION_IDS,
  PASS_MIN_CRITERION,
  PASS_TOTAL,
  PRINCIPLE_IDS,
  SCORE_ANCHORS,
  TOOL_IDS,
} from '../../../data/certification';
import { hasBannedCopy } from '../ids';
import { PRINCIPLE_ICONS, TOOL_ICONS } from '../../icons';

// Resolved from this file's own location, not the process cwd, so the test
// passes regardless of which directory `vitest` is invoked from.
const PRINCIPLES_DIR = fileURLToPath(new URL('../../../content/principles', import.meta.url));
const TOOLS_DIR = fileURLToPath(new URL('../../../content/tools', import.meta.url));

const basenames = (dir: string, ext: string) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => f.slice(0, -ext.length))
    .sort();

describe('certification rubric data', () => {
  it('has six criteria whose weights sum to 100', () => {
    expect(CRITERIA).toHaveLength(6);
    expect(CRITERIA.reduce((sum, c) => sum + c.weight, 0)).toBe(100);
    expect(new Set(CRITERION_IDS).size).toBe(6);
  });

  it('publishes the five score anchors and the pass rule', () => {
    expect(Object.keys(SCORE_ANCHORS)).toEqual(['0', '1', '2', '3', '4']);
    expect(PASS_TOTAL).toBe(80);
    expect(PASS_MIN_CRITERION).toBe(3);
  });

  it('lists exactly the principles and tools that exist as content', () => {
    expect([...PRINCIPLE_IDS].sort()).toEqual(basenames(PRINCIPLES_DIR, '.yaml'));
    expect([...PRINCIPLE_IDS].sort()).toEqual(Object.keys(PRINCIPLE_ICONS).sort());
    expect([...TOOL_IDS].sort()).toEqual(basenames(TOOLS_DIR, '.md'));
    expect([...TOOL_IDS].sort()).toEqual(Object.keys(TOOL_ICONS).sort());
  });

  it('states the meaning of the credential in house copy', () => {
    expect(CERTIFICATION_MEANING).toMatch(/AI-assessed/);
    expect(hasBannedCopy(CERTIFICATION_MEANING)).toBe(false);
  });
});
