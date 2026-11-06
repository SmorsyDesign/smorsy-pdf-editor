import {
  PDFContentStream,
  PDFDict,
  PDFName,
  PDFRawStream,
  PDFStream,
  concatTransformationMatrix,
  decodePDFRawStream,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
  type PDFContext,
  type PDFObject,
  type PDFPage,
} from '@cantoo/pdf-lib';
import { boundsAround, name, numbersIn, rectOf } from './page-annotations';

// Drawing commands that paint an area: fills, shadings and images or nested drawings.
const PAINTS_AREA = /(^|\s)([fFbB]\*?|sh|Do)(\s|$)/;

const HEX_STRINGS = /<[0-9a-fA-F\s]*>/g;

/** A single drawing, or for a checkbox or radio button, one drawing per state. */
function normalLook(context: PDFContext, annotation: PDFDict): PDFObject | undefined {
  const appearances = context.lookup(annotation.get(name('AP')));
  return appearances instanceof PDFDict ? context.lookup(appearances.get(name('N'))) : undefined;
}

/** What's showing now, including the drawing for the state a checkbox or radio button is in. */
export function currentLook(context: PDFContext, annotation: PDFDict): PDFStream | null {
  const normal = normalLook(context, annotation);
  if (normal instanceof PDFStream) return normal;
  const state = context.lookup(annotation.get(name('AS')));
  if (!(normal instanceof PDFDict) || !(state instanceof PDFName)) return null;
  const drawing = context.lookup(normal.get(state));
  return drawing instanceof PDFStream ? drawing : null;
}

export function appearanceOf(context: PDFContext, widget: PDFDict): PDFStream | null {
  const normal = normalLook(context, widget);
  return normal instanceof PDFStream ? normal : null;
}

export function hasBackground(context: PDFContext, widget: PDFDict): boolean {
  const looks = context.lookup(widget.get(name('MK')));
  return looks instanceof PDFDict && numbersIn(context, looks.get(name('BG'))).length > 0;
}

/** Text in an appearance could otherwise read as a drawing command. Strings can nest. */
function withoutStrings(drawing: string): string {
  let kept = '';
  let depth = 0;
  for (let at = 0; at < drawing.length; at += 1) {
    const character = drawing.charAt(at);
    if (depth > 0 && character === '\\') at += 1;
    else if (character === '(') depth += 1;
    else if (character === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0) kept += character;
  }
  return kept.replace(HEX_STRINGS, ' ');
}

/** A drawing from the file is compressed, while one made during this save isn't yet. */
function contentsOf(appearance: PDFStream): Uint8Array {
  if (appearance instanceof PDFRawStream) return decodePDFRawStream(appearance).decode();
  if (appearance instanceof PDFContentStream) return appearance.getUnencodedContents();
  throw new Error('This form field’s drawing is in an unknown format.');
}

/** Whether a field paints a solid area, which would hide a signature beneath it. */
export function paintsSolid(context: PDFContext, widget: PDFDict, appearance: PDFStream): boolean {
  if (hasBackground(context, widget)) return true;
  try {
    const drawing = new TextDecoder('latin1').decode(contentsOf(appearance));
    return PAINTS_AREA.test(withoutStrings(drawing));
  } catch {
    // If its drawing can't be read, it's safest to assume that it could cover the signature.
    return true;
  }
}

/** Draws what an annotation shows into the page itself, fitted to its box as a viewer would. */
export function drawLooksIntoPage(
  page: PDFPage,
  annotation: PDFDict,
  appearance: PDFStream,
): boolean {
  const { context } = page.doc;
  const rect = rectOf(context, annotation);
  const box = numbersIn(context, appearance.dict.get(name('BBox')));
  const [boxLeft = 0, boxBottom = 0, boxRight = 0, boxTop = 0] = box;
  if (!rect || boxRight === boxLeft || boxTop === boxBottom) return false;

  const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = numbersIn(
    context,
    appearance.dict.get(name('Matrix')),
  );
  const { left, right, bottom, top } = boundsAround(
    [
      [boxLeft, boxBottom],
      [boxRight, boxBottom],
      [boxLeft, boxTop],
      [boxRight, boxTop],
    ].map(([x = 0, y = 0]) => ({ x: a * x + c * y + e, y: b * x + d * y + f })),
  );
  const scaleX = (rect.right - rect.left) / (right - left);
  const scaleY = (rect.top - rect.bottom) / (top - bottom);

  const appearanceRef = context.getObjectRef(appearance);
  if (!appearanceRef) return false;
  const key = page.node.newXObject('FieldLooks', appearanceRef);
  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(
      scaleX,
      0,
      0,
      scaleY,
      rect.left - left * scaleX,
      rect.bottom - bottom * scaleY,
    ),
    drawObject(key),
    popGraphicsState(),
  );
  return true;
}

/** Leaves a field showing nothing, keeping the state a checkbox or radio button is in. */
export function blankLooks(context: PDFContext, widget: PDFDict, appearance: PDFStream): void {
  const box = numbersIn(context, appearance.dict.get(name('BBox')));
  const empty = context.register(context.formXObject([], { BBox: [...box] }));
  const state = context.lookup(widget.get(name('AS')));
  const stateful = normalLook(context, widget) instanceof PDFDict && state instanceof PDFName;
  widget.set(
    name('AP'),
    context.obj({ N: stateful ? context.obj({ [state.decodeText()]: empty }) : empty }),
  );
  const looks = context.lookup(widget.get(name('MK')));
  if (looks instanceof PDFDict) {
    looks.delete(name('BG'));
    looks.delete(name('BC'));
  }
}

/**
 * Viewers always paint form fields last, in whatever order the file lists them, so nothing can sit
 * on top of a solid one. So what the field shows moves down into the page, where other things can
 * go over it.
 */
export function moveFieldLooksIntoPage(
  page: PDFPage,
  widget: PDFDict,
  appearance: PDFStream,
): boolean {
  if (!drawLooksIntoPage(page, widget, appearance)) return false;
  blankLooks(page.doc.context, widget, appearance);
  return true;
}
