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
    // The one that actually happened, and the one that will happen again: the
    // domain in EMAIL_FROM must EXACTLY match a domain the API key is allowed to
    // send from. Get it wrong and every send 403s while the site keeps promising
    // people their inbox. Say the fix out loud, in the log, at the moment it breaks.
    if (/not authorized|domain/i.test(error.message ?? '')) {
      console.error(
        `EMAIL_FROM is "${serverEnv('EMAIL_FROM')}". Resend refused it. The from-domain must ` +
          'match a verified domain on this API key, exactly. Fix EMAIL_FROM in Netlify and redeploy.'
      );
    }
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

/**
 * Escape anything a stranger typed before it goes into an HTML email.
 *
 * These alerts are addressed to us, which makes it tempting to skip: the cost
 * is not a classic XSS but an attacker composing markup inside an email we
 * trust, e.g. a plausible-looking link. Escape at the boundary and it cannot
 * happen at all.
 */
const esc = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Where internal alerts go. ALERTS_TO is the general one; TEAM_ENQUIRY_TO is
 * honoured for compatibility, and EMAIL_FROM is the last resort so an alert
 * lands *somewhere* rather than being dropped.
 */
export const internalAlertTo = (): string =>
  serverEnv('ALERTS_TO') || serverEnv('TEAM_ENQUIRY_TO') || serverEnv('EMAIL_FROM');

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
    ${row('Name', esc(enquiry.name))}
    ${row('Email', `<a href="mailto:${esc(enquiry.email)}" style="color:${BRAND};">${esc(enquiry.email)}</a>`)}
    ${row('Team size', esc(enquiry.teamSize ?? 'not given'))}
    ${enquiry.note ? `<p style="margin:16px 0 0;padding:12px 14px;background:#f8fafc;border-radius:10px;">${esc(enquiry.note)}</p>` : ''}`,
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

/**
 * Internal alert when someone answers "Did this help?" with something written.
 *
 * Sent for praise AND for criticism, deliberately. A "not yet" with a sentence
 * explaining what was missing is the most actionable message this site can
 * produce, and it is the one nobody would ever send us unprompted.
 */
export function feedbackAlertEmail(feedback: {
  helpful: boolean;
  agent: string;
  quote: string | null;
  note: string | null;
  displayName: string | null;
  roleTitle: string | null;
  consentPublish: boolean;
  adminUrl: string;
}) {
  const heading = feedback.helpful ? 'Someone said the assistant helped' : 'Someone said it missed';
  const attribution = [feedback.displayName, feedback.roleTitle].filter(Boolean).join(', ');
  const body = feedback.quote ?? feedback.note ?? '';

  const html = layout(
    `
    <h1 style="margin:0 0 16px;font-size:20px;color:${INK};">${heading}</h1>
    <p style="margin:0 0 6px;"><strong style="color:${INK};">Assistant:</strong> ${esc(feedback.agent)}</p>
    ${
      body
        ? `<blockquote style="margin:16px 0;padding:12px 14px;background:#f8fafc;border-left:3px solid ${BRAND};border-radius:6px;">${esc(body)}</blockquote>`
        : '<p style="margin:16px 0;color:#94a3b8;">They rated it but did not write anything.</p>'
    }
    ${attribution ? `<p style="margin:0 0 6px;">${esc(attribution)}</p>` : ''}
    ${
      feedback.quote
        ? feedback.consentPublish
          ? `<p style="margin:16px 0 0;color:#15803d;font-weight:600;">They consented to publication. Approve it to use it.</p>`
          : `<p style="margin:16px 0 0;color:#b45309;font-weight:600;">No consent to publish. Do not quote this publicly.</p>`
        : ''
    }
    <p style="margin:20px 0 0;font-size:13px;color:#64748b;">${esc(feedback.adminUrl)}</p>`,
    'Sent because someone answered "Did this help?" in the chat.'
  );

  const text = [
    heading,
    '',
    `Assistant: ${feedback.agent}`,
    body ? `\n"${body}"` : '\n(No written feedback.)',
    attribution ? `\n${attribution}` : '',
    feedback.quote
      ? feedback.consentPublish
        ? '\nCONSENTED to publication. Approve it to use it.'
        : '\nNO CONSENT to publish. Do not quote this publicly.'
      : '',
    '',
    feedback.adminUrl,
  ].join('\n');

  return {
    subject: feedback.helpful ? 'Positive feedback on the assistant' : 'The assistant missed',
    html,
    text,
  };
}
