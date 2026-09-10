import { useEffect, useState } from 'react';
import { useSession } from '../../lib/useSession';
import { accountLink } from '../../lib/accountLink';
import { CourseActionError, courseErrorMessage, fetchWorksheet, type WorksheetPayload } from '../../lib/courseClient';
import Markdown from './chat/Markdown';

/** A module worksheet for enrolled learners. Printing uses the page's print stylesheet; nothing is generated. */
export default function WorksheetView({ worksheetId, title }: { worksheetId: string; title: string }) {
  const { session, user, loading } = useSession();
  const [sheet, setSheet] = useState<WorksheetPayload | null>(null);
  const [error, setError] = useState<CourseActionError | null>(null);

  useEffect(() => {
    if (loading || !session) return;
    fetchWorksheet(session.access_token, worksheetId)
      .then(setSheet)
      .catch((err) => setError(err instanceof CourseActionError ? err : new CourseActionError('request_failed', 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.id, worksheetId]);

  if (loading) return <p className="text-slate-500">Loading the worksheet…</p>;
  if (!session || user?.is_anonymous) {
    return (
      <p className="text-slate-700">
        Sign in to open this worksheet.{' '}
        <a href={accountLink({ next: window.location.pathname })} className="font-semibold text-brand-700 underline">
          Sign in
        </a>
      </p>
    );
  }
  if (error) {
    return (
      <p className="text-slate-700">
        {courseErrorMessage(error.code)}{' '}
        <a href="/course/learn/" className="font-semibold text-brand-700 underline">
          Go to your course
        </a>
      </p>
    );
  }
  if (!sheet) return <p className="text-slate-500">Loading the worksheet…</p>;

  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => window.print()} className="btn-primary">
          Print this worksheet
        </button>
        <a href="/course/learn/" className="btn-secondary">
          Back to your course
        </a>
      </div>
      <article className="print-sheet prose-sss rounded-2xl border border-slate-100 bg-white p-6 shadow-card sm:p-8" aria-label={title}>
        <Markdown text={sheet.markdown} headings="semantic" />
      </article>
    </div>
  );
}
