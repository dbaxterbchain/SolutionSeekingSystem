import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send } };
  }),
}));

import { courseMail, escapeHtml, sendClaimedEmail } from '../courseEmail';

const config = { apiKey: 'key', from: 'Course <course@example.com>' };
const mail = courseMail({ subject: 'Subject', intro: 'Intro <b>', button: { href: 'https://example.com/x/', label: 'Open' }, footer: 'Footer' });
const args = (claimed: boolean, to: string | null) => ({
  label: 'thing t-1: test email',
  key: 'course-test/t-1',
  claim: vi.fn(async () => claimed),
  to: vi.fn(async () => to),
  mail,
});

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ error: null });
});

describe('courseMail', () => {
  it('escapes text in the html and keeps the text version plain', () => {
    expect(mail.html).toContain('Intro &lt;b&gt;');
    expect(mail.html).toContain('href="https://example.com/x/"');
    expect(mail.text).toContain('Open: https://example.com/x/');
    expect(mail.text).toContain('Intro <b>');
    expect(escapeHtml(`"a" & 'b'`)).toBe('&quot;a&quot; &amp; &#39;b&#39;');
  });
});

describe('sendClaimedEmail', () => {
  it('claims, then looks up the address, then sends once under the key', async () => {
    const a = args(true, 'learner@example.com');
    expect(await sendClaimedEmail(config, a)).toBe(true);
    expect(a.claim).toHaveBeenCalledTimes(1);
    expect(a.to).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ from: config.from, to: 'learner@example.com', subject: 'Subject' });
    expect(send.mock.calls[0][1]).toEqual({ idempotencyKey: 'course-test/t-1' });
  });
  it('sends nothing when the claim says it was already sent', async () => {
    const a = args(false, 'learner@example.com');
    expect(await sendClaimedEmail(config, a)).toBe(false);
    expect(a.to).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
  it('sends nothing without configuration, without an address, or when Resend refuses, and never throws', async () => {
    const unconfigured = args(true, 'learner@example.com');
    expect(await sendClaimedEmail({ apiKey: '', from: '' }, unconfigured)).toBe(false);
    expect(unconfigured.claim).not.toHaveBeenCalled();
    expect(await sendClaimedEmail(config, args(true, null))).toBe(false);
    send.mockResolvedValueOnce({ error: { message: 'no' } });
    expect(await sendClaimedEmail(config, args(true, 'learner@example.com'))).toBe(false);
    send.mockRejectedValueOnce(new Error('network'));
    expect(await sendClaimedEmail(config, args(true, 'learner@example.com'))).toBe(false);
    const throwing = { ...args(true, 'learner@example.com'), claim: vi.fn(async () => { throw new Error('db'); }) };
    expect(await sendClaimedEmail(config, throwing)).toBe(false);
  });
});
