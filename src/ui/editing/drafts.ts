import type { Cover, OriginalFont, Rect, TextBox, TextStyle } from '../../engine/edits/model';
import type { TextBlock } from '../../engine/extract';
import { styleFromName } from '../../engine/fonts/match';
import type { PageSize } from '../../engine/zoom';
import { samplePageColours } from './samplePage';

export type DraftKind = 'add' | 'replace' | 'update';

/** What the editor is working on, before it becomes an edit. */
export interface TextDraft {
  readonly kind: DraftKind;
  readonly id: string;
  readonly pageNumber: number;
  readonly rect: Rect;
  readonly angle: number;
  readonly text: string;
  readonly firstBaseline: number;
  readonly lineHeight: number;
  readonly style: TextStyle;
  readonly covers: readonly Cover[];
  readonly original: OriginalFont | null;
  /** True when a patch would show, because the background isn't one colour. */
  readonly backgroundNotFlat: boolean;
  /** True when the text being replaced had several styles, and the edit will have one. */
  readonly mixedStyles: boolean;
  /** What was typed before an edit failed. Never counts as unchanged, so a retry can't lose it. */
  readonly retry?: { readonly text: string; readonly rect: Rect; readonly style: TextStyle };
}

const DEFAULT_SIZE = 12;
const DEFAULT_WIDTH = 240;
const COVER_PADDING = 1;
const RIGHT_MARGIN = 36;
const WRAP_TOLERANCE = 2;

export function draftForNewText(
  pageNumber: number,
  x: number,
  y: number,
  page: PageSize,
): TextDraft {
  return {
    kind: 'add',
    id: `added-${crypto.randomUUID()}`,
    pageNumber,
    rect: {
      x,
      y,
      width: Math.max(48, Math.min(DEFAULT_WIDTH, page.width - x - RIGHT_MARGIN)),
      height: DEFAULT_SIZE * 1.4,
    },
    angle: 0,
    text: '',
    firstBaseline: DEFAULT_SIZE,
    lineHeight: DEFAULT_SIZE * 1.3,
    style: {
      font: 'sans',
      size: DEFAULT_SIZE,
      color: { r: 0, g: 0, b: 0 },
      bold: false,
      italic: false,
      align: 'left',
    },
    covers: [],
    original: null,
    backgroundNotFlat: false,
    mixedStyles: false,
  };
}

export function draftForBlock(
  block: TextBlock,
  page: PageSize,
  pageElement: HTMLElement,
  scale: number,
): TextDraft {
  const { background, flat, text } = samplePageColours(pageElement, block.rect, block.angle, scale);
  const named = styleFromName(block.font.name);
  // One line can run on to the page margin. A paragraph keeps its own width, so it still fits.
  const roomToRight =
    block.angle === 0
      ? Math.max(block.rect.width, page.width - block.rect.x - RIGHT_MARGIN)
      : block.rect.width;
  return {
    kind: 'replace',
    id: block.id,
    pageNumber: block.pageNumber,
    rect: {
      ...block.rect,
      // The small extra stops a paragraph re-wrapping because of tiny rounding in measured widths.
      width: block.lines.length === 1 ? roomToRight : block.rect.width + WRAP_TOLERANCE,
    },
    angle: block.angle,
    text: block.text,
    firstBaseline: block.firstBaseline,
    lineHeight: block.lineHeight,
    style: {
      font: 'original',
      size: block.size,
      color: text,
      bold: named.bold || block.font.bold,
      italic: named.italic || block.font.italic,
      align: 'left',
    },
    covers: block.lines.map((line) => ({
      rect: {
        x: line.rect.x - COVER_PADDING,
        y: line.rect.y - COVER_PADDING,
        width: line.rect.width + COVER_PADDING * 2,
        height: line.rect.height + COVER_PADDING * 2,
      },
      angle: block.angle,
      color: background,
    })),
    original: block.font,
    backgroundNotFlat: !flat,
    mixedStyles: block.mixedStyles,
  };
}

export function draftForBox(box: TextBox): TextDraft {
  return { ...box, kind: 'update', backgroundNotFlat: false, mixedStyles: false };
}
