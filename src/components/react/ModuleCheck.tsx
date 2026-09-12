import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../lib/useSession';
import { accountLink } from '../../lib/accountLink';
import { track } from '../../lib/analytics';
import {
  answerCheck,
  CourseActionError,
  courseErrorMessage,
  fetchModuleChecks,
  type CheckAnswerResponse,
  type ModuleChecksPayload,
} from '../../lib/courseClient';

/**
 * The module check. Each question is two choices and a button; the verdict
 * and the author's explanation come back from the server, which is the only
 * place the key lives. Answering again after a wrong pick is allowed.
 */
export default function ModuleCheck({ moduleId }: { moduleId: string }) {
  const { session, user, loading } = useSession();
  const [data, setData] = useState<ModuleChecksPayload | null>(null);
  const [error, setError] = useState<CourseActionError | null>(null);
  const [picks, setPicks] = useState<Record<string, 1 | 2>>({});
  const [verdicts, setVerdicts] = useState<Record<string, CheckAnswerResponse>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({});
  // A ref, not the closed-over data: two submits can race (nothing stops a
  // learner from answering both questions before either response lands), and
  // only a ref reads the true latest value at the moment each one resolves.
  // Set once the module is already complete on load, so a later re-answer of
  // an already-correct question never re-fires the event.
  const moduleCompleteTracked = useRef(false);

  useEffect(() => {
    if (loading || !session) return;
    fetchModuleChecks(session.access_token, moduleId)
      .then((payload) => {
        setData(payload);
        moduleCompleteTracked.current = payload.module_complete;
      })
      .catch((err) => setError(err instanceof CourseActionError ? err : new CourseActionError('request_failed', 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.id, moduleId]);

  if (loading) return <p className="text-slate-500">Loading the check…</p>;
  if (!session || user?.is_anonymous) {
    return (
      <p className="text-slate-700">
        Sign in to take this check.{' '}
        <a href={accountLink({ next: window.location.pathname })} className="font-semibold text-brand-700 underline">
          Sign in
        </a>
      </p>
    );
  }
  if (error) {
    const message =
      error.code === 'enrollment_required'
        ? 'This check is for enrolled learners.'
        : error.code === 'not_found'
          ? 'This module has no check.'
          : courseErrorMessage(error.code);
    return (
      <p className="text-slate-700">
        {message}{' '}
        <a href="/course/learn/" className="font-semibold text-brand-700 underline">
          Go to your course
        </a>
      </p>
    );
  }
  if (!data) return <p className="text-slate-500">Loading the check…</p>;

  const submit = async (checkId: string) => {
    const choice = picks[checkId];
    if (!choice || !session) return;
    setBusy(checkId);
    setSubmitErrors((e) => {
      if (!(checkId in e)) return e;
      const next = { ...e };
      delete next[checkId];
      return next;
    });
    try {
      const res = await answerCheck(session.access_token, { module_id: moduleId, check_id: checkId, choice });
      setVerdicts((v) => ({ ...v, [checkId]: res }));
      setData((d) =>
        d && {
          ...d,
          checks: d.checks.map((c) =>
            c.id === checkId ? { ...c, answered_correctly: c.answered_correctly || res.correct } : c
          ),
          module_complete: res.module_complete,
        }
      );
      if (res.module_complete && !moduleCompleteTracked.current) {
        moduleCompleteTracked.current = true;
        track({ event: 'module_completed', module_id: moduleId });
      }
    } catch (err) {
      const courseErr = err instanceof CourseActionError ? err : new CourseActionError('request_failed', 0);
      // A session problem is not retryable in place; everything else keeps
      // the questions on screen, with the failure shown beside this one.
      if (courseErr.code === 'enrollment_required' || courseErr.code === 'unauthorized') {
        setError(courseErr);
      } else {
        setSubmitErrors((e) => ({ ...e, [checkId]: courseErrorMessage(courseErr.code) }));
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {data.checks.map((c, i) => {
        const verdict = verdicts[c.id];
        const done = c.answered_correctly;
        return (
          <fieldset key={c.id} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-card">
            <legend className="sr-only">Question {i + 1}</legend>
            <p className="eyebrow">Question {i + 1}{done ? '. Done' : ''}</p>
            <p className="mt-2 font-semibold text-ink-800">{c.question}</p>
            <div className="mt-4 space-y-2">
              {c.choices.map((label, j) => {
                const value = (j + 1) as 1 | 2;
                return (
                  <label key={value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm hover:border-brand-300">
                    <input
                      type="radio"
                      name={c.id}
                      value={value}
                      checked={picks[c.id] === value}
                      onChange={() => setPicks((p) => ({ ...p, [c.id]: value }))}
                      className="mt-1"
                    />
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => void submit(c.id)}
              disabled={!picks[c.id] || busy === c.id || c.answered_correctly}
              className="btn-primary mt-4 disabled:opacity-60"
            >
              {busy === c.id ? 'Checking…' : verdict && !verdict.correct ? 'Try again' : 'Check my answer'}
            </button>
            {submitErrors[c.id] && (
              <p role="alert" className="mt-3 text-sm text-red-600">{submitErrors[c.id]}</p>
            )}
            {verdict && (
              <div
                role="status"
                className={`mt-4 rounded-xl px-4 py-3 text-sm ${verdict.correct ? 'border border-emerald-100 bg-emerald-50 text-emerald-900' : 'border border-amber-100 bg-amber-50 text-amber-900'}`}
              >
                <p className="font-semibold">{verdict.correct ? 'Correct.' : 'Not yet.'}</p>
                <p className="mt-1">{verdict.explanation}</p>
              </div>
            )}
          </fieldset>
        );
      })}
      {data.module_complete ? (
        <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-6 py-4 text-emerald-900">
          Module {data.module.order} is complete.{' '}
          <a href="/course/learn/" className="font-semibold underline">
            Back to your course
          </a>
        </p>
      ) : (
        !data.lessons_complete && (
          <p className="text-sm text-slate-500">You can answer now. The module counts as complete once every lesson is done as well.</p>
        )
      )}
    </div>
  );
}
