import { Resend } from 'resend';

/**
 * The one shape every learner email in the course takes (a subject, one
 * paragraph, one button, a footer line) and the one way any of them is sent:
 * claim the sent-at column first, then send under an idempotency key, and
 * never throw. Worker-shared, so it imports only the Resend SDK; the Netlify
 * function and the dev server pass in the configuration they read themselves.
 */

export interface CourseEmailConfig {
  apiKey: string;
  from: string;
}

export interface CourseMail {
  subject: string;
  text: string;
  html: string;
}

export const BRAND = '#5271FF';
export const INK = '#16276B';

export const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** One paragraph, one button, one footer line. Text fields are escaped in the html; the href is built by our code, never from input. */
export function courseMail(opts: { subject: string; intro: string; button: { href: string; label: string }; footer: string }): CourseMail {
  const text = [opts.subject, '', opts.intro, '', `${opts.button.label}: ${opts.button.href}`, '', 'Beanchain Coffee LLC'].join('\n');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#1e293b;line-height:1.5;">
<h1 style="margin:0 0 12px;font-size:22px;color:${INK};">${escapeHtml(opts.subject)}</h1>
<p style="margin:0 0 20px;">${escapeHtml(opts.intro)}</p>
<p style="margin:0 0 24px;"><a href="${escapeHtml(opts.button.href)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:${BRAND};color:#ffffff;font-weight:600;text-decoration:none;">${escapeHtml(opts.button.label)}</a></p>
<p style="margin:0;font-size:13px;color:#64748b;">${escapeHtml(opts.footer)}<br>Beanchain Coffee LLC</p>
</body></html>`;
  return { subject: opts.subject, text, html };
}

export interface ClaimedSend {
  /** Names the thing in log lines, for example "grading job abc: result email". */
  label: string;
  /** The Resend idempotency key; covers a repeat inside Resend's window. */
  key: string;
  /** Sets the sent-at column where it is null and says whether this call did. Only a true claim sends. */
  claim(): Promise<boolean>;
  /** The learner's address, or null when the account has none. */
  to(): Promise<string | null>;
  mail: CourseMail;
}

/**
 * Claim first, then send: the sent-at column is the guard that outlives
 * Resend's idempotency window. A send that fails after the claim is logged
 * and not retried, because what the email announces is already on its page.
 * Never throws; true only when Resend accepted the message.
 */
export async function sendClaimedEmail(config: CourseEmailConfig, args: ClaimedSend): Promise<boolean> {
  if (!config.apiKey || !config.from) {
    console.error(`${args.label} not sent (RESEND_API_KEY or EMAIL_FROM unset)`);
    return false;
  }
  try {
    if (!(await args.claim())) return false;
    const to = await args.to();
    if (!to) {
      console.error(`${args.label} not sent (the account has no email address)`);
      return false;
    }
    const { error } = await new Resend(config.apiKey).emails.send(
      { from: config.from, to, subject: args.mail.subject, text: args.mail.text, html: args.mail.html },
      { idempotencyKey: args.key }
    );
    if (error) {
      console.error(`${args.label} rejected`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`${args.label} failed`, err);
    return false;
  }
}
