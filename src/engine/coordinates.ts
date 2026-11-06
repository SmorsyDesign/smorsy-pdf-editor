import type { Rect } from './edits/model';

export interface PageBox {
  /** The page's visible box in PDF space, before rotation. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** 0, 90, 180 or 270, clockwise. */
  readonly rotation: number;
  /** Size of one PDF unit in points, which a few documents change from the usual 1. */
  readonly unit?: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The box between two opposite corners, which can come in either order on a turned page. */
export function rectFromCorners(x1: number, y1: number, x2: number, y2: number): Rect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

/** Converts from the page as displayed (y down) to PDF space (y up, unrotated). */
export function displayToUser(point: Point, box: PageBox): Point {
  const unit = box.unit ?? 1;
  const x = point.x / unit;
  const y = point.y / unit;
  switch (box.rotation) {
    case 90:
      return { x: box.x + y, y: box.y + x };
    case 180:
      return { x: box.x + box.width - x, y: box.y + y };
    case 270:
      return { x: box.x + box.width - y, y: box.y + box.height - x };
    default:
      return { x: box.x + x, y: box.y + box.height - y };
  }
}

/** Display angles run clockwise and PDF angles anticlockwise. */
export function userAngle(displayAngle: number, rotation: number): number {
  return rotation - displayAngle;
}
