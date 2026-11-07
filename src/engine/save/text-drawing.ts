import {
  PDFHexString,
  beginText,
  degrees,
  endText,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  rotateDegrees,
  setFillingRgbColor,
  setFontAndSize,
  showText,
  translate,
  type PDFFont,
  type PDFPage,
} from '@cantoo/pdf-lib';
import { displayToUser, userAngle } from '../coordinates';
import type { Color, TextBox } from '../edits/model';
import type { EmbeddedFont } from '../fonts/embedded';
import { pageBoxOf } from './page-geometry';

export type DrawFont =
  | { readonly kind: 'pdf-font'; readonly font: PDFFont }
  | { readonly kind: 'embedded'; readonly font: EmbeddedFont };

function toRgb({ r, g, b }: Color) {
  return rgb(r, g, b);
}

export function drawLines(page: PDFPage, box: TextBox, font: DrawFont): void {
  const pageBox = pageBoxOf(page);
  const unit = pageBox.unit ?? 1;
  const { size: displaySize, align, color } = box.style;
  const size = displaySize / unit;
  const radians = (box.angle * Math.PI) / 180;
  const along = { x: Math.cos(radians), y: Math.sin(radians) };
  const across = { x: -Math.sin(radians), y: Math.cos(radians) };
  const angle = userAngle(box.angle, pageBox.rotation);

  box.lines.forEach((line, index) => {
    if (line === '') return;
    const width =
      (font.kind === 'embedded'
        ? font.font.widthOf(line, size)
        : font.font.widthOfTextAtSize(line, size)) * unit;
    const indent =
      align === 'center'
        ? (box.rect.width - width) / 2
        : align === 'right'
          ? box.rect.width - width
          : 0;
    const down = box.firstBaseline + index * box.lineHeight;
    const origin = displayToUser(
      {
        x: box.rect.x + along.x * indent + across.x * down,
        y: box.rect.y + along.y * indent + across.y * down,
      },
      pageBox,
    );

    if (font.kind === 'pdf-font') {
      page.drawText(line, {
        x: origin.x,
        y: origin.y,
        size,
        font: font.font,
        color: toRgb(color),
        rotate: degrees(angle),
      });
      return;
    }
    const hex = font.font.encode(line);
    if (hex === null) throw new Error(`The file’s own font can’t draw this line: ${line}`);
    page.pushOperators(
      pushGraphicsState(),
      translate(origin.x, origin.y),
      rotateDegrees(angle),
      setFillingRgbColor(color.r, color.g, color.b),
      beginText(),
      setFontAndSize(font.font.resourceName, size),
      showText(PDFHexString.of(hex)),
      endText(),
      popGraphicsState(),
    );
  });
}

export function drawCovers(page: PDFPage, box: TextBox): void {
  const pageBox = pageBoxOf(page);
  const unit = pageBox.unit ?? 1;
  for (const { rect, angle, color } of box.covers) {
    const radians = (angle * Math.PI) / 180;
    // PDF rectangles grow from their lower-left corner, which is the display's bottom left.
    const corner = displayToUser(
      {
        x: rect.x - Math.sin(radians) * rect.height,
        y: rect.y + Math.cos(radians) * rect.height,
      },
      pageBox,
    );
    page.drawRectangle({
      x: corner.x,
      y: corner.y,
      width: rect.width / unit,
      height: rect.height / unit,
      rotate: degrees(userAngle(angle, pageBox.rotation)),
      color: toRgb(color),
      borderWidth: 0,
    });
  }
}
