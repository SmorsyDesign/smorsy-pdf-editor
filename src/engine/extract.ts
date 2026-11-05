import type { OriginalFont, Rect } from './edits/model';

export interface RawTextItem {
  readonly text: string;
  /** Text matrix already converted to display space at 100%: y runs down. */
  readonly matrix: readonly [number, number, number, number, number, number];
  readonly width: number;
  readonly fontKey: string;
}

export interface FontFacts extends OriginalFont {
  /** Height above the baseline, as a share of the font size. */
  readonly ascent: number;
  readonly descent: number;
}

export type ReadOnlyReason = 'skewed' | 'complex-script' | null;

export interface TextLine {
  readonly text: string;
  /** Top left of the line as displayed, before its angle is applied. */
  readonly rect: Rect;
}

export interface TextBlock {
  readonly id: string;
  readonly pageNumber: number;
  readonly text: string;
  readonly lines: readonly TextLine[];
  readonly rect: Rect;
  readonly angle: number;
  readonly size: number;
  readonly firstBaseline: number;
  readonly lineHeight: number;
  readonly font: OriginalFont;
  /** True when the block has more than one font, so one style can't fully match it. */
  readonly mixedStyles: boolean;
  readonly readOnly: ReadOnlyReason;
}

export interface PageText {
  readonly blocks: readonly TextBlock[];
  readonly scanned: boolean;
}

const UNKNOWN_FONT: FontFacts = {
  name: '',
  serif: false,
  monospace: false,
  type3: false,
  bold: false,
  italic: false,
  ascent: 0.8,
  descent: 0.2,
};

// Scripts whose letters join or reorder, which drawing one glyph at a time gets wrong.
const COMPLEX_SCRIPT = /[֐-ࣿऀ-෿฀-࿿က-႟יִ-ﻼ]/;

const SAME_LINE_TOLERANCE = 0.35;
const WORD_GAP = 0.15;
const COLUMN_GAP = 1.5;
const MAX_LINE_SPACING = 1.7;
const MIN_LINE_SPACING = 0.6;
const SAME_SIZE_TOLERANCE = 0.5;
const SKEW_TOLERANCE = 0.01;

interface PlacedItem {
  readonly text: string;
  readonly along: number;
  readonly across: number;
  readonly width: number;
  readonly size: number;
  readonly angle: number;
  readonly skewed: boolean;
  readonly fontKey: string;
}

function placeItem(item: RawTextItem): PlacedItem {
  const [a, b, c, d, e, f] = item.matrix;
  const angleRadians = Math.atan2(b, a);
  const cos = Math.cos(angleRadians);
  const sin = Math.sin(angleRadians);
  const size = Math.hypot(c, d);
  const dot = (a * c + b * d) / (Math.hypot(a, b) * size || 1);
  return {
    text: item.text,
    along: e * cos + f * sin,
    across: -e * sin + f * cos,
    width: item.width,
    size,
    angle: (angleRadians * 180) / Math.PI,
    skewed: Math.abs(dot) > SKEW_TOLERANCE,
    fontKey: item.fontKey,
  };
}

interface WorkingLine {
  readonly items: PlacedItem[];
  text: string;
  start: number;
  end: number;
  readonly across: number;
  readonly angle: number;
  readonly size: number;
  fontKey: string;
  fontLengths: Map<string, number>;
  skewed: boolean;
}

function startLine(item: PlacedItem): WorkingLine {
  return {
    items: [item],
    text: item.text,
    start: item.along,
    end: item.along + item.width,
    across: item.across,
    angle: item.angle,
    size: item.size,
    fontKey: item.fontKey,
    fontLengths: new Map([[item.fontKey, item.text.length]]),
    skewed: item.skewed,
  };
}

function extendLine(line: WorkingLine, item: PlacedItem): void {
  const gap = item.along - line.end;
  const needsSpace =
    gap > line.size * WORD_GAP && !line.text.endsWith(' ') && !item.text.startsWith(' ');
  line.items.push(item);
  line.text += (needsSpace ? ' ' : '') + item.text;
  line.end = Math.max(line.end, item.along + item.width);
  line.skewed ||= item.skewed;
  line.fontLengths.set(item.fontKey, (line.fontLengths.get(item.fontKey) ?? 0) + item.text.length);
}

function dominantFont(lengths: Map<string, number>): string {
  let best = '';
  let bestLength = -1;
  for (const [font, length] of lengths) {
    if (length > bestLength) {
      best = font;
      bestLength = length;
    }
  }
  return best;
}

