import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  concatTransformationMatrix,
  decodePDFRawStream,
  degrees,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
  type PDFContext,
  type PDFDocument,
  type PDFImage,
  type PDFObject,
  type PDFPage,
} from '@cantoo/pdf-lib';
import type { PdfImagePlacement } from '../signatures/placement';

interface UserBounds {
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
  readonly top: number;
}

const HIDDEN_FLAG = 2;
// These draw nothing of their own, so nothing placed beneath them is hidden.
const PAINTS_NOTHING = new Set(['/Link', '/Popup']);
const PICTURE_NAME = 'Signature';
const PRINT_FLAG = 4;
// Any fill or fill-and-stroke drawing command in an appearance.
const FILLS = /(^|\s)[fFbB]\*?(\s|$)/;

const name = (text: string) => PDFName.of(text);

function boundsOf({ x, y, width, height, rotate }: PdfImagePlacement): UserBounds {
  const radians = (rotate * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const xs = [0, width * cos, -height * sin, width * cos - height * sin].map((v) => x + v);
  const ys = [0, width * sin, height * cos, width * sin + height * cos].map((v) => y + v);
  return {
    left: Math.min(...xs),
    bottom: Math.min(...ys),
    right: Math.max(...xs),
    top: Math.max(...ys),
  };
}

function numbersIn(context: PDFContext, value: PDFObject | undefined): readonly number[] {
  const array = context.lookup(value);
  if (!(array instanceof PDFArray)) return [];
  return array.asArray().map((item) => {
    const number = context.lookup(item);
    return number instanceof PDFNumber ? number.asNumber() : 0;
  });
}

function rectOf(context: PDFContext, annotation: PDFDict): UserBounds | null {
  const [x1, y1, x2, y2] = numbersIn(context, annotation.get(name('Rect')));
  if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) return null;
  return {
    left: Math.min(x1, x2),
    bottom: Math.min(y1, y2),
    right: Math.max(x1, x2),
    top: Math.max(y1, y2),
  };
}

const overlap = (one: UserBounds, two: UserBounds) =>
  one.left < two.right && two.left < one.right && one.bottom < two.top && two.bottom < one.top;

function annotationsOver(page: PDFPage, bounds: UserBounds): readonly PDFDict[] {
  const annotations = page.node.Annots();
  if (!annotations) return [];
  const { context } = page.doc;
  const found: PDFDict[] = [];
  for (let index = 0; index < annotations.size(); index += 1) {
    const annotation = context.lookup(annotations.get(index));
    if (!(annotation instanceof PDFDict)) continue;
    const flags = context.lookup(annotation.get(name('F')));
    if (flags instanceof PDFNumber && flags.asNumber() & HIDDEN_FLAG) continue;
    const kind = context.lookup(annotation.get(name('Subtype')));
    if (kind instanceof PDFName && PAINTS_NOTHING.has(kind.toString())) continue;
    const rect = rectOf(context, annotation);
    if (rect && overlap(rect, bounds)) found.push(annotation);
  }
  return found;
}

const isWidget = (context: PDFContext, annotation: PDFDict) =>
  context.lookup(annotation.get(name('Subtype'))) === name('Widget');

function appearanceOf(context: PDFContext, widget: PDFDict): PDFRawStream | null {
  const appearances = context.lookup(widget.get(name('AP')));
  if (!(appearances instanceof PDFDict)) return null;
  const normal = context.lookup(appearances.get(name('N')));
  return normal instanceof PDFRawStream ? normal : null;
}

/** Whether a field paints a solid area, which would hide a signature beneath it. */
function paintsSolid(context: PDFContext, widget: PDFDict, appearance: PDFRawStream): boolean {
  const looks = context.lookup(widget.get(name('MK')));
  if (looks instanceof PDFDict && numbersIn(context, looks.get(name('BG'))).length > 0) return true;
  try {
    return FILLS.test(new TextDecoder('latin1').decode(decodePDFRawStream(appearance).decode()));
  } catch {
    // If its drawing can't be read, it's safest to assume that it could cover the signature.
    return true;
  }
}

