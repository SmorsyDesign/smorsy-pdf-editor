import type { Color } from './edits/model';

export interface PixelRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SampleResult {
  readonly background: Color;
  /** False when a single-colour patch would be visible, such as over a photo or gradient. */
  readonly flat: boolean;
  readonly text: Color;
}

const WHITE: Color = { r: 1, g: 1, b: 1 };
const BLACK: Color = { r: 0, g: 0, b: 0 };
// Colours this close count as the same, which absorbs compression noise in scans and images.
const SAME_COLOUR_DISTANCE = 24;
const FLAT_SHARE = 0.9;

type Rgb = readonly [number, number, number];

const toColor = ([r, g, b]: Rgb): Color => ({ r: r / 255, g: g / 255, b: b / 255 });

function distance(first: Rgb, second: Rgb): number {
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);
}

function mostCommon(pixels: readonly Rgb[]): Rgb | undefined {
  const counts = new Map<number, { count: number; pixel: Rgb }>();
  for (const pixel of pixels) {
    const key = ((pixel[0] >> 3) << 10) | ((pixel[1] >> 3) << 5) | (pixel[2] >> 3);
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { count: 1, pixel });
  }
  let best: { count: number; pixel: Rgb } | undefined;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  return best?.pixel;
}

/**
 * Reads the rendered page rather than the PDF's colour operators. It works whatever made the
 * colour, including patterns and images. `inner` holds the text; the rest of the region is its
 * surroundings.
 */
export function sampleAround(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  inner: PixelRegion,
): SampleResult {
  const ring: Rgb[] = [];
  const inside: Rgb[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      const pixel: Rgb = [data[at] ?? 255, data[at + 1] ?? 255, data[at + 2] ?? 255];
      const isInside =
        x >= inner.x && x < inner.x + inner.width && y >= inner.y && y < inner.y + inner.height;
      (isInside ? inside : ring).push(pixel);
    }
  }

  const background = mostCommon(ring);
  if (!background) return { background: WHITE, flat: false, text: BLACK };

  const matching = ring.filter((pixel) => distance(pixel, background) <= SAME_COLOUR_DISTANCE);
  const flat = matching.length / ring.length >= FLAT_SHARE;

  // Text edges are blended by anti-aliasing, so the pixel furthest from the background is the
  // truest sample of the ink.
  let text = background;
  for (const pixel of inside) {
    if (distance(pixel, background) > distance(text, background)) text = pixel;
  }

  return {
    background: toColor(background),
    flat,
    text: text === background ? BLACK : toColor(text),
  };
}
