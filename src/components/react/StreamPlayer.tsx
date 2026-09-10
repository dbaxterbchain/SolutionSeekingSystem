import { useEffect } from 'react';

interface Props {
  video: { embed_url: string; poster_url: string; expires_at: string } | null;
  /** A video exists but its token could not be prepared. */
  unavailable: boolean;
  /** No recording exists yet (a placeholder lesson before the stand-in clip is configured). */
  pending: boolean;
  /** The clip playing is the stand-in, not this lesson's recording. */
  placeholder: boolean;
  title: string;
  /** Ask the parent to fetch the lesson again (a fresh token, or a retry). */
  onRefresh: () => void;
}

/**
 * The Cloudflare Stream iframe. No autoplay, captions on by default, and a
 * token that outlives any sitting: if a tab comes back after the token
 * expired, the parent fetches a fresh one before the learner presses play.
 */
export default function StreamPlayer({ video, unavailable, pending, placeholder, title, onRefresh }: Props) {
  useEffect(() => {
    if (!video) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() > new Date(video.expires_at).getTime()) onRefresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [video, onRefresh]);

  if (video) {
    return (
      <figure className="not-prose">
        <div className="overflow-hidden rounded-2xl bg-ink-900 shadow-card" style={{ aspectRatio: '16 / 9' }}>
          <iframe
            src={video.embed_url}
            title={title}
            className="h-full w-full"
            allow="accelerometer; gyroscope; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
        {placeholder && (
          <figcaption className="mt-2 text-sm text-slate-500">
            This lesson plays a short stand-in clip until its recording is ready.
          </figcaption>
        )}
      </figure>
    );
  }

  if (unavailable) {
    return (
      <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 text-amber-900">
        <p className="font-semibold">The video is unavailable right now.</p>
        <p className="mt-1 text-sm">The transcript, the exercise and everything else in this lesson still work.</p>
        <button type="button" onClick={onRefresh} className="btn-secondary mt-4">
          Retry
        </button>
      </div>
    );
  }

  if (pending) {
    return (
      <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-5 text-slate-700">
        <p className="font-semibold text-ink-800">The video for this lesson is being filmed.</p>
        <p className="mt-1 text-sm">Everything else in the lesson is ready to use now.</p>
      </div>
    );
  }

  return null;
}
