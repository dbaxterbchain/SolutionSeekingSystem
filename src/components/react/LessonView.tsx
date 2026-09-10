import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSession } from '../../lib/useSession';
import { accountLink } from '../../lib/accountLink';
import {
  CourseActionError,
  courseErrorMessage,
  fetchCourseState,
  fetchLesson,
  postProgress,
  type CourseStateView,
  type LessonPayload,
  type ProgressBody,
  type ProgressView,
} from '../../lib/courseClient';
import { track } from '../../lib/analytics';
import type { PublicCurriculum } from '../../lib/course/curriculum';
import LessonNav from './LessonNav';
import LessonSections from './LessonSections';
import StreamPlayer from './StreamPlayer';

interface Props {
  lessonId: string;
  title: string;
  curriculum: PublicCurriculum;
  supportContact: string;
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: Date }
  | { kind: 'failed'; keptFrom: Date | null }
  | { kind: 'conflict'; server: { text: string; revision: number } };

const SAVE_DEBOUNCE_MS = 1500;
const draftKey = (userId: string, lessonId: string) => `sss-course-draft:${userId}:${lessonId}`;
const clock = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * The enrolled lesson. Everything paid comes from /api/course/lesson with
 * the bearer token: the shell around this island carries only the title and
 * the outcome. Progress writes go one action at a time through
 * /api/course/progress, and the response text is autosaved with a revision
 * check so two tabs never silently overwrite each other.
 */
