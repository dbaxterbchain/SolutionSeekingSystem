import { courseMail, sendClaimedEmail, type CourseEmailConfig, type CourseMail } from './courseEmail';

/**
 * "Your certificate is ready": sent once per certificate, from wherever the
 * certificate was issued (the worker after a pass with awards on, the dev
 * server's inline run, or the admin's Issue action). It names no score and no
 * name; the certificate page behind sign-in carries both. Worker-shared.
 */

export interface CertificateNotice {
  certificateId: string;
  userId: string;
  certificateUrl: string;
}

export interface CertificateNoticeDeps {
  /** The learner's sign-in address, or null when the account has none. */
  emailFor(userId: string): Promise<string | null>;
  /** Sets email_sent_at on the certificate where it is null and says whether this call did. */
  markSent(certificateId: string): Promise<boolean>;
}

export function certificateReadyEmail(opts: { certificateUrl: string }): CourseMail {
  return courseMail({
    subject: 'Your certificate is ready',
    intro: 'Your Solution Seeking System Certification has been issued. Sign in to confirm the name it should show, then print it or turn on its verification link.',
    button: { href: opts.certificateUrl, label: 'Open your certificate' },
    footer: 'Sent because this address passed the final assessment on solutionseeking.com.',
  });
}

/** Once per certificate: the sent-at column is claimed first, and only the claim that won sends. Never throws. */
export function notifyLearnerOfCertificate(config: CourseEmailConfig, notice: CertificateNotice, deps: CertificateNoticeDeps): Promise<boolean> {
  return sendClaimedEmail(config, {
    label: `certificate ${notice.certificateId}: certificate email`,
    key: `course-certificate/${notice.certificateId}`,
    claim: () => deps.markSent(notice.certificateId),
    to: () => deps.emailFor(notice.userId),
    mail: certificateReadyEmail({ certificateUrl: notice.certificateUrl }),
  });
}
