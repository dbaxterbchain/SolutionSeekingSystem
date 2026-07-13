import { Resend } from 'resend';
import { serverEnv } from './env';

/**
 * Transactional email via Resend.
 *
 * Notes that bite:
 * - The SDK returns `{ data, error }` and does NOT throw on API errors, so every
 *   caller has to check `error` explicitly.
 * - The `from` domain must exactly match a domain verified in Resend, or the
 *   send 403s.
 * - Idempotency keys stop a retried request from emailing someone twice; they
 *   expire after 24h.
 */

let client: Resend | null = null;
const getResend = () => (client ??= new Resend(serverEnv('RESEND_API_KEY')));

/** True once Resend is configured; lets endpoints degrade instead of exploding. */
export const isEmailConfigured = () => Boolean(serverEnv('RESEND_API_KEY') && serverEnv('EMAIL_FROM'));

interface SendOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** `<event>/<entity-id>`. Prevents a duplicate send if the request is retried. */
  idempotencyKey?: string;
}

/** Send one email. Returns false on failure (already logged) rather than throwing. */
export async function sendEmail(opts: SendOptions): Promise<boolean> {
  if (!isEmailConfigured()) {
    console.error('Resend is not configured (RESEND_API_KEY / EMAIL_FROM); email not sent');
    return false;
  }

  const { data, error } = await getResend().emails.send(
    {
      from: serverEnv('EMAIL_FROM'),
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    },
    opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : undefined
  );

  if (error) {
    console.error('resend send failed', error.name, error.message);
    return false;
  }
  console.log('email sent', data?.id, opts.subject);
  return true;
}

/* ------------------------------------------------------------------ */
/* Templates                                                          */
/* ------------------------------------------------------------------ */

const BRAND = '#5271FF';
const INK = '#16276B';

const layout = (bodyHtml: string, footerHtml: string) => `
<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#334155;line-height:1.6;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;">
      <p style="margin:0 0 24px;font-weight:700;color:${INK};font-size:15px;letter-spacing:0.02em;">
        SOLUTION SEEKING SYSTEM
      </p>
      ${bodyHtml}
    </div>
    <div style="max-width:560px;margin:16px auto 0;text-align:center;font-size:12px;color:#94a3b8;line-height:1.5;">
      ${footerHtml}
      <p style="margin:8px 0 0;">Beanchain Coffee LLC</p>
    </div>
  </body>
</html>`;

const button = (href: string, label: string) => `
  <a href="${href}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px;">
    ${label}
  </a>`;

/**
 * The one email that matters. The download button IS the confirmation link, so
 * double opt-in costs the reader nothing: they only get the guide if the address
 * is real, and there is no second step that feels like a second step.
 *
 * One CTA beyond the download, and it closes the loop back into the product:
 * lead magnet -> anonymous trial -> account -> subscription.
 */
export function guideDeliveryEmail(opts: { confirmUrl: string; unsubscribeUrl: string; guideUrl: string }) {
  const html = layout(
    `
    <h1 style="margin:0 0 12px;font-size:22px;color:${INK};">Your copy of the guide</h1>
    <p style="margin:0 0 20px;">Here is the complete Solution Seeking System: the three-step Communication Protocol, all 12 Wisdom Principles, and the four Leadership Tools.</p>
    <p style="margin:0 0 24px;">${button(opts.confirmUrl, 'Download the guide (PDF)')}</p>
    <p style="margin:0 0 8px;font-weight:600;color:${INK};">Where to start</p>
    <ul style="margin:0 0 24px;padding-left:20px;">
      <li>Read the Communication Protocol first. It is the spine of everything else.</li>
      <li>Pick the one Wisdom Principle you are worst at. Be honest.</li>
      <li>Use it on a real conversation this week, not a hypothetical one.</li>
    </ul>
    <p style="margin:0 0 8px;">Or skip the reading and talk an actual situation through:</p>
    <p style="margin:0;">
      <a href="${opts.guideUrl}" style="color:${BRAND};font-weight:600;">Try the Guide, no account needed &rarr;</a>
    </p>`,
    `<a href="${opts.unsubscribeUrl}" style="color:#94a3b8;">Unsubscribe</a>`
  );

  const text = [
    'Your copy of the guide',
    '',
    'Here is the complete Solution Seeking System: the three-step Communication Protocol, all 12 Wisdom Principles, and the four Leadership Tools.',
    '',
    `Download the guide (PDF): ${opts.confirmUrl}`,
    '',
    'Where to start:',
    '- Read the Communication Protocol first. It is the spine of everything else.',
    '- Pick the one Wisdom Principle you are worst at. Be honest.',
    '- Use it on a real conversation this week, not a hypothetical one.',
    '',
    `Or skip the reading and talk an actual situation through: ${opts.guideUrl}`,
    '',
    `Unsubscribe: ${opts.unsubscribeUrl}`,
    'Beanchain Coffee LLC',
  ].join('\n');

  return { subject: 'Your Solution Seeking guide', html, text };
}

/** Internal alert so a team enquiry doesn't sit unseen in a table. */
export function teamEnquiryAlertEmail(enquiry: {
  name: string;
  email: string;
  teamSize: string | null;
  note: string | null;
}) {
  const row = (label: string, value: string) =>
    `<p style="margin:0 0 6px;"><strong style="color:${INK};">${label}:</strong> ${value}</p>`;

  const html = layout(
    `
    <h1 style="margin:0 0 16px;font-size:20px;color:${INK};">New team enquiry</h1>
    ${row('Name', enquiry.name)}
    ${row('Email', `<a href="mailto:${enquiry.email}" style="color:${BRAND};">${enquiry.email}</a>`)}
    ${row('Team size', enquiry.teamSize ?? 'not given')}
    ${enquiry.note ? `<p style="margin:16px 0 0;padding:12px 14px;background:#f8fafc;border-radius:10px;">${enquiry.note}</p>` : ''}`,
    'Sent because someone submitted the team form on /pricing.'
  );

  const text = [
    'New team enquiry',
    '',
    `Name: ${enquiry.name}`,
    `Email: ${enquiry.email}`,
    `Team size: ${enquiry.teamSize ?? 'not given'}`,
    enquiry.note ? `\nNote:\n${enquiry.note}` : '',
  ].join('\n');

  return { subject: `Team enquiry: ${enquiry.name}`, html, text };
}
