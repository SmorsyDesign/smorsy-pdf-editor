import { describe, expect, it } from 'vitest';
import {
  annotationMovedTo,
  boundsOfAnnotation,
  canMove,
  canResize,
  mergedLines,
  movedAnnotation,
  rectBetween,
  scaledAnnotation,
  type Annotation,
} from './annotations';

const PAGE = { width: 612, height: 792 };
const color = { r: 1, g: 0, b: 0 };
const base = { id: 'a', pageNumber: 1, color };
const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe('mergedLines', () => {
  it('joins runs on one line into one piece', () => {
    expect(mergedLines([rect(100, 200, 50, 14), rect(150, 201, 60, 12)])).toEqual([
      rect(100, 200, 110, 14),
    ]);
  });

  it('keeps separate lines separate', () => {
    expect(mergedLines([rect(100, 200, 50, 14), rect(100, 220, 60, 14)])).toHaveLength(2);
  });

  it('drops the empty rectangles selections can contain', () => {
    expect(mergedLines([rect(100, 200, 0, 14), rect(100, 220, 60, 0)])).toEqual([]);
  });
});

describe('rectBetween', () => {
  it('works in any drag direction', () => {
    expect(rectBetween({ x: 200, y: 300 }, { x: 100, y: 250 })).toEqual(rect(100, 250, 100, 50));
  });

  it('treats a click that barely moved as no shape', () => {
    expect(rectBetween({ x: 200, y: 300 }, { x: 203, y: 302 })).toBeNull();
  });

  it('gives a thin drag a visible size', () => {
    expect(rectBetween({ x: 100, y: 300 }, { x: 200, y: 300 })?.height).toBe(8);
  });
});

const shape: Annotation = { ...base, kind: 'rect', rect: rect(100, 100, 200, 100), width: 2 };
const pen: Annotation = {
  ...base,
  kind: 'pen',
  points: [
    { x: 100, y: 100 },
    { x: 200, y: 150 },
  ],
  width: 2,
};
const arrow: Annotation = {
  ...base,
  kind: 'arrow',
  from: { x: 10, y: 10 },
  to: { x: 60, y: 40 },
  width: 2,
};
const note: Annotation = { ...base, kind: 'note', at: { x: 50, y: 60 }, text: 'Check' };
const highlight: Annotation = {
  ...base,
  kind: 'highlight',
  rects: [rect(10, 10, 50, 12)],
  text: 'x',
};

describe('boundsOfAnnotation', () => {
  it('knows the space each kind takes up', () => {
    expect(boundsOfAnnotation(shape)).toEqual(rect(100, 100, 200, 100));
    expect(boundsOfAnnotation(pen)).toEqual(rect(100, 100, 100, 50));
    expect(boundsOfAnnotation(arrow)).toEqual(rect(10, 10, 50, 30));
    expect(boundsOfAnnotation(note)).toEqual(rect(50, 60, 24, 24));
    expect(boundsOfAnnotation(highlight)).toEqual(rect(10, 10, 50, 12));
  });
});

describe('what can be changed', () => {
  it('leaves marks with the text they mark', () => {
    expect(canMove(highlight)).toBe(false);
    expect(canResize(highlight)).toBe(false);
  });

  it('lets notes move, but not change size', () => {
    expect(canMove(note)).toBe(true);
    expect(canResize(note)).toBe(false);
  });

  it('lets drawings do both', () => {
    for (const drawn of [shape, pen, arrow]) {
      expect(canMove(drawn)).toBe(true);
      expect(canResize(drawn)).toBe(true);
    }
  });
});

describe('movedAnnotation', () => {
  it('moves every kind', () => {
    expect(boundsOfAnnotation(movedAnnotation(shape, 10, 20, PAGE)).x).toBe(110);
    expect(boundsOfAnnotation(movedAnnotation(pen, 10, 20, PAGE)).y).toBe(120);
    expect(boundsOfAnnotation(movedAnnotation(arrow, 10, 20, PAGE)).x).toBe(20);
    expect(boundsOfAnnotation(movedAnnotation(note, 10, 20, PAGE)).y).toBe(80);
  });

  it('stops at the page’s edge', () => {
    const bounds = boundsOfAnnotation(movedAnnotation(shape, -5000, 5000, PAGE));
    expect(bounds.x).toBe(0);
    expect(bounds.y + bounds.height).toBe(792);
  });

  it('leaves marks where they are', () => {
    expect(movedAnnotation(highlight, 10, 10, PAGE)).toEqual(highlight);
  });
});

describe('annotationMovedTo', () => {
  it('centres it on the point, on the page given', () => {
    const next = annotationMovedTo(shape, 3, { x: 300, y: 400 }, PAGE);
    expect(next.pageNumber).toBe(3);
    expect(boundsOfAnnotation(next)).toEqual(rect(200, 350, 200, 100));
  });
});

describe('scaledAnnotation', () => {
  it('grows around the middle', () => {
    expect(boundsOfAnnotation(scaledAnnotation(shape, 1.5, PAGE))).toEqual(rect(50, 75, 300, 150));
  });

  it('scales a drawing’s points', () => {
    expect(boundsOfAnnotation(scaledAnnotation(pen, 2, PAGE))).toEqual(rect(50, 75, 200, 100));
  });

  it('never shrinks away to nothing', () => {
    const { width } = boundsOfAnnotation(scaledAnnotation(shape, 0.0001, PAGE));
    expect(width).toBeGreaterThanOrEqual(8);
  });

  it('stays on the page', () => {
    const bounds = boundsOfAnnotation(scaledAnnotation(shape, 50, PAGE));
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(612.001);
  });
});
