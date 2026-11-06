import type { CSSProperties } from 'react';
import type { Color, OriginalFont, Rect, TextStyle } from '../../engine/edits/model';
import type { MeasureText } from '../../engine/edits/layout';
import { closestBundled, type BundledFamily } from '../../engine/fonts/match';

const CSS_FAMILY: Readonly<Record<BundledFamily, string>> = {
  sans: 'Doc Sans',
  serif: 'Doc Serif',
  mono: 'Doc Mono',
  carlito: 'Doc Carlito',
  caladea: 'Doc Caladea',
};

/** The names people see for the fonts that ship with the app. */
export const FAMILY_NAMES: Readonly<Record<BundledFamily, string>> = {
  sans: 'Liberation Sans',
  serif: 'Liberation Serif',
  mono: 'Liberation Mono',
  carlito: 'Carlito',
  caladea: 'Caladea',
};

export function cssColor({ r, g, b }: Color): string {
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
}

/** Puts an element where a rectangle in page points falls on the drawn page. */
export function placedOnPage(rect: Rect, angle: number, scale: number): CSSProperties {
  return {
    left: rect.x * scale,
    top: rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale,
    transform: `rotate(${angle}deg)`,
  };
}

/**
 * Previews use a bundled font, because the file's own fonts live in a worker. Lines break where
 * the preview shows, so with an embedded font a saved line can end slightly sooner or later.
 */
export function previewFamily(style: TextStyle, original: OriginalFont | null): string {
  if (style.font === 'times-new-roman') return CSS_FAMILY.serif;
  if (style.font === 'original') {
    return CSS_FAMILY[original ? closestBundled(original).family : 'sans'];
  }
  return CSS_FAMILY[style.font];
}

export function previewFont(
  style: TextStyle,
  original: OriginalFont | null,
  sizeInPixels: number,
): string {
  const weight = style.bold ? '700' : '400';
  const slant = style.italic ? 'italic' : 'normal';
  return `${slant} ${weight} ${sizeInPixels}px "${previewFamily(style, original)}"`;
}

/** Shared by the finished box and the open editor, so text doesn't shift when it's opened. */
export function previewTextStyle(
  style: TextStyle,
  original: OriginalFont | null,
  scale: number,
): CSSProperties {
  return {
    color: cssColor(style.color),
    fontFamily: `"${previewFamily(style, original)}"`,
    fontSize: style.size * scale,
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? 'italic' : 'normal',
    textAlign: style.align,
  };
}

const measuringContext = document.createElement('canvas').getContext('2d');

const FONT_LOAD_LIMIT_MS = 5000;

/** Edits wait in line for this, so a load that never finished would hold up every later edit. */
async function loadWithinTime(font: string): Promise<void> {
  let timer = 0;
  const tooSlow = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      reject(new Error(`This font took too long to load: ${font}`));
    }, FONT_LOAD_LIMIT_MS);
  });
  try {
    await Promise.race([document.fonts.load(font), tooSlow]);
  } finally {
    window.clearTimeout(timer);
  }
}

/** Loads the face first: measuring before it's ready would measure a fallback font instead. */
export async function preparedMeasure(
  style: TextStyle,
  original: OriginalFont | null,
): Promise<MeasureText> {
  const font = previewFont(style, original, style.size);
  await loadWithinTime(font);
  return (text) => {
    if (!measuringContext) return text.length * style.size * 0.5;
    measuringContext.font = font;
    return measuringContext.measureText(text).width;
  };
}

/** How far below a CSS line box's top the text baseline falls, so it can line up with the PDF. */
export function baselineWithinLine(font: string, lineHeight: number): number {
  if (!measuringContext) return lineHeight * 0.8;
  measuringContext.font = font;
  const { fontBoundingBoxAscent: ascent, fontBoundingBoxDescent: descent } =
    measuringContext.measureText('Hg');
  return (lineHeight - (ascent + descent)) / 2 + ascent;
}
