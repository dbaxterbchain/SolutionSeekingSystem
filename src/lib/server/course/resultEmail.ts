import { Resend } from 'resend';

/**
 * The learner's "your result is ready" email. It names no outcome, no score
 * and no quote: the result lives on the assessment page behind sign-in, and
 * an email is not a place for it. Worker-shared, like gradingAlert.ts: the
 * Netlify function and the dev server both call it with configuration they
 * read themselves, and it imports only the Resend SDK.
 */

export interface ResultEmailConfig {
  apiKey: string;
  from: string;
}

export interface ResultNotice {
  jobId: string;
  generation: number;
  userId: string;
  assessmentUrl: string;
}

export interface ResultNoticeDeps {
  /** The learner's sign-in address, or null when the account has none. */
  emailFor(userId: string): Promise<string | null>;
  /** Sets result_email_sent_at where it is null and says whether this call did. */
  markSent(jobId: string): Promise<boolean>;
}

const BRAND = '#5271FF';
const INK = '#16276B';

export function resultReadyEmail(opts: { assessmentUrl: string }): { subject: string; text: string; html: string } {
  const subject = 'Your assessment result is ready';
  const text = [
    subject,
    '',
    'The grader has finished with your final assessment. Sign in to read the feedback and the lessons it points to.',
    '',
    `Open your assessment: ${opts.assessmentUrl}`,
    '',
    'Beanchain Coffee LLC',
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#1e293b;line-height:1.5;">
<h1 style="margin:0 0 12px;font-size:22px;color:${INK};">${subject}</h1>
<p style="margin:0 0 20px;">The grader has finished with your final assessment. Sign in to read the feedback and the lessons it points to.</p>
<p style="margin:0 0 24px;"><a href="${opts.assessmentUrl}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:${BRAND};color:#ffffff;font-weight:600;text-decoration:none;">Open your assessment</a></p>
<p style="margin:0;font-size:13px;color:#64748b;">Sent because this address took the final assessment on solutionseeking.com.<br>Beanchain Coffee LLC</p>
</body></html>`;
  return { subject, text, html };
}

/**
 * Claim first, then send: the sent-at column is the guard that outlives
 * Resend's idempotency window, and the key covers a worker that reports the
 * same run twice inside it. A send that fails after the claim is logged and
 * not retried; the result is already on the page. Never throws.
 */
export async function notifyLearnerOfResult(config: ResultEmailConfig, notice: ResultNotice, deps: ResultNoticeDeps): Promise<boolean> {
  if (!config.apiKey || !config.from) {
    console.error(`grading job ${notice.jobId}: result email not sent (RESEND_API_KEY or EMAIL_FROM unset)`);
    return false;
  }
  try {
    if (!(await deps.markSent(notice.jobId))) return false;
    const to = await deps.emailFor(notice.userId);
    if (!to) {
      console.error(`grading job ${notice.jobId}: result email not sent (the account has no email address)`);
      return false;
    }
    const mail = resultReadyEmail({ assessmentUrl: notice.assessmentUrl });
    const { error } = await new Resend(config.apiKey).emails.send(
      { from: config.from, to, subject: mail.subject, text: mail.text, html: mail.html },
      { idempotencyKey: `course-result/${notice.jobId}-${notice.generation}` }
    );
    if (error) {
      console.error(`grading job ${notice.jobId}: result email rejected`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`grading job ${notice.jobId}: result email failed`, err);
    return false;
  }
}
