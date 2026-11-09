import { describe, expect, it } from 'vitest';
import type { Annotation } from '../edits/annotations';
import type { PlacedSignature, TextBox } from '../edits/model';
import {
  sizeAfter,
  turnAnnotation,
  turnPlacement,
  turnPoint,
  turnRect,
  turnTextBox,
} from './turning';

const page = { width: 600, height: 800 };

describe('turning a page', () => {
  it('swaps its sides for a quarter turn', () => {
    expect(sizeAfter(page, 1)).toEqual({ width: 800, height: 600 });
    expect(sizeAfter(page, 2)).toEqual(page);
  });

  it('carries the top left corner to the top right', () => {
    expect(turnPoint({ x: 0, y: 0 }, page, 1)).toEqual({ x: 800, y: 0 });
    expect(turnPoint({ x: 10, y: 20 }, page, 1)).toEqual({ x: 780, y: 10 });
  });

  it('comes back where it started after four turns, or one each way', () => {
    const start = { x: 37, y: 512 };
    expect(turnPoint(start, page, 4)).toEqual(start);
    const once = turnPoint(start, page, 1);
    expect(turnPoint(once, sizeAfter(page, 1), 3)).toEqual(start);
    expect(turnPoint(start, page, -1)).toEqual(turnPoint(start, page, 3));
  });

  it('keeps a rectangle square to the page', () => {
    expect(turnRect({ x: 10, y: 20, width: 100, height: 50 }, page, 1)).toEqual({
      x: 730,
      y: 10,
      width: 50,
      height: 100,
    });
  });
});

describe('turning what’s on a page', () => {
  const common = { id: 'a', pageNumber: 1, color: { r: 0, g: 0, b: 0 } };

  it('puts a comment where a viewer draws it once the page turns', () => {
    const comment: Annotation = { ...common, kind: 'comment', at: { x: 100, y: 76 }, text: 'x' };
    // Its box ran from (100, 76) to (124, 100). A quarter turn puts that at (700, 100) to (724, 124).
    expect(turnAnnotation(comment, page, 1)).toMatchObject({ at: { x: 700, y: 100 } });
    expect(turnAnnotation(comment, page, 2)).toMatchObject({ at: { x: 476, y: 700 } });
  });

  it('turns a text box about its corner, and its angle with it', () => {
    const box = {
      id: 't',
      pageNumber: 1,
      rect: { x: 10, y: 20, width: 200, height: 30 },
      angle: 0,
      covers: [{ rect: { x: 10, y: 20, width: 200, height: 30 }, angle: 0, color: common.color }],
    } as unknown as TextBox;
    const turned = turnTextBox(box, page, 1);
    expect(turned.rect).toEqual({ x: 780, y: 10, width: 200, height: 30 });
    expect(turned.angle).toBe(90);
    expect(turned.covers[0]?.angle).toBe(90);
  });

  it('turns a signature about its middle, and its angle with it', () => {
    const placed = {
      id: 's',
      pageNumber: 1,
      rect: { x: 100, y: 100, width: 200, height: 100 },
      angle: 350,
    } as unknown as PlacedSignature;
    const turned = turnPlacement(placed, page, 1);
    // The middle was (200, 150), which a quarter turn puts at (650, 200).
    expect(turned.rect).toEqual({ x: 550, y: 150, width: 200, height: 100 });
    expect(turned.angle).toBe(80);
  });
});
