import { describe, expect, it } from 'vitest';
import {
  bundledFaceFile,
  cleanFontName,
  closestBundled,
  standardFontFor,
  styleFromName,
} from './match';

const facts = (name: string, extra = {}) => ({
  name,
  serif: false,
  monospace: false,
  type3: false,
  bold: false,
  italic: false,
  ...extra,
});

describe('cleanFontName', () => {
  it('removes a subset prefix', () => {
    expect(cleanFontName('ABCDEF+TimesNewRomanPSMT')).toBe('TimesNewRomanPSMT');
  });
});

describe('closestBundled', () => {
  it.each([
    ['ArialMT', 'sans'],
    ['Arial-BoldMT', 'sans'],
    ['Helvetica-Bold', 'sans'],
    ['ABCDEF+TimesNewRomanPSMT', 'serif'],
    ['Times-Roman', 'serif'],
    ['CourierNewPSMT', 'mono'],
    ['Calibri', 'carlito'],
    ['Cambria-Bold', 'caladea'],
  ])('%s has a bundled font with matching widths: %s', (name, family) => {
    expect(closestBundled(facts(name))).toEqual({ family, sameWidths: true });
  });

  it('falls back on what is known about an unfamiliar font', () => {
    expect(closestBundled(facts('Garamond', { serif: true }))).toEqual({
      family: 'serif',
      sameWidths: false,
    });
    expect(closestBundled(facts('Consolas', { monospace: true }))).toEqual({
      family: 'mono',
      sameWidths: false,
    });
    expect(closestBundled(facts('Frutiger'))).toEqual({ family: 'sans', sameWidths: false });
  });
});

describe('styleFromName', () => {
  it('reads bold and italic from the name', () => {
    expect(styleFromName('Arial-BoldItalicMT')).toEqual({ bold: true, italic: true });
    expect(styleFromName('Times-Oblique')).toEqual({ bold: false, italic: true });
    expect(styleFromName('Lato-Black')).toEqual({ bold: true, italic: false });
    expect(styleFromName('Helvetica')).toEqual({ bold: false, italic: false });
  });
});

describe('standardFontFor', () => {
  it('recognises the fonts every PDF reader must have, when not embedded', () => {
    expect(standardFontFor('Helvetica-Bold')).toBe('Helvetica-Bold');
    expect(standardFontFor('Times-Roman')).toBe('Times-Roman');
  });

  it('ignores anything else, including subset copies', () => {
    expect(standardFontFor('ArialMT')).toBeNull();
    expect(standardFontFor('ABCDEF+Helvetica')).toBeNull();
  });
});

describe('bundledFaceFile', () => {
  it('picks the file for a family and style', () => {
    expect(bundledFaceFile('sans', false, false)).toBe('liberation/LiberationSans-Regular.ttf');
    expect(bundledFaceFile('serif', true, true)).toBe('liberation/LiberationSerif-BoldItalic.ttf');
    expect(bundledFaceFile('carlito', true, false)).toBe('carlito/Carlito-Bold.ttf');
    expect(bundledFaceFile('caladea', false, true)).toBe('caladea/Caladea-Italic.ttf');
  });
});
