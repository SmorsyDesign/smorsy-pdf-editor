import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EMPTY_LOG,
  activeEdits,
  canRedo,
  canUndo,
  changeCount,
  deriveTextBoxes,
  record,
  redo,
  undo,
  type Edit,
  type EditLog,
  type TextBox,
} from '../../engine/edits/model';
import { embeddingAllowed } from '../../engine/fonts/embedded';
import type { FontOutcome } from '../../engine/save/editor';
import { unchangedCopy } from '../../engine/copy';
import type { OpenedFile, Platform, SystemFontStyle } from '../../platform';
import { SaveClient } from '../../workers/save-client';

const SYSTEM_STYLES: readonly SystemFontStyle[] = ['regular', 'bold', 'italic', 'bold-italic'];

export interface FontNoticeState {
  readonly box: TextBox;
  readonly outcome: FontOutcome;
}

export interface DocumentEditor {
  readonly boxes: readonly TextBox[];
  readonly changes: number;
  /** Reads the latest state directly, so it's right even straight after an edit. */
  readonly isDirty: () => boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly timesAvailable: boolean;
  readonly notice: FontNoticeState | null;
  readonly substitutedFonts: number;
  readonly dismissNotice: () => void;
  readonly apply: (edit: Edit, group?: string) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  /** The bytes to write: the original exactly, unless there are edits. */
  readonly buildBytes: () => Promise<Uint8Array>;
  readonly markSaved: () => void;
}

function changedBox(edit: Edit, boxes: readonly TextBox[]): TextBox | undefined {
  if (edit.kind === 'add-text' || edit.kind === 'replace-text') return edit.box;
  if (edit.kind === 'update-text') return boxes.find((box) => box.id === edit.id);
  return undefined;
}

export function useDocumentEditor(file: OpenedFile | null, platform: Platform): DocumentEditor {
  const [log, setLog] = useState<EditLog>(EMPTY_LOG);
  const savedEntryRef = useRef<unknown>(undefined);
  const [timesAvailable, setTimesAvailable] = useState(false);
  const [notice, setNotice] = useState<FontNoticeState | null>(null);
  const [outcomes, setOutcomes] = useState<ReadonlyMap<string, FontOutcome>>(() => new Map());
  // Kept in step with the state, because saving straight after an edit must include that edit.
  const logRef = useRef(log);
  const clientRef = useRef<Promise<SaveClient> | null>(null);

  useEffect(() => {
    logRef.current = EMPTY_LOG;
    setLog(EMPTY_LOG);
    savedEntryRef.current = undefined;
    setNotice(null);
    setOutcomes(new Map());
    if (!file) return;

    const stop = new AbortController();
    clientRef.current = (async () => {
      const fonts = await Promise.all(SYSTEM_STYLES.map((style) => platform.readSystemFont(style)));
      const systemFonts: Partial<Record<SystemFontStyle, Uint8Array>> = {};
      SYSTEM_STYLES.forEach((style, index) => {
        const bytes = fonts[index];
        if (bytes) systemFonts[style] = bytes;
      });
      if (!stop.signal.aborted) {
        setTimesAvailable(systemFonts.regular ? embeddingAllowed(systemFonts.regular) : false);
      }
      return new SaveClient(file.bytes, systemFonts);
    })();
    const client = clientRef.current;
    return () => {
      stop.abort();
      clientRef.current = null;
      void client.then((opened) => {
        opened.close();
      });
    };
  }, [file, platform]);

  const boxes = useMemo(() => deriveTextBoxes(activeEdits(log)), [log]);

  const apply = useCallback((edit: Edit, group?: string) => {
    const next = record(logRef.current, edit, group);
    logRef.current = next;
    setLog(next);

    const box = changedBox(edit, deriveTextBoxes(activeEdits(next)));
    const client = clientRef.current;
    // A drag doesn't change what the text needs from its font.
    if (!box || !client || group !== undefined) return;
    void client
      .then((opened) => opened.resolveFont(box))
      .then((outcome) => {
        setOutcomes((current) => new Map(current).set(box.id, outcome));
        setNotice(box.lines.length > 0 ? { box, outcome } : null);
      })
      .catch((error: unknown) => {
        console.error(error);
      });
  }, []);

  const undoEdit = useCallback(() => {
    const next = undo(logRef.current);
    logRef.current = next;
    setLog(next);
    setNotice(null);
  }, []);

  const redoEdit = useCallback(() => {
    const next = redo(logRef.current);
    logRef.current = next;
    setLog(next);
  }, []);

  const buildBytes = useCallback(async () => {
    const active = deriveTextBoxes(activeEdits(logRef.current));
    if (active.length === 0) return unchangedCopy(file?.bytes ?? new Uint8Array());
    const client = await clientRef.current;
    if (!client) throw new Error('The document closed before it could be saved.');
    return client.save(active);
  }, [file]);

  const markSaved = useCallback(() => {
    const current = logRef.current;
    savedEntryRef.current = current.entries[current.cursor - 1];
  }, []);

  const isDirty = useCallback(() => {
    const current = logRef.current;
    return current.entries[current.cursor - 1] !== savedEntryRef.current;
  }, []);

  const dismissNotice = useCallback(() => {
    setNotice(null);
  }, []);

  const substitutedFonts = boxes.filter((box) => {
    const outcome = outcomes.get(box.id);
    return outcome !== undefined && box.original !== null && outcome.match === 'closest';
  }).length;

  return {
    boxes,
    changes: changeCount(log),
    isDirty,
    canUndo: canUndo(log),
    canRedo: canRedo(log),
    timesAvailable,
    notice,
    substitutedFonts,
    dismissNotice,
    apply,
    undo: undoEdit,
    redo: redoEdit,
    buildBytes,
    markSaved,
  };
}
