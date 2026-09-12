import { describe, expect, it } from 'vitest';
import { findCheck, gradeCheck, parseCheckAnswer, publicChecks } from '../checkRules';
import type { ModuleCheck } from '../types';

const checks: ModuleCheck[] = [
  { question: 'First?', choices: ['No', 'Yes'], answer: 2, explanation: 'Because yes.' },
  { question: 'Second?', choices: ['Yes', 'No'], answer: 1, explanation: 'Because the first.' },
];

describe('publicChecks', () => {
  it('numbers the checks from one and strips the answer and the explanation', () => {
    const out = publicChecks('m02', checks);
    expect(out.map((c) => c.id)).toEqual(['m02-c1', 'm02-c2']);
    expect(out[0]).toEqual({ id: 'm02-c1', question: 'First?', choices: ['No', 'Yes'] });
    expect(JSON.stringify(out)).not.toContain('answer');
    expect(JSON.stringify(out)).not.toContain('Because');
  });
});

describe('parseCheckAnswer', () => {
  it('accepts a well-formed answer', () => {
    expect(parseCheckAnswer({ module_id: 'm02', check_id: 'm02-c1', choice: 2 })).toEqual({
      ok: true,
      value: { module_id: 'm02', check_id: 'm02-c1', choice: 2 },
    });
  });
  it.each([
    [{ module_id: 'm09', check_id: 'm09-c1', choice: 1 }, 'module_id'],
    [{ module_id: 'm02', check_id: 'm03-c1', choice: 1 }, 'check_id'],
    [{ module_id: 'm02', check_id: 'm02-c1', choice: 3 }, 'choice'],
    [{ module_id: 'm02', check_id: 'm02-c1', choice: '2' }, 'choice'],
    [{ check_id: 'm02-c1', choice: 1 }, 'module_id'],
    [null, 'module_id'],
  ])('rejects %j naming %s', (body, field) => {
    expect(parseCheckAnswer(body)).toEqual({ ok: false, field });
  });
});

describe('findCheck', () => {
  it('finds a check by its numbered id', () => {
    expect(findCheck('m02', checks, 'm02-c2')).toEqual({ index: 1, check: checks[1] });
  });
  it('returns null for a number the module does not have or another module', () => {
    expect(findCheck('m02', checks, 'm02-c3')).toBeNull();
    expect(findCheck('m02', checks, 'm03-c1')).toBeNull();
  });
});

describe('gradeCheck', () => {
  it('compares the choice with the key and returns the explanation either way', () => {
    expect(gradeCheck(checks[0], 2)).toEqual({ correct: true, explanation: 'Because yes.' });
    expect(gradeCheck(checks[0], 1)).toEqual({ correct: false, explanation: 'Because yes.' });
  });
});
