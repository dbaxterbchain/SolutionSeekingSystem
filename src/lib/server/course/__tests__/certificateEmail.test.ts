import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send } };
  }),
}));

import { certificateReadyEmail, notifyLearnerOfCertificate } from '../certificateEmail';

const config = { apiKey: 'key', from: 'Course <course@example.com>' };
const notice = { certificateId: 'cert-1', userId: 'user-1', certificateUrl: 'https://example.com/course/learn/certificate/' };
const deps = (email: string | null, claimed: boolean) => ({ emailFor: vi.fn(async () => email), markSent: vi.fn(async () => claimed) });

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ error: null });
});

describe('certificateReadyEmail', () => {
  it('names no score, no quote and no name', () => {
    const mail = certificateReadyEmail({ certificateUrl: notice.certificateUrl });
    expect(mail.subject).toBe('Your certificate is ready');
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain(notice.certificateUrl);
      expect(body).not.toMatch(/score|total|criterion|awarded to/i);
    }
  });
});

describe('notifyLearnerOfCertificate', () => {
  it('claims the certificate, looks up the address, and sends once with the certificate id as the key', async () => {
    const d = deps('learner@example.com', true);
    expect(await notifyLearnerOfCertificate(config, notice, d)).toBe(true);
    expect(d.markSent).toHaveBeenCalledWith('cert-1');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ to: 'learner@example.com', subject: 'Your certificate is ready' });
    expect(send.mock.calls[0][1]).toEqual({ idempotencyKey: 'course-certificate/cert-1' });
  });
  it('sends nothing when the claim says it was already sent', async () => {
    const d = deps('learner@example.com', false);
    expect(await notifyLearnerOfCertificate(config, notice, d)).toBe(false);
    expect(d.emailFor).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
