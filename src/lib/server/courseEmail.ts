import { BRAND, INK, button, esc, layout } from './email';

/**
 * Course emails. Subjects are plain; bodies carry no prices, no answers and
 * no scores; every link lands on a page that asks for sign-in.
 */

/** "Your course is ready", sent once per enrollment (idempotency key course-purchase/<enrollment_id>). */
export function coursePurchaseEmail(opts: { courseTitle: string; courseUrl: string; supportEmail: string }) {
  const html = layout(
    `
    <h1 style="margin:0 0 12px;font-size:22px;color:${INK};">Your course is ready</h1>
    <p style="margin:0 0 20px;">Thank you for buying the ${esc(opts.courseTitle)}. Your lessons are waiting in your account.</p>
    <p style="margin:0 0 24px;">${button(opts.courseUrl, 'Open your course')}</p>
    <p style="margin:0 0 12px;">Sign in with the same email address you used at checkout. Stripe sends your receipt separately.</p>
    <p style="margin:0;">Questions about access? Write to <a href="mailto:${esc(opts.supportEmail)}" style="color:${BRAND};font-weight:600;">${esc(opts.supportEmail)}</a>.</p>`,
    'Sent because this address bought the course on solutionseeking.com.'
  );

  const text = [
    'Your course is ready',
    '',
    `Thank you for buying the ${opts.courseTitle}. Your lessons are waiting in your account.`,
    '',
    `Open your course: ${opts.courseUrl}`,
    '',
    'Sign in with the same email address you used at checkout. Stripe sends your receipt separately.',
    '',
    `Questions about access? Write to ${opts.supportEmail}.`,
    '',
    'Beanchain Coffee LLC',
  ].join('\n');

  return { subject: 'Your course is ready', html, text };
}

/** Internal alert: somebody paid for a course they already have, or paid while revoked. Money needs a human. */
export function courseDuplicatePaymentAlertEmail(opts: {
  userId: string;
  sessionId: string;
  amountLabel: string;
  note: string;
  adminUrl: string;
}) {
  const row = (label: string, value: string) =>
    `<p style="margin:0 0 6px;"><strong style="color:${INK};">${label}:</strong> ${value}</p>`;

  const html = layout(
    `
    <h1 style="margin:0 0 16px;font-size:20px;color:${INK};">A course payment needs a refund</h1>
    ${row('Learner', esc(opts.userId))}
    ${row('Checkout session', esc(opts.sessionId))}
    ${row('Amount', esc(opts.amountLabel))}
    <p style="margin:16px 0 0;padding:12px 14px;background:#f8fafc;border-radius:10px;">${esc(opts.note)}</p>
    <p style="margin:16px 0 0;">Their access did not change. Refund the newer payment from the Stripe dashboard, then record it in the admin area.</p>
    <p style="margin:20px 0 0;font-size:13px;color:#64748b;">${esc(opts.adminUrl)}</p>`,
    'Sent because the Stripe webhook saw a course payment it could not apply.'
  );

  const text = [
    'A course payment needs a refund',
    '',
    `Learner: ${opts.userId}`,
    `Checkout session: ${opts.sessionId}`,
    `Amount: ${opts.amountLabel}`,
    '',
    opts.note,
    '',
    'Their access did not change. Refund the newer payment from the Stripe dashboard, then record it in the admin area.',
    opts.adminUrl,
  ].join('\n');

  return { subject: 'A course payment needs a refund', html, text };
}
