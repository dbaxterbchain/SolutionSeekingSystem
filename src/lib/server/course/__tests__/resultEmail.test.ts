import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send } };
  }),
}));

import { notifyLearnerOfResult, resultReadyEmail } from '../resultEmail';

const config = { apiKey: 'key', from: 'Course <course@example.com>' };
const notice = { jobId: 'job-1', generation: 1, userId: 'user-1', assessmentUrl: 'https://example.com/course/learn/assessment/' };
const deps = (email: string | null, claimed: boolean) => ({ emailFor: vi.fn(async () => email), markSent: vi.fn(async () => claimed) });

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ error: null });
});

describe('resultReadyEmail', () => {
  it('names no outcome, no score and no quote', () => {
    const mail = resultReadyEmail({ assessmentUrl: notice.assessmentUrl });
    expect(mail.subject).toBe('Your assessment result is ready');
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain(notice.assessmentUrl);
      expect(body).not.toMatch(/pass|score|not yet|total|criterion/i);
    }
  });
});

describe('notifyLearnerOfResult', () => {
  it('claims the send, looks up the address, and sends once with the job and generation as the key', async () => {
    const d = deps('learner@example.com', true);
    expect(await notifyLearnerOfResult(config, notice, d)).toBe(true);
    expect(d.markSent).toHaveBeenCalledWith('job-1');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ to: 'learner@example.com', subject: 'Your assessment result is ready' });
    expect(send.mock.calls[0][1]).toEqual({ idempotencyKey: 'course-result/job-1-1' });
  });
  it('sends nothing when the claim says it was already sent', async () => {
    const d = deps('learner@example.com', false);
    expect(await notifyLearnerOfResult(config, notice, d)).toBe(false);
    expect(d.emailFor).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
  it('sends nothing without configuration or without an address, and never throws', async () => {
    expect(await notifyLearnerOfResult({ apiKey: '', from: '' }, notice, deps('learner@example.com', true))).toBe(false);
    expect(await notifyLearnerOfResult(config, notice, deps(null, true))).toBe(false);
    send.mockRejectedValueOnce(new Error('network'));
    expect(await notifyLearnerOfResult(config, notice, deps('learner@example.com', true))).toBe(false);
  });
});
