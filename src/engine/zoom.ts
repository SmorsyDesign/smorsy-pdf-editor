export interface PageSize {
  readonly width: number;
  readonly height: number;
}

export const MIN_ZOOM = 25;
export const MAX_ZOOM = 500;

const STEPS = [25, 50, 75, 100, 125, 150, 200, 300, 400, 500] as const;

// PDF pages are measured in points (1/72 inch) and screens in CSS pixels (1/96 inch).
const POINTS_TO_PIXELS = 96 / 72;

// WebKit refuses to draw on canvases larger than this; going over gives a blank page.
const MAX_CANVAS_AREA = 16_777_216;

export function clampZoom(percent: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(percent)));
}

export function zoomIn(percent: number): number {
  return STEPS.find((step) => step > percent) ?? MAX_ZOOM;
}

export function zoomOut(percent: number): number {
  return STEPS.findLast((step) => step < percent) ?? MIN_ZOOM;
}

export function displayedPageSize(page: PageSize, percent: number): PageSize {
  const scale = (percent / 100) * POINTS_TO_PIXELS;
  return { width: Math.round(page.width * scale), height: Math.round(page.height * scale) };
}

export function fitWidthZoom(page: PageSize, availableWidth: number): number {
  return clampZoom(
    Math.min(100, Math.floor((availableWidth / (page.width * POINTS_TO_PIXELS)) * 100)),
  );
}

export function canvasPixels(
  displayed: PageSize,
  devicePixelRatio: number,
): PageSize & { readonly outputScale: number } {
  const area = displayed.width * displayed.height * devicePixelRatio ** 2;
  const outputScale =
    area > MAX_CANVAS_AREA
      ? Math.sqrt(MAX_CANVAS_AREA / (displayed.width * displayed.height))
      : devicePixelRatio;
  return {
    width: Math.floor(displayed.width * outputScale),
    height: Math.floor(displayed.height * outputScale),
    outputScale,
  };
}
