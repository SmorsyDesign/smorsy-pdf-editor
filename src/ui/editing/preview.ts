import type { FontId, OriginalFont, TextStyle } from '../../engine/edits/model';
import type { MeasureText } from '../../engine/edits/layout';
import { closestBundled } from '../../engine/fonts/match';

const CSS_FAMILY: Readonly<Record<Exclude<FontId, 'original' | 'times-new-roman'>, string>> = {
  sans: 'Doc Sans',
  serif: 'Doc Serif',
  mono: 'Doc Mono',
  carlito: 'Doc Carlito',
  caladea: 'Doc Caladea',
};

/**
 * Previews always use a bundled font. The file's own fonts live in a worker, and Liberation Serif
 * matches Times New Roman's widths, so what's previewed lays out the same as what's saved.
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

const measuringContext = document.createElement('canvas').getContext('2d');

/** Loads the face first: measuring before it's ready would measure a fallback font instead. */
export async function preparedMeasure(
  style: TextStyle,
  original: OriginalFont | null,
): Promise<MeasureText> {
  const font = previewFont(style, original, style.size);
  await document.fonts.load(font);
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
