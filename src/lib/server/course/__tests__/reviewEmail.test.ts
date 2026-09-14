import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send } };
  }),
}));

import { notifyLearnerOfReview, reviewReceivedEmail } from '../reviewEmail';

const config = { apiKey: 'key', from: 'Course <course@example.com>' };
const notice = { reviewId: 'rev-1', userId: 'user-1', assessmentUrl: 'https://example.com/course/learn/assessment/' };
const deps = (email: string | null, claimed: boolean) => ({ emailFor: vi.fn(async () => email), markSent: vi.fn(async () => claimed) });

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ error: null });
});

describe('reviewReceivedEmail', () => {
  it('names no criterion, no score and no quote', () => {
    const mail = reviewReceivedEmail({ assessmentUrl: notice.assessmentUrl });
    expect(mail.subject).toBe('We received your review request');
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain(notice.assessmentUrl);
      expect(body).not.toMatch(/score|criterion|passed|not yet|total/i);
    }
  });
});

describe('notifyLearnerOfReview', () => {
  it('claims the send, looks up the address, and sends once with the review as the key', async () => {
    const d = deps('learner@example.com', true);
    expect(await notifyLearnerOfReview(config, notice, d)).toBe(true);
    expect(d.markSent).toHaveBeenCalledWith('rev-1');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ to: 'learner@example.com', subject: 'We received your review request' });
    expect(send.mock.calls[0][1]).toEqual({ idempotencyKey: 'course-review-received/rev-1' });
  });
  it('sends nothing when the claim says it was already sent', async () => {
    const d = deps('learner@example.com', false);
    expect(await notifyLearnerOfReview(config, notice, d)).toBe(false);
    expect(d.emailFor).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
