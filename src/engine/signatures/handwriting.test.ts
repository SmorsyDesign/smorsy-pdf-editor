import { describe, expect, it } from 'vitest';
import { handwritingCovers } from './handwriting';

describe('handwritingCovers', () => {
  it('accepts names in Western European letters', () => {
    expect(handwritingCovers('Mara Okafor')).toBe(true);
    expect(handwritingCovers('José Müller-Lefèvre')).toBe(true);
    expect(handwritingCovers('Siobhán O’Brien')).toBe(true);
  });

  it('spots letters the fonts don’t have', () => {
    expect(handwritingCovers('Данило')).toBe(false);
    expect(handwritingCovers('山田')).toBe(false);
    expect(handwritingCovers('Łukasz')).toBe(false);
    expect(handwritingCovers('Oʼbrien')).toBe(false);
  });
});
