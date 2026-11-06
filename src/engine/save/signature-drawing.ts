import {
  concatTransformationMatrix,
  degrees,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
  type PDFImage,
  type PDFPage,
} from '@cantoo/pdf-lib';
import type { PdfImagePlacement } from '../signatures/placement';
import { annotationsOver, boundsAround, isWidget, name, type UserBounds } from './page-annotations';

const PRINT_FLAG = 4;

const PICTURE_NAME = 'Signature';

/** A PDF image turns anticlockwise around its lower-left corner, which is where x and y are. */
export function boundsOfPlacement({ x, y, width, height, rotate }: PdfImagePlacement): UserBounds {
  const radians = (rotate * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return boundsAround([
    { x, y },
    { x: x + width * cos, y: y + width * sin },
    { x: x - height * sin, y: y + height * cos },
    { x: x + (width * cos - height * sin), y: y + (width * sin + height * cos) },
  ]);
}

/** Added last, so it's painted after any other annotation beneath it. */
function addStamp(
  page: PDFPage,
  picture: PDFImage,
  placed: PdfImagePlacement,
  bounds: UserBounds,
): void {
  const { context } = page.doc;
  const radians = (placed.rotate * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const appearance = context.formXObject(
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
  const annotation = context.obj({
    Type: 'Annot',
    Subtype: 'Stamp',
    Rect: [bounds.left, bounds.bottom, bounds.right, bounds.top],
    F: PRINT_FLAG,
    AP: { N: context.register(appearance) },
  });
  page.node.addAnnot(context.register(annotation));
}

/**
 * Draws on the page where it can, so the signature becomes part of it. Other annotations always
 * paint above the page, but in the order the file lists them, so over those it's added as a stamp.
 */
export function drawSignaturePicture(
  page: PDFPage,
  picture: PDFImage,
  placed: PdfImagePlacement,
): void {
  const bounds = boundsOfPlacement(placed);
  const { context } = page.doc;
  const overAnnotation = annotationsOver(page, bounds).some(
    (annotation) => !isWidget(context, annotation),
  );
  if (overAnnotation) addStamp(page, picture, placed, bounds);
  else page.drawImage(picture, { ...placed, rotate: degrees(placed.rotate) });
}
