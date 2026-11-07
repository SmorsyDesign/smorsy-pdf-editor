import { describe, expect, it } from 'vitest';
import { displayToUser, userToDisplay } from '../coordinates';
import type { Annotation } from './annotations';
import { deriveAnnotations, savedChanges, type Edit } from './model';
import { allTags, cleanTags, drawingOf, readDrawing } from './saved-data';

const common = { id: 'a', pageNumber: 1, color: { r: 0, g: 0, b: 0 } };

describe('tags', () => {
  it('treats the same tag in different capitals as one, spelled as first typed', () => {
    expect(cleanTags(['Chapter 1', 'chapter 1', 'CHAPTER 1'])).toEqual(['Chapter 1']);
  });

  it('tidies spaces, and drops empty ones', () => {
    expect(cleanTags(['  Chapter   1 ', '', '   '])).toEqual(['Chapter 1']);
  });

  it('lists what’s in use once each, with numbers in a sensible order', () => {
    const tagged = (tags: readonly string[]): Annotation => ({
      ...common,
      kind: 'rect',
      rect: { x: 0, y: 0, width: 1, height: 1 },
      width: 1,
      tags,
    });
    expect(allTags([tagged(['Chapter 10', 'Ask']), tagged(['Chapter 2', 'ask'])])).toEqual([
      'Ask',
      'Chapter 2',
      'Chapter 10',
    ]);
  });
});

describe('what’s kept in the file', () => {
  it('reads back as it was written, rounded', () => {
    const drawing = drawingOf({
      ...common,
      kind: 'arrow',
      from: { x: 1.23456, y: 2 },
      to: { x: 3, y: 4 },
      width: 2,
    });
    expect(readDrawing(JSON.stringify(drawing))).toEqual({
      kind: 'arrow',
      from: { x: 1.23, y: 2 },
      to: { x: 3, y: 4 },
      width: 2,
    });
  });

  it('has nothing to keep for what isn’t redrawn', () => {
    expect(
      drawingOf({
        ...common,
        kind: 'whiteout',
        rect: { x: 0, y: 0, width: 1, height: 1 },
        width: 0,
      }),
    ).toBeNull();
    expect(
      drawingOf({
        ...common,
        kind: 'foreign',
        subtype: 'Stamp',
        rect: { x: 0, y: 0, width: 1, height: 1 },
        text: '',
      }),
    ).toBeNull();
  });
});

describe('converting positions', () => {
  for (const rotation of [0, 90, 180, 270]) {
    it(`gets back to where it started on a page turned ${String(rotation)}°`, () => {
      const box = { x: 10, y: 20, width: 300, height: 400, rotation, unit: 2 };
      const start = { x: 50, y: 70 };
      const back = userToDisplay(displayToUser(start, box), box);
      expect(back.x).toBeCloseTo(start.x);
      expect(back.y).toBeCloseTo(start.y);
    });
  }
});

describe('working out what changed', () => {
  const saved: Annotation = {
    ...common,
    id: '1:5R',
    kind: 'comment',
    at: { x: 1, y: 1 },
    text: 'Words',
    saved: { ref: '5R', pageNumber: 1, foreign: false },
  };
  const other: Annotation = {
    ...saved,
    id: '1:6R',
    saved: { ref: '6R', pageNumber: 1, foreign: false },
  };

  it('starts from what’s in the file', () => {
    expect(deriveAnnotations([], [saved])).toEqual([saved]);
  });

  it('sees nothing changed with no edits', () => {
    expect(savedChanges([], [saved, other])).toEqual({ changed: [], removed: [] });
  });

  it('notices a change', () => {
    const edit: Edit = {
      kind: 'change-annotation',
      annotation: { ...saved, text: 'New' } as Annotation,
    };
    const { changed, removed } = savedChanges([edit], [saved, other]);
    expect(changed.map((one) => one.id)).toEqual([saved.id]);
    expect(removed).toEqual([]);
  });

  it('notices a removal', () => {
    const edit: Edit = { kind: 'remove-annotation', id: saved.id };
    expect(savedChanges([edit], [saved, other]).removed).toEqual([saved.saved]);
  });

  it('counts one changed and then removed as only removed', () => {
    const edits: Edit[] = [
      { kind: 'change-annotation', annotation: saved },
      { kind: 'remove-annotation', id: saved.id },
    ];
    const { changed, removed } = savedChanges(edits, [saved]);
    expect(changed).toEqual([]);
    expect(removed).toEqual([saved.saved]);
  });

  it('leaves out what’s new since opening, which isn’t in the file yet', () => {
    const fresh: Annotation = { ...saved, id: 'new', saved: undefined } as unknown as Annotation;
    const edit: Edit = { kind: 'add-annotation', annotation: fresh };
    expect(savedChanges([edit], [])).toEqual({ changed: [], removed: [] });
  });
});
