import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  canvasPixels,
  clampZoom,
  displayedPageSize,
  fitWidthZoom,
  zoomIn,
  zoomOut,
} from './zoom';

describe('zoom steps', () => {
  it('moves to the next step up and down', () => {
    expect(zoomIn(100)).toBe(125);
    expect(zoomOut(100)).toBe(75);
  });

  it('moves from a value between steps to the nearest step in that direction', () => {
    expect(zoomIn(94)).toBe(100);
    expect(zoomOut(94)).toBe(75);
  });

  it('stops at the limits', () => {
    expect(zoomIn(MAX_ZOOM)).toBe(MAX_ZOOM);
    expect(zoomOut(MIN_ZOOM)).toBe(MIN_ZOOM);
  });

  it('clamps and rounds to a whole percent', () => {
    expect(clampZoom(10)).toBe(MIN_ZOOM);
    expect(clampZoom(9000)).toBe(MAX_ZOOM);
    expect(clampZoom(93.6)).toBe(94);
  });
});

describe('page sizes', () => {
  it('treats 100% as a Letter page 816 pixels wide', () => {
    expect(displayedPageSize({ width: 612, height: 792 }, 100)).toEqual({
      width: 816,
      height: 1056,
    });
  });

  it('always returns whole pixels', () => {
    const { width, height } = displayedPageSize({ width: 595.28, height: 841.89 }, 94);
    expect(Number.isInteger(width)).toBe(true);
    expect(Number.isInteger(height)).toBe(true);
  });

  it('fits a page to the available width, never above 100% by default', () => {
    expect(fitWidthZoom({ width: 612, height: 792 }, 800)).toBe(98);
    expect(fitWidthZoom({ width: 612, height: 792 }, 2000)).toBe(100);
    expect(fitWidthZoom({ width: 612, height: 792 }, 10)).toBe(MIN_ZOOM);
  });
});

describe('canvasPixels', () => {
  it('multiplies by the device pixel ratio for sharp text on Retina displays', () => {
    expect(canvasPixels({ width: 816, height: 1056 }, 2)).toEqual({
      width: 1632,
      height: 2112,
      outputScale: 2,
    });
  });

  it('stays under the canvas size limit browsers enforce', () => {
    const { width, height } = canvasPixels({ width: 5000, height: 7000 }, 2);
    expect(width * height).toBeLessThanOrEqual(16_777_216);
  });
});
