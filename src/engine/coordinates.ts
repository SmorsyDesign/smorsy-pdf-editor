export interface PageBox {
  /** The page's visible box in PDF space, before rotation. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** 0, 90, 180 or 270, clockwise. */
  readonly rotation: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Converts from the page as displayed (y down) to PDF space (y up, unrotated). */
export function displayToUser({ x, y }: Point, box: PageBox): Point {
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