export default function LessonView({ lessonId, title, curriculum, supportContact }: Props) {
  const { session, user, loading: sessionLoading } = useSession();
  const [payload, setPayload] = useState<LessonPayload | null>(null);
  const [loadError, setLoadError] = useState<CourseActionError | null>(null);
  const [state, setState] = useState<CourseStateView | null>(null);
  const [progress, setProgress] = useState<ProgressView | null>(null);
  const [modelResponse, setModelResponse] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [completedNow, setCompletedNow] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const revision = useRef(0);
  const textRef = useRef('');
  const lastSavedAt = useRef<Date | null>(null);
  textRef.current = text;

  const token = session?.access_token ?? null;

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchLesson(token, lessonId);
      setPayload(data);
      setLoadError(null);
      if (data.progress) {
        setProgress(data.progress);
        revision.current = data.progress.revision;
      }
    } catch (err) {
      setLoadError(err instanceof CourseActionError ? err : new CourseActionError('request_failed', 0));
    }
  }, [token, lessonId]);

  // First load, the open action, the drawer's state, and the local draft.
  useEffect(() => {
    if (sessionLoading || !token || !user) return;
    void load();
    void fetchCourseState(token).then(setState).catch(() => setState(null));
    void postProgress(token, { lesson_id: lessonId, action: 'open' }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading, user?.id, lessonId]);

  // Seed the editor: the local draft wins over the server copy if it is newer than the last save.
  useEffect(() => {
    if (!payload || !user) return;
    const server = payload.progress?.response_text ?? '';
    let draft: { text: string; revision: number } | null = null;
    try {
      const raw = window.localStorage.getItem(draftKey(user.id, lessonId));
      draft = raw ? (JSON.parse(raw) as { text: string; revision: number }) : null;
    } catch {
      draft = null;
    }
    const serverRevision = payload.progress?.revision ?? 0;
    setText(draft && draft.revision === serverRevision && draft.text !== server ? draft.text : server);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload?.lesson.id]);

  const act = useCallback(
    async (body: Omit<ProgressBody, 'lesson_id'>) => {
      if (!token) return null;
      setBusy(body.action);
      setActionError(null);
      setMissing([]);
      try {
        const res = await postProgress(token, { lesson_id: lessonId, ...body });
        setProgress(res.progress);
        revision.current = Math.max(revision.current, res.progress.revision);
        return res;
      } catch (err) {
        if (err instanceof CourseActionError) {
          if (err.code === 'incomplete' && Array.isArray(err.extra.missing)) setMissing(err.extra.missing as string[]);
          setActionError(courseErrorMessage(err.code));
        } else {
          setActionError('Something went wrong. Please try again.');
        }
        return null;
      } finally {
        setBusy(null);
      }
    },
    [token, lessonId]
  );

  const saveNow = useCallback(
    async (opts: { keepPrevious?: boolean; expected?: number } = {}) => {
      if (!token || !user) return;
      const value = textRef.current;
      setSave({ kind: 'saving' });
      try {
        const res = await postProgress(token, {
          lesson_id: lessonId,
          action: 'save_response',
          text: value,
          expected_revision: opts.expected ?? revision.current,
          ...(opts.keepPrevious ? { keep_previous: true } : {}),
        });
        setProgress(res.progress);
        revision.current = res.progress.revision;
        lastSavedAt.current = new Date();
        setSave({ kind: 'saved', at: lastSavedAt.current });
        if (textRef.current === value) {
          try {
            window.localStorage.removeItem(draftKey(user.id, lessonId));
          } catch {
            // Nothing to clean up.
          }
        }
      } catch (err) {
        if (err instanceof CourseActionError && err.code === 'revision_conflict') {
          setSave({ kind: 'conflict', server: err.extra.server as { text: string; revision: number } });
        } else {
          setSave({ kind: 'failed', keptFrom: lastSavedAt.current });
        }
      }
    },
    [token, user, lessonId]
  );

  const onType = (value: string) => {
    setText(value);
    if (user) {
      try {
        window.localStorage.setItem(draftKey(user.id, lessonId), JSON.stringify({ text: value, revision: revision.current }));
      } catch {
        // Private mode: the server copy is still the record.
      }
    }
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void saveNow(), SAVE_DEBOUNCE_MS);
  };

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  const reveal = async () => {
    const res = await act({ action: 'reveal_model' });
    if (res?.model_response !== undefined) setModelResponse(res.model_response);
  };

  const complete = async () => {
    const res = await act({ action: 'complete' });
    if (!res) return;
    setMissing([]);
    if (res.lesson_completed && payload) {
      setCompletedNow(true);
      track({
        event: 'lesson_completed',
        lesson_id: payload.lesson.id,
        module_id: payload.lesson.module_id,
        content_version: payload.lesson.content_version,
      });
      if (res.module_completed) track({ event: 'module_completed', module_id: payload.lesson.module_id });
    }
  };

  if (sessionLoading) return <Note>Loading the lesson…</Note>;
  if (!session || user?.is_anonymous) {
    return (
      <Note>
        Sign in to open this lesson.{' '}
        <a href={accountLink({ next: `/course/learn/lessons/${lessonId}` })} className="font-semibold text-brand-700 underline">
          Sign in
        </a>
      </Note>
    );
  }
  if (loadError) {
    if (loadError.code === 'enrollment_required') {
      return (
        <Note>
          This lesson is for enrolled learners.{' '}
          <a href="/course/learn/" className="font-semibold text-brand-700 underline">
            Go to your course
          </a>
        </Note>
      );
    }
    return (
      <Note>
        {courseErrorMessage(loadError.code)}{' '}
        <button type="button" onClick={() => void load()} className="font-semibold text-brand-700 underline">
          Try again
        </button>
      </Note>
    );
  }
  if (!payload) return <Note>Loading the lesson…</Note>;

  const { lesson } = payload;
  const p = progress;
  const done = Boolean(p?.completed);
  const hasPractice = (p?.practice_state ?? 'none') !== 'none' || text.trim() !== '';
  const stepClass = (ok: boolean) =>
    `flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
      ok ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-700 hover:border-brand-200'
    }`;
  const mark = (ok: boolean) => (
    <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-slate-300'}`} />
  );

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LessonNav curriculum={curriculum} currentId={lessonId} state={state} />
        <a href={`/course/learn/worksheets/${lesson.worksheet_id}`} className="text-sm font-semibold text-brand-700 hover:underline">
          Module {lesson.module_order} worksheet
        </a>
      </div>

      {p && p.content_version < lesson.content_version && (
        <p className="rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-sm text-slate-700">
          This lesson was updated since you last worked on it. Your progress and your response are kept.
        </p>
      )}

      <StreamPlayer
        video={payload.video}
        unavailable={payload.video_unavailable}
        pending={!payload.video && !payload.video_unavailable}
        placeholder={lesson.video_placeholder}
        title={title}
        onRefresh={load}
      />

      <section aria-labelledby="studied-title">
        <h2 id="studied-title" className="sr-only">Study</h2>
        <button type="button" onClick={() => void act({ action: 'studied' })} disabled={busy !== null || Boolean(p?.studied)} className={stepClass(Boolean(p?.studied))}>
          {mark(Boolean(p?.studied))}
          I watched the video or studied the transcript
        </button>
      </section>

      <LessonSections sections={[{ id: 'key-points', title: 'Key points', markdown: lesson.sections.key_points }]} />

      {lesson.has_exercise && (
        <section aria-label="Exercise" className="space-y-4">
          <LessonSections sections={[{ id: 'exercise', title: 'Exercise', markdown: lesson.sections.exercise }]} />
          <label htmlFor="response" className="block text-sm font-semibold text-ink-800">
            Your response
          </label>
          <textarea
            id="response"
            value={text}
            onChange={(e) => onType(e.target.value)}
            rows={8}
            maxLength={20000}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="Write here. Your work saves as you type."
          />
          <p aria-live="polite" className="text-sm text-slate-500">
            {save.kind === 'saving' && 'Saving your response…'}
            {save.kind === 'saved' && `Saved ${clock(save.at)}`}
            {save.kind === 'failed' &&
              (save.keptFrom ? `Could not save. Your last saved version from ${clock(save.keptFrom)} is kept.` : 'Could not save. Your draft is kept on this device.')}
          </p>
          {save.kind === 'conflict' && (
            <div role="alert" className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">This response was changed somewhere else, probably in another tab.</p>
              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white/70 p-3 text-slate-700">{save.server.text}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setText(save.server.text);
                    revision.current = save.server.revision;
                    setSave({ kind: 'saved', at: new Date() });
                  }}
                >
                  Use the other version
                </button>
                <button type="button" className="btn-primary" onClick={() => void saveNow({ keepPrevious: true, expected: save.server.revision })}>
                  Keep mine
                </button>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => void act({ action: 'practiced_offline' })}
            disabled={busy !== null || (p?.practice_state ?? 'none') !== 'none'}
            className={stepClass((p?.practice_state ?? 'none') !== 'none')}
          >
            {mark((p?.practice_state ?? 'none') !== 'none')}
            I did this exercise on paper or out loud
          </button>
        </section>
      )}

      {lesson.has_model_response && (
        <section aria-labelledby="model-title">
          <h2 id="model-title" className="font-heading text-2xl font-bold text-ink-800">Model response</h2>
          {modelResponse === null ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm text-slate-600">Try the exercise first. The model response is here when you are ready to compare.</p>
              <button type="button" onClick={() => void reveal()} disabled={busy !== null || !hasPractice} className="btn-primary mt-4 disabled:opacity-60">
                Reveal the model response
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-8">
              <div className="prose-sss rounded-2xl border border-brand-100 bg-brand-50/40 p-5">
                <LessonSections sections={[{ id: 'model-response', title: '', markdown: modelResponse }]} />
              </div>
              <LessonSections sections={[{ id: 'self-review', title: 'Self-review', markdown: lesson.sections.self_review }]} />
              <button type="button" onClick={() => void act({ action: 'acknowledge' })} disabled={busy !== null || Boolean(p?.acknowledged)} className={stepClass(Boolean(p?.acknowledged))}>
                {mark(Boolean(p?.acknowledged))}
                I have compared my response with the model
              </button>
            </div>
          )}
        </section>
      )}

      {!lesson.has_model_response && (
        <button type="button" onClick={() => void act({ action: 'acknowledge' })} disabled={busy !== null || Boolean(p?.acknowledged)} className={stepClass(Boolean(p?.acknowledged))}>
          {mark(Boolean(p?.acknowledged))}
          I have taken this in
        </button>
      )}

      {lesson.sections.transcript.trim() !== '' && (
        <details className="rounded-2xl border border-slate-100 bg-white p-5">
          <summary className="cursor-pointer font-heading text-lg font-bold text-ink-800">Transcript</summary>
          <div className="prose-sss mt-4">
            <LessonSections sections={[{ id: 'transcript', title: '', markdown: lesson.sections.transcript }]} />
          </div>
        </details>
      )}

      <section aria-labelledby="complete-title" className="rounded-2xl border border-slate-100 bg-white p-6 shadow-card">
        <h2 id="complete-title" className="font-heading text-xl font-bold text-ink-800">
          {done ? 'Lesson complete' : 'Finish this lesson'}
        </h2>
        {!done && (
          <button type="button" onClick={() => void complete()} disabled={busy !== null} className="btn-primary mt-4 disabled:opacity-60">
            Mark this lesson complete
          </button>
        )}
        {missing.length > 0 && !done && (
          <p className="mt-3 text-sm text-slate-600">
            Still to do:{' '}
            {missing
              .map((m) => ({ studied: 'study the lesson', practice: 'try the exercise', model: 'reveal the model response', acknowledge: 'compare your response', response: 'write your response' })[m] ?? m)
              .join(', ')}
            .
          </p>
        )}
        {actionError && <p className="mt-3 text-sm text-red-600">{actionError}</p>}
        {(done || completedNow) && (
          <div className="mt-4 flex flex-wrap gap-3">
            {lesson.next && lesson.next.available ? (
              <a href={`/course/learn/lessons/${lesson.next.id}`} className="btn-primary">
                Next: {lesson.next.title}
              </a>
            ) : lesson.next ? (
              <p className="text-sm text-slate-600">Next up, coming soon: {lesson.next.title}</p>
            ) : null}
            <a href="/course/learn/" className="btn-secondary">
              Back to your course
            </a>
          </div>
        )}
      </section>

      <p className="text-sm text-slate-500">
        Something not working? Write to{' '}
        <a href={`mailto:${supportContact}`} className="font-semibold text-brand-700 underline">
          {supportContact}
        </a>
        .
      </p>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-slate-100 bg-white p-6 text-slate-700 shadow-card">{children}</div>;
}
