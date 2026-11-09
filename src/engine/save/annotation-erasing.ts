import {
  PDFArray,
  PDFDict,
  PDFRef,
  PDFStream,
  type PDFContext,
  type PDFObject,
  type PDFPage,
} from '@cantoo/pdf-lib';
import { name } from './page-annotations';

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
  if (target instanceof PDFStream) {
    partsInResources(context, target.dict.get(name('Resources')), found);
  }
}

export function partsInResources(
  context: PDFContext,
  value: PDFObject | undefined,
  found: Set<PDFRef>,
): void {
  const resources = context.lookup(value);
  const drawings =
    resources instanceof PDFDict ? context.lookup(resources.get(name('XObject'))) : null;
  if (drawings instanceof PDFDict) {
    for (const drawing of drawings.values()) drawingParts(context, drawing, found);
  }
}

export function looksOf(context: PDFContext, annotation: PDFDict, found: Set<PDFRef>): void {
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
    partsInResources(context, one.node.getInheritableAttribute(name('Resources')), found);
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
