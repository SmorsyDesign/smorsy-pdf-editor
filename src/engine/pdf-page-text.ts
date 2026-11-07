import { Util, type PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { FontFacts, RawTextItem } from './extract';
import { styleFromName } from './fonts/match';

interface PdfJsFont {
  readonly name?: string;
  readonly bold?: boolean;
  readonly black?: boolean;
  readonly italic?: boolean;
  readonly isSerifFont?: boolean;
  readonly isMonospace?: boolean;
  readonly isType3Font?: boolean;
}

function readFontFacts(
  page: PDFPageProxy,
  fontKey: string,
  styles: Record<string, { ascent: number; descent: number; fontFamily: string }>,
): FontFacts {
  const font: PdfJsFont = page.commonObjs.has(fontKey)
    ? (page.commonObjs.get(fontKey) as PdfJsFont)
    : {};
  const style = styles[fontKey];
  const name = font.name ?? '';
  const named = styleFromName(name);
  return {
    name,
    bold: named.bold || font.bold === true || font.black === true,
    italic: named.italic || font.italic === true,
    serif: font.isSerifFont ?? style?.fontFamily === 'serif',
    monospace: font.isMonospace ?? style?.fontFamily === 'monospace',
    type3: font.isType3Font === true,
    ascent: style?.ascent || 0.8,
    descent: Math.abs(style?.descent ?? 0.2),
  };
}

/** What's known about each font the page's text uses, including which characters it has drawn. */
export function fontsInText(
  page: PDFPageProxy,
  content: Awaited<ReturnType<PDFPageProxy['getTextContent']>>,
): ReadonlyMap<string, FontFacts> {
  const fonts = new Map<string, FontFacts>();
  const drawn = new Map<string, Set<string>>();
  for (const item of content.items) {
    if (!('str' in item)) continue;
    if (!fonts.has(item.fontName)) {
      fonts.set(item.fontName, readFontFacts(page, item.fontName, content.styles));
      drawn.set(item.fontName, new Set());
    }
    const characters = drawn.get(item.fontName);
    for (const character of item.str) characters?.add(character);
  }
  for (const [key, facts] of fonts) {
    fonts.set(key, { ...facts, knownCharacters: [...(drawn.get(key) ?? [])].join('') });
  }
  return fonts;
}

export function rawItems(items: readonly object[], transform: number[]): RawTextItem[] {
  const raw: RawTextItem[] = [];
  for (const item of items) {
    if (!('str' in item)) continue;
    const text = item as { str: string; transform: number[]; width: number; fontName: string };
    const matrix = Util.transform(transform, text.transform) as number[];
    const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = matrix;
    raw.push({
      text: text.str,
      matrix: [a, b, c, d, e, f],
      width: text.width,
      fontKey: text.fontName,
    });
  }
  return raw;
}
