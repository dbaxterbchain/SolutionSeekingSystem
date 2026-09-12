import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSession } from '../../lib/useSession';
import { accountLink } from '../../lib/accountLink';
import { track } from '../../lib/analytics';
import {
  CourseActionError,
  advanceAssessment,
  courseErrorMessage,
  fetchAssessmentStatus,
  listAttempts,
  notEligibleMessage,
  saveAssessmentResponse,
  startAssessment,
  submitAssessment,
  type AssessmentStatus,
  type AttemptSummary,
  type CapApplied,
  type CriterionFeedback,
  type PromptView,
  type StageView,
} from '../../lib/courseClient';
import { useDialog } from './Dialog';

interface Props {
  certificationTitle: string;
  supportContact: string;
}

const POLL_MS = 5000;
const SAVE_DEBOUNCE_MS = 800;
const GRADING_ERROR_COPY =
  'We hit a technical problem while grading. This is not a failed attempt. Check status again in a few minutes, or contact course support.';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
interface Draft {
  text: string;
  revision: number;
  state: SaveState;
  savedAt: string | null;
  error: string | null;
  conflict: { text: string; revision: number } | null;
}

const submitKeyFor = (attemptId: string): string => {
  const key = `sss-course-submit:${attemptId}`;
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(key, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
};
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export default function AssessmentView(props: Props) {
  const { session, loading } = useSession();
  const token = session?.access_token ?? null;
  const { confirm, dialog } = useDialog();

  const [status, setStatus] = useState<AssessmentStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [history, setHistory] = useState<AttemptSummary[] | null>(null);
  /** The `?attempt=` id this page is showing read-only, or null for the learner's own current attempt. */
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [notAvailable, setNotAvailable] = useState(false);
  const [retakeError, setRetakeError] = useState<string | null>(null);
  /**
   * Mirrors `viewingId` for `load` to read: the shell is prerendered and this
   * island renders once on the server, so the URL is read in an effect, and a
   * ref keeps `load` reading the value that effect found rather than a stale
   * closure over the `viewingId` state.
   */
  const viewingRef = useRef<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  /** The latest revision the server has told us about, per prompt: the source of truth for `expected_revision`. */
  const revisions = useRef<Record<string, number>>({});
  /** Text typed since the last successful save, per prompt: read at save time, never from render-derived state. */
  const dirtyText = useRef<Record<string, string>>({});
  const pending = useRef<Record<string, Promise<boolean>>>({});
  /** The one-time event already fired, as `${attempt id}:${event}`: after a grading_error, an admin retry must still fire grade_ready once. */
  const firedFor = useRef<string | null>(null);
  /** Set by the polling effect: which attempt this page itself watched through submitted/grading. */
  const sawOpenFor = useRef<string | null>(null);

  const attempt = status?.attempt ?? null;

  // Seed the drafts from the server view whenever the attempt changes shape.
  useEffect(() => {
    if (!attempt) return;
    for (const stage of attempt.stages) {
      for (const p of stage.prompts) {
        if ((revisions.current[p.prompt_id] ?? -1) < p.response.revision) {
          revisions.current[p.prompt_id] = p.response.revision;
        }
      }
    }
    setDrafts((prev) => {
      const next = { ...prev };
      for (const stage of attempt.stages) {
        for (const p of stage.prompts) {
          if (!next[p.prompt_id] || next[p.prompt_id].revision < p.response.revision) {
            next[p.prompt_id] = { text: p.response.text, revision: p.response.revision, state: 'idle', savedAt: null, error: null, conflict: null };
          }
        }
      }
      return next;
    });
  }, [attempt?.id, attempt?.current_stage, attempt?.state]);

  /** The attempt list is supplementary: a failure here leaves whatever list was last loaded rather than blocking the page on it. */
  const refreshHistory = useCallback(async () => {
    if (!token) return;
    try {
      setHistory((await listAttempts(token)).attempts);
    } catch {
      // ignore; the history section simply keeps its last known list
    }
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setStatus(await fetchAssessmentStatus(token, viewingRef.current ?? undefined));
      setLoadError(null);
      setNotAvailable(false);
      void refreshHistory();
    } catch (err) {
      const code = err instanceof CourseActionError ? err.code : 'request_failed';
      if (code === 'not_found') setNotAvailable(true);
      else setLoadError(courseErrorMessage(code));
    }
  }, [token, refreshHistory]);

  useEffect(() => {
    if (loading || !token) return;
    // The shell is prerendered and this island renders once on the server,
    // so the flag is read here, in the effect, and never during render.
    const id = new URLSearchParams(window.location.search).get('attempt');
    viewingRef.current = id;
    setViewingId(id);
    void load();
  }, [loading, token, load]);

  // Poll while grading. An interval, not a timeout re-armed by this effect's
  // own deps: a `grading` reading twice in a row would otherwise not re-run
  // the effect at all, and the poll would silently stop. Once started, the
  // interval keeps firing on its own until the cleanup below runs. Never for
  // a read-only view of an earlier attempt: it never sets sawOpenFor either,
  // so the one-time events below stay tied to attempts this page itself watched.
  useEffect(() => {
    if (!attempt || viewingId) return;
    if (attempt.state !== 'submitted' && attempt.state !== 'grading') return;
    sawOpenFor.current = attempt.id;
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [attempt?.id, attempt?.state, load, viewingId]);

  // Fire the one-time events when the outcome lands, but only for an attempt
  // this page itself watched through submitted/grading: never on a plain
  // visit to a result that was already finished before this page loaded.
  useEffect(() => {
    if (!attempt) return;
    if (sawOpenFor.current !== attempt.id) return;
    const state = attempt.state;
    const kind = state === 'passed' || state === 'needs_revision' ? 'grade_ready' : state === 'grading_error' ? 'grading_error' : null;
    if (!kind) return;
    const key = `${attempt.id}:${kind}`;
    if (firedFor.current === key) return;
    firedFor.current = key;
    if (state === 'grading_error') track({ event: 'grading_error', attempt_id: attempt.id });
    else track({ event: 'grade_ready', attempt_id: attempt.id, result: state === 'passed' ? 'passed' : 'needs_revision' });
  }, [attempt?.id, attempt?.state]);

  /**
   * Perform one save for promptId, reading the text and expected revision
   * from refs, never from render-derived state (which can still be showing a
   * pre-save snapshot by the time an awaited continuation runs). Resolves to
   * whether this prompt's saved state is now clean.
   */
  const doSave = useCallback(
    async (promptId: string): Promise<boolean> => {
      const text = dirtyText.current[promptId];
      if (text === undefined) return true;
      if (!token || !attempt) return true;
      delete dirtyText.current[promptId];
      const expectedRevision = revisions.current[promptId] ?? 0;
      setDrafts((d) => ({ ...d, [promptId]: { ...d[promptId], text, state: 'saving', error: null, conflict: null } }));
      try {
        const r = await saveAssessmentResponse(token, attempt.id, promptId, text, expectedRevision);
        revisions.current[promptId] = r.revision;
        // Never write the captured text back here: the rendered draft may
        // already hold newer typing than what this request just saved.
        setDrafts((d) => ({ ...d, [promptId]: { ...d[promptId], revision: r.revision, state: 'saved', savedAt: r.saved_at, error: null, conflict: null } }));
        return true;
      } catch (err) {
        if (err instanceof CourseActionError && err.code === 'revision_conflict') {
          // Restore the captured text only if nothing newer arrived while this
          // request was in flight; a newer edit is what the learner wants saved next.
          if (dirtyText.current[promptId] === undefined) dirtyText.current[promptId] = text;
          const extra = err.extra as { text?: string; revision?: number };
          setDrafts((d) => ({ ...d, [promptId]: { ...d[promptId], state: 'error', error: null, conflict: { text: extra.text ?? '', revision: extra.revision ?? expectedRevision } } }));
          return false;
        }
        if (err instanceof CourseActionError && (err.code === 'stage_locked' || err.code === 'already_submitted')) {
          void load();
          return false;
        }
        if (dirtyText.current[promptId] === undefined) dirtyText.current[promptId] = text;
        setDrafts((d) => ({ ...d, [promptId]: { ...d[promptId], state: 'error', error: courseErrorMessage(err instanceof CourseActionError ? err.code : 'request_failed') } }));
        return false;
      }
    },
    [token, attempt, load]
  );

  /** Queue a save for promptId behind any save already in flight for it. */
  const saveNow = useCallback(
    (promptId: string): Promise<boolean> => {
      const run = (pending.current[promptId] ?? Promise.resolve(true)).then(() => doSave(promptId));
      pending.current[promptId] = run;
      return run;
    },
    [doSave]
  );

  const onChange = (promptId: string, text: string) => {
    dirtyText.current[promptId] = text;
    setDrafts((d) => ({ ...d, [promptId]: { ...d[promptId], text, state: 'idle' } }));
    setProblems((p) => ({ ...p, [promptId]: '' }));
    clearTimeout(timers.current[promptId]);
    timers.current[promptId] = setTimeout(() => {
      void saveNow(promptId);
    }, SAVE_DEBOUNCE_MS);
  };

  /**
   * Flush every scheduled save and wait for every save in flight to land.
   * Looped: a round can leave new dirty text behind (a conflict or error
   * restores it, or a caller's own retry logic re-marks it), so re-save and
   * re-await up to three rounds before giving up.
   */
  const flush = async (): Promise<boolean> => {
    for (const promptId of Object.keys(timers.current)) {
      clearTimeout(timers.current[promptId]);
      delete timers.current[promptId];
    }
    let results: boolean[] = [];
    for (let round = 0; round < 3; round += 1) {
      for (const promptId of Object.keys(dirtyText.current)) {
        void saveNow(promptId);
      }
      results = await Promise.all(Object.values(pending.current));
      if (Object.keys(dirtyText.current).length === 0) break;
    }
    return results.every((ok) => ok) && Object.keys(dirtyText.current).length === 0;
  };

  const resolveConflict = (promptId: string, keepMine: boolean) => {
    const conflict = drafts[promptId]?.conflict;
    if (!conflict) return;
    revisions.current[promptId] = conflict.revision;
    if (keepMine) {
      // Saves whatever is already dirty (the newest typing); only falls back
      // to the rendered draft text when nothing newer has been typed since.
      if (dirtyText.current[promptId] === undefined) dirtyText.current[promptId] = drafts[promptId]?.text ?? '';
      setDrafts((d) => ({ ...d, [promptId]: { ...d[promptId], state: 'idle', error: null, conflict: null } }));
      void saveNow(promptId);
    } else {
      delete dirtyText.current[promptId];
      setDrafts((d) => ({
        ...d,
        [promptId]: { ...d[promptId], text: conflict.text, revision: conflict.revision, state: 'saved', savedAt: new Date().toISOString(), conflict: null, error: null },
      }));
    }
  };

  const start = async () => {
    if (!token) return;
    setBusy(true);
    setActionError(null);
    try {
      setStatus(await startAssessment(token));
      void refreshHistory();
    } catch (err) {
      if (err instanceof CourseActionError && err.code === 'not_eligible') setActionError(notEligibleMessage(err.extra.reason));
      else setActionError(courseErrorMessage(err instanceof CourseActionError ? err.code : 'request_failed'));
    } finally {
      setBusy(false);
    }
  };

  /** Starting again after a `needs_revision` result: the retake panel's only action. */
  const onRetake = async () => {
    if (!token) return;
    setBusy(true);
    setRetakeError(null);
    try {
      setStatus(await startAssessment(token));
      void refreshHistory();
    } catch (err) {
      if (err instanceof CourseActionError && err.code === 'no_forms_available') setRetakeError(err.message);
      else setRetakeError(courseErrorMessage(err instanceof CourseActionError ? err.code : 'request_failed'));
    } finally {
      setBusy(false);
    }
  };

  const advance = async (stage: StageView) => {
    if (!token || !attempt) return;
    setActionError(null);
    // busy goes up before flush and stays up through the confirm dialog too,
    // so nothing can type into a disabled textarea while either is pending.
    setBusy(true);
    try {
      if (!(await flush())) {
        setActionError('Some responses could not be saved. Fix the ones marked below, then try again.');
        return;
      }
      const ok = await confirm({
        title: 'Continue and lock this part?',
        message: 'The next part reveals new information. Once you continue, this part cannot be edited.',
        confirmLabel: 'Continue and lock',
        cancelLabel: 'Keep editing',
      });
      if (!ok) return;
      const expectedRevisions = Object.fromEntries(stage.prompts.map((p) => [p.prompt_id, revisions.current[p.prompt_id] ?? 0]));
      setStatus(await advanceAssessment(token, attempt.id, stage.index, expectedRevisions));
      setProblems({});
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    } catch (err) {
      if (err instanceof CourseActionError && err.code === 'incomplete') {
        const fields = (err.extra as { fields?: { prompt_id: string; problem: string }[] }).fields ?? [];
        setProblems(Object.fromEntries(fields.map((f) => [f.prompt_id, problemCopy(f.problem)])));
      } else if (err instanceof CourseActionError && (err.code === 'revision_conflict' || err.code === 'stage_mismatch')) {
        setActionError(courseErrorMessage(err.code));
        void load();
      } else {
        setActionError(courseErrorMessage(err instanceof CourseActionError ? err.code : 'request_failed'));
      }
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!token || !attempt) return;
    setActionError(null);
    // busy goes up before flush and stays up through the confirm dialog too,
    // so nothing can type into a disabled textarea while either is pending.
    setBusy(true);
    try {
      if (!(await flush())) {
        setActionError('Some responses could not be saved. Fix the ones marked below, then try again.');
        return;
      }
      const ok = await confirm({
        title: 'Submit your assessment?',
        message: 'Every response locks and grading begins. You will not be able to edit after this.',
        confirmLabel: 'Submit for grading',
        cancelLabel: 'Keep editing',
      });
      if (!ok) return;
      const next = await submitAssessment(token, attempt.id, submitKeyFor(attempt.id));
      setStatus(next);
      setProblems({});
      void refreshHistory();
      track({ event: 'assessment_submitted', attempt_id: attempt.id, form_id: attempt.form_id });
    } catch (err) {
      if (err instanceof CourseActionError && err.code === 'incomplete') {
        const fields = (err.extra as { fields?: { prompt_id: string; problem: string }[] }).fields ?? [];
        setProblems(Object.fromEntries(fields.map((f) => [f.prompt_id, problemCopy(f.problem)])));
      } else {
        setActionError(courseErrorMessage(err instanceof CourseActionError ? err.code : 'request_failed'));
        if (err instanceof CourseActionError && err.code === 'already_submitted') void load();
      }
    } finally {
      setBusy(false);
    }
  };

  // ---- rendering ----
  if (loading) return <p className="text-slate-600">Loading your assessment…</p>;
  if (!session) {
    return (
      <p className="text-slate-700">
        <a href={accountLink({ next: '/course/learn/assessment/' })} className="font-semibold text-brand-700 underline">Sign in</a> to open your assessment.
      </p>
    );
  }
  if (notAvailable) {
    return (
      <div className="max-w-3xl">
        <header>
          <p className="eyebrow">{props.certificationTitle}</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink-800 sm:text-4xl">Final assessment</h1>
        </header>
        <p className="mt-8 text-slate-700">
          That attempt is not available.{' '}
          <a href="/course/learn/assessment/" className="font-semibold text-brand-700 underline">Back to your assessment</a>
        </p>
      </div>
    );
  }
  if (loadError && !status) return <ErrorLine text={loadError} />;
  if (!status) return <p className="text-slate-600">Loading your assessment…</p>;

  const showRetake = !viewingId && attempt?.state === 'needs_revision' && status.eligibility.eligible;
  const showHistory = !!history && (history.length > 1 || ['passed', 'needs_revision', 'grading_error'].includes(history[0]?.state ?? ''));

  return (
    <div className="max-w-3xl">
      {loadError && <ErrorLine text={loadError} />}
      <header>
        <p className="eyebrow">{props.certificationTitle}</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink-800 sm:text-4xl">Final assessment</h1>
      </header>
      {viewingId ? (
        <ReadOnlyAttempt status={status} supportContact={props.supportContact} onCheckAgain={load} />
      ) : (
        <>
          {!attempt && <Intro status={status} busy={busy} error={actionError} onStart={start} />}
          {attempt && attempt.state === 'draft' && (
            <Stages
              attempt={attempt}
              drafts={drafts}
              problems={problems}
              busy={busy}
              error={actionError}
              onChange={onChange}
              onResolve={resolveConflict}
              onAdvance={advance}
              onSubmit={submit}
            />
          )}
          {attempt && (attempt.state === 'submitted' || attempt.state === 'grading') && (
            <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="font-heading text-xl font-bold text-ink-800">Grading in progress</h2>
              <p className="mt-2 text-slate-700">Your responses are with the grader. Results usually take a few minutes, and this page checks every few seconds.</p>
            </section>
          )}
          {attempt && attempt.state === 'grading_error' && (
            <section className="mt-8 rounded-2xl border border-amber-100 bg-amber-50 p-6" role="alert">
              <h2 className="font-heading text-xl font-bold text-ink-800">We could not finish grading</h2>
              <p className="mt-2 text-amber-900">{GRADING_ERROR_COPY}</p>
              <p className="mt-2 text-amber-900">Course support can re-run the grading for you.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <a className="btn-primary" href={`mailto:${props.supportContact}`}>Contact course support</a>
                <button type="button" className="btn-secondary" onClick={() => void load()}>Check again</button>
              </div>
            </section>
          )}
          {attempt && (attempt.state === 'passed' || attempt.state === 'needs_revision') && status.result && (
            <Result result={status.result} awardsEnabled={status.awards_enabled} />
          )}
          {showRetake && <Retake busy={busy} error={retakeError} onRetake={onRetake} />}
        </>
      )}
      {showHistory && <AttemptHistory attempts={history ?? []} currentId={attempt?.id ?? null} />}
      {dialog}
    </div>
  );
}

/** A `?attempt=<id>` view of one earlier or in-progress attempt: read-only, no polling, never Stages or Intro. */
function ReadOnlyAttempt({
  status,
  supportContact,
  onCheckAgain,
}: {
  status: AssessmentStatus;
  supportContact: string;
  onCheckAgain: () => void;
}) {
  const attempt = status.attempt;
  return (
    <div className="mt-8">
      <p className="text-slate-700">
        You are looking at an earlier attempt.{' '}
        <a href="/course/learn/assessment/" className="font-semibold text-brand-700 underline">Back to your assessment</a>
      </p>
      {attempt && (attempt.state === 'passed' || attempt.state === 'needs_revision') && status.result && (
        <Result result={status.result} awardsEnabled={status.awards_enabled} />
      )}
      {attempt && attempt.state === 'grading_error' && (
        <section className="mt-8 rounded-2xl border border-amber-100 bg-amber-50 p-6" role="alert">
          <h2 className="font-heading text-xl font-bold text-ink-800">We could not finish grading</h2>
          <p className="mt-2 text-amber-900">{GRADING_ERROR_COPY}</p>
          <p className="mt-2 text-amber-900">Course support can re-run the grading for you.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a className="btn-primary" href={`mailto:${supportContact}`}>Contact course support</a>
            <button type="button" className="btn-secondary" onClick={onCheckAgain}>Check again</button>
          </div>
        </section>
      )}
      {attempt && (attempt.state === 'submitted' || attempt.state === 'grading') && (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-heading text-xl font-bold text-ink-800">Grading in progress</h2>
          <p className="mt-2 text-slate-700">
            Your responses are with the grader. Results usually take a few minutes. Refresh this page to check, or open your assessment.{' '}
            <a href="/course/learn/assessment/" className="font-semibold text-brand-700 underline">Back to your assessment</a>
          </p>
        </section>
      )}
      {attempt && attempt.state === 'draft' && (
        <p className="mt-8 text-slate-700">
          This attempt is still in progress.{' '}
          <a href="/course/learn/assessment/" className="font-semibold text-brand-700 underline">Back to your assessment</a>
        </p>
      )}
    </div>
  );
}

function Retake({ busy, error, onRetake }: { busy: boolean; error: string | null; onRetake: () => void }) {
  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="font-heading text-xl font-bold text-ink-800">Start again when you are ready</h2>
      <p className="mt-2 text-slate-700">A new attempt uses a different scenario where one is available. Your earlier result stays in your history, and the lessons named above are the ones worth revisiting first.</p>
      <button type="button" className="btn-primary mt-4" disabled={busy} onClick={onRetake}>{busy ? 'Starting…' : 'Start a new attempt'}</button>
      {error && <ErrorLine text={error} />}
    </section>
  );
}

