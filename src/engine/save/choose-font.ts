import fontkit from '@cantoo/fontkit';
import type { PDFDocument } from '@cantoo/pdf-lib';
import type { TextBox } from '../edits/model';
import { embeddingAllowed, findEmbeddedFont } from '../fonts/embedded';
import {
  bundledFaceFile,
  closestBundled,
  isTimesNewRoman,
  standardFontFor,
  styleFromName,
  type BundledFamily,
} from '../fonts/match';

type FontUsed = 'embedded' | 'standard' | 'system' | 'bundled';
type FontMatch = 'exact' | 'same-widths' | 'closest';

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

interface ParsedFont {
  hasGlyphForCodePoint(codePoint: number): boolean;
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

/** Tells a system face apart from the others, so each is only read and embedded once. */
export function systemFontKey(box: TextBox): string {
  return `system-${systemStyle(box.style.bold, box.style.italic)}`;
}

const uniqueCharacters = (text: string) => [...new Set(Array.from(text))];

/** Decides which font each edit is drawn with, following the order in PLAN.md. */
export class FontChooser {
  private readonly load: () => Promise<PDFDocument>;
  private readonly fonts: FontBytes;
  private inspection: Promise<PDFDocument> | null = null;
  private readonly parsed = new Map<string, Promise<ParsedFont>>();

  constructor(load: () => Promise<PDFDocument>, fonts: FontBytes) {
    this.load = load;
    this.fonts = fonts;
  }

  private inspect(): Promise<PDFDocument> {
    this.inspection ??= this.load();
    return this.inspection;
  }

  async systemFontBytes(box: TextBox): Promise<Uint8Array | null> {
    const bytes = await this.fonts.system(systemStyle(box.style.bold, box.style.italic));
    return bytes && embeddingAllowed(bytes) ? bytes : null;
  }

  private parse(key: string, read: () => Promise<Uint8Array>): Promise<ParsedFont> {
    let font = this.parsed.get(key);
    if (!font) {
      font = read().then((bytes) => fontkit.create(bytes) as unknown as ParsedFont);
      this.parsed.set(key, font);
      // A failed read isn't kept, so the next try can still work.
      font.catch(() => {
        this.parsed.delete(key);
      });
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
    const uncovered = await this.uncoveredBy(box.lines.join(''), systemFontKey(box), () =>
      Promise.resolve(bytes),
    );
    return { used: 'system', match: 'exact', missing, uncovered };
  }

  /** Follows the order in PLAN.md: the file's own font, then Times New Roman, then bundled. */
  async resolve(box: TextBox): Promise<FontOutcome> {
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
}
