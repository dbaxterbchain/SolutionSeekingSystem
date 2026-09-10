import { useEffect, useState, type ReactElement } from 'react';
import { useSession } from '../../lib/useSession';
import { accountLink } from '../../lib/accountLink';
import { useCourseEntitlement } from '../../lib/useCourseEntitlement';
import { CourseActionError, courseErrorMessage, startCourseCheckout } from '../../lib/courseClient';
import { track } from '../../lib/analytics';
import { useDialog } from './Dialog';
import type { CourseStatus } from '../../lib/course/status';

interface Props {
  location: 'course_hero' | 'course_close' | 'course_dashboard';
  saleStatus: CourseStatus;
  courseId: string;
  /** "Get the course for $X" once the course is open; null renders "Get the course". */
  priceLabel: string | null;
  /** Dollar amount for checkout_started; 0 until COURSE_PRICE exists. */
  priceAmount: number;
  supportContact: string;
  /** Only one instance per page fires course_viewed. */
  trackView?: boolean;
}

/** A uuid for the checkout request key. crypto.randomUUID needs a secure context; plain http gets the manual form. */
function newRequestKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The buy control. An island because checkout needs the session, because the
 * enrolled state must come from the server, and because checkout_started has
 * to fire with the location that was clicked.
 *
 * Entitlement fails OPEN: a failed lookup still shows the button, and the
 * server answers 409 if they already own the course.
 */
export default function CourseSalesCta(props: Props) {
  const { session, user, loading: sessionLoading } = useSession();
  const { entitlement, loading, refetch } = useCourseEntitlement();
  const { confirm, dialog } = useDialog();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justEnrolled, setJustEnrolled] = useState(false);
  // One key per mount: a double click or a retry replays the same Stripe session.
  const [requestKey, setRequestKey] = useState(newRequestKey);

  useEffect(() => {
    if (props.trackView) {
      track({ event: 'course_viewed', course_id: props.courseId, sale_status: props.saleStatus });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signedIn = Boolean(session) && !user?.is_anonymous;
  const enrolled = justEnrolled || entitlement?.kind === 'enrolled';
  const revoked = entitlement?.kind === 'inactive' && entitlement.reason === 'revoked';
  // Signed out, the server has not been asked: the launch flag decides.
  const purchasable = entitlement ? entitlement.sale.can_purchase : props.saleStatus === 'open';
  // Signed in with the answer still in flight: hold the verdict rather than
  // telling a buyer the course opens soon and then swapping in a button.
  const settling = Boolean(session) && loading && !entitlement;
  const label = props.priceLabel ? `Get the course for ${props.priceLabel}` : 'Get the course';

  const buy = async () => {
    track({
      event: 'checkout_started',
      plan: 'course',
      cta_location: props.location,
      value: props.priceAmount,
      currency: 'USD',
    });

    // No account, or an anonymous trial user with no email: register first,
    // then come straight back here.
    if (!session || !signedIn) {
      window.location.href = accountLink({ mode: 'register', next: window.location.pathname });
      return;
    }

    const ok = await confirm({
      title: 'Continue to checkout?',
      message: 'Stripe takes the payment on a secure page, then brings you to your course.',
      confirmLabel: 'Continue to checkout',
      cancelLabel: 'Not now',
    });
    if (!ok) return;

    setBusy(true);
    setError(null);
    let key = requestKey;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        window.location.href = await startCourseCheckout(session.access_token, {
          request_key: key,
          returnPath: window.location.pathname,
        });
        return;
      } catch (err) {
        // The server refused a replayed key with different parameters (a GA
        // session rolled over between clicks): mint a fresh key and try once more.
        if (err instanceof CourseActionError && err.code === 'request_key_reused' && attempt === 0) {
          key = newRequestKey();
          setRequestKey(key);
          continue;
        }
        if (err instanceof CourseActionError && err.code === 'already_enrolled') {
          setJustEnrolled(true);
          void refetch();
        } else {
          setError(err instanceof CourseActionError ? courseErrorMessage(err.code) : 'Could not start checkout. Please try again.');
        }
        setBusy(false);
        return;
      }
    }
  };

  let body: ReactElement;
  if (enrolled) {
    body = (
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
        <p className="font-semibold text-emerald-800">You already have access to the course.</p>
        <a href="/course/learn/" className="btn-primary mt-4" data-track-cta={props.location} data-track-label="Continue your course">
          Continue your course
        </a>
      </div>
    );
  } else if (revoked) {
    body = (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-slate-700">
        <p className="font-semibold text-ink-800">Access to the course has ended for this account.</p>
        <p className="mt-2 text-sm">
          If that seems wrong, write to{' '}
          <a href={`mailto:${props.supportContact}`} className="font-semibold text-brand-700 underline">
            {props.supportContact}
          </a>
          .
        </p>
      </div>
    );
  } else if (!purchasable && !settling) {
    body = (
      <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-5 text-slate-700">
        <p className="font-semibold text-ink-800">The course opens soon.</p>
        <p className="mt-2 text-sm">The lessons are being filmed now. Everything else on the site is free to use today.</p>
      </div>
    );
  } else {
    body = (
      <div>
        <button
          type="button"
          onClick={buy}
          disabled={busy || sessionLoading || (Boolean(session) && loading && !entitlement)}
          className="btn-primary disabled:opacity-60"
        >
          {busy ? 'Opening checkout…' : label}
        </button>
        {!sessionLoading && !signedIn && (
          <p className="mt-3 text-sm text-slate-500">Create a free account first. The course is added to it after payment.</p>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <>
      {body}
      {dialog}
    </>
  );
}
