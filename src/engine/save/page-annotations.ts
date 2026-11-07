import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRef,
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
  // A loop, because a long pen stroke has more points than a function can take as arguments.
  let left = Infinity;
  let right = -Infinity;
  let bottom = Infinity;
  let top = -Infinity;
  for (const { x, y } of points) {
    left = Math.min(left, x);
    right = Math.max(right, x);
    bottom = Math.min(bottom, y);
    top = Math.max(top, y);
  }
  return { left, bottom, right, top };
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

/** Whether viewers show it at all. */
export function isShown(context: PDFContext, annotation: PDFDict): boolean {
  const flags = context.lookup(annotation.get(name('F')));
  return !(flags instanceof PDFNumber && flags.asNumber() & (HIDDEN_FLAG | NO_VIEW_FLAG));
}

/**
 * Pages can share one list, or inherit it, and a change to a shared list would land on every page
 * using it. So a page gets its own before anything about it changes.
 */
export function giveOwnAnnotationList(page: PDFPage): void {
  const { context } = page.doc;
  const list = context.lookup(page.node.getInheritableAttribute(name('Annots')));
  if (list instanceof PDFArray) page.node.set(name('Annots'), list.clone(context));
}

/** Every entry in every page's list, to tell whether something's still in use elsewhere. */
function everyListedAnnotation(page: PDFPage): readonly PDFObject[] {
  return page.doc.getPages().flatMap((one) => one.node.Annots()?.asArray() ?? []);
}

/** The drawings an annotation can show, which might be shared with another annotation. */
function looksOf(context: PDFContext, annotation: PDFDict): readonly PDFRef[] {
  const looks = context.lookup(annotation.get(name('AP')));
  if (!(looks instanceof PDFDict)) return [];
  return looks.values().flatMap((value) => {
    if (value instanceof PDFRef) {
      const target = context.lookup(value);
      return target instanceof PDFDict
        ? [value, ...target.values().filter((one) => one instanceof PDFRef)]
        : [value];
    }
    return value instanceof PDFDict ? value.values().filter((one) => one instanceof PDFRef) : [];
  });
}

const eraseIfHeldApart = (context: PDFContext, value: PDFObject | undefined) => {
  if (value instanceof PDFRef) context.delete(value);
};

/**
 * Erases an annotation from the file, rather than only taking it off the page's list. A save writes
 * every object it knows of, so anything just unlisted would still be there for a PDF tool to find.
 * Its drawing goes too, which can hold its words, unless something else still needs it.
 */
export function eraseAnnotation(page: PDFPage, annotation: PDFDict, keepLook = false): void {
  const { context } = page.doc;
  const list = page.node.Annots();
  if (!list) return;
  const going = new Set([annotation, context.lookup(annotation.get(name('Popup')))]);
  const refs: PDFRef[] = [];
  for (let index = list.size() - 1; index >= 0; index -= 1) {
    const entry = list.get(index);
    if (going.has(context.lookup(entry))) {
      list.remove(index);
      if (entry instanceof PDFRef) refs.push(entry);
    }
  }
  // Another page can list the same annotation, which then has to stay as it is.
  const remaining = everyListedAnnotation(page);
  if (remaining.some((entry) => going.has(context.lookup(entry)))) return;
  const looks = keepLook ? [] : looksOf(context, annotation);
  const looksInUse = new Set(
    remaining.flatMap((entry) => {
      const other = context.lookup(entry);
      return other instanceof PDFDict ? looksOf(context, other) : [];
    }),
  );
  eraseIfHeldApart(context, annotation.get(name('Contents')));
  eraseIfHeldApart(context, annotation.get(name('RC')));
  for (const ref of [...refs, ...looks.filter((look) => !looksInUse.has(look))]) {
    context.delete(ref);
  }
}

export function annotationsOver(page: PDFPage, bounds: UserBounds): readonly PDFDict[] {
  const annotations = page.node.Annots();
  if (!annotations) return [];
  const { context } = page.doc;
  const found: PDFDict[] = [];
  for (let index = 0; index < annotations.size(); index += 1) {
    const annotation = context.lookup(annotations.get(index));
    if (!(annotation instanceof PDFDict)) continue;
    if (!isShown(context, annotation)) continue;
    const kind = context.lookup(annotation.get(name('Subtype')));
    if (kind instanceof PDFName && PAINTS_NOTHING.has(kind.toString())) continue;
    const rect = rectOf(context, annotation);
    if (rect && overlap(rect, bounds)) found.push(annotation);
  }
  return found;
}

export const isWidget = (context: PDFContext, annotation: PDFDict) =>
  context.lookup(annotation.get(name('Subtype'))) === name('Widget');
