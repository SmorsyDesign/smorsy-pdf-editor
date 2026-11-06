import {
  PDFHexString,
  appendBezierCurve,
  closePath,
  fill,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  setFillingRgbColor,
  setGraphicsState,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingRgbColor,
  stroke,
  LineCapStyle,
  LineJoinStyle,
  type PDFOperator,
  type PDFPage,
} from '@cantoo/pdf-lib';
import { displayToUser, type PageBox, type Point } from '../coordinates';
import { NOTE_SIZE, type Annotation, type MarkupKind, type ShapeKind } from '../edits/annotations';
import type { Color, Rect } from '../edits/model';
import { boundsAround, type UserBounds } from './page-annotations';

const PRINT_FLAG = 4;
const HIGHLIGHT_BLEND = 'Multiply';
const BLEND_NAME = 'Blend';
const ARROW_HEAD = 10;
// How far a curve's control points sit to approximate a quarter of an ellipse.
const CURVE = 0.5523;
// Room for line ends, which reach half a line's width past the points they join.
const STROKE_ROOM = 2;

const colorArray = ({ r, g, b }: Color) => [r, g, b];

function cornersOf(rect: Rect, box: PageBox) {
  return {
    topLeft: displayToUser(rect, box),
    topRight: displayToUser({ x: rect.x + rect.width, y: rect.y }, box),
    bottomLeft: displayToUser({ x: rect.x, y: rect.y + rect.height }, box),
    bottomRight: displayToUser({ x: rect.x + rect.width, y: rect.y + rect.height }, box),
  };
}

const polygon = (points: readonly Point[]): PDFOperator[] => {
  const [first, ...rest] = points;
  if (!first) return [];
  return [moveTo(first.x, first.y), ...rest.map((point) => lineTo(point.x, point.y)), closePath()];
};

const inkSetup = (color: Color, width: number): PDFOperator[] => [
  setStrokingRgbColor(color.r, color.g, color.b),
  setLineWidth(width),
  setLineCap(LineCapStyle.Round),
  setLineJoin(LineJoinStyle.Round),
];

interface Drawn {
  readonly subtype: string;
  readonly points: readonly Point[];
  readonly operators: readonly PDFOperator[];
  readonly extra: Readonly<Record<string, unknown>>;
  readonly blend?: boolean;
}

function drawnMarkup(
  annotation: Extract<Annotation, { kind: MarkupKind }>,
  box: PageBox,
  unit: number,
): Drawn {
  const { color, rects, kind, text } = annotation;
  const quads = rects.map((rect) => cornersOf(rect, box));
  const quadPoints = quads.flatMap(({ topLeft, topRight, bottomLeft, bottomRight }) => [
    topLeft.x,
    topLeft.y,
    topRight.x,
    topRight.y,
    bottomLeft.x,
    bottomLeft.y,
    bottomRight.x,
    bottomRight.y,
  ]);
  const points = quads.flatMap((quad) => Object.values(quad));
  const extra = {
    QuadPoints: quadPoints,
    Contents: PDFHexString.fromText(text),
  };
  if (kind === 'highlight') {
    return {
      subtype: 'Highlight',
      points,
      extra,
      blend: true,
      operators: [
        setGraphicsState(BLEND_NAME),
        setFillingRgbColor(color.r, color.g, color.b),
        ...quads.flatMap(({ topLeft, topRight, bottomLeft, bottomRight }) => [
          ...polygon([topLeft, topRight, bottomRight, bottomLeft]),
          fill(),
        ]),
      ],
    };
  }
  const position = kind === 'underline' ? 0.92 : 0.55;
  const lines = quads.flatMap(({ topLeft, topRight, bottomLeft, bottomRight }) => {
    const across = (from: Point, to: Point) => ({
      x: from.x + (to.x - from.x) * position,
      y: from.y + (to.y - from.y) * position,
    });
    const start = across(topLeft, bottomLeft);
    const end = across(topRight, bottomRight);
    return [moveTo(start.x, start.y), lineTo(end.x, end.y), stroke()];
  });
  return {
    subtype: kind === 'underline' ? 'Underline' : 'StrikeOut',
    points,
    extra,
    operators: [...inkSetup(color, 1.5 / unit), ...lines],
  };
}

function drawnPen(
  annotation: Extract<Annotation, { kind: 'pen' }>,
  box: PageBox,
  unit: number,
): Drawn {
  const points = annotation.points.map((point) => displayToUser(point, box));
  const [first, ...rest] = points;
  return {
    subtype: 'Ink',
    points,
    extra: {
      InkList: [points.flatMap((point) => [point.x, point.y])],
      BS: { W: annotation.width / unit },
    },
    operators: first
      ? [
          ...inkSetup(annotation.color, annotation.width / unit),
          moveTo(first.x, first.y),
          ...rest.map((point) => lineTo(point.x, point.y)),
          stroke(),
        ]
      : [],
  };
}

