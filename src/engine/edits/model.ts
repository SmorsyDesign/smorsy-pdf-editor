import type { FieldValue } from '../forms/fields';
import type { Annotation } from './annotations';

/** Positions are PDF points as displayed: origin at the page's top left, y going down. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Each channel runs from 0 to 1. */
export interface Color {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export type Alignment = 'left' | 'center' | 'right';

/** 'original' tries the font already in the file before anything else. */
export type FontId =
  'original' | 'sans' | 'serif' | 'mono' | 'carlito' | 'caladea' | 'times-new-roman';

export interface TextStyle {
  readonly font: FontId;
  readonly size: number;
  readonly color: Color;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly align: Alignment;
}

/** A background-coloured patch over the original text. */
export interface Cover {
  readonly rect: Rect;
  readonly angle: number;
  readonly color: Color;
}

/** What was known about the font of the text being replaced. */
export interface OriginalFont {
  readonly name: string;
  readonly serif: boolean;
  readonly monospace: boolean;
  readonly type3: boolean;
  readonly bold: boolean;
  readonly italic: boolean;
  /** Characters this font visibly draws on the page, the only ones safe to reuse it for. */
  readonly knownCharacters?: string;
}

export interface TextBox {
  readonly id: string;
  readonly pageNumber: number;
  readonly rect: Rect;
  /** Degrees clockwise, as displayed. */
  readonly angle: number;
  readonly text: string;
  /** Wrapped when the edit was made, so the saved lines match what the person saw. */
  readonly lines: readonly string[];
  /** Distance from the box's top to the first baseline. */
  readonly firstBaseline: number;
  readonly lineHeight: number;
  readonly style: TextStyle;
  readonly covers: readonly Cover[];
  readonly original: OriginalFont | null;
}

type TextBoxChanges = Partial<
  Pick<TextBox, 'rect' | 'text' | 'lines' | 'style' | 'firstBaseline' | 'lineHeight'>
>;

/** A signature picture, made once and placed as often as needed. It exists only in memory. */
export interface SignatureImage {
  readonly id: string;
  /** Always re-encoded by the app, so nothing from an uploaded file's metadata comes along. */
  readonly png: Uint8Array;
  readonly width: number;
  readonly height: number;
  /** The ink colour, when known, so a date stamp can match it. */
  readonly ink: Color | null;
}

export interface PlacedSignature {
  readonly id: string;
  readonly pageNumber: number;
  /** Before turning. A signature turns around its middle. */
  readonly rect: Rect;
  /** Degrees clockwise, as displayed. */
  readonly angle: number;
  readonly image: SignatureImage;
  /** Placed the same way as a signature, but managed with the other annotations. */
  readonly purpose?: 'image';
}

export type PlacedSignatureChanges = Partial<
  Pick<PlacedSignature, 'rect' | 'angle' | 'pageNumber'>
>;

export type Edit =
  | { readonly kind: 'add-text'; readonly box: TextBox }
  | { readonly kind: 'replace-text'; readonly box: TextBox }
  | { readonly kind: 'update-text'; readonly id: string; readonly changes: TextBoxChanges }
  | { readonly kind: 'remove-text'; readonly id: string }
  | { readonly kind: 'place-signature'; readonly placement: PlacedSignature }
  | {
      readonly kind: 'update-signature';
      readonly id: string;
      readonly changes: PlacedSignatureChanges;
    }
  | { readonly kind: 'remove-signature'; readonly id: string }
  | { readonly kind: 'add-annotation'; readonly annotation: Annotation }
  | { readonly kind: 'change-annotation'; readonly annotation: Annotation }
  | { readonly kind: 'remove-annotation'; readonly id: string }
  | { readonly kind: 'fill-field'; readonly name: string; readonly value: FieldValue }
  | { readonly kind: 'lock-answers'; readonly lock: boolean };

export interface EditEntry {
  readonly edit: Edit;
  /** Entries sharing a group undo together, so one drag is one undo. */
  readonly group: string | number;
}

export interface EditLog {
  readonly entries: readonly EditEntry[];
  /** Entries before this index are active. */
  readonly cursor: number;
}

export const EMPTY_LOG: EditLog = { entries: [], cursor: 0 };

export function record(log: EditLog, edit: Edit, group?: string): EditLog {
  const kept = log.entries.slice(0, log.cursor);
  return {
    entries: [...kept, { edit, group: group ?? kept.length }],
    cursor: kept.length + 1,
  };
}

export function canUndo(log: EditLog): boolean {
  return log.cursor > 0;
}

export function canRedo(log: EditLog): boolean {
  return log.cursor < log.entries.length;
}

export function undo(log: EditLog): EditLog {
  const last = log.entries[log.cursor - 1];
  if (!last) return log;
  let cursor = log.cursor - 1;
  while (cursor > 0 && log.entries[cursor - 1]?.group === last.group) cursor -= 1;
  return { ...log, cursor };
}

export function redo(log: EditLog): EditLog {
  const next = log.entries[log.cursor];
  if (!next) return log;
  let cursor = log.cursor + 1;
  while (cursor < log.entries.length && log.entries[cursor]?.group === next.group) cursor += 1;
  return { ...log, cursor };
}

export function activeEdits(log: EditLog): readonly Edit[] {
  return log.entries.slice(0, log.cursor).map((entry) => entry.edit);
}

/** The number of undoable steps, which is what the person thinks of as their changes. */
export function changeCount(log: EditLog): number {
  return new Set(log.entries.slice(0, log.cursor).map((entry) => entry.group)).size;
}

/** The entry the log stands at, which identifies this exact state even after undo and redo. */
export function currentEntry(log: EditLog): EditEntry | undefined {
  return log.entries[log.cursor - 1];
}

/** How many undoable steps separate the current state from a saved one, in either direction. */
export function changesSince(log: EditLog, saved: EditEntry | undefined): number {
  const savedCursor = saved ? log.entries.indexOf(saved) + 1 : 0;
  // A saved entry can be discarded by editing after an undo, and then nothing is shared.
  if (saved && savedCursor === 0) return Math.max(changeCount(log), 1);
  const from = Math.min(savedCursor, log.cursor);
  const to = Math.max(savedCursor, log.cursor);
  return new Set(log.entries.slice(from, to).map((entry) => entry.group)).size;
}

export function deriveTextBoxes(edits: readonly Edit[]): readonly TextBox[] {
  const boxes = new Map<string, TextBox>();
  for (const edit of edits) {
    switch (edit.kind) {
      case 'add-text':
      case 'replace-text':
        boxes.set(edit.box.id, edit.box);
        break;
      case 'update-text': {
        const current = boxes.get(edit.id);
        if (current) boxes.set(edit.id, { ...current, ...edit.changes });
        break;
      }
      case 'remove-text':
        boxes.delete(edit.id);
        break;
      default:
        break;
    }
  }
  return [...boxes.values()];
}

export function deriveSignatures(edits: readonly Edit[]): readonly PlacedSignature[] {
  const placed = new Map<string, PlacedSignature>();
  for (const edit of edits) {
    switch (edit.kind) {
      case 'place-signature':
        placed.set(edit.placement.id, edit.placement);
        break;
      case 'update-signature': {
        const current = placed.get(edit.id);
        if (current) placed.set(edit.id, { ...current, ...edit.changes });
        break;
      }
      case 'remove-signature':
        placed.delete(edit.id);
        break;
      default:
        break;
    }
  }
  return [...placed.values()];
}

export function deriveAnnotations(edits: readonly Edit[]): readonly Annotation[] {
  const annotations = new Map<string, Annotation>();
  for (const edit of edits) {
    if (edit.kind === 'add-annotation' || edit.kind === 'change-annotation') {
      annotations.set(edit.annotation.id, edit.annotation);
    } else if (edit.kind === 'remove-annotation') {
      annotations.delete(edit.id);
    }
  }
  return [...annotations.values()];
}

/** The latest answer for each field that's been changed. */
/** Whether answers become part of the page when saving. */
export function deriveLock(edits: readonly Edit[]): boolean {
  return edits.reduce((lock, edit) => (edit.kind === 'lock-answers' ? edit.lock : lock), false);
}

export function deriveFieldAnswers(edits: readonly Edit[]): ReadonlyMap<string, FieldValue> {
  const answers = new Map<string, FieldValue>();
  for (const edit of edits) {
    if (edit.kind === 'fill-field') answers.set(edit.name, edit.value);
  }
  return answers;
}
