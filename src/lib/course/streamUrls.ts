/**
 * Cloudflare Stream signed playback, the pure part. Tokens are not bound to a
 * viewer, so one token per video is shared by every learner and refreshed
 * long before it expires; the mint rate stays at a handful a day regardless
 * of how many people watch. Sharing one token per video was chosen for launch
 * because the mint endpoint is rate-limited; per-viewer short-lived tokens
 * signed locally with a Stream signing key are the upgrade path if a token is
 * ever shared beyond a learner.
 */

/** A minted token lives twelve hours. */
export const TOKEN_TTL_SECONDS = 12 * 60 * 60;

/** A stored token is reused while more than an hour remains, so a long lesson never sees it expire mid-watch. */
export const REUSE_MARGIN_SECONDS = 60 * 60;

export const shouldReuse = (expiresAt: Date, now: Date): boolean =>
  expiresAt.getTime() - now.getTime() > REUSE_MARGIN_SECONDS * 1000;

const host = (customerCode: string) => `https://customer-${customerCode}.cloudflarestream.com`;

/** The poster frame two seconds in, through the same token. */
export const posterUrl = (customerCode: string, token: string): string =>
  `${host(customerCode)}/${token}/thumbnails/thumbnail.jpg?time=2s`;

/** The player iframe. No autoplay: the learner presses play. */
export const embedUrl = (customerCode: string, token: string): string =>
  `${host(customerCode)}/${token}/iframe?preload=metadata&defaultTextTrack=en&primaryColor=%235271FF&poster=${encodeURIComponent(posterUrl(customerCode, token))}`;
