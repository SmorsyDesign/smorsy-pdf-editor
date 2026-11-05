import { describe, expect, it } from 'vitest';
import { sampleAround } from './sampling';

type Pixel = readonly [number, number, number];

function image(
  width: number,
  height: number,
  paint: (x: number, y: number) => Pixel,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      const at = (y * width + x) * 4;
      data[at] = r;
      data[at + 1] = g;
      data[at + 2] = b;
      data[at + 3] = 255;
    }
  }
  return data;
}

const WIDTH = 60;
const HEIGHT = 40;
const inner = { x: 10, y: 10, width: 40, height: 20 };
const inText = (x: number, y: number) => x >= 15 && x < 45 && y >= 15 && y < 25;

describe('sampleAround', () => {
  it('finds a flat white background and black text', () => {
    const data = image(WIDTH, HEIGHT, (x, y) => (inText(x, y) ? [0, 0, 0] : [255, 255, 255]));
    const result = sampleAround(data, WIDTH, HEIGHT, inner);
    expect(result.background).toEqual({ r: 1, g: 1, b: 1 });
    expect(result.flat).toBe(true);
    expect(result.text).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('finds white text on a dark band', () => {
    const data = image(WIDTH, HEIGHT, (x, y) => (inText(x, y) ? [255, 255, 255] : [20, 70, 115]));
    const result = sampleAround(data, WIDTH, HEIGHT, inner);
    expect(result.background.r).toBeCloseTo(20 / 255, 2);
    expect(result.flat).toBe(true);
    expect(result.text).toEqual({ r: 1, g: 1, b: 1 });
  });

  it('reports a gradient as not flat, so the person can be warned', () => {
    const data = image(WIDTH, HEIGHT, (x) => [x * 4, 200, 255 - x * 4]);
    expect(sampleAround(data, WIDTH, HEIGHT, inner).flat).toBe(false);
  });

  it('tolerates a stray mark near the text', () => {
    const data = image(WIDTH, HEIGHT, (x, y) => (x === 2 && y === 2 ? [0, 0, 0] : [255, 255, 255]));
    expect(sampleAround(data, WIDTH, HEIGHT, inner).flat).toBe(true);
  });

  it('falls back to white when there is nothing outside to sample', () => {
    const data = image(10, 10, () => [40, 40, 40]);
    const result = sampleAround(data, 10, 10, { x: 0, y: 0, width: 10, height: 10 });
    expect(result.background).toEqual({ r: 1, g: 1, b: 1 });
    expect(result.flat).toBe(false);
  });
});
