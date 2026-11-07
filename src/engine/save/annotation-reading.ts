import {
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFRef,
  PDFString,
  type PDFContext,
  type PDFDocument,
  type PDFObject,
  type PDFPage,
} from '@cantoo/pdf-lib';
import { rectFromCorners, userToDisplay, type PageBox } from '../coordinates';
import type { Annotation, SavedSource } from '../edits/annotations';
import type { Color } from '../edits/model';
import {
  DRAWING_KEY,
  TAGS_KEY,
  readDrawing,
  readTags,
  type SavedDrawing,
} from '../edits/saved-data';
import { annotationBounds } from './annotation-writing';
import { isShown, name, numbersIn, rectOf, type UserBounds } from './page-annotations';
import { pageBoxOf } from './page-geometry';

// These aren't things a person put on the page to read: they're how the file works.
const NOT_ANNOTATIONS = new Set(['Link', 'Widget', 'Popup', 'PrinterMark', 'TrapNet', 'Watermark']);
// A little over what rounding can add up to, so only a real move counts as one.
const MOVED_BY = 1.5;
const GREY: Color = { r: 0.5, g: 0.5, b: 0.5 };

function textIn(context: PDFContext, value: PDFObject | undefined): string {
  const text = context.lookup(value);
  return text instanceof PDFString || text instanceof PDFHexString ? text.decodeText() : '';
}

function colorOf(context: PDFContext, annotation: PDFDict): Color {
  const [r, g, b] = numbersIn(context, annotation.get(name('C')));
  return r !== undefined && g !== undefined && b !== undefined ? { r, g, b } : GREY;
}

function displayRect(bounds: UserBounds, box: PageBox) {
  const one = userToDisplay({ x: bounds.left, y: bounds.bottom }, box);
  const two = userToDisplay({ x: bounds.right, y: bounds.top }, box);
  return rectFromCorners(one.x, one.y, two.x, two.y);
}

/** The PDF's own name for an object, spelled the way the page renderer spells it. */
const refName = (ref: PDFRef) =>
  ref.generationNumber === 0
    ? `${String(ref.objectNumber)}R`
    : `${String(ref.objectNumber)}R${String(ref.generationNumber)}`;

function fromDrawing(
  drawing: SavedDrawing,
  common: Pick<Annotation, 'id' | 'pageNumber' | 'color'>,
  words: string,
): Annotation {
  switch (drawing.kind) {
    case 'highlight':
    case 'underline':
    case 'strikeout':
    case 'comment':
      return { ...common, ...drawing, text: words };
    default:
      return { ...common, ...drawing };
  }
}

/** If another app has moved or reshaped it, what we kept no longer describes it. */
function stillMatches(annotation: Annotation, rect: UserBounds, box: PageBox): boolean {
  const expected = annotationBounds(annotation, box);
  return (
    expected !== null &&
    Math.abs(expected.left - rect.left) < MOVED_BY &&
    Math.abs(expected.right - rect.right) < MOVED_BY &&
    Math.abs(expected.bottom - rect.bottom) < MOVED_BY &&
    Math.abs(expected.top - rect.top) < MOVED_BY
  );
}

function readOne(
  context: PDFContext,
  dict: PDFDict,
  ref: PDFRef,
  pageNumber: number,
  box: PageBox,
): Annotation | null {
  const subtypeName = context.lookup(dict.get(name('Subtype')));
  if (!(subtypeName instanceof PDFName)) return null;
  const subtype = subtypeName.decodeText();
  const rect = rectOf(context, dict);
  if (NOT_ANNOTATIONS.has(subtype) || !rect || !isShown(context, dict)) return null;
  const refText = refName(ref);
  const source = (foreign: boolean): SavedSource => ({ ref: refText, pageNumber, foreign });
  const common = {
    id: `${String(pageNumber)}:${refText}`,
    pageNumber,
    color: colorOf(context, dict),
  };
  const words = textIn(context, dict.get(name('Contents')));
  const tags = readTags(textIn(context, dict.get(name(TAGS_KEY))));
  const tagged = tags.length > 0 ? { tags } : {};

  const drawing = readDrawing(textIn(context, dict.get(name(DRAWING_KEY))));
  if (drawing) {
    const ours = fromDrawing(drawing, common, words);
    if (stillMatches(ours, rect, box)) return { ...ours, ...tagged, saved: source(false) };
  }
  const place = displayRect(rect, box);
  if (subtype === 'Text') {
    return {
      ...common,
      ...tagged,
      kind: 'comment',
      at: { x: place.x, y: place.y },
      text: words,
      saved: source(true),
    };
  }
  return {
    ...common,
    ...tagged,
    kind: 'foreign',
    subtype,
    rect: place,
    text: words,
    saved: source(true),
  };
}

function readPage(page: PDFPage, pageNumber: number): readonly Annotation[] {
  const { context } = page.doc;
  const list = context.lookup(page.node.getInheritableAttribute(name('Annots')));
  if (!(list instanceof PDFArray)) return [];
  const box = pageBoxOf(page);
  return list.asArray().flatMap((entry) => {
    // One held directly in the list has no name for saving or hiding to find it by.
    if (!(entry instanceof PDFRef)) return [];
    const dict = context.lookup(entry);
    if (!(dict instanceof PDFDict)) return [];
    return readOne(context, dict, entry, pageNumber, box) ?? [];
  });
}

/** Everything people have put on the pages, for listing and editing. */
export function readAnnotations(doc: PDFDocument): readonly Annotation[] {
  return doc.getPages().flatMap((page, index) => readPage(page, index + 1));
}
