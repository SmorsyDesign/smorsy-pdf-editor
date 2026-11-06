import { describe, expect, it } from 'vitest';
import {
  cropToInk,
  inkCoverage,
  removeWhiteBackground,
  scaledToFit,
  type RgbaImage,
} from './image';

type Pixel = readonly [number, number, number, number?];

function imageOf(rows: readonly (readonly Pixel[])[]): RgbaImage {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.flat().forEach(([r, g, b, a = 255], index) => {
    data.set([r, g, b, a], index * 4);
  });
  return { width, height, data };
}

function paper(size: number, level: number, ink: Readonly<Record<string, Pixel>>): RgbaImage {
  const rows: Pixel[][] = [];
  for (let y = 0; y < size; y += 1) {
    const row: Pixel[] = [];
    for (let x = 0; x < size; x += 1) row.push(ink[`${x},${y}`] ?? [level, level, level]);
    rows.push(row);
  }
  return imageOf(rows);
}

const pixelAt = (image: RgbaImage, x: number, y: number) =>
  [...image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)] as const;

describe('removeWhiteBackground', () => {
  it('makes white paper clear and keeps black ink solid', () => {
    const result = removeWhiteBackground(paper(8, 255, { '2,2': [0, 0, 0] }));
    expect(pixelAt(result, 0, 0)[3]).toBe(0);
    expect(pixelAt(result, 2, 2)).toEqual([0, 0, 0, 255]);
  });

  it('handles paper that photographed grey, not just pure white', () => {
    const result = removeWhiteBackground(paper(8, 212, { '2,2': [20, 20, 20] }));
    expect(pixelAt(result, 0, 0)[3]).toBe(0);
    expect(pixelAt(result, 2, 2)[3]).toBe(255);
  });

  it('keeps the colour of blue ink', () => {
    const [r, g, b, a] = pixelAt(
      removeWhiteBackground(paper(8, 255, { '2,2': [28, 42, 90] })),
      2,
      2,
    );
    expect(a).toBe(255);
    expect([r, g, b]).toEqual([28, 42, 90]);
  });

  it('softens the edge of a stroke, without leaving a pale halo', () => {
    const [r, , , a] = pixelAt(
      removeWhiteBackground(paper(8, 255, { '2,2': [200, 200, 200] })),
      2,
      2,
    );
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(255);
    expect(r).toBeLessThan(200);
  });

  it('ignores speckle close to the paper’s colour', () => {
    const result = removeWhiteBackground(paper(8, 255, { '2,2': [246, 246, 246] }));
    expect(pixelAt(result, 2, 2)[3]).toBe(0);
  });

  it('leaves what was already clear as clear', () => {
    const result = removeWhiteBackground(paper(8, 255, { '2,2': [0, 0, 0, 0] }));
    expect(pixelAt(result, 2, 2)[3]).toBe(0);
  });

  it('leaves an image that’s already cut out alone, rather than erasing its ink', () => {
    const clear: Pixel = [0, 0, 0, 0];
    const rows = Array.from({ length: 8 }, (_, y) =>
      Array.from({ length: 8 }, (__, x): Pixel => (y === 4 ? [10 + x * 14, 10, 40] : clear)),
    );
    const source = imageOf(rows);
    const result = removeWhiteBackground(source);
    expect(pixelAt(result, 3, 4)).toEqual(pixelAt(source, 3, 4));
    expect(pixelAt(result, 7, 4)[3]).toBe(255);
    expect(pixelAt(result, 0, 0)[3]).toBe(0);
  });

  it('still treats an image with a few stray clear pixels as paper', () => {
    const result = removeWhiteBackground(paper(16, 255, { '2,2': [0, 0, 0, 0] }));
    expect(pixelAt(result, 8, 8)[3]).toBe(0);
  });

  it('doesn’t change the image it was given', () => {
    const source = paper(4, 255, {});
    removeWhiteBackground(source);
    expect(pixelAt(source, 0, 0)[3]).toBe(255);
  });
});

describe('cropToInk', () => {
  const clear: Pixel = [0, 0, 0, 0];
  const ink: Pixel = [0, 0, 0, 255];

  it('trims to the ink, with a little room around it', () => {
    const rows = Array.from({ length: 10 }, (_, y) =>
      Array.from({ length: 10 }, (__, x): Pixel => (x === 4 && y === 5 ? ink : clear)),
    );
    const cropped = cropToInk(imageOf(rows), 1);
    expect(cropped).toMatchObject({ width: 3, height: 3 });
    expect(cropped && pixelAt(cropped, 1, 1)).toEqual([0, 0, 0, 255]);
  });

  it('stays inside the image when the ink touches an edge', () => {
    const cropped = cropToInk(imageOf([[ink, clear]]), 4);
    expect(cropped).toMatchObject({ width: 2, height: 1 });
  });

  it('reports when there’s no ink at all', () => {
    expect(cropToInk(imageOf([[clear, clear]]))).toBeNull();
  });
});

describe('inkCoverage', () => {
  it('is the share of the image that isn’t clear', () => {
    expect(
      inkCoverage(
        imageOf([
          [
            [0, 0, 0, 255],
            [0, 0, 0, 0],
          ],
        ]),
      ),
    ).toBe(0.5);
  });
});

describe('scaledToFit', () => {
  it('leaves small images alone', () => {
    expect(scaledToFit(100, 50, 2000)).toEqual({ width: 100, height: 50 });
  });

  it('shrinks large ones, keeping their shape', () => {
    expect(scaledToFit(4000, 1000, 2000)).toEqual({ width: 2000, height: 500 });
  });

  it('never rounds a thin image down to nothing', () => {
    expect(scaledToFit(10000, 1, 2000)).toEqual({ width: 2000, height: 1 });
  });
});
