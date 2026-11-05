import fontkit from '@cantoo/fontkit';
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
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
import { displayToUser, userAngle, type PageBox } from '../coordinates';
import type { Color, TextBox } from '../edits/model';
import { UNSUPPORTED_TEXT, nameCharacter } from '../errors';
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
  /** Characters no available font can draw, so they can't be saved. */
  readonly uncovered: readonly string[];
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

interface ParsedFont {
  hasGlyphForCodePoint(codePoint: number): boolean;
}

/** The visible page is where the crop box and media box overlap, which is what pdf.js shows. */
function pageBoxOf(page: PDFPage): PageBox {
  const crop = page.getCropBox();
  const media = page.getMediaBox();
  const x = Math.max(crop.x, media.x);
  const y = Math.max(crop.y, media.y);
  const unit = page.node.get(PDFName.of('UserUnit'));
  return {
    x,
    y,
    width: Math.min(crop.x + crop.width, media.x + media.width) - x,
    height: Math.min(crop.y + crop.height, media.y + media.height) - y,
    rotation: ((page.getRotation().angle % 360) + 360) % 360,
    unit: unit instanceof PDFNumber ? unit.asNumber() : 1,
  };
}

function toRgb({ r, g, b }: Color) {
  return rgb(r, g, b);
}

function usesOriginalFace(box: TextBox): boolean {
  if (!box.original) return false;
  const named = styleFromName(box.original.name);
  return (
    box.style.bold === (named.bold || box.original.bold) &&
    box.style.italic === (named.italic || box.original.italic)
  );
}

function systemStyle(bold: boolean, italic: boolean): SystemFontStyle {
  if (bold && italic) return 'bold-italic';
  if (bold) return 'bold';
  return italic ? 'italic' : 'regular';
}

const uniqueCharacters = (text: string) => [...new Set(Array.from(text))];

/** Applies text edits to the original bytes. Every save starts again from those bytes. */
export class PdfEditor {
  private readonly original: Uint8Array;
  private readonly fonts: FontBytes;
  private inspection: Promise<PDFDocument> | null = null;
  private readonly parsed = new Map<string, Promise<ParsedFont>>();

  constructor(original: Uint8Array, fonts: FontBytes) {
    this.original = original;
    this.fonts = fonts;
  }

  private async load(): Promise<PDFDocument> {
    const doc = await PDFDocument.load(this.original.slice());
    doc.registerFontkit(fontkit);
    return doc;
  }

  private inspect(): Promise<PDFDocument> {
    this.inspection ??= this.load();
    return this.inspection;
  }

  private async systemFontBytes(box: TextBox): Promise<Uint8Array | null> {
    const bytes = await this.fonts.system(systemStyle(box.style.bold, box.style.italic));
    return bytes && embeddingAllowed(bytes) ? bytes : null;
  }

  private parse(key: string, read: () => Promise<Uint8Array>): Promise<ParsedFont> {
    let font = this.parsed.get(key);
    if (!font) {
      font = read().then((bytes) => fontkit.create(bytes) as unknown as ParsedFont);
      this.parsed.set(key, font);
    }
    return font;
  }

  private async uncoveredBy(
    text: string,
    key: string,
    read: () => Promise<Uint8Array>,
  ): Promise<readonly string[]> {
    const font = await this.parse(key, read);
    return uniqueCharacters(text).filter(
      (character) => !font.hasGlyphForCodePoint(character.codePointAt(0) ?? 0),
    );
  }

  private async bundledOutcome(
    box: TextBox,
    family: BundledFamily,
    match: FontMatch,
    missing: readonly string[],
  ): Promise<FontOutcome> {
    const file = bundledFaceFile(family, box.style.bold, box.style.italic);
    const uncovered = await this.uncoveredBy(box.lines.join(''), file, () =>
      this.fonts.bundled(file),
    );
    return { used: 'bundled', match, family, missing, uncovered };
  }

  private async systemOutcome(
    box: TextBox,
    bytes: Uint8Array,
    missing: readonly string[],
  ): Promise<FontOutcome> {
    const key = `system-${systemStyle(box.style.bold, box.style.italic)}`;
    const uncovered = await this.uncoveredBy(box.lines.join(''), key, () => Promise.resolve(bytes));
    return { used: 'system', match: 'exact', missing, uncovered };
  }

