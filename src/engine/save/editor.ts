import fontkit from '@cantoo/fontkit';
import {
  PDFDocument,
  PDFHexString,
  beginText,
  endText,
  degrees,
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
import { displayToUser, userAngle, type PageBox } from '../coordinates';
import type { Color, TextBox } from '../edits/model';
import { embeddingAllowed, findEmbeddedFont, type EmbeddedFont } from '../fonts/embedded';
import {
  bundledFaceFile,
  closestBundled,
  isTimesNewRoman,
  standardFontFor,
  styleFromName,
  type BundledFamily,
} from '../fonts/match';

export type FontUsed = 'embedded' | 'standard' | 'system' | 'bundled';
export type FontMatch = 'exact' | 'same-widths' | 'closest';

export interface FontOutcome {
  readonly used: FontUsed;
  readonly match: FontMatch;
  readonly family?: BundledFamily;
  /** Characters that sent it past the file's own font. */
  readonly missing: readonly string[];
}

export type SystemFontStyle = 'regular' | 'bold' | 'italic' | 'bold-italic';

/** Supplies font files, so the engine needs no knowledge of where they live. */
export interface FontBytes {
  bundled(file: string): Promise<Uint8Array>;
  system(style: SystemFontStyle): Promise<Uint8Array | null>;
}

type DrawFont =
  | { readonly kind: 'pdf-font'; readonly font: PDFFont }
  | { readonly kind: 'embedded'; readonly font: EmbeddedFont };

function pageBoxOf(page: PDFPage): PageBox {
  const { x, y, width, height } = page.getCropBox();
  return { x, y, width, height, rotation: ((page.getRotation().angle % 360) + 360) % 360 };
}

function toRgb({ r, g, b }: Color) {
  return rgb(r, g, b);
}

/** Stops whatever the page's own content left set from moving or scaling what's drawn after it. */
function isolateOriginalContent(doc: PDFDocument, page: PDFPage): void {
  const start = doc.context.register(doc.context.contentStream([pushGraphicsState()]));
  const end = doc.context.register(doc.context.contentStream([popGraphicsState()]));
  page.node.wrapContentStreams(start, end);
}

function usesOriginalFace(box: TextBox): boolean {
  if (!box.original) return false;
  const original = styleFromName(box.original.name);
  return box.style.bold === original.bold && box.style.italic === original.italic;
}

function systemStyle(bold: boolean, italic: boolean): SystemFontStyle {
  if (bold && italic) return 'bold-italic';
  if (bold) return 'bold';
  return italic ? 'italic' : 'regular';
}

/** Applies text edits to the original bytes. Every save starts again from those bytes. */
export class PdfEditor {
  private readonly original: Uint8Array;
  private readonly fonts: FontBytes;
  private inspection: Promise<PDFDocument> | null = null;

  constructor(original: Uint8Array, fonts: FontBytes) {
    this.original = original;
    this.fonts = fonts;
  }

  private async load(): Promise<PDFDocument> {
    const doc = await PDFDocument.load(this.original.slice());
    doc.registerFontkit(fontkit);
    return doc;
  }

  private async systemFontBytes(box: TextBox): Promise<Uint8Array | null> {
    const bytes = await this.fonts.system(systemStyle(box.style.bold, box.style.italic));
    return bytes && embeddingAllowed(bytes) ? bytes : null;
  }

  /** Follows the order in PLAN.md: the file's own font, then Times New Roman, then bundled. */
  async resolveFont(box: TextBox): Promise<FontOutcome> {
    const { font: chosen } = box.style;
    const text = box.lines.join('');
    if (chosen === 'times-new-roman') {
      const available = await this.systemFontBytes(box);
      return available
        ? { used: 'system', match: 'exact', missing: [] }
        : { used: 'bundled', match: 'same-widths', family: 'serif', missing: [] };
    }
    if (chosen !== 'original') {
      return { used: 'bundled', match: 'exact', family: chosen, missing: [] };
    }
    if (!box.original) {
      return { used: 'bundled', match: 'exact', family: 'sans', missing: [] };
    }

    let missing: readonly string[] = [];
    if (usesOriginalFace(box)) {
      if (standardFontFor(box.original.name)) {
        const unsupported = this.unsupportedByStandard(text);
        if (unsupported.length === 0) return { used: 'standard', match: 'exact', missing: [] };
        missing = unsupported;
      } else if (!box.original.type3) {
        this.inspection ??= this.load();
        const doc = await this.inspection;
        const embedded = findEmbeddedFont(
          doc.getPage(box.pageNumber - 1),
          doc.context,
          box.original.name,
        );
        if (embedded) {
          missing = embedded.missing(text);
          if (missing.length === 0) return { used: 'embedded', match: 'exact', missing: [] };
        }
      }
    }

    if (isTimesNewRoman(box.original.name) && (await this.systemFontBytes(box))) {
      return { used: 'system', match: 'exact', missing };
    }
    const { family, sameWidths } = closestBundled(box.original);
    return { used: 'bundled', match: sameWidths ? 'same-widths' : 'closest', family, missing };
  }

  /** Standard fonts only cover Windows Latin characters. */
  private unsupportedByStandard(text: string): readonly string[] {
    return [
      ...new Set(Array.from(text).filter((character) => (character.codePointAt(0) ?? 0) > 0xff)),
    ];
  }

  private async drawFont(doc: PDFDocument, page: PDFPage, box: TextBox): Promise<DrawFont> {
    const outcome = await this.resolveFont(box);
    const { bold, italic } = box.style;
    switch (outcome.used) {
      case 'embedded': {
        const font = findEmbeddedFont(page, doc.context, box.original?.name ?? '');
        if (font) return { kind: 'embedded', font };
        break;
      }
      case 'standard':
        return { kind: 'pdf-font', font: await doc.embedFont(box.original?.name ?? 'Helvetica') };
      case 'system': {
        const bytes = await this.systemFontBytes(box);
        if (bytes) return { kind: 'pdf-font', font: await doc.embedFont(bytes, { subset: true }) };
        break;
      }
      case 'bundled':
        break;
    }
    const file = bundledFaceFile(outcome.family ?? 'sans', bold, italic);
    const bytes = await this.fonts.bundled(file);
    return { kind: 'pdf-font', font: await doc.embedFont(bytes, { subset: true }) };
  }

  private drawLines(page: PDFPage, box: TextBox, font: DrawFont): void {
    const pageBox = pageBoxOf(page);
    const { size, align, color } = box.style;
    const radians = (box.angle * Math.PI) / 180;
    const along = { x: Math.cos(radians), y: Math.sin(radians) };
    const across = { x: -Math.sin(radians), y: Math.cos(radians) };
    const angle = userAngle(box.angle, pageBox.rotation);

    box.lines.forEach((line, index) => {
      if (line === '') return;
      const width =
        font.kind === 'embedded'
          ? font.font.widthOf(line, size)
          : font.font.widthOfTextAtSize(line, size);
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
      if (hex === null) return;
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

  private drawCovers(page: PDFPage, box: TextBox): void {
    const pageBox = pageBoxOf(page);
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
        width: rect.width,
        height: rect.height,
        rotate: degrees(userAngle(angle, pageBox.rotation)),
        color: toRgb(color),
        borderWidth: 0,
      });
    }
  }

  async save(boxes: readonly TextBox[]): Promise<Uint8Array> {
    const doc = await this.load();
    const pageNumbers = [...new Set(boxes.map((box) => box.pageNumber))];
    for (const pageNumber of pageNumbers) {
      const page = doc.getPage(pageNumber - 1);
      const onPage = boxes.filter((box) => box.pageNumber === pageNumber);
      isolateOriginalContent(doc, page);
      // All covers go first, so a patch can never hide another box's new text.
      for (const box of onPage) this.drawCovers(page, box);
      for (const box of onPage) {
        if (box.lines.length > 0) this.drawLines(page, box, await this.drawFont(doc, page, box));
      }
    }
    return doc.save({ updateFieldAppearances: false });
  }
}
