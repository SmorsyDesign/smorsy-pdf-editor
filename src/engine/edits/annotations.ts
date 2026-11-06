import type { Point } from '../coordinates';
import type { PageSize } from '../zoom';
import type { Color, Rect } from './model';

export type MarkupKind = 'highlight' | 'underline' | 'strikeout';
export type ShapeKind = 'rect' | 'ellipse' | 'whiteout';

interface Common {
  readonly id: string;
  readonly pageNumber: number;
  readonly color: Color;
}

/** Everything is in PDF points as displayed: origin at the page's top left, y going down. */
export type Annotation =
  | (Common & {
      readonly kind: MarkupKind;
      readonly rects: readonly Rect[];
      /** What it's marking, so the panel can say. */
      readonly text: string;
    })
  | (Common & { readonly kind: 'pen'; readonly points: readonly Point[]; readonly width: number })
  | (Common & { readonly kind: ShapeKind; readonly rect: Rect; readonly width: number })
  | (Common & {
      readonly kind: 'arrow';
      readonly from: Point;
      readonly to: Point;
      readonly width: number;
    })
  | (Common & { readonly kind: 'note'; readonly at: Point; readonly text: string });

export const LINE_WIDTH = 2;
export const NOTE_SIZE = 24;
export const WHITE: Color = { r: 1, g: 1, b: 1 };

const DEFAULT_WIDTH = 120;
const DEFAULT_HEIGHT = 72;
// A click that barely moves is a click, and placing something that small would be an accident.
const MIN_SIZE = 8;
// Rectangles from one line of selected text can differ slightly in height.
const SAME_LINE = 0.5;

/** Selecting text gives one rectangle per run, and a line reads better marked as one piece. */
export function mergedLines(rects: readonly Rect[]): readonly Rect[] {
  const lines: Rect[] = [];
  const sorted = [...rects]
    .filter((rect) => rect.width > 0.5 && rect.height > 0.5)
    .sort((one, two) => one.y - two.y || one.x - two.x);
  for (const rect of sorted) {
    const index = lines.findIndex((line) => {
      const overlap =
        Math.min(line.y + line.height, rect.y + rect.height) - Math.max(line.y, rect.y);
      return overlap > Math.min(line.height, rect.height) * SAME_LINE;
    });
    const line = lines[index];
    if (!line) {
      lines.push(rect);
      continue;
    }
    const left = Math.min(line.x, rect.x);
    const top = Math.min(line.y, rect.y);
    lines[index] = {
      x: left,
      y: top,
      width: Math.max(line.x + line.width, rect.x + rect.width) - left,
      height: Math.max(line.y + line.height, rect.y + rect.height) - top,
    };
  }
  return lines;
}

/** The rectangle between two points, or null if they're too close to mean anything. */
export function rectBetween(from: Point, to: Point): Rect | null {
  const width = Math.abs(to.x - from.x);
  const height = Math.abs(to.y - from.y);
  if (width < MIN_SIZE && height < MIN_SIZE) return null;
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.max(width, MIN_SIZE),
    height: Math.max(height, MIN_SIZE),
  };
}

/** A sensible size around a point, for when there's been no dragging to say what size to be. */
export function defaultRect(centre: Point): Rect {
  return {
    x: centre.x - DEFAULT_WIDTH / 2,
    y: centre.y - DEFAULT_HEIGHT / 2,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  };
}

