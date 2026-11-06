import type { Rect } from './edits/model';

/** A sticky note already saved in the file, which can be read but not changed. */
export interface ExistingNote {
  readonly id: string;
  readonly rect: Rect;
  readonly text: string;
  readonly author: string;
}

/** The parts of pdf.js's description of an annotation that a note needs. */
export interface NoteData {
  readonly id?: string;
  readonly subtype?: string;
  readonly rect?: readonly number[];
  readonly contentsObj?: { readonly str?: string };
  readonly titleObj?: { readonly str?: string };
  readonly annotationFlags?: number;
}

const HIDDEN_OR_NO_VIEW = 2 | 32;

/** Reads a note. Anything else on the page, or a note with no words, gives null. */
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
    rect: {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    },
    text,
    author: data.titleObj?.str?.trim() ?? '',
  };
}
