import { useEffect, useState } from 'react';
import { track } from '../../lib/analytics';
import LessonSections from './LessonSections';

/**
 * The free lesson's exercise: the model response is revealed on request, so
 * a visitor practises before reading it, the way an enrolled learner does.
 * Fires course_preview_started once on mount.
 */
export default function PreviewLesson({ lessonId, modelResponse }: { lessonId: string; modelResponse: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    track({ event: 'course_preview_started', lesson_id: lessonId });
  }, [lessonId]);
  if (modelResponse.trim() === '') return null;
  return (
    <div className="mt-6">
      {shown ? (
        <LessonSections sections={[{ id: 'model-response', title: 'A model response', markdown: modelResponse }]} />
      ) : (
        <button type="button" onClick={() => setShown(true)} className="btn-secondary">
          Show a model response
        </button>
      )}
    </div>
  );
}
