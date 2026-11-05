import { describe, expect, it } from 'vitest';
import {
  activeEdits,
  canRedo,
  canUndo,
  changeCount,
  deriveTextBoxes,
  EMPTY_LOG,
  record,
  redo,
  undo,
  type TextBox,
} from './model';

const box = (id: string, text = 'Hello'): TextBox => ({
  id,
  pageNumber: 1,
  rect: { x: 10, y: 20, width: 200, height: 40 },
  angle: 0,
  text,
  lines: [text],
  firstBaseline: 12,
  lineHeight: 14,
  style: {
    font: 'sans',
    size: 12,
    color: { r: 0, g: 0, b: 0 },
    bold: false,
    italic: false,
    align: 'left',
  },
  covers: [],
  original: null,
});

describe('the edit log', () => {
  it('starts empty, with nothing to undo or redo', () => {
    expect(activeEdits(EMPTY_LOG)).toEqual([]);
    expect(canUndo(EMPTY_LOG)).toBe(false);
    expect(canRedo(EMPTY_LOG)).toBe(false);
  });

  it('never changes an existing log', () => {
    const first = record(EMPTY_LOG, { kind: 'add-text', box: box('a') });
    const frozenEntries = first.entries;
    record(first, { kind: 'remove-text', id: 'a' });
    expect(first.entries).toBe(frozenEntries);
    expect(first.entries).toHaveLength(1);
  });

  it('undo and redo walk the log', () => {
    const log = record(EMPTY_LOG, { kind: 'add-text', box: box('a') });
    const undone = undo(log);
    expect(activeEdits(undone)).toEqual([]);
    expect(canRedo(undone)).toBe(true);
    expect(activeEdits(redo(undone))).toHaveLength(1);
  });

  it('a new edit after an undo discards what could have been redone', () => {
    const log = record(EMPTY_LOG, { kind: 'add-text', box: box('a') });
    const next = record(undo(log), { kind: 'add-text', box: box('b') });
    expect(canRedo(next)).toBe(false);
    expect(deriveTextBoxes(activeEdits(next)).map((item) => item.id)).toEqual(['b']);
  });

  it('undoes a whole group as one step, so a drag is one undo', () => {
    let log = record(EMPTY_LOG, { kind: 'add-text', box: box('a') });
    for (const x of [11, 12, 13]) {
      log = record(
        log,
        { kind: 'update-text', id: 'a', changes: { rect: { x, y: 20, width: 200, height: 40 } } },
        'drag-1',
      );
    }
    expect(changeCount(log)).toBe(2);
    const undone = undo(log);
    expect(deriveTextBoxes(activeEdits(undone))[0]?.rect.x).toBe(10);
    expect(deriveTextBoxes(activeEdits(redo(undone)))[0]?.rect.x).toBe(13);
  });

  it('undo and redo at the ends change nothing', () => {
    expect(undo(EMPTY_LOG)).toBe(EMPTY_LOG);
    expect(redo(EMPTY_LOG)).toBe(EMPTY_LOG);
  });
});

describe('deriveTextBoxes', () => {
  it('applies updates in order', () => {
    const log = record(record(EMPTY_LOG, { kind: 'add-text', box: box('a') }), {
      kind: 'update-text',
      id: 'a',
      changes: { text: 'Changed', lines: ['Changed'] },
    });
    expect(deriveTextBoxes(activeEdits(log))[0]?.text).toBe('Changed');
  });

  it('removes a box', () => {
    const log = record(record(EMPTY_LOG, { kind: 'add-text', box: box('a') }), {
      kind: 'remove-text',
      id: 'a',
    });
    expect(deriveTextBoxes(activeEdits(log))).toEqual([]);
  });

  it('keeps what a replacement covers when its text is emptied', () => {
    const replaced = {
      ...box('a'),
      covers: [
        { rect: { x: 0, y: 0, width: 10, height: 10 }, angle: 0, color: { r: 1, g: 1, b: 1 } },
      ],
    };
    const log = record(record(EMPTY_LOG, { kind: 'replace-text', box: replaced }), {
      kind: 'update-text',
      id: 'a',
      changes: { text: '', lines: [] },
    });
    const [result] = deriveTextBoxes(activeEdits(log));
    expect(result?.lines).toEqual([]);
    expect(result?.covers).toHaveLength(1);
  });

  it('ignores an update to a box that no longer exists', () => {
    const edits = [{ kind: 'update-text', id: 'gone', changes: { text: 'x' } }] as const;
    expect(deriveTextBoxes(edits)).toEqual([]);
  });
});
