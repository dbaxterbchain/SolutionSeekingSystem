/**
 * Shared shapes for the course content pipeline. Plain types only, so the
 * validator and its tests never touch astro:content.
 */

/** The production ladder. Monotone: each rung requires everything below it. */
export const LESSON_STATUSES = [
  'draft',
  'approved',
  'filmed',
  'edited',
  'captioned',
  'staged',
  'published',
] as const;
export type LessonStatus = (typeof LESSON_STATUSES)[number];

/** Drives the completion rule: standard lessons need practice and a model reveal. */
export const LESSON_KINDS = ['standard', 'orientation', 'plan'] as const;
export type LessonKind = (typeof LESSON_KINDS)[number];

export interface LessonApprovals {
  copy?: string;
  edit?: string;
  captions?: string;
}

export interface LessonInput {
  id: string;
  title: string;
  module: string;
  kind: LessonKind;
  next?: string;
  worksheet: string;
  streamUid: string | null;
  durationMin: number;
  status: LessonStatus;
  contentVersion: number;
  preview: boolean;
  /** The video is a temporary clip; relaxes the transcript and edit gates while the course is not open. */
  videoPlaceholder: boolean;
  approvals: LessonApprovals;
  body: string;
}

export interface ModuleCheck {
  question: string;
  choices: [string, string];
  /** 1-based index into `choices`. Server-only: never rendered before an answer. */
  answer: 1 | 2;
  explanation: string;
}

export interface ModuleInput {
  id: string;
  title: string;
  summary: string;
  worksheet: string;
  checks: ModuleCheck[];
}

export interface WorksheetInput {
  id: string;
  title: string;
  module: string;
  body: string;
}
