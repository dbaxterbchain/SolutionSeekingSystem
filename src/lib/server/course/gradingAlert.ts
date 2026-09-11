import { Resend } from 'resend';

/**
 * The operator's signal that a grading job has failed for good. The learner
 * sees the honest grading_error copy and is told to write to course support;
 * this email is what lets support act before they do. Worker-shared: the
 * Netlify function and the dev server both call it with configuration they
 * read themselves, and it imports only the Resend SDK.
 */
export interface GradingFailure {
  jobId: string;
  attemptId: string;
  category: string;
  error: string;
  /** Which try this was. It goes into the idempotency key, so a retry alerts again. */
  attempts: number;
  adminUrl: string;
}

export function gradingFailureEmail(f: GradingFailure): { subject: string; text: string } {
  return {
    subject: 'A course grading job failed',
    text: [
      'A grading job ended in failure after its retries, and the learner now sees the grading_error state.',
      '',
      `Job: ${f.jobId}`,
      `Attempt: ${f.attemptId}`,
      `Category: ${f.category}`,
      `Error: ${f.error.slice(0, 500)}`,
      '',
      `Retry it from the admin area: ${f.adminUrl}`,
      'The learner has been told this is not a failed attempt and that course support can re-run the grading.',
    ].join('\n'),
  };
}

export interface AlertConfig {
  apiKey: string;
  from: string;
  to: string;
}

/**
 * Send the alert once per try. The idempotency key carries the attempt count as
 * well as the job id, so a worker that runs the same try twice still sends one
 * email, while a job an admin retried and that failed again sends its own alert
 * rather than being swallowed as a duplicate of the first. Never throws.
 */
export async function sendGradingFailureAlert(config: AlertConfig, f: GradingFailure): Promise<boolean> {
  if (!config.apiKey || !config.from || !config.to) {
    console.error(`grading job ${f.jobId}: failure alert not sent (RESEND_API_KEY, EMAIL_FROM or ALERTS_TO unset)`);
    return false;
  }
  try {
    const mail = gradingFailureEmail(f);
    const { error } = await new Resend(config.apiKey).emails.send(
      { from: config.from, to: config.to, subject: mail.subject, text: mail.text },
      { idempotencyKey: `course-grading-failed/${f.jobId}/${f.attempts}` }
    );
    if (error) {
      console.error(`grading job ${f.jobId}: failure alert rejected`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`grading job ${f.jobId}: failure alert failed`, err);
    return false;
  }
}