/**
 * Viewers always paint form fields last, in whatever order the file lists them, so nothing can sit
 * on top of a solid one. So what the field shows moves down into the page, where the signature can
 * go over it, and the field itself stays, still fillable, but see-through.
 */
function moveFieldLooksIntoPage(
  doc: PDFDocument,
  page: PDFPage,
  widget: PDFDict,
  appearance: PDFRawStream,
): void {
  const { context } = doc;
  const rect = rectOf(context, widget);
  const box = numbersIn(context, appearance.dict.get(name('BBox')));
  const [boxLeft = 0, boxBottom = 0, boxRight = 0, boxTop = 0] = box;
  if (!rect || boxRight === boxLeft || boxTop === boxBottom) return;

  const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = numbersIn(
    context,
    appearance.dict.get(name('Matrix')),
  );
  const corners = [
    [boxLeft, boxBottom],
    [boxRight, boxBottom],
    [boxLeft, boxTop],
    [boxRight, boxTop],
  ].map(([x = 0, y = 0]) => ({ x: a * x + c * y + e, y: b * x + d * y + f }));
  const left = Math.min(...corners.map((corner) => corner.x));
  const right = Math.max(...corners.map((corner) => corner.x));
  const bottom = Math.min(...corners.map((corner) => corner.y));
  const top = Math.max(...corners.map((corner) => corner.y));
  const scaleX = (rect.right - rect.left) / (right - left);
  const scaleY = (rect.top - rect.bottom) / (top - bottom);

  const appearanceRef = context.getObjectRef(appearance);
  if (!appearanceRef) return;
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

  const empty = context.formXObject([], { BBox: [boxLeft, boxBottom, boxRight, boxTop] });
  widget.set(name('AP'), context.obj({ N: context.register(empty) }));
  const looks = context.lookup(widget.get(name('MK')));
  if (looks instanceof PDFDict) {
    looks.delete(name('BG'));
    looks.delete(name('BC'));
  }
}

/** Added last, so it's painted after any other annotation beneath it. */
function addStamp(
  doc: PDFDocument,
  page: PDFPage,
  picture: PDFImage,
  placed: PdfImagePlacement,
  bounds: UserBounds,
): void {
  const radians = (placed.rotate * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const appearance = doc.context.formXObject(
    [
      pushGraphicsState(),
      concatTransformationMatrix(
        placed.width * cos,
        placed.width * sin,
        -placed.height * sin,
        placed.height * cos,
        placed.x - bounds.left,
        placed.y - bounds.bottom,
      ),
      drawObject(name(PICTURE_NAME)),
      popGraphicsState(),
    ],
    {
      BBox: [0, 0, bounds.right - bounds.left, bounds.top - bounds.bottom],
      Resources: { XObject: { [PICTURE_NAME]: picture.ref } },
    },
  );
  const annotation = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Stamp',
    Rect: [bounds.left, bounds.bottom, bounds.right, bounds.top],
    F: PRINT_FLAG,
    AP: { N: doc.context.register(appearance) },
  });
  page.node.addAnnot(doc.context.register(annotation));
}

/**
 * Draws on the page where it can, so the signature becomes part of it. Annotations always paint
 * above the page, so anything solid over this spot has to be dealt with for it to be seen.
 */
export function drawSignaturePicture(
  doc: PDFDocument,
  page: PDFPage,
  picture: PDFImage,
  placed: PdfImagePlacement,
): void {
  const bounds = boundsOf(placed);
  const { context } = doc;
  let needsStamp = false;
  for (const annotation of annotationsOver(page, bounds)) {
    if (isWidget(context, annotation)) {
      const appearance = appearanceOf(context, annotation);
      if (appearance && paintsSolid(context, annotation, appearance)) {
        moveFieldLooksIntoPage(doc, page, annotation, appearance);
      }
    } else {
      needsStamp = true;
    }
  }
  if (needsStamp) addStamp(doc, page, picture, placed, bounds);
  else page.drawImage(picture, { ...placed, rotate: degrees(placed.rotate) });
}
