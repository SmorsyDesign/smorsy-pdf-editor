import { describe, expect, it } from 'vitest';
import { noteFromAnnotation, type NoteData } from './notes';

const flipped = ([x1 = 0, y1 = 0, x2 = 0, y2 = 0]: readonly number[]) => [
  x1,
  792 - y1,
  x2,
  792 - y2,
];

const note: NoteData = {
  id: '12R',
  subtype: 'Text',
  rect: [100, 700, 124, 724],
  contentsObj: { str: ' Ask about the fee ' },
  titleObj: { str: 'Sam' },
};

describe('reading a note already in a file', () => {
  it('gives its words, author and place on the page', () => {
    expect(noteFromAnnotation(note, flipped)).toEqual({
      id: '12R',
      rect: { x: 100, y: 68, width: 24, height: 24 },
      text: 'Ask about the fee',
      author: 'Sam',
    });
  });

  it('leaves the author empty when the file doesn’t name one', () => {
    expect(noteFromAnnotation({ ...note, titleObj: {} }, flipped)?.author).toBe('');
  });

  it('skips a note with no words, since there would be nothing to read', () => {
    expect(noteFromAnnotation({ ...note, contentsObj: { str: '  ' } }, flipped)).toBeNull();
    expect(noteFromAnnotation({ ...note, contentsObj: {} }, flipped)).toBeNull();
  });

  it('skips everything that isn’t a note', () => {
    expect(noteFromAnnotation({ ...note, subtype: 'Link' }, flipped)).toBeNull();
    expect(noteFromAnnotation({ ...note, subtype: 'Widget' }, flipped)).toBeNull();
  });
});
