import { courseMail, sendClaimedEmail, type CourseEmailConfig, type CourseMail } from './courseEmail';

/**
 * The learner's "your result is ready" email. It names no outcome, no score
 * and no quote: the result lives on the assessment page behind sign-in, and
 * an email is not a place for it. Worker-shared: the Netlify function and the
 * dev server both call it with configuration they read themselves, through
 * the skeleton in courseEmail.ts.
 */

export type ResultEmailConfig = CourseEmailConfig;

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

export function resultReadyEmail(opts: { assessmentUrl: string }): CourseMail {
  return courseMail({
    subject: 'Your assessment result is ready',
    intro: 'The grader has finished with your final assessment. Sign in to read the feedback and the lessons it points to.',
    button: { href: opts.assessmentUrl, label: 'Open your assessment' },
    footer: 'Sent because this address took the final assessment on solutionseeking.com.',
  });
}

/** Once per job and generation: the sent-at column is claimed first, and only the claim that won sends. Never throws. */
export function notifyLearnerOfResult(config: ResultEmailConfig, notice: ResultNotice, deps: ResultNoticeDeps): Promise<boolean> {
  return sendClaimedEmail(config, {
    label: `grading job ${notice.jobId}: result email`,
    key: `course-result/${notice.jobId}-${notice.generation}`,
    claim: () => deps.markSent(notice.jobId),
    to: () => deps.emailFor(notice.userId),
    mail: resultReadyEmail({ assessmentUrl: notice.assessmentUrl }),
  });
}
