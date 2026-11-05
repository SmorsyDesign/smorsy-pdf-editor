import type { Rect } from '../../engine/edits/model';
import { sampleAround, type SampleResult } from '../../engine/sampling';

const FALLBACK: SampleResult = {
  background: { r: 1, g: 1, b: 1 },
  flat: true,
  text: { r: 0, g: 0, b: 0 },
};

// Enough surroundings to judge the background without reaching the next line of text.
const RING_POINTS = 3;

function boundsOf(rect: Rect, angle: number): Rect {
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const xs = [0, rect.width * cos, -rect.height * sin, rect.width * cos - rect.height * sin];
  const ys = [0, rect.width * sin, rect.height * cos, rect.width * sin + rect.height * cos];
  const left = rect.x + Math.min(...xs);
  const top = rect.y + Math.min(...ys);
  return {
    x: left,
    y: top,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

/** Resolves true once the page has been drawn, or false if that hasn't happened in time. */
export function whenPageDrawn(pageElement: HTMLElement, timeoutMs = 3000): Promise<boolean> {
  const canvas = pageElement.querySelector('canvas');
  if (!canvas) return Promise.resolve(false);
  if (canvas.dataset.drawn === 'true') return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (drawn: boolean) => {
      observer.disconnect();
      window.clearTimeout(timer);
      resolve(drawn);
    };
    const observer = new MutationObserver(() => {
      if (canvas.dataset.drawn === 'true') finish(true);
    });
    const timer = window.setTimeout(() => {
      finish(false);
    }, timeoutMs);
    observer.observe(canvas, { attributes: true, attributeFilter: ['data-drawn'] });
  });
}

/** Reads colours from the page as drawn, so the patch matches what the person actually sees. */
export function samplePageColours(
  pageElement: HTMLElement,
  rect: Rect,
  angle: number,
  scale: number,
): SampleResult {
  const canvas = pageElement.querySelector('canvas');
  if (!canvas || canvas.width === 0) return FALLBACK;

  const cssWidth = canvas.getBoundingClientRect().width;
  const pixelsPerPoint = (canvas.width / cssWidth) * scale;
  const bounds = boundsOf(rect, angle);
  const ring = Math.ceil(RING_POINTS * pixelsPerPoint);
  const left = Math.max(0, Math.floor(bounds.x * pixelsPerPoint) - ring);
  const top = Math.max(0, Math.floor(bounds.y * pixelsPerPoint) - ring);
  const width = Math.min(canvas.width - left, Math.ceil(bounds.width * pixelsPerPoint) + ring * 2);
  const height = Math.min(
    canvas.height - top,
    Math.ceil(bounds.height * pixelsPerPoint) + ring * 2,
  );
  if (width <= 0 || height <= 0) return FALLBACK;

  const copy = document.createElement('canvas');
  copy.width = width;
  copy.height = height;
  const context = copy.getContext('2d', { willReadFrequently: true });
  if (!context) return FALLBACK;
  context.drawImage(canvas, left, top, width, height, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  return sampleAround(data, width, height, {
    x: ring,
    y: ring,
    width: width - ring * 2,
    height: height - ring * 2,
  });
}
