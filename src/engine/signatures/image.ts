export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

// Anything this close to the paper's colour counts as paper, which hides speckle and shadows.
const PAPER_MARGIN = 16;
// How gradually ink fades in past that, so strokes keep soft edges rather than jagged ones.
const EDGE_SOFTNESS = 48;
// Paper fills most of a signature photo, so the brightest quarter of pixels shows its colour.
const PAPER_PERCENTILE = 0.75;
// Paper photographed or scanned is solid. This much clear means the background is already gone.
const ALREADY_CUT_OUT = 0.05;

const luminance = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

function paperLevel({ data }: RgbaImage): number {
  const histogram = new Array<number>(256).fill(0);
  let opaque = 0;
  for (let at = 0; at < data.length; at += 4) {
    if ((data[at + 3] ?? 0) === 0) continue;
    const level = Math.round(luminance(data[at] ?? 0, data[at + 1] ?? 0, data[at + 2] ?? 0));
    histogram[level] = (histogram[level] ?? 0) + 1;
    opaque += 1;
  }
  const target = opaque * PAPER_PERCENTILE;
  let seen = 0;
  for (let level = 0; level < 256; level += 1) {
    seen += histogram[level] ?? 0;
    if (seen >= target) return level;
  }
  return 255;
}

/**
 * Turns the paper clear and keeps the ink. Partly clear pixels get their paper tint taken back out,
 * so a stroke doesn't carry a pale halo onto whatever page it's placed on.
 */
export function removeWhiteBackground(image: RgbaImage): RgbaImage {
  // Treating ink as paper would erase a signature that's already been cut out.
  if (1 - inkCoverage(image) > ALREADY_CUT_OUT) return image;
  const paper = paperLevel(image);
  const data = new Uint8ClampedArray(image.data);
  for (let at = 0; at < data.length; at += 4) {
    const r = data[at] ?? 0;
    const g = data[at + 1] ?? 0;
    const b = data[at + 2] ?? 0;
    const strength = (paper - PAPER_MARGIN - luminance(r, g, b)) / EDGE_SOFTNESS;
    const alpha = Math.min(1, Math.max(0, strength));
    if (alpha > 0 && alpha < 1) {
      data[at] = (r - (1 - alpha) * paper) / alpha;
      data[at + 1] = (g - (1 - alpha) * paper) / alpha;
      data[at + 2] = (b - (1 - alpha) * paper) / alpha;
    }
    data[at + 3] = alpha * (data[at + 3] ?? 0);
  }
  return { width: image.width, height: image.height, data };
}

/** Trims away everything clear. Resolves to null if nothing is left. */
export function cropToInk(image: RgbaImage, padding = 2): RgbaImage | null {
  const { width, height, data } = image;
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) === 0) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < 0) return null;

  const fromX = Math.max(0, left - padding);
  const toX = Math.min(width - 1, right + padding);
  const fromY = Math.max(0, top - padding);
  const toY = Math.min(height - 1, bottom + padding);
  const croppedWidth = toX - fromX + 1;
  const cropped = new Uint8ClampedArray(croppedWidth * (toY - fromY + 1) * 4);
  for (let y = fromY; y <= toY; y += 1) {
    const start = (y * width + fromX) * 4;
    cropped.set(data.subarray(start, start + croppedWidth * 4), (y - fromY) * croppedWidth * 4);
  }
  return { width: croppedWidth, height: toY - fromY + 1, data: cropped };
}

/** The share of the image that isn't clear, from 0 to 1. */
export function inkCoverage({ data }: RgbaImage): number {
  let inked = 0;
  for (let at = 3; at < data.length; at += 4) {
    if ((data[at] ?? 0) > 0) inked += 1;
  }
  return data.length === 0 ? 0 : inked / (data.length / 4);
}

export function scaledToFit(width: number, height: number, limit: number) {
  const scale = Math.min(1, limit / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