function buildLines(items: readonly PlacedItem[]): WorkingLine[] {
  const sorted = [...items].sort((first, second) => {
    const sameLine =
      Math.abs(first.across - second.across) <=
      Math.max(first.size, second.size) * SAME_LINE_TOLERANCE;
    return sameLine ? first.along - second.along : first.across - second.across;
  });

  const lines: WorkingLine[] = [];
  for (const item of sorted) {
    const line = lines.find(
      (candidate) =>
        Math.abs(candidate.angle - item.angle) < 0.5 &&
        Math.abs(candidate.across - item.across) <= candidate.size * SAME_LINE_TOLERANCE &&
        item.along - candidate.end < candidate.size * COLUMN_GAP &&
        item.along + item.width > candidate.start,
    );
    if (line) extendLine(line, item);
    else lines.push(startLine(item));
  }
  for (const line of lines) {
    line.fontKey = dominantFont(line.fontLengths);
    line.text = line.text.trim();
  }
  return lines.filter((line) => line.text.length > 0);
}

function belongsToBlock(block: WorkingLine[], line: WorkingLine): boolean {
  const last = block.at(-1);
  if (!last) return false;
  if (Math.abs(last.angle - line.angle) >= 0.5) return false;
  if (last.fontKey !== line.fontKey || Math.abs(last.size - line.size) > SAME_SIZE_TOLERANCE) {
    return false;
  }
  const spacing = (line.across - last.across) / last.size;
  if (spacing < MIN_LINE_SPACING || spacing > MAX_LINE_SPACING) return false;
  return Math.max(last.start, line.start) < Math.min(last.end, line.end);
}

function buildBlock(
  lines: readonly WorkingLine[],
  id: string,
  pageNumber: number,
  fonts: ReadonlyMap<string, FontFacts>,
): TextBlock {
  const [first] = lines;
  if (!first) throw new Error('A block needs at least one line.');
  const facts = fonts.get(first.fontKey) ?? UNKNOWN_FONT;
  const ascent = first.size * facts.ascent;
  const descent = first.size * facts.descent;
  const start = Math.min(...lines.map((line) => line.start));
  const end = Math.max(...lines.map((line) => line.end));
  const last = lines.at(-1) ?? first;
  const radians = (first.angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  // Converts from along/across the text back to page position.
  const toPage = (along: number, across: number) => ({
    x: along * cos - across * sin,
    y: along * sin + across * cos,
  });
  const lineRects = lines.map((line) => {
    const corner = toPage(line.start, line.across - ascent);
    return {
      text: line.text,
      rect: { ...corner, width: line.end - line.start, height: ascent + descent },
    };
  });
  const lineHeight =
    lines.length > 1 ? (last.across - first.across) / (lines.length - 1) : first.size * 1.2;
  const text = lines.map((line) => line.text).join(' ');
  const skewed = lines.some((line) => line.skewed);
  const fontKinds = new Set(lines.flatMap((line) => [...line.fontLengths.keys()]));

  return {
    id,
    pageNumber,
    text,
    lines: lineRects,
    rect: {
      ...toPage(start, first.across - ascent),
      width: end - start,
      height: last.across - first.across + ascent + descent,
    },
    angle: first.angle,
    size: first.size,
    firstBaseline: ascent,
    lineHeight,
    font: facts,
    mixedStyles: fontKinds.size > 1,
    readOnly: skewed ? 'skewed' : COMPLEX_SCRIPT.test(text) ? 'complex-script' : null,
  };
}

/** Turns positioned pieces of text into the lines and paragraphs a person would see. */
export function groupTextItems(
  items: readonly RawTextItem[],
  pageNumber: number,
  fonts: ReadonlyMap<string, FontFacts>,
): readonly TextBlock[] {
  const placed = items.filter((item) => item.text.length > 0).map(placeItem);
  const groups: WorkingLine[][] = [];
  const lines = buildLines(placed).sort((first, second) => first.across - second.across);
  for (const line of lines) {
    const group = groups.find((candidate) => belongsToBlock(candidate, line));
    if (group) group.push(line);
    else groups.push([line]);
  }
  return groups.map((group, index) =>
    buildBlock(group, `page-${pageNumber}-block-${index}`, pageNumber, fonts),
  );
}

/** Files restricted by an owner password open normally, but can't be re-saved faithfully yet. */
export function isEncrypted(bytes: Uint8Array): boolean {
  return /\/Encrypt\s+(\d+\s+\d+\s+R|<<)/.test(new TextDecoder('latin1').decode(bytes));
}

/**
 * A signature dictionary has to record which bytes it covers, and it sits outside compressed
 * streams so it can be located, which makes this search dependable and fast on large files.
 */
export function hasDigitalSignature(bytes: Uint8Array): boolean {
  return new TextDecoder('latin1').decode(bytes).includes('/ByteRange');
}