function boundsAround(points: readonly Point[]): Rect {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function boundsOfAnnotation(annotation: Annotation): Rect {
  switch (annotation.kind) {
    case 'pen':
      return boundsAround(annotation.points);
    case 'arrow':
      return boundsAround([annotation.from, annotation.to]);
    case 'note':
      return { ...annotation.at, width: NOTE_SIZE, height: NOTE_SIZE };
    case 'rect':
    case 'ellipse':
    case 'whiteout':
      return annotation.rect;
    default:
      return boundsAround(
        annotation.rects.flatMap((rect) => [
          rect,
          { x: rect.x + rect.width, y: rect.y + rect.height },
        ]),
      );
  }
}

/** Marks belong to the text under them, so only what's drawn freely can be moved. */
export function canMove(annotation: Annotation): boolean {
  return !['highlight', 'underline', 'strikeout'].includes(annotation.kind);
}

export function canResize(annotation: Annotation): boolean {
  return canMove(annotation) && annotation.kind !== 'note';
}

function moved(annotation: Annotation, dx: number, dy: number): Annotation {
  const shift = (point: Point) => ({ x: point.x + dx, y: point.y + dy });
  switch (annotation.kind) {
    case 'pen':
      return { ...annotation, points: annotation.points.map(shift) };
    case 'arrow':
      return { ...annotation, from: shift(annotation.from), to: shift(annotation.to) };
    case 'note':
      return { ...annotation, at: shift(annotation.at) };
    case 'rect':
    case 'ellipse':
    case 'whiteout':
      return { ...annotation, rect: { ...annotation.rect, ...shift(annotation.rect) } };
    default:
      return annotation;
  }
}

/** Moves it, stopping at the page's edge, because a PDF cuts off anything past that. */
export function movedAnnotation(
  annotation: Annotation,
  dx: number,
  dy: number,
  page: PageSize,
): Annotation {
  const bounds = boundsOfAnnotation(annotation);
  const x = Math.min(page.width - bounds.width, Math.max(0, bounds.x + dx));
  const y = Math.min(page.height - bounds.height, Math.max(0, bounds.y + dy));
  return moved(annotation, x - bounds.x, y - bounds.y);
}

/** Puts its middle at a point on a page, for moving it with a click instead of a drag. */
export function annotationMovedTo(
  annotation: Annotation,
  pageNumber: number,
  centre: Point,
  page: PageSize,
): Annotation {
  const bounds = boundsOfAnnotation(annotation);
  return movedAnnotation(
    { ...annotation, pageNumber },
    centre.x - bounds.width / 2 - bounds.x,
    centre.y - bounds.height / 2 - bounds.y,
    page,
  );
}

/** Grows or shrinks around its middle, staying on the page and never vanishing. */
export function scaledAnnotation(
  annotation: Annotation,
  factor: number,
  page: PageSize,
): Annotation {
  const bounds = boundsOfAnnotation(annotation);
  const largest = Math.max(bounds.width, bounds.height);
  if (largest === 0) return annotation;
  const fit = Math.min(
    page.width / bounds.width || Infinity,
    page.height / bounds.height || Infinity,
  );
  const scale = Math.min(Math.max(factor, MIN_SIZE / largest), fit);
  const middleX = bounds.x + bounds.width / 2;
  const middleY = bounds.y + bounds.height / 2;
  const scaled = (point: Point) => ({
    x: middleX + (point.x - middleX) * scale,
    y: middleY + (point.y - middleY) * scale,
  });
  let next = annotation;
  if (annotation.kind === 'pen') {
    next = { ...annotation, points: annotation.points.map(scaled) };
  } else if (annotation.kind === 'arrow') {
    next = { ...annotation, from: scaled(annotation.from), to: scaled(annotation.to) };
  } else if (
    annotation.kind === 'rect' ||
    annotation.kind === 'ellipse' ||
    annotation.kind === 'whiteout'
  ) {
    const { x, y } = scaled(annotation.rect);
    next = {
      ...annotation,
      rect: { x, y, width: annotation.rect.width * scale, height: annotation.rect.height * scale },
    };
  }
  return movedAnnotation(next, 0, 0, page);
}

const LABELS: Readonly<Record<Annotation['kind'], string>> = {
  highlight: 'Highlight',
  underline: 'Underline',
  strikeout: 'Strikethrough',
  pen: 'Pen drawing',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  arrow: 'Arrow',
  note: 'Note',
  whiteout: 'Whiteout box',
};

export const annotationLabel = (annotation: Annotation) => LABELS[annotation.kind];

export function annotationDetail(annotation: Annotation): string {
  if ('text' in annotation) return annotation.text;
  return '';
}