  /** Follows the order in PLAN.md: the file's own font, then Times New Roman, then bundled. */
  async resolveFont(box: TextBox): Promise<FontOutcome> {
    const { font: chosen } = box.style;
    const text = box.lines.join('');
    if (chosen === 'times-new-roman') {
      const bytes = await this.systemFontBytes(box);
      return bytes
        ? this.systemOutcome(box, bytes, [])
        : this.bundledOutcome(box, 'serif', 'same-widths', []);
    }
    if (chosen !== 'original') return this.bundledOutcome(box, chosen, 'exact', []);
    if (!box.original) return this.bundledOutcome(box, 'sans', 'exact', []);

    let missing: readonly string[] = [];
    if (usesOriginalFace(box)) {
      const standard = standardFontFor(box.original.name);
      if (standard) {
        const doc = await this.inspect();
        const supported = new Set((await doc.embedFont(standard)).getCharacterSet());
        missing = uniqueCharacters(text).filter(
          (character) => !supported.has(character.codePointAt(0) ?? 0),
        );
        if (missing.length === 0) {
          return { used: 'standard', match: 'exact', missing, uncovered: [] };
        }
      } else if (!box.original.type3) {
        const absent = await this.missingFromEmbedded(box, text);
        if (absent?.length === 0) {
          return { used: 'embedded', match: 'exact', missing: [], uncovered: [] };
        }
        missing = absent ?? [];
      }
    }

    if (isTimesNewRoman(box.original.name)) {
      const bytes = await this.systemFontBytes(box);
      if (bytes) return this.systemOutcome(box, bytes, missing);
    }
    const { family, sameWidths } = closestBundled(box.original);
    return this.bundledOutcome(box, family, sameWidths ? 'same-widths' : 'closest', missing);
  }

  /**
   * Only characters visibly drawn with this font on the page count as available. A file could
   * label an unused glyph wrongly, and typing that character would paint something else.
   */
  private async missingFromEmbedded(box: TextBox, text: string): Promise<readonly string[] | null> {
    const doc = await this.inspect();
    const font = findEmbeddedFont(
      doc.getPage(box.pageNumber - 1),
      doc.context,
      box.original?.name ?? '',
    );
    if (!font) return null;
    const known = new Set(Array.from(box.original?.knownCharacters ?? ''));
    const unknown = uniqueCharacters(text).filter((character) => !known.has(character));
    return [...new Set([...font.missing(text), ...unknown])];
  }

  private async drawFont(
    doc: PDFDocument,
    page: PDFPage,
    box: TextBox,
    embedded: Map<string, Promise<PDFFont>>,
  ): Promise<DrawFont> {
    const outcome = await this.resolveFont(box);
    if (outcome.uncovered.length > 0) {
      throw new Error(UNSUPPORTED_TEXT + outcome.uncovered.map(nameCharacter).join(' '));
    }
    const once = (key: string, make: () => Promise<PDFFont>) => {
      let font = embedded.get(key);
      if (!font) {
        font = make();
        embedded.set(key, font);
      }
      return font;
    };

    if (outcome.used === 'embedded') {
      const font = findEmbeddedFont(page, doc.context, box.original?.name ?? '');
      if (font) return { kind: 'embedded', font };
    }
    if (outcome.used === 'standard') {
      const name = box.original?.name ?? 'Helvetica';
      return { kind: 'pdf-font', font: await once(name, () => doc.embedFont(name)) };
    }
    if (outcome.used === 'system') {
      const bytes = await this.systemFontBytes(box);
      if (bytes) {
        const key = `system-${systemStyle(box.style.bold, box.style.italic)}`;
        const font = await once(key, () => doc.embedFont(bytes, { subset: true }));
        return { kind: 'pdf-font', font };
      }
    }
    const file = bundledFaceFile(outcome.family ?? 'sans', box.style.bold, box.style.italic);
    const font = await once(file, async () =>
      doc.embedFont(await this.fonts.bundled(file), { subset: true }),
    );
    return { kind: 'pdf-font', font };
  }

  private drawLines(page: PDFPage, box: TextBox, font: DrawFont): void {
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

  private drawCovers(page: PDFPage, box: TextBox): void {
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

  async save(boxes: readonly TextBox[]): Promise<Uint8Array> {
    const doc = await this.load();
    const embedded = new Map<string, Promise<PDFFont>>();
    const pageNumbers = [...new Set(boxes.map((box) => box.pageNumber))];
    for (const pageNumber of pageNumbers) {
      const page = doc.getPage(pageNumber - 1);
      const onPage = boxes.filter((box) => box.pageNumber === pageNumber);
      // All covers go first, so a patch can never hide another box's new text.
      for (const box of onPage) this.drawCovers(page, box);
      for (const box of onPage) {
        if (box.lines.length > 0) {
          this.drawLines(page, box, await this.drawFont(doc, page, box, embedded));
        }
      }
    }
    return doc.save({ updateFieldAppearances: false });
  }
}
