/**
 * Pure certificate rules shared by the API, the islands and the verify page:
 * the display name a learner may put on a certificate, the shape of a share
 * token, and the learner-facing views built from a row. Nothing here reads
 * the environment or the database.
 */

import type { CertificateRecord, CertificateStatus, CertificateSummary } from './assessmentTypes';

export const DISPLAY_NAME_MAX = 80;
/** 24 random bytes as base64url: 32 characters, no padding. */
export const SHARE_TOKEN_BYTES = 24;
export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

/** Control characters, the C0 and C1 ranges. */
const CONTROL_RE = /\p{Cc}/u;
/** The em dash, the en dash, template braces and angle brackets: the verify page prints the name, and the copy rules apply to it. Built from code points so the source carries no dash. */
const BANNED_RE = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}{}<>]`);
const LETTER_RE = /\p{L}/u;

/**
 * The name as it will print: trimmed, inner whitespace collapsed to one space.
 * Null when empty, longer than DISPLAY_NAME_MAX, without a letter, or carrying
 * a control character or a banned character.
 */
export function normalizeDisplayName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name || name.length > DISPLAY_NAME_MAX) return null;
  if (CONTROL_RE.test(name) || BANNED_RE.test(name) || !LETTER_RE.test(name)) return null;
  return name;
}

export const certificateVerifyPath = (token: string): string => `/course/verify/${token}/`;

export function certificateShareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}${certificateVerifyPath(token)}`;
}

/** The columns the views need; the server's row type carries more. */
export interface CertificateRowLike {
  id: string;
  serial: string;
  certification_version: string;
  display_name: string | null;
  name_confirmed_at: string | null;
  issued_at: string;
  status: CertificateStatus;
  revoked_at: string | null;
  share_token: string | null;
  share_active: boolean;
}

export function certificateSummary(row: CertificateRowLike): CertificateSummary {
  return { id: row.id, serial: row.serial, status: row.status, name_confirmed: row.name_confirmed_at !== null, issued_at: row.issued_at };
}

/** The learner's own view. The token travels only inside the full share url, and only while sharing is on. */
export function certificateRecord(row: CertificateRowLike, origin: string): CertificateRecord {
  return {
    id: row.id,
    serial: row.serial,
    certification_version: row.certification_version,
    display_name: row.display_name,
    name_confirmed_at: row.name_confirmed_at,
    issued_at: row.issued_at,
    status: row.status,
    revoked_at: row.revoked_at,
    share_active: row.share_active,
    share_url: row.share_active && row.share_token ? certificateShareUrl(origin, row.share_token) : null,
  };
}
