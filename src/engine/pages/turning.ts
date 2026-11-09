import type { Point } from '../coordinates';
import { PIN_SIZE, type Annotation } from '../edits/annotations';
import type { PlacedSignature, Rect, TextBox } from '../edits/model';
import type { PageSize } from '../zoom';

const quarter = (turns: number) => ((turns % 4) + 4) % 4;

/** The page's size as shown after these quarter turns. */
export function sizeAfter(size: PageSize, turns: number): PageSize {
  return quarter(turns) % 2 === 0 ? size : { width: size.height, height: size.width };
}

/** Where a point on a page of this size ends up after the page turns clockwise. */
export function turnPoint(point: Point, size: PageSize, turns: number): Point {
  let { x, y } = point;
  let { width, height } = size;
  for (let turn = 0; turn < quarter(turns); turn += 1) {
    [x, y] = [height - y, x];
    [width, height] = [height, width];
  }
  return { x, y };
}

/** The box around a rectangle once turned, which stays square to the page. */
export function turnRect(rect: Rect, size: PageSize, turns: number): Rect {
  const one = turnPoint(rect, size, turns);
  const two = turnPoint({ x: rect.x + rect.width, y: rect.y + rect.height }, size, turns);
  return {
    x: Math.min(one.x, two.x),
    y: Math.min(one.y, two.y),
    width: Math.abs(two.x - one.x),
    height: Math.abs(two.y - one.y),
  };
}

const turnAngle = (angle: number, turns: number) => (angle + quarter(turns) * 90) % 360;

/** Text boxes turn about their top left corner, which is where their rectangle starts. */
export function turnTextBox(box: TextBox, size: PageSize, turns: number): TextBox {
  if (quarter(turns) === 0) return box;
  const corner = turnPoint(box.rect, size, turns);
  return {
    ...box,
    rect: { ...box.rect, ...corner },
    angle: turnAngle(box.angle, turns),
    covers: box.covers.map((cover) => ({
      ...cover,
      rect: { ...cover.rect, ...turnPoint(cover.rect, size, turns) },
      angle: turnAngle(cover.angle, turns),
    })),
  };
}

/** A signature or image turns about its middle. */
export function turnPlacementRect(rect: Rect, size: PageSize, turns: number): Rect {
  const middle = turnPoint(
    { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
    size,
    turns,
  );
  return { ...rect, x: middle.x - rect.width / 2, y: middle.y - rect.height / 2 };
}

export function turnPlacement(
  placement: PlacedSignature,
  size: PageSize,
  turns: number,
): PlacedSignature {
  if (quarter(turns) === 0) return placement;
  return {
    ...placement,
    rect: turnPlacementRect(placement.rect, size, turns),
    angle: turnAngle(placement.angle, turns),
  };
}

export const turnSignatureAngle = turnAngle;

export function turnAnnotation(annotation: Annotation, size: PageSize, turns: number): Annotation {
  if (quarter(turns) === 0) return annotation;
  const point = (one: Point) => turnPoint(one, size, turns);
  switch (annotation.kind) {
    case 'highlight':
    case 'underline':
    case 'strikeout':
      return { ...annotation, rects: annotation.rects.map((rect) => turnRect(rect, size, turns)) };
    case 'pen':
      return { ...annotation, points: annotation.points.map(point) };
    case 'arrow':
      return { ...annotation, from: point(annotation.from), to: point(annotation.to) };
    case 'comment': {
      // Where a viewer draws it once the page turns: its box turns with the page.
      const box = turnRect({ ...annotation.at, width: PIN_SIZE, height: PIN_SIZE }, size, turns);
      return { ...annotation, at: { x: box.x, y: box.y } };
    }
    default:
      return { ...annotation, rect: turnRect(annotation.rect, size, turns) };
  }
}
