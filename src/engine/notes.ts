import { rectFromCorners } from './coordinates';
import type { Rect } from './edits/model';

/** A comment already saved in the file, read this way because it works on protected files too. */
export interface ExistingNote {
  readonly id: string;
  readonly rect: Rect;
  readonly text: string;
  readonly author: string;
  /** The file has no drawing of it, so there's no pin on the page unless the app adds one. */
  readonly noLook: boolean;
}

/** The parts of pdf.js's description of an annotation that a comment needs. */
export interface NoteData {
  readonly id?: string;
  readonly subtype?: string;
  readonly rect?: readonly number[];
  readonly contentsObj?: { readonly str?: string };
  readonly titleObj?: { readonly str?: string };
  readonly annotationFlags?: number;
  readonly hasAppearance?: boolean;
}

const HIDDEN_OR_NO_VIEW = 2 | 32;

/** Reads a comment. Anything else on the page, or a comment with no words, gives null. */
export function noteFromAnnotation(
  data: NoteData,
  toDisplay: (rect: readonly number[]) => readonly number[],
): ExistingNote | null {
  const text = data.contentsObj?.str?.trim();
  if (data.subtype !== 'Text' || !text || !data.rect || !data.id) return null;
  if ((data.annotationFlags ?? 0) & HIDDEN_OR_NO_VIEW) return null;
  const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = toDisplay(data.rect);
  return {
    id: data.id,
    rect: rectFromCorners(x1, y1, x2, y2),
    text,
    author: data.titleObj?.str?.trim() ?? '',
    noLook: data.hasAppearance === false,
  };
}
