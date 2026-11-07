import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFStream,
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

/** Every annotation that any page still lists. */
function everyListedAnnotation(page: PDFPage): readonly PDFDict[] {
  const { context } = page.doc;
  return page.doc.getPages().flatMap((one) => {
    // Looked up by hand, because the library's shortcut stops the save on a list that isn't one.
    const list = context.lookup(one.node.get(name('Annots')));
    return (list instanceof PDFArray ? list.asArray() : []).flatMap((entry) => {
      const dict = context.lookup(entry);
      return dict instanceof PDFDict ? [dict] : [];
    });
  });
}

/** Everything a drawing is made of, including drawings inside it, as some apps build stamps. */
function drawingParts(context: PDFContext, start: PDFObject | undefined, found: Set<PDFRef>): void {
  if (start instanceof PDFRef) {
    if (found.has(start)) return;
    found.add(start);
  }
  const target = context.lookup(start);
  // An appearance can be one drawing, or a set of them to choose from by state.
  if (target instanceof PDFDict) {
    for (const value of target.values()) drawingParts(context, value, found);
    return;
  }
  if (!(target instanceof PDFStream)) return;
  const resources = context.lookup(target.dict.get(name('Resources')));
  const inner =
    resources instanceof PDFDict ? context.lookup(resources.get(name('XObject'))) : null;
  if (inner instanceof PDFDict) {
    for (const value of inner.values()) drawingParts(context, value, found);
  }
}

function looksOf(context: PDFContext, annotation: PDFDict, found: Set<PDFRef>): void {
  const looks = context.lookup(annotation.get(name('AP')));
  if (looks instanceof PDFDict) {
    for (const value of looks.values()) drawingParts(context, value, found);
  }
}

/** Drawings something still needs: other annotations, and the pages themselves. */
function looksInUse(page: PDFPage, annotations: readonly PDFDict[]): Set<PDFRef> {
  const { context } = page.doc;
  const found = new Set<PDFRef>();
  for (const annotation of annotations) looksOf(context, annotation, found);
  for (const one of page.doc.getPages()) {
    const resources = context.lookup(one.node.getInheritableAttribute(name('Resources')));
    const drawings =
      resources instanceof PDFDict ? context.lookup(resources.get(name('XObject'))) : null;
    if (drawings instanceof PDFDict) {
      for (const value of drawings.values()) drawingParts(context, value, found);
    }
  }
  return found;
}

/** Erases what an annotation holds by reference, unless another annotation shares it. */
export function eraseHeldText(
  page: PDFPage,
  annotation: PDFDict,
  key: string,
  others: readonly PDFDict[] = everyListedAnnotation(page),
): void {
  const held = annotation.get(name(key));
  if (!(held instanceof PDFRef)) return;
  if (!others.some((other) => other !== annotation && other.get(name(key)) === held)) {
    page.doc.context.delete(held);
  }
}

const WORDS_KEYS = ['Contents', 'RC', 'T', 'Subj'];

/**
 * Erases an annotation from the file, rather than only taking it off the page's list. A save writes
 * every object it knows of, so anything just unlisted would still be there for a PDF tool to find.
 * Its drawing goes too, which can hold its words, unless something else still needs it.
 */
export function eraseAnnotation(page: PDFPage, annotation: PDFDict): void {
  const { context } = page.doc;
  const popupEntry = annotation.get(name('Popup'));
  const popup = context.lookup(popupEntry);
  const list = page.node.Annots();
  const entries = list?.asArray() ?? [];
  let ownRef: PDFRef | undefined;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    const target = context.lookup(entry);
    if (target === annotation || (popup !== undefined && target === popup)) {
      list?.remove(index);
      if (target === annotation && entry instanceof PDFRef) ownRef = entry;
    }
  }
  const remaining = everyListedAnnotation(page);
  // Another page can list the same annotation, which then has to stay as it is.
  if (remaining.includes(annotation)) return;
  const going: PDFDict[] = [annotation];
  if (popup instanceof PDFDict && !remaining.includes(popup)) {
    going.push(popup);
    if (popupEntry instanceof PDFRef) context.delete(popupEntry);
  }
  const looks = new Set<PDFRef>();
  looksOf(context, annotation, looks);
  const inUse = looksInUse(page, remaining);
  for (const look of looks) {
    if (!inUse.has(look)) context.delete(look);
  }
  for (const dict of going) {
    for (const key of WORDS_KEYS) eraseHeldText(page, dict, key, remaining);
  }
  if (ownRef) context.delete(ownRef);
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
