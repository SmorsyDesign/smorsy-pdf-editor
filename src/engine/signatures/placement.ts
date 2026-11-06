import { displayToUser, userAngle, type PageBox } from '../coordinates';
import type { Color, Rect, TextBox } from '../edits/model';
import type { PageSize } from '../zoom';

export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** Turns a point clockwise, as displayed: y goes down. */
function turned(x: number, y: number, angle: number) {
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

const middleOf = ({ x, y, width, height }: Rect) => ({ x: x + width / 2, y: y + height / 2 });

/** Centres a new signature on a point, keeping its shape and keeping it on the page. */
export function newPlacementRect(
  centreX: number,
  centreY: number,
  targetWidth: number,
  ratio: number,
  page: PageSize,
): Rect {
  let width = Math.min(targetWidth, page.width);
  let height = width / ratio;
  if (height > page.height) {
    height = page.height;
    width = height * ratio;
  }
  return {
    x: Math.min(page.width - width, Math.max(0, centreX - width / 2)),
    y: Math.min(page.height - height, Math.max(0, centreY - height / 2)),
    width,
    height,
  };
}

/** Drags one corner, keeping the signature's shape and leaving the opposite corner where it is. */
export function resizeFromCorner(
  rect: Rect,
  angle: number,
  corner: Corner,
  dx: number,
  dy: number,
  minWidth: number,
): Rect {
  const towards = {
    x: corner.endsWith('right') ? 1 : -1,
    y: corner.startsWith('bottom') ? 1 : -1,
  };
  const drag = turned(dx, dy, -angle);
  const scale =
    ((rect.width + towards.x * drag.x) / rect.width +
      (rect.height + towards.y * drag.y) / rect.height) /
    2;
  const width = Math.max(minWidth, rect.width * scale);
  const height = width * (rect.height / rect.width);

  const middle = middleOf(rect);
  const anchor = turned((-towards.x * rect.width) / 2, (-towards.y * rect.height) / 2, angle);
  const across = turned((towards.x * width) / 2, (towards.y * height) / 2, angle);
  const centreX = middle.x + anchor.x + across.x;
  const centreY = middle.y + anchor.y + across.y;
  return { x: centreX - width / 2, y: centreY - height / 2, width, height };
}

export function turnedBy(angle: number, change: number): number {
  return (((angle + change) % 360) + 360) % 360;
}

/** Drags a signature, keeping its middle on the page so it can always be reached again. */
export function movedRect(rect: Rect, dx: number, dy: number, page: PageSize): Rect {
  const middle = middleOf(rect);
  const x = Math.min(page.width, Math.max(0, middle.x + dx));
  const y = Math.min(page.height, Math.max(0, middle.y + dy));
  return { ...rect, x: x - rect.width / 2, y: y - rect.height / 2 };
}

const SNAP_DEGREES = 2;

/** The angle a point sits at around a middle, settling on upright and quarter turns when close. */
export function angleToPoint(dx: number, dy: number): number {
  const angle = turnedBy((Math.atan2(dy, dx) * 180) / Math.PI, 90);
  const nearest = Math.round(angle / 90) * 90;
  return turnedBy(Math.abs(angle - nearest) <= SNAP_DEGREES ? nearest : Math.round(angle), 0);
}

export interface PdfImagePlacement {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotate: number;
}

/**
 * On screen a signature turns around its middle, but a PDF image turns around its lower-left
 * corner. So this finds where that corner has moved to.
 */
export function placementInPdf(rect: Rect, angle: number, box: PageBox): PdfImagePlacement {
  const middle = middleOf(rect);
  const corner = turned(-rect.width / 2, rect.height / 2, angle);
  const origin = displayToUser({ x: middle.x + corner.x, y: middle.y + corner.y }, box);
  const unit = box.unit ?? 1;
  return {
    x: origin.x,
    y: origin.y,
    width: rect.width / unit,
    height: rect.height / unit,
    rotate: userAngle(angle, box.rotation),
  };
}

/** The space a turned signature takes up on the page. */
export function boundsOf(rect: Rect, angle: number): Rect {
  const middle = middleOf(rect);
  const corners = [
    turned(rect.width / 2, rect.height / 2, angle),
    turned(-rect.width / 2, rect.height / 2, angle),
  ];
  const halfWidth = Math.max(...corners.map((corner) => Math.abs(corner.x)));
  const halfHeight = Math.max(...corners.map((corner) => Math.abs(corner.y)));
  return {
    x: middle.x - halfWidth,
    y: middle.y - halfHeight,
    width: halfWidth * 2,
    height: halfHeight * 2,
  };
}

const STAMP_SIZE = 12;
const STAMP_LINE_HEIGHT = 16;
// Fits the longest date, "September 30, 2026", in Liberation Serif at this size.
const STAMP_WIDTH = 120;
const STAMP_GAP = 12;
const STAMP_GAP_BELOW = 4;

export function formatStampDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** A normal text box beside the signature, so it can be edited or moved like any other text. */
export function dateStampBox(
  id: string,
  pageNumber: number,
  signature: Rect,
  angle: number,
  page: PageSize,
  ink: Color,
  date: Date,
): TextBox {
  const taken = boundsOf(signature, angle);
  const right = taken.x + taken.width;
  const bottom = taken.y + taken.height;
  const fitsBeside = right + STAMP_GAP + STAMP_WIDTH <= page.width;
  const x = fitsBeside ? right + STAMP_GAP : taken.x;
  const y = fitsBeside ? bottom - STAMP_LINE_HEIGHT : bottom + STAMP_GAP_BELOW;
  const text = formatStampDate(date);
  return {
    id,
    pageNumber,
    rect: {
      x: Math.max(0, Math.min(page.width - STAMP_WIDTH, x)),
      y: Math.max(0, Math.min(page.height - STAMP_LINE_HEIGHT, y)),
      width: STAMP_WIDTH,
      height: STAMP_LINE_HEIGHT,
    },
    angle: 0,
    text,
    lines: [text],
    firstBaseline: STAMP_SIZE,
    lineHeight: STAMP_LINE_HEIGHT,
    style: {
      font: 'serif',
      size: STAMP_SIZE,
      color: ink,
      bold: false,
      italic: false,
      align: 'left',
    },
    covers: [],
    original: null,
  };
}
