import { extractText as pdfExtractText, getDocumentProxy } from 'unpdf';
import mammoth from 'mammoth';

/** Per-document extracted-text budget (~15k tokens). Longer sources are cut. */
export const MAX_DOC_CHARS = 60_000;

export type DocExt = 'pdf' | 'docx' | 'txt' | 'md';

export interface Extraction {
  text: string;
  truncated: boolean;
}

/**
 * A file we can't turn into useful text (e.g. a scanned/image-only PDF). Thrown
 * so the API can answer 422 with a clear, actionable message instead of storing
 * an empty document. We do not OCR at launch.
 */
export class UnsupportedContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedContentError';
  }
}

/** Collapse whitespace and strip control characters, so the injected text is compact. */
function normalize(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    // Strip control characters, keeping tabs and newlines.
    .replace(/\p{Cc}/gu, (c) => (c === '\n' || c === '\t' ? c : ''))
    .replace(/[^\S\n]+/g, ' ') // collapse runs of spaces/tabs (never newlines)
    .replace(/ *\n */g, '\n') // trim spaces around line breaks
    .replace(/\n{3,}/g, '\n\n') // cap consecutive blank lines
    .trim();
}

function cap(text: string): Extraction {
  return text.length <= MAX_DOC_CHARS
    ? { text, truncated: false }
    : { text: text.slice(0, MAX_DOC_CHARS), truncated: true };
}

/**
 * Extract plain text from an uploaded document. The extension (validated against
 * the storage path) picks the reader; the MIME is not trusted, since browsers
 * disagree on .md and .txt.
 */
export async function extractText(buffer: Buffer, ext: DocExt): Promise<Extraction> {
  if (ext === 'txt' || ext === 'md') {
    return cap(normalize(buffer.toString('utf-8')));
  }

  if (ext === 'docx') {
    const { value } = await mammoth.extractRawText({ buffer });
    return cap(normalize(value));
  }

  // pdf: unpdf is a serverless-friendly build of pdf.js (no native deps).
  // mergePages:true returns the whole document as one string.
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await pdfExtractText(pdf, { mergePages: true });
  const normalized = normalize(text);

  // A mostly-scanned PDF yields almost no selectable text. Reject it clearly
  // rather than store a blank document the assistant can't use.
  if (buffer.length > 50_000 && normalized.length < 20) {
    throw new UnsupportedContentError(
      'This PDF looks scanned (no selectable text). Upload a text-based PDF, or paste the text into a .txt or .md file.'
    );
  }

  return cap(normalized);
}
