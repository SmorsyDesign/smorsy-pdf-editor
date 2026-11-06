import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  type PDFContext,
  type PDFObject,
  type PDFPage,
} from '@cantoo/pdf-lib';
import type { Point } from '../coordinates';

export interface UserBounds {
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
  readonly top: number;
}

const HIDDEN_FLAG = 2;

const NO_VIEW_FLAG = 32;

// These draw nothing of their own, so nothing placed beneath them is hidden.
const PAINTS_NOTHING = new Set(['/Link', '/Popup']);

export const name = (text: string) => PDFName.of(text);

/** The smallest box holding all of these points. */
export function boundsAround(points: readonly Point[]): UserBounds {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    left: Math.min(...xs),
    bottom: Math.min(...ys),
    right: Math.max(...xs),
    top: Math.max(...ys),
  };
}

export function numbersIn(context: PDFContext, value: PDFObject | undefined): readonly number[] {
  const array = context.lookup(value);
  if (!(array instanceof PDFArray)) return [];
  return array.asArray().map((item) => {
    const number = context.lookup(item);
    return number instanceof PDFNumber ? number.asNumber() : 0;
  });
}

export function rectOf(context: PDFContext, annotation: PDFDict): UserBounds | null {
  const [x1, y1, x2, y2] = numbersIn(context, annotation.get(name('Rect')));
  if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) return null;
  return boundsAround([
    { x: x1, y: y1 },
    { x: x2, y: y2 },
  ]);
}

const overlap = (one: UserBounds, two: UserBounds) =>
  one.left < two.right && two.left < one.right && one.bottom < two.top && two.bottom < one.top;

export function annotationsOver(page: PDFPage, bounds: UserBounds): readonly PDFDict[] {
  const annotations = page.node.Annots();
  if (!annotations) return [];
  const { context } = page.doc;
  const found: PDFDict[] = [];
  for (let index = 0; index < annotations.size(); index += 1) {
    const annotation = context.lookup(annotations.get(index));
    if (!(annotation instanceof PDFDict)) continue;
    const flags = context.lookup(annotation.get(name('F')));
    if (flags instanceof PDFNumber && flags.asNumber() & (HIDDEN_FLAG | NO_VIEW_FLAG)) continue;
    const kind = context.lookup(annotation.get(name('Subtype')));
    if (kind instanceof PDFName && PAINTS_NOTHING.has(kind.toString())) continue;
    const rect = rectOf(context, annotation);
    if (rect && overlap(rect, bounds)) found.push(annotation);
  }
  return found;
}

export const isWidget = (context: PDFContext, annotation: PDFDict) =>
  context.lookup(annotation.get(name('Subtype'))) === name('Widget');