function drawnShape(
  annotation: Extract<Annotation, { kind: ShapeKind }>,
  box: PageBox,
  unit: number,
): Drawn {
  const corners = cornersOf(annotation.rect, box);
  const points = Object.values(corners);
  const { left, right, bottom, top } = boundsAround(points);
  const extra = { BS: { W: annotation.width / unit } };
  const setup = inkSetup(annotation.color, annotation.width / unit);
  if (annotation.kind === 'rect') {
    return {
      subtype: 'Square',
      points,
      extra,
      operators: [
        ...setup,
        ...polygon([corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft]),
        stroke(),
      ],
    };
  }
  const x = (left + right) / 2;
  const y = (bottom + top) / 2;
  const rx = (right - left) / 2;
  const ry = (top - bottom) / 2;
  const cx = rx * CURVE;
  const cy = ry * CURVE;
  return {
    subtype: 'Circle',
    points,
    extra,
    operators: [
      ...setup,
      moveTo(x - rx, y),
      appendBezierCurve(x - rx, y + cy, x - cx, y + ry, x, y + ry),
      appendBezierCurve(x + cx, y + ry, x + rx, y + cy, x + rx, y),
      appendBezierCurve(x + rx, y - cy, x + cx, y - ry, x, y - ry),
      appendBezierCurve(x - cx, y - ry, x - rx, y - cy, x - rx, y),
      closePath(),
      stroke(),
    ],
  };
}

function drawnArrow(
  annotation: Extract<Annotation, { kind: 'arrow' }>,
  box: PageBox,
  unit: number,
): Drawn {
  const from = displayToUser(annotation.from, box);
  const to = displayToUser(annotation.to, box);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const head = ARROW_HEAD / unit;
  const barb = (turn: number) => ({
    x: to.x - head * Math.cos(angle + turn),
    y: to.y - head * Math.sin(angle + turn),
  });
  const one = barb(Math.PI / 6);
  const two = barb(-Math.PI / 6);
  return {
    subtype: 'Line',
    points: [from, to, one, two],
    extra: {
      L: [from.x, from.y, to.x, to.y],
      LE: ['None', 'OpenArrow'],
      BS: { W: annotation.width / unit },
    },
    operators: [
      ...inkSetup(annotation.color, annotation.width / unit),
      moveTo(from.x, from.y),
      lineTo(to.x, to.y),
      moveTo(one.x, one.y),
      lineTo(to.x, to.y),
      lineTo(two.x, two.y),
      stroke(),
    ],
  };
}

function drawnNote(
  annotation: Extract<Annotation, { kind: 'note' }>,
  box: PageBox,
  unit: number,
): Drawn {
  const { at, color, text } = annotation;
  const corners = cornersOf({ ...at, width: NOTE_SIZE, height: NOTE_SIZE }, box);
  const { left, right, bottom, top } = boundsAround(Object.values(corners));
  const inset = (right - left) * 0.25;
  const lines = [0.65, 0.5, 0.35].flatMap((share) => {
    const y = bottom + (top - bottom) * share;
    return [moveTo(left + inset, y), lineTo(right - inset, y)];
  });
  return {
    subtype: 'Text',
    points: Object.values(corners),
    extra: { Contents: PDFHexString.fromText(text), Name: 'Comment', Open: false },
    operators: [
      setFillingRgbColor(color.r, color.g, color.b),
      ...polygon([corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft]),
      fill(),
      ...inkSetup({ r: 0.3, g: 0.23, b: 0 }, 1 / unit),
      ...polygon([corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft]),
      stroke(),
      ...lines,
      stroke(),
    ],
  };
}

function drawnAnnotation(annotation: Annotation, box: PageBox): Drawn | null {
  const unit = box.unit ?? 1;
  switch (annotation.kind) {
    case 'pen':
      return drawnPen(annotation, box, unit);
    case 'rect':
    case 'ellipse':
      return drawnShape(annotation, box, unit);
    case 'arrow':
      return drawnArrow(annotation, box, unit);
    case 'note':
      return drawnNote(annotation, box, unit);
    // Whiteout is part of the page rather than an annotation, so it's drawn elsewhere.
    case 'whiteout':
      return null;
    default:
      return drawnMarkup(annotation, box, unit);
  }
}

/** Where an annotation lands in the PDF, including room for how thick its lines are. */
export function annotationBounds(annotation: Annotation, box: PageBox): UserBounds | null {
  const drawn = drawnAnnotation(annotation, box);
  if (!drawn) return null;
  const { left, right, bottom, top } = boundsAround(drawn.points);
  return {
    left: left - STROKE_ROOM,
    right: right + STROKE_ROOM,
    bottom: bottom - STROKE_ROOM,
    top: top + STROKE_ROOM,
  };
}

/**
 * Adds a real annotation, so it stays editable in other PDF apps. Its appearance is drawn in page
 * coordinates, which makes it right on rotated pages without any further working out.
 */
export function writeAnnotation(page: PDFPage, annotation: Annotation, box: PageBox): void {
  const drawn = drawnAnnotation(annotation, box);
  const bounds = annotationBounds(annotation, box);
  if (!drawn || !bounds) return;
  const { context } = page.doc;
  const appearance = context.formXObject(
    [pushGraphicsState(), ...drawn.operators, popGraphicsState()],
    {
      BBox: [bounds.left, bounds.bottom, bounds.right, bounds.top],
      Resources: drawn.blend ? { ExtGState: { [BLEND_NAME]: { BM: HIGHLIGHT_BLEND } } } : {},
    },
  );
  const dict = context.obj({
    Type: 'Annot',
    Subtype: drawn.subtype,
    Rect: [bounds.left, bounds.bottom, bounds.right, bounds.top],
    C: colorArray(annotation.color),
    F: PRINT_FLAG,
    AP: { N: context.register(appearance) },
    ...drawn.extra,
  } as never);
  page.node.addAnnot(context.register(dict));
}
