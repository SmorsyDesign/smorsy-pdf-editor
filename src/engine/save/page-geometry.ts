import { PDFName, PDFNumber, rgb, type PDFPage } from '@cantoo/pdf-lib';
import { displayToUser, type PageBox } from '../coordinates';
import { boundsOfAnnotation, type Annotation } from '../edits/annotations';
import type { TextBox } from '../edits/model';
import { boundsAround, type UserBounds } from './page-annotations';

/** The visible page is where the crop box and media box overlap, which is what pdf.js shows. */
export function pageBoxOf(page: PDFPage): PageBox {
  const crop = page.getCropBox();
  const media = page.getMediaBox();
  const x = Math.max(crop.x, media.x);
  const y = Math.max(crop.y, media.y);
  const width = Math.min(crop.x + crop.width, media.x + media.width) - x;
  const height = Math.min(crop.y + crop.height, media.y + media.height) - y;
  const unit = page.node.lookup(PDFName.of('UserUnit'));
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  // A crop box that shows nothing is ignored, which is what pdf.js does when it draws the page.
  const visible = width > 0 && height > 0 ? { x, y, width, height } : media;
  return {
    x: visible.x,
    y: visible.y,
    width: visible.width,
    height: visible.height,
    rotation,
    unit: unit instanceof PDFNumber && unit.asNumber() > 0 ? unit.asNumber() : 1,
  };
}

/** The space a text box takes up in the PDF, so a solid field there can be dealt with. */
export function textBoxBounds(box: TextBox, pageBox: PageBox): UserBounds {
  const { x, y, width, height } = box.rect;
  const radians = (box.angle * Math.PI) / 180;
  return boundsAround(
    [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ].map(([across = 0, down = 0]) =>
      displayToUser(
        {
          x: x + across * Math.cos(radians) - down * Math.sin(radians),
          y: y + across * Math.sin(radians) + down * Math.cos(radians),
        },
        pageBox,
      ),
    ),
  );
}

export function boundsOfWhiteout(mark: Annotation, box: PageBox): UserBounds {
  const { x, y, width, height } = boundsOfAnnotation(mark);
  return boundsAround([
    displayToUser({ x, y }, box),
    displayToUser({ x: x + width, y: y + height }, box),
  ]);
}

/** Painted into the page, so it covers what's there. It doesn't remove it, and the app says so. */
export function drawWhiteout(page: PDFPage, mark: Annotation, box: PageBox): void {
  const { left, right, bottom, top } = boundsOfWhiteout(mark, box);
  page.drawRectangle({
    x: left,
    y: bottom,
    width: right - left,
    height: top - bottom,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });
}
