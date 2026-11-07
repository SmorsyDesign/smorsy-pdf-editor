import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFRef,
  type PDFContext,
  type PDFDocument,
  type PDFObject,
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
  LONGEST_DRAWING,
} from '../edits/saved-data';
import { isPdfText, readPdfText } from './pdf-text';
import { annotationBounds } from './annotation-writing';
import { isShown, name, numbersIn, rectOf, type UserBounds } from './page-annotations';
import { pageBoxOf } from './page-geometry';

// These aren't things a person put on the page to read: they're how the file works.
const NOT_ANNOTATIONS = new Set(['Link', 'Widget', 'Popup', 'PrinterMark', 'TrapNet', 'Watermark']);
// A little over what rounding can add up to, so only a real move counts as one.
const MOVED_BY = 1.5;
const GREY: Color = { r: 0.5, g: 0.5, b: 0.5 };
// Far past any real document. A small hostile file can repeat one long string thousands of times,
// which would otherwise fill the memory of the window it's sent to.
const MOST_ANNOTATIONS = 20_000;
// In the size text takes up in the file, which is about four times its length in letters.
const MOST_TEXT = 64_000_000;
const LONGEST_TAGS = 128_000;

/** What's in a file, and how much of it couldn't be offered for editing. */
export interface ReadAnnotations {
  readonly annotations: readonly Annotation[];
  readonly skipped: number;
}

/** A running total of how much text has been read, which a hostile file can't get past. */
class ReadingBudget {
  private left = MOST_TEXT;

  isSpent(): boolean {
    return this.left <= 0;
  }

  /** Charged before reading, because the reading itself is what uses up the memory. */
  text(context: PDFContext, value: PDFObject | undefined, longest = Infinity): string {
    const text = context.lookup(value);
    if (!isPdfText(text)) return '';
    const size = text.sizeInBytes();
    this.left -= size;
    return size > longest || this.isSpent() ? '' : readPdfText(text);
  }
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

/** Whether it's something a person put on the page to read, and that viewers show. */
function isListable(context: PDFContext, dict: PDFDict): boolean {
  const subtype = context.lookup(dict.get(name('Subtype')));
  return (
    subtype instanceof PDFName &&
    !NOT_ANNOTATIONS.has(subtype.decodeText()) &&
    isShown(context, dict)
  );
}

function readOne(
  context: PDFContext,
  dict: PDFDict,
  ref: PDFRef,
  pageNumber: number,
  box: PageBox,
  budget: ReadingBudget,
): Annotation | null {
  const subtypeName = context.lookup(dict.get(name('Subtype')));
  const rect = rectOf(context, dict);
  if (!(subtypeName instanceof PDFName) || !rect) return null;
  const subtype = subtypeName.decodeText();
  const refText = refName(ref);
  const source = (foreign: boolean): SavedSource => ({ ref: refText, pageNumber, foreign });
  const common = {
    id: `${String(pageNumber)}:${refText}`,
    pageNumber,
    color: colorOf(context, dict),
  };
  const words = budget.text(context, dict.get(name('Contents')));
  const tags = readTags(budget.text(context, dict.get(name(TAGS_KEY)), LONGEST_TAGS));
  const tagged = tags.length > 0 ? { tags } : {};

  const drawing = readDrawing(budget.text(context, dict.get(name(DRAWING_KEY)), LONGEST_DRAWING));
  if (drawing) {
    const ours = fromDrawing(drawing, common, words);
    if (stillMatches(ours, rect, box)) return { ...ours, ...tagged, saved: source(false) };
  }
  const place = displayRect(rect, box);
  if (subtype === 'Text') {
    const looks = context.lookup(dict.get(name('AP')));
    const hasLook = looks instanceof PDFDict && looks.has(name('N'));
    return {
      ...common,
      ...tagged,
      kind: 'comment',
      at: { x: place.x, y: place.y },
      text: words,
      saved: { ...source(true), ...(hasLook ? {} : { noLook: true }) },
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

/** Everything people have put on the pages. One that can't be read doesn't spoil the rest. */
export function readAnnotations(doc: PDFDocument): ReadAnnotations {
  const { context } = doc;
  const annotations: Annotation[] = [];
  let skipped = 0;
  const budget = new ReadingBudget();
  doc.getPages().forEach((page, index) => {
    const list = context.lookup(page.node.getInheritableAttribute(name('Annots')));
    if (!(list instanceof PDFArray)) return;
    let box: PageBox;
    try {
      box = pageBoxOf(page);
    } catch (error) {
      console.error(error);
      skipped += list.size();
      return;
    }
    // A file can list the same one twice, which is still only one.
    for (const entry of new Set(list.asArray())) {
      const dict = context.lookup(entry);
      if (!(dict instanceof PDFDict) || !isListable(context, dict)) continue;
      // One held directly in the list has no name for saving or hiding to find it by.
      if (
        !(entry instanceof PDFRef) ||
        annotations.length >= MOST_ANNOTATIONS ||
        budget.isSpent()
      ) {
        skipped += 1;
        continue;
      }
      try {
        const found = readOne(context, dict, entry, index + 1, box, budget);
        if (budget.isSpent()) skipped += 1;
        else if (found) annotations.push(found);
      } catch (error) {
        console.error(error);
        skipped += 1;
      }
    }
  });
  return { annotations, skipped };
}
