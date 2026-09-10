import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CRITERIA,
  CRITERION_IDS,
  PASS_MIN_CRITERION,
  PASS_TOTAL,
  PRINCIPLE_IDS,
  SCORE_ANCHORS,
  TOOL_IDS,
} from '../../../data/certification';
import { PRINCIPLE_ICONS, TOOL_ICONS } from '../../icons';

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
    expect([...PRINCIPLE_IDS].sort()).toEqual(basenames('src/content/principles', '.yaml'));
    expect([...PRINCIPLE_IDS].sort()).toEqual(Object.keys(PRINCIPLE_ICONS).sort());
    expect([...TOOL_IDS].sort()).toEqual(basenames('src/content/tools', '.md'));
    expect([...TOOL_IDS].sort()).toEqual(Object.keys(TOOL_ICONS).sort());
  });
});