function AttemptHistory({ attempts, currentId }: { attempts: AttemptSummary[]; currentId: string | null }) {
  const outcome = (a: AttemptSummary): string =>
    a.state === 'passed' ? 'Passed' : a.state === 'needs_revision' ? 'Not yet' : a.state === 'grading_error' ? 'Grading problem' : a.state === 'draft' ? 'In progress' : 'Being graded';
  const finished = (a: AttemptSummary) => a.state === 'passed' || a.state === 'needs_revision' || a.state === 'grading_error';
  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="font-heading text-xl font-bold text-ink-800">Your attempts</h2>
      <ul className="mt-3 divide-y divide-slate-100">
        {attempts.map((a) => (
          <li key={a.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
            <span>
              {finished(a) && a.id !== currentId ? (
                <a href={`/course/learn/assessment/?attempt=${a.id}`} className="font-medium text-brand-700 hover:underline">
                  Attempt {a.sequence}
                </a>
              ) : (
                <span className="font-medium text-ink-800">Attempt {a.sequence}</span>
              )}
              <span className="text-slate-500">, {new Date(a.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">{outcome(a)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function problemCopy(problem: string): string {
  if (problem === 'required') return 'This response is required before you continue.';
  if (problem === 'too_short') return 'This response is shorter than the minimum for this question.';
  if (problem === 'too_long') return 'This response is longer than the maximum for this question.';
  return 'This response needs attention.';
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
      {text}
    </p>
  );
}

function Intro({ status, busy, error, onStart }: { status: AssessmentStatus; busy: boolean; error: string | null; onStart: () => void }) {
  const { eligibility } = status;
  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
      <p className="text-slate-700">
        The assessment has three parts about one situation. Each part shows new information. When you continue past a part, your responses in it lock, so write each part as you would act in the real conversation.
      </p>
      <p className="mt-3 text-slate-700">An AI grader scores your responses against the published rubric and quotes what it found. There is no time limit, and your responses save as you type.</p>
      {eligibility.reason === 'modules_incomplete' && (
        <p className="mt-4 text-slate-700">The final assessment opens when modules 1 to 8 and the orientation lesson are complete.</p>
      )}
      {eligibility.reason === 'already_passed' && <p className="mt-4 text-slate-700">You have passed this version of the assessment.</p>}
      {eligibility.eligible && (
        <button type="button" className="btn-primary mt-5" disabled={busy} onClick={onStart}>
          {busy ? 'Starting…' : 'Start the assessment'}
        </button>
      )}
      {error && <ErrorLine text={error} />}
    </section>
  );
}

function Stages(props: {
  attempt: NonNullable<AssessmentStatus['attempt']>;
  drafts: Record<string, Draft>;
  problems: Record<string, string>;
  busy: boolean;
  error: string | null;
  onChange: (promptId: string, text: string) => void;
  onResolve: (promptId: string, keepMine: boolean) => void;
  onAdvance: (stage: StageView) => void;
  onSubmit: () => void;
}) {
  const { attempt } = props;
  const last = attempt.stage_count - 1;
  return (
    <div className="mt-8 space-y-8">
      {attempt.stages.map((stage) => {
        const current = stage.index === attempt.current_stage;
        return (
          <section key={stage.id} className="rounded-2xl border border-slate-200 bg-white p-6" aria-labelledby={`stage-${stage.id}`}>
            <p className="eyebrow">Part {stage.part}</p>
            <h2 id={`stage-${stage.id}`} className="mt-1 font-heading text-xl font-bold text-ink-800">{stage.title}</h2>
            {stage.intro && <p className="mt-3 text-slate-700">{stage.intro}</p>}
            {stage.reveal && (
              <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50 p-4">
                <p className="text-sm font-semibold text-brand-800">New information</p>
                <p className="mt-1 text-slate-800">{stage.reveal}</p>
              </div>
            )}
            <div className="mt-5 space-y-6">
              {stage.prompts.map((p, i) => (
                <Prompt
                  key={p.prompt_id}
                  index={i + 1}
                  prompt={p}
                  draft={props.drafts[p.prompt_id]}
                  problem={props.problems[p.prompt_id]}
                  editable={current && !p.response.locked}
                  busy={props.busy}
                  onChange={props.onChange}
                  onResolve={props.onResolve}
                />
              ))}
            </div>
            {current && (
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {stage.index < last ? (
                  <button type="button" className="btn-primary" disabled={props.busy} onClick={() => props.onAdvance(stage)}>
                    Continue and lock this part
                  </button>
                ) : (
                  <button type="button" className="btn-primary" disabled={props.busy} onClick={props.onSubmit}>
                    Submit for grading
                  </button>
                )}
                {stage.index < last && <span className="text-sm text-slate-600">Part {String.fromCharCode(stage.part.charCodeAt(0) + 1)} opens after this one locks.</span>}
              </div>
            )}
            {current && props.error && <ErrorLine text={props.error} />}
          </section>
        );
      })}
    </div>
  );
}

function Prompt(props: {
  index: number;
  prompt: PromptView;
  draft: Draft | undefined;
  problem: string | undefined;
  editable: boolean;
  busy: boolean;
  onChange: (promptId: string, text: string) => void;
  onResolve: (promptId: string, keepMine: boolean) => void;
}) {
  const { prompt, draft } = props;
  const text = draft?.text ?? prompt.response.text;
  const id = `prompt-${prompt.prompt_id}`;
  return (
    <div>
      <label htmlFor={id} className="block font-semibold text-ink-800">
        Question {props.index}
        {!prompt.required && <span className="ml-2 text-sm font-normal text-slate-500">(optional)</span>}
      </label>
      <p className="mt-1 text-slate-700">{prompt.text}</p>
      {props.editable ? (
        <>
          <textarea
            id={id}
            className="mt-3 w-full rounded-xl border border-slate-300 p-3 text-slate-900"
            rows={8}
            value={text}
            maxLength={prompt.max_chars}
            disabled={props.busy}
            onChange={(e) => props.onChange(prompt.prompt_id, e.target.value)}
          />
          <div className="mt-1 flex flex-wrap justify-between gap-2 text-sm text-slate-600">
            <span>{saveCopy(draft)}</span>
            <span>
              {text.length} of {prompt.max_chars} characters{prompt.min_chars > 0 ? `, at least ${prompt.min_chars}` : ''}
            </span>
          </div>
          {draft?.conflict && (
            <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
              <p>This response was also saved from another window. Which version do you want to keep?</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className="btn-secondary" disabled={props.busy} onClick={() => props.onResolve(prompt.prompt_id, false)}>Use the other version</button>
                <button type="button" className="btn-secondary" disabled={props.busy} onClick={() => props.onResolve(prompt.prompt_id, true)}>Keep mine</button>
              </div>
            </div>
          )}
          {draft?.error && <ErrorLine text={draft.error} />}
          {props.problem && <ErrorLine text={props.problem} />}
        </>
      ) : (
        <>
          <div className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-800">
            {text || <span className="text-slate-500">No response.</span>}
            {prompt.response.locked && <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">Locked</p>}
          </div>
          {/* A problem on a prompt this learner cannot edit still has to show, or the submit fails with nothing on screen to explain it. */}
          {props.problem && <ErrorLine text={props.problem} />}
        </>
      )}
    </div>
  );
}

function saveCopy(draft: Draft | undefined): string {
  if (!draft) return '';
  if (draft.state === 'saving') return 'Saving your response…';
  if (draft.state === 'saved' && draft.savedAt) return `Saved ${timeOf(draft.savedAt)}`;
  if (draft.state === 'error') return 'Could not save. Your last saved version is kept.';
  return '';
}

function Result({ result, awardsEnabled }: { result: NonNullable<AssessmentStatus['result']>; awardsEnabled: boolean }) {
  return (
    <section className="mt-8 space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-heading text-2xl font-bold text-ink-800">{result.passed ? 'You passed' : 'Not yet'}</h2>
        <p className="mt-2 text-slate-700">
          Your weighted total is {result.total.toFixed(1)} out of 100. A pass needs {result.pass_total} with every criterion at 3 or more.
        </p>
        {!result.passed && <p className="mt-2 text-slate-700">Each criterion below says what was present, what was missing, and which lessons to revisit before a retake.</p>}
        {result.passed && !awardsEnabled && (
          <p className="mt-2 text-slate-700">Certificates are not being issued yet. Your pass is recorded against your account and will be awarded when they open.</p>
        )}
      </div>
      {result.criteria.map((c) => (
        <Criterion key={c.criterion_id} feedback={c} caps={result.caps_applied.filter((cap) => cap.criterion_id === c.criterion_id)} />
      ))}
    </section>
  );
}

/** Join nodes into a plain-sentence list: "A", "A and B", "A, B and C". */
function joinWithAnd(nodes: ReactNode[]): ReactNode {
  return nodes.map((node, i) => (
    <span key={i}>
      {i > 0 && (i === nodes.length - 1 ? ' and ' : ', ')}
      {node}
    </span>
  ));
}

/**
 * Why a criterion reads lower than it scored, one sentence per cause. Several
 * missing principles are one cap sentence, because the sentence already says "at
 * least one"; each misconception names itself, so each gets its own.
 */
function capSentence(cap: CapApplied): string {
  if (cap.cause === 'principle') return `Capped at ${cap.to} because at least one Wisdom Principle was missing or misapplied.`;
  if (cap.cause === 'tool') return `Capped at ${cap.to} because at least one Leadership Tool was missing or misapplied.`;
  return `Capped at ${cap.to} because of a material misconception: ${cap.detail}`;
}

function Criterion({ feedback: c, caps }: { feedback: CriterionFeedback; caps: CapApplied[] }) {
  const capped = c.effective_score < c.score;
  const reasons = capped ? [...new Set(caps.map(capSentence))] : [];
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-heading text-lg font-bold text-ink-800">{c.name}</h3>
        <p className="text-slate-700">
          <span className="text-2xl font-bold text-ink-800">{c.effective_score}</span> of 4
          {capped && <span className="ml-2 text-sm text-slate-600">(scored {c.score}, capped)</span>}
        </p>
      </div>
      {c.status === 'unanswered' && <p className="mt-1 text-sm text-slate-600">Nothing in your responses could be quoted for this criterion.</p>}
      {c.status === 'misconception' && <p className="mt-1 text-sm text-amber-900">A material misconception was found here.</p>}
      {reasons.map((sentence) => (
        <p key={sentence} className="mt-1 text-sm text-slate-600">
          {sentence}
        </p>
      ))}
      <p className="mt-3 text-slate-800">{c.reason}</p>
      {c.evidence.length > 0 && (
        <ul className="mt-3 space-y-2">
          {c.evidence.map((e, i) => (
            <li key={i} className="border-l-2 border-brand-200 pl-3 text-sm text-slate-700">
              <span className="italic">{e.quote}</span>
              <span className="ml-2 text-slate-500">({e.prompt_label})</span>
            </li>
          ))}
        </ul>
      )}
      {c.revision_lessons.length > 0 && (
        <p className="mt-3 text-sm text-slate-700">
          Revisit{' '}
          {joinWithAnd(
            c.revision_lessons.map((l) =>
              l.href ? (
                <a href={l.href} className="font-semibold text-brand-700 underline">
                  {l.title}
                </a>
              ) : (
                l.title
              )
            )
          )}{' '}
          before a retake.
        </p>
      )}
    </article>
  );
}
