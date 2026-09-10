import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSession } from '../../lib/useSession';
import { accountLink } from '../../lib/accountLink';
import { useCourseEntitlement } from '../../lib/useCourseEntitlement';
import { track } from '../../lib/analytics';
import CourseSalesCta from './CourseSalesCta';
import type { PublicCurriculum } from '../../lib/course/curriculum';
import type { CourseStatus } from '../../lib/course/status';

interface Props {
  curriculum: PublicCurriculum;
  saleStatus: CourseStatus;
  courseId: string;
  courseTitle: string;
  supportContact: string;
  priceAmount: number;
}

const checkoutSuccessParam = () =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('checkout') === 'success';

const clearCheckoutParam = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete('checkout');
  window.history.replaceState(null, '', url);
};

/** Back from Stripe: the webhook usually lands within seconds; the page waits, then says so honestly. */
type Activation = 'none' | 'pending' | 'ready' | 'slow';

const POLL_TRIES = 12;
const POLL_INTERVAL_MS = 1500;
const SESSION_GRACE_MS = 6000;

/**
 * The learner's home. A public shell mounts this; every fact about the learner
 * comes from /api/course/entitlement with the bearer token. Lesson links go to
 * shells that fetch their own content, so nothing paid is ever in HTML.
 */
export default function CourseDashboard(props: Props) {
  const { session, user, loading: sessionLoading } = useSession();
  const { entitlement, loading, failed, refetch } = useCourseEntitlement();
  const [fromCheckout] = useState(checkoutSuccessParam);
  const [activation, setActivation] = useState<Activation>(fromCheckout ? 'pending' : 'none');
  const [graceOver, setGraceOver] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkNote, setCheckNote] = useState<string | null>(null);
  const readyTracked = useRef(false);
  const viewedTracked = useRef(false);

  // The session rehydrates from localStorage after the Stripe redirect. Hold a
  // neutral screen instead of flashing "sign in", with a grace window.
  useEffect(() => {
    if (!fromCheckout) return;
    const t = window.setTimeout(() => setGraceOver(true), SESSION_GRACE_MS);
    return () => window.clearTimeout(t);
  }, [fromCheckout]);

  useEffect(() => {
    if (!fromCheckout || sessionLoading || !session) return;
    let cancelled = false;
    let tries = 0;
    let timer: number | undefined;
    // A funnel step, not the conversion: course_enrolled is sent by the webhook.
    if (!viewedTracked.current) {
      viewedTracked.current = true;
      track({ event: 'checkout_success_viewed' });
    }
    const poll = async () => {
      const current = await refetch();
      if (cancelled) return;
      if (current?.kind === 'enrolled') {
        setActivation('ready');
        clearCheckoutParam();
      } else if (tries < POLL_TRIES) {
        tries += 1;
        timer = window.setTimeout(poll, POLL_INTERVAL_MS);
      } else {
        setActivation('slow');
        clearCheckoutParam();
      }
    };
    void poll();
    return () => {
      window.clearTimeout(timer);
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromCheckout, sessionLoading, user?.id]);

  useEffect(() => {
    if (activation === 'ready' && !readyTracked.current) {
      readyTracked.current = true;
      track({ event: 'enrollment_ready', course_id: props.courseId });
    }
  }, [activation, props.courseId]);

  const checkAccess = async () => {
    setChecking(true);
    setCheckNote(null);
    const current = await refetch();
    setChecking(false);
    if (current?.kind === 'enrolled') setActivation('ready');
    else setCheckNote('Not showing yet. Give it a minute, then try again.');
  };

  const enrolled = entitlement?.kind === 'enrolled';

  if (sessionLoading || (fromCheckout && !session && !graceOver)) {
    // The same text on the server and the client: fromCheckout reads the query
    // string, which the prerendered HTML cannot know.
    return <Neutral text="Loading your course…" />;
  }

  if (!session || user?.is_anonymous) {
    return (
      <Panel title="Sign in to open your course">
        <p>Your lessons are attached to the account you bought the course with.</p>
        <a href={accountLink({ next: '/course/learn' })} className="btn-primary mt-5">
          Sign in
        </a>
      </Panel>
    );
  }

  if (activation === 'pending' && !enrolled) {
    return <Neutral text="Setting up your course…" note="Your payment went through. This usually takes a few seconds." />;
  }

  if (activation === 'slow' && !enrolled) {
    return (
      <Panel title="Your course is on its way">
        <p>
          Your payment went through, and your access is being set up. Stripe emails your receipt as soon as
          the payment settles.
        </p>
        <button type="button" onClick={checkAccess} disabled={checking} className="btn-primary mt-5 disabled:opacity-60">
          {checking ? 'Checking…' : 'Check access'}
        </button>
        <p aria-live="polite" className="mt-3 text-sm text-slate-600">
          {checkNote}
        </p>
        <p className="mt-4 text-sm text-slate-500">
          Still nothing after a few minutes? Write to{' '}
          <a href={`mailto:${props.supportContact}`} className="font-semibold text-brand-700 underline">
            {props.supportContact}
          </a>
          .
        </p>
      </Panel>
    );
  }

  if (loading && !entitlement && !failed) {
    return <Neutral text="Loading your course…" />;
  }

  // A failed lookup fails OPEN: the lesson API is the real gate.
  if (!enrolled && !failed) {
    if (entitlement?.kind === 'inactive' && entitlement.reason === 'revoked') {
      return (
        <Panel title="Access to the course has ended for this account">
          <p>
            If that seems wrong, write to{' '}
            <a href={`mailto:${props.supportContact}`} className="font-semibold text-brand-700 underline">
              {props.supportContact}
            </a>
            .
          </p>
        </Panel>
      );
    }
    return (
      <Panel title="You do not have access to the course yet">
        {entitlement?.sale.can_purchase ? (
          <div className="mt-2">
            <CourseSalesCta
              location="course_dashboard"
              saleStatus={props.saleStatus}
              courseId={props.courseId}
              priceLabel={null}
              priceAmount={props.priceAmount}
              supportContact={props.supportContact}
              trackView
            />
          </div>
        ) : props.saleStatus === 'hidden' ? (
          <p>
            The course is open to invited learners for now. If you were expecting access, write to{' '}
            <a href={`mailto:${props.supportContact}`} className="font-semibold text-brand-700 underline">
              {props.supportContact}
            </a>
            .
          </p>
        ) : (
          <a href="/course" className="btn-primary mt-2">
            About the course
          </a>
        )}
      </Panel>
    );
  }

  const firstLesson = props.curriculum.modules
    .flatMap((m) => m.lessons)
    .find((l) => l.status === 'published');

  return (
    <div>
      <header className="max-w-2xl">
        <p className="eyebrow">Video course</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink-800 sm:text-4xl">
          {activation === 'ready' ? 'Your course is ready' : props.courseTitle}
        </h1>
        {failed && (
          <p className="mt-4 max-w-prose rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            We could not check your access just now. If a lesson will not open, sign in again or write to{' '}
            <a href={`mailto:${props.supportContact}`} className="font-semibold underline">
              {props.supportContact}
            </a>
            .
          </p>
        )}
        {firstLesson ? (
          <div className="mt-6">
            <a href={`/course/learn/lessons/${firstLesson.id}`} className="btn-primary">
              Open the first lesson
            </a>
            <p className="mt-3 text-sm text-slate-500">{firstLesson.title}</p>
          </div>
        ) : (
          <p className="mt-4 text-slate-600">The first lessons are being prepared. Check back soon.</p>
        )}
      </header>

      <ol className="mt-10 grid gap-4 md:grid-cols-2">
        {props.curriculum.modules.map((m) => (
          <li key={m.id} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-card">
            <p className="eyebrow">Module {m.order}</p>
            <h2 className="mt-1 font-heading text-lg font-bold text-ink-800">{m.title}</h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              {m.lessons.map((l) => (
                <li key={l.id} className="flex items-baseline justify-between gap-3">
                  {l.status === 'published' ? (
                    <a href={`/course/learn/lessons/${l.id}`} className="font-medium text-brand-700 hover:underline">
                      {l.title}
                    </a>
                  ) : (
                    <>
                      <span className="text-slate-500">{l.title}</span>
                      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Coming soon
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Neutral({ text, note }: { text: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-card">
      <p className="font-semibold text-ink-800">{text}</p>
      {note && <p className="mt-2 text-sm text-slate-500">{note}</p>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="max-w-xl rounded-2xl border border-slate-100 bg-white p-8 text-slate-700 shadow-card">
      <h1 className="font-heading text-2xl font-bold text-ink-800">{title}</h1>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}
