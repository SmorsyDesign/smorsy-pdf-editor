import { describe, expect, it } from 'vitest';
import {
  activeEdits,
  canRedo,
  canUndo,
  changeCount,
  changesSince,
  currentEntry,
  deriveSignatures,
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

  it('gives each edit made after an undo its own step', () => {
    let log = record(EMPTY_LOG, { kind: 'add-text', box: box('a') });
    log = record(log, { kind: 'add-text', box: box('b') });
    log = undo(log);
    log = record(log, { kind: 'add-text', box: box('c') });
    log = record(log, { kind: 'add-text', box: box('d') });
    expect(deriveTextBoxes(activeEdits(undo(log))).map((item) => item.id)).toEqual(['a', 'c']);
  });

  it('counts changes since the saved point, in either direction', () => {
    let log = record(EMPTY_LOG, { kind: 'add-text', box: box('a') });
    log = record(log, { kind: 'add-text', box: box('b') });
    const saved = currentEntry(log);
    expect(changesSince(log, saved)).toBe(0);
    expect(changesSince(undo(log), saved)).toBe(1);
    expect(changesSince(record(log, { kind: 'remove-text', id: 'a' }), saved)).toBe(1);
  });

  it('counts everything as changed when the saved point was discarded', () => {
    let log = record(EMPTY_LOG, { kind: 'add-text', box: box('a') });
    const saved = currentEntry(log);
    log = record(undo(log), { kind: 'add-text', box: box('b') });
    expect(changesSince(log, saved)).toBe(1);
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

describe('signatures in the edit log', () => {
  const image = { id: 'image', png: new Uint8Array([1]), width: 200, height: 100, ink: null };
  const placement = {
    id: 'one',
    pageNumber: 1,
    rect: { x: 10, y: 20, width: 100, height: 50 },
    angle: 0,
    image,
  };

  it('derives what’s placed, following moves and removals', () => {
    let log = record(EMPTY_LOG, { kind: 'place-signature', placement });
    expect(deriveSignatures(activeEdits(log))).toEqual([placement]);

    const rect = { x: 30, y: 40, width: 100, height: 50 };
    log = record(log, { kind: 'update-signature', id: 'one', changes: { rect, angle: 90 } });
    expect(deriveSignatures(activeEdits(log))).toEqual([{ ...placement, rect, angle: 90 }]);

    log = record(log, { kind: 'remove-signature', id: 'one' });
    expect(deriveSignatures(activeEdits(log))).toEqual([]);
  });

  it('undo and redo walk placements like any other edit', () => {
    const log = record(EMPTY_LOG, { kind: 'place-signature', placement });
    expect(deriveSignatures(activeEdits(undo(log)))).toEqual([]);
    expect(deriveSignatures(activeEdits(redo(undo(log))))).toEqual([placement]);
  });

  it('a signature and its date stamp undo together', () => {
    const box = {
      id: 'date',
      pageNumber: 1,
      rect: { x: 0, y: 0, width: 10, height: 10 },
      angle: 0,
      text: 'November 5, 2026',
      lines: ['November 5, 2026'],
      firstBaseline: 10,
      lineHeight: 14,
      style: {
        font: 'serif' as const,
        size: 12,
        color: { r: 0, g: 0, b: 0 },
        bold: false,
        italic: false,
        align: 'left' as const,
      },
      covers: [],
      original: null,
    };
    let log = record(EMPTY_LOG, { kind: 'place-signature', placement }, 'signed');
    log = record(log, { kind: 'add-text', box }, 'signed');
    expect(changeCount(log)).toBe(1);
    expect(undo(log).cursor).toBe(0);
  });

  it('ignores signatures when working out text, and text when working out signatures', () => {
    const log = record(EMPTY_LOG, { kind: 'place-signature', placement });
    expect(deriveTextBoxes(activeEdits(log))).toEqual([]);
  });
});
