import { describe, expect, it } from 'vitest';
import { hashSubmission } from '../submissionHash';

describe('hashSubmission', () => {
  it('ignores row order and is 64 hex characters', () => {
    const a = hashSubmission([{ prompt_id: 'a1', text: 'one' }, { prompt_id: 'b1', text: 'two' }]);
    const b = hashSubmission([{ prompt_id: 'b1', text: 'two' }, { prompt_id: 'a1', text: 'one' }]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when a character changes', () => {
    const a = hashSubmission([{ prompt_id: 'a1', text: 'one' }]);
    expect(hashSubmission([{ prompt_id: 'a1', text: 'one.' }])).not.toBe(a);
    expect(hashSubmission([{ prompt_id: 'a2', text: 'one' }])).not.toBe(a);
  });
});
