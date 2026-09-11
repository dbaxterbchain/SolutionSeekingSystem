import { describe, expect, it } from 'vitest';
import { gradingFailureEmail } from '../gradingAlert';

describe('gradingFailureEmail', () => {
  it('names the job, the attempt, the category and where to retry', () => {
    const mail = gradingFailureEmail({ jobId: 'job-1', attemptId: 'att-1', category: 'internal', error: 'boom', adminUrl: 'https://example.com/admin/' });
    expect(mail.subject).toBe('A course grading job failed');
    expect(mail.text).toContain('Job: job-1');
    expect(mail.text).toContain('Attempt: att-1');
    expect(mail.text).toContain('Category: internal');
    expect(mail.text).toContain('Error: boom');
    expect(mail.text).toContain('https://example.com/admin/');
    expect(mail.text).not.toMatch(/[—–]/);
  });

  it('cuts a long error', () => {
    const mail = gradingFailureEmail({ jobId: 'j', attemptId: 'a', category: 'upstream', error: 'x'.repeat(2000), adminUrl: 'u' });
    expect(mail.text.length).toBeLessThan(1200);
  });
});
