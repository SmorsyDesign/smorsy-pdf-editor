import { describe, expect, it } from 'vitest';
import { wrapText } from './layout';

// Every character is 10 wide, which keeps the expected breaks easy to read.
const measure = (text: string) => text.length * 10;

describe('wrapText', () => {
  it('keeps text that fits on one line', () => {
    expect(wrapText('Hello there', 200, measure)).toEqual(['Hello there']);
  });

  it('breaks between words', () => {
    expect(wrapText('one two three four', 90, measure)).toEqual(['one two', 'three', 'four']);
  });

  it('keeps line breaks the person typed, including blank lines', () => {
    expect(wrapText('first\n\nthird', 200, measure)).toEqual(['first', '', 'third']);
  });

  it('breaks a word too long for the box rather than overflowing', () => {
    expect(wrapText('abcdefghij', 40, measure)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('always makes progress when the box is narrower than one character', () => {
    expect(wrapText('abc', 1, measure)).toEqual(['a', 'b', 'c']);
  });

  it('gives no lines for empty text', () => {
    expect(wrapText('', 100, measure)).toEqual([]);
  });
});
