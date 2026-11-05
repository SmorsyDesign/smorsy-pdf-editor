import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  decodePDFRawStream,
  type PDFContext,
  type PDFPage,
} from '@cantoo/pdf-lib';
import { cleanFontName } from './match';

export interface CharacterCode {
  readonly code: number;
  readonly bytes: number;
}

export interface EmbeddedFont {
  /** The font's name in the page's resources, used to draw with it. */
  readonly resourceName: string;
  /** The characters as hex codes for this font, or null if any is missing from it. */
  encode(text: string): string | null;
  missing(text: string): readonly string[];
  widthOf(text: string, size: number): number;
}

const FULL_EMBEDDING_FORBIDDEN = 0x0002;
const BITMAP_ONLY = 0x0200;
const EDITABLE = 0x0008;

/** Reads a font's own licence flag. Only installable and editable fonts may go in an edited PDF. */
export function embeddingAllowed(font: Uint8Array): boolean {
  if (font.length < 12) return false;
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const tables = view.getUint16(4);
  for (let index = 0; index < tables; index += 1) {
    const entry = 12 + index * 16;
    if (entry + 16 > font.length) return false;
    const tag = String.fromCharCode(...font.subarray(entry, entry + 4));
    if (tag !== 'OS/2') continue;
    const fsTypeAt = view.getUint32(entry + 8) + 8;
    if (fsTypeAt + 2 > font.length) return false;
    const fsType = view.getUint16(fsTypeAt);
    if (fsType & (FULL_EMBEDDING_FORBIDDEN | BITMAP_ONLY)) return false;
    return fsType === 0 || (fsType & EDITABLE) !== 0;
  }
  return false;
}

function hexToText(hex: string): string {
  let text = '';
  for (let at = 0; at + 4 <= hex.length; at += 4) {
    text += String.fromCharCode(parseInt(hex.slice(at, at + 4), 16));
  }
  return text;
}

/**
 * Reverses a ToUnicode map, because editing needs text-to-code rather than code-to-text. A
 * character mapped from several codes is left out: a file could label a "9" glyph as "1", and
 * typing "1" would then silently paint "9". Characters left out use a bundled font instead.
 */
export function parseToUnicode(cmap: string): Map<string, CharacterCode> {
  const map = new Map<string, CharacterCode>();
  const ambiguous = new Set<string>();
  const add = (code: number, bytes: number, text: string) => {
    const existing = map.get(text);
    if (existing && existing.code !== code) ambiguous.add(text);
    else map.set(text, { code, bytes });
  };

  for (const section of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const entry of (section[1] ?? '').matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      const [, code = '', text = ''] = entry;
      add(parseInt(code, 16), code.length / 2, hexToText(text));
    }
  }
  for (const section of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const pattern = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]+)>|\[([^\]]*)\])/g;
    for (const entry of (section[1] ?? '').matchAll(pattern)) {
      const [, startHex = '', endHex = '', targetHex, targets] = entry;
      const start = parseInt(startHex, 16);
      const end = parseInt(endHex, 16);
      const bytes = startHex.length / 2;
      if (targets !== undefined) {
        [...targets.matchAll(/<([0-9a-fA-F]+)>/g)].forEach((item, offset) => {
          add(start + offset, bytes, hexToText(item[1] ?? ''));
        });
      } else if (targetHex !== undefined) {
        const base = hexToText(targetHex);
        const last = base.charCodeAt(base.length - 1);
        for (let code = start; code <= end; code += 1) {
          add(code, bytes, base.slice(0, -1) + String.fromCharCode(last + code - start));
        }
      }
    }
  }
  for (const text of ambiguous) map.delete(text);
  return map;
}

function resolveDict(context: PDFContext, value: unknown): PDFDict | undefined {
  const resolved = value instanceof PDFRef ? context.lookup(value) : value;
  return resolved instanceof PDFDict ? resolved : undefined;
}

function readToUnicode(font: PDFDict, context: PDFContext): Map<string, CharacterCode> | null {
  const stream = context.lookup(font.get(PDFName.of('ToUnicode')));
  if (!(stream instanceof PDFRawStream)) return null;
  const decoded = decodePDFRawStream(stream).decode();
  return parseToUnicode(new TextDecoder('latin1').decode(decoded));
}

function numbersOf(array: PDFArray, context: PDFContext): (number | PDFArray)[] {
  return array.asArray().map((item) => {
    const value = context.lookup(item);
    if (value instanceof PDFNumber) return value.asNumber();
    return value instanceof PDFArray ? value : 0;
  });
}

/** Character widths in thousandths of the font size. */
function readWidths(font: PDFDict, context: PDFContext): (code: number) => number {
  const descendants = context.lookup(font.get(PDFName.of('DescendantFonts')));
  if (descendants instanceof PDFArray) {
    const cid = resolveDict(context, descendants.get(0));
    const fallback = context.lookup(cid?.get(PDFName.of('DW')));
    const standard = fallback instanceof PDFNumber ? fallback.asNumber() : 1000;
    const widths = new Map<number, number>();
    const table = context.lookup(cid?.get(PDFName.of('W')));
    if (table instanceof PDFArray) {
      const items = numbersOf(table, context);
      for (let at = 0; at < items.length;) {
        const first = items[at];
        const second = items[at + 1];
        if (typeof first !== 'number') break;
        if (second instanceof PDFArray) {
          numbersOf(second, context).forEach((width, offset) => {
            if (typeof width === 'number') widths.set(first + offset, width);
          });
          at += 2;
        } else {
          const width = items[at + 2];
          if (typeof second === 'number' && typeof width === 'number') {
            for (let code = first; code <= second; code += 1) widths.set(code, width);
          }
          at += 3;
        }
      }
    }
    return (code) => widths.get(code) ?? standard;
  }

  const firstChar = context.lookup(font.get(PDFName.of('FirstChar')));
  const start = firstChar instanceof PDFNumber ? firstChar.asNumber() : 0;
  const table = context.lookup(font.get(PDFName.of('Widths')));
  const widths = table instanceof PDFArray ? numbersOf(table, context) : [];
  return (code) => {
    const width = widths[code - start];
    return typeof width === 'number' ? width : 0;
  };
}

/**
 * Finds a font already in the page, for reuse. Fonts with no ToUnicode map return null: without
 * one there's no reliable way to know which code draws which letter.
 */
export function findEmbeddedFont(
  page: PDFPage,
  context: PDFContext,
  name: string,
): EmbeddedFont | null {
  const fonts = page.node.normalizedEntries().Font;
  const wanted = cleanFontName(name);
  for (const [key, value] of fonts.entries()) {
    const font = resolveDict(context, value);
    const baseFont = font?.get(PDFName.of('BaseFont'));
    if (!font || !(baseFont instanceof PDFName)) continue;
    if (cleanFontName(baseFont.decodeText()) !== wanted) continue;
    const codes = readToUnicode(font, context);
    if (!codes) return null;
    const widthOfCode = readWidths(font, context);
    const missing = (text: string) => [
      ...new Set(Array.from(text).filter((character) => !codes.has(character))),
    ];
    return {
      resourceName: key.decodeText(),
      missing,
      encode(text) {
        if (missing(text).length > 0) return null;
        let hex = '';
        for (const character of text) {
          const entry = codes.get(character);
          if (entry) hex += entry.code.toString(16).padStart(entry.bytes * 2, '0');
        }
        return hex;
      },
      widthOf(text, size) {
        let total = 0;
        for (const character of text) {
          const entry = codes.get(character);
          if (entry) total += widthOfCode(entry.code);
        }
        return (total / 1000) * size;
      },
    };
  }
  return null;
}
