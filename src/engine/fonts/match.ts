import type { OriginalFont } from '../edits/model';

export type BundledFamily = 'sans' | 'serif' | 'mono' | 'carlito' | 'caladea';

export interface BundledMatch {
  readonly family: BundledFamily;
  /** True when the bundled font was designed to match the original's letter widths. */
  readonly sameWidths: boolean;
}

const SAME_WIDTHS: readonly (readonly [RegExp, BundledFamily])[] = [
  [/arial|helvetica/i, 'sans'],
  [/times/i, 'serif'],
  [/courier/i, 'mono'],
  [/calibri/i, 'carlito'],
  [/cambria/i, 'caladea'],
];

const STANDARD_FONTS = new Set([
  'Helvetica',
  'Helvetica-Bold',
  'Helvetica-Oblique',
  'Helvetica-BoldOblique',
  'Times-Roman',
  'Times-Bold',
  'Times-Italic',
  'Times-BoldItalic',
  'Courier',
  'Courier-Bold',
  'Courier-Oblique',
  'Courier-BoldOblique',
]);

const FACE_FILES: Readonly<Record<BundledFamily, string>> = {
  sans: 'liberation/LiberationSans',
  serif: 'liberation/LiberationSerif',
  mono: 'liberation/LiberationMono',
  carlito: 'carlito/Carlito',
  caladea: 'caladea/Caladea',
};

export function cleanFontName(name: string): string {
  return name.replace(/^[A-Z]{6}\+/, '');
}

export function closestBundled(font: OriginalFont): BundledMatch {
  const name = cleanFontName(font.name);
  for (const [pattern, family] of SAME_WIDTHS) {
    if (pattern.test(name)) return { family, sameWidths: true };
  }
  if (font.monospace) return { family: 'mono', sameWidths: false };
  return { family: font.serif ? 'serif' : 'sans', sameWidths: false };
}

export function styleFromName(name: string): { bold: boolean; italic: boolean } {
  return {
    bold: /bold|black|heavy|semibold/i.test(name),
    italic: /italic|oblique/i.test(name),
  };
}

export function isTimesNewRoman(name: string): boolean {
  return /times\s*new\s*roman/i.test(cleanFontName(name));
}

/** The 14 fonts every PDF reader must supply, so these need no embedded data. */
export function standardFontFor(name: string): string | null {
  return STANDARD_FONTS.has(name) ? name : null;
}

export function bundledFaceFile(family: BundledFamily, bold: boolean, italic: boolean): string {
  const style = `${bold ? 'Bold' : ''}${italic ? 'Italic' : ''}` || 'Regular';
  return `${FACE_FILES[family]}-${style}.ttf`;
}
