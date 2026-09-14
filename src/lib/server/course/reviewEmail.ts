import { courseMail, sendClaimedEmail, type CourseEmailConfig, type CourseMail } from './courseEmail';

/**
 * "We received your review request": an acknowledgement, nothing more. It
 * names no criterion and no score, because the result itself never puts one
 * in an inbox and a review is about a score. Built on the same claim-then-send
 * skeleton as the result and certificate emails.
 */

export interface ReviewNotice {
  reviewId: string;
  userId: string;
  assessmentUrl: string;
}

export interface ReviewNoticeDeps {
  emailFor(userId: string): Promise<string | null>;
  markSent(reviewId: string): Promise<boolean>;
}

export function reviewReceivedEmail(opts: { assessmentUrl: string }): CourseMail {
  return courseMail({
    subject: 'We received your review request',
    intro: 'Someone will read your assessment again and reply on your assessment page. You do not need to do anything while you wait.',
    button: { href: opts.assessmentUrl, label: 'Open your assessment' },
    footer: 'Sent because this address asked for a second look at an assessment on solutionseeking.com.',
  });
}

/** Once per review: the sent-at column is claimed first, and only the claim that won sends. Never throws. */
export function notifyLearnerOfReview(config: CourseEmailConfig, notice: ReviewNotice, deps: ReviewNoticeDeps): Promise<boolean> {
  return sendClaimedEmail(config, {
    label: `review ${notice.reviewId}: received email`,
    key: `course-review-received/${notice.reviewId}`,
    claim: () => deps.markSent(notice.reviewId),
    to: () => deps.emailFor(notice.userId),
    mail: reviewReceivedEmail({ assessmentUrl: notice.assessmentUrl }),
  });
}
