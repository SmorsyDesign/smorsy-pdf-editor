import { describe, expect, it } from 'vitest';
import type { TextBlock } from './extract';
import { findMatches } from './search';

const block = (lines: readonly string[]): TextBlock => ({
  id: 'b',
  pageNumber: 2,
  text: lines.join(' '),
  lines: lines.map((text, index) => ({
    text,
    rect: { x: 100, y: 100 + index * 20, width: text.length * 10, height: 16 },
  })),
  rect: { x: 100, y: 100, width: 300, height: 40 },
  angle: 0,
  size: 12,
  firstBaseline: 10,
  lineHeight: 20,
  font: { name: 'x', serif: false, monospace: false, type3: false, bold: false, italic: false },
  mixedStyles: false,
  readOnly: null,
});

describe('findMatches', () => {
  it('finds every match, ignoring case', () => {
    const matches = findMatches([block(['Rent is due', 'the rent is $5'])], 'rent');
    expect(matches).toHaveLength(2);
    expect(matches[0]?.pageNumber).toBe(2);
  });

  it('places the highlight over the matching words', () => {
    const [match] = findMatches([block(['Monthly rent'])], 'rent');
    expect(match?.rect.x).toBeCloseTo(180, 5);
    expect(match?.rect.width).toBeCloseTo(40, 5);
    expect(match?.rect.y).toBe(100);
  });

  it('finds nothing for an empty search', () => {
    expect(findMatches([block(['Rent'])], '  ')).toEqual([]);
  });

  it('finds several matches on one line', () => {
    expect(findMatches([block(['aa aa aa'])], 'aa')).toHaveLength(3);
  });
});
