import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EMPTY_LOG,
  activeEdits,
  canRedo,
  canUndo,
  changesSince,
  currentEntry,
  deriveTextBoxes,
  record,
  redo,
  undo,
  type Edit,
  type EditEntry,
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

/** What a save produced, and the exact state it contains. */
export interface BuiltFile {
  readonly bytes: Uint8Array;
  readonly edited: boolean;
  readonly entry: EditEntry | undefined;
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
  readonly problem: string | null;
  readonly substitutedFonts: number;
  readonly dismissNotice: () => void;
  readonly reportProblem: (problem: string | null) => void;
  readonly apply: (edit: Edit) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  /** The bytes to write: the original exactly, unless there are edits. */
  readonly buildBytes: () => Promise<BuiltFile>;
  readonly markSaved: (entry: EditEntry | undefined) => void;
}

function changedBox(edit: Edit, boxes: readonly TextBox[]): TextBox | undefined {
  if (edit.kind === 'add-text' || edit.kind === 'replace-text') return edit.box;
  if (edit.kind === 'update-text') return boxes.find((box) => box.id === edit.id);
  return undefined;
}

export function useDocumentEditor(file: OpenedFile | null, platform: Platform): DocumentEditor {
  const [log, setLog] = useState<EditLog>(EMPTY_LOG);
  const [savedEntry, setSavedEntry] = useState<EditEntry | undefined>(undefined);
  const [timesAvailable, setTimesAvailable] = useState(false);
  const [notice, setNotice] = useState<FontNoticeState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<ReadonlyMap<string, FontOutcome>>(() => new Map());
  // Kept in step with the state, because saving straight after an edit must include that edit.
  const logRef = useRef(log);
  const savedRef = useRef(savedEntry);
  const clientRef = useRef<Promise<SaveClient> | null>(null);
  const createClientRef = useRef<(() => Promise<SaveClient>) | null>(null);
  // A font check answers later, by which time the edit it's about may have been undone.
  const latestChange = useRef(0);

  useEffect(() => {
    logRef.current = EMPTY_LOG;
    savedRef.current = undefined;
    latestChange.current += 1;
    setLog(EMPTY_LOG);
    setSavedEntry(undefined);
    setNotice(null);
    setProblem(null);
    setOutcomes(new Map());
    if (!file) return;

    const stop = new AbortController();
    const createClient = async () => {
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
    };
    createClientRef.current = createClient;
    clientRef.current = createClient();
    return () => {
      stop.abort();
      const client = clientRef.current;
      clientRef.current = null;
      void client?.then((opened) => {
        opened.close();
      });
    };
  }, [file, platform]);

  const boxes = useMemo(() => deriveTextBoxes(activeEdits(log)), [log]);

  const moveTo = useCallback((next: EditLog) => {
    logRef.current = next;
    latestChange.current += 1;
    setLog(next);
    setNotice(null);
  }, []);

  const apply = useCallback(
    (edit: Edit) => {
      const next = record(logRef.current, edit);
      moveTo(next);
      const box = changedBox(edit, deriveTextBoxes(activeEdits(next)));
      const client = clientRef.current;
      if (!box || !client) return;
      const change = latestChange.current;
      client
        .then((opened) => opened.resolveFont(box))
        .then((outcome) => {
          setOutcomes((current) => new Map(current).set(box.id, outcome));
          if (change === latestChange.current) setNotice({ box, outcome });
        })
        .catch((error: unknown) => {
          console.error(error);
          if (change !== latestChange.current) return;
          setProblem(
            'The app couldn’t check the font for this edit, so it may not save correctly. Check the text after saving, or undo the edit.',
          );
        });
    },
    [moveTo],
  );

  const undoEdit = useCallback(() => {
    moveTo(undo(logRef.current));
  }, [moveTo]);

  const redoEdit = useCallback(() => {
    moveTo(redo(logRef.current));
  }, [moveTo]);

  const buildBytes = useCallback(async (): Promise<BuiltFile> => {
    const current = logRef.current;
    const entry = currentEntry(current);
    const active = deriveTextBoxes(activeEdits(current));
    if (active.length === 0) {
      if (!file) throw new Error('The document closed before it could be saved.');
      return { bytes: unchangedCopy(file.bytes), edited: false, entry };
    }
    let client = await clientRef.current;
    if (!client) throw new Error('The document closed before it could be saved.');
    // The edits are safe on this side, so a worker that died only needs replacing.
    if (client.failed && createClientRef.current) {
      client.close();
      clientRef.current = createClientRef.current();
      client = await clientRef.current;
    }
    return { bytes: await client.save(active), edited: true, entry };
  }, [file]);

  const markSaved = useCallback((entry: EditEntry | undefined) => {
    savedRef.current = entry;
    setSavedEntry(entry);
  }, []);

  const isDirty = useCallback(() => currentEntry(logRef.current) !== savedRef.current, []);

  const dismissNotice = useCallback(() => {
    setNotice(null);
  }, []);

  const substitutedFonts = boxes.filter((box) => {
    const outcome = outcomes.get(box.id);
    return outcome !== undefined && box.original !== null && outcome.match === 'closest';
  }).length;

  return {
    boxes,
    changes: changesSince(log, savedEntry),
    isDirty,
    canUndo: canUndo(log),
    canRedo: canRedo(log),
    timesAvailable,
    notice,
    problem,
    substitutedFonts,
    dismissNotice,
    reportProblem: setProblem,
    apply,
    undo: undoEdit,
    redo: redoEdit,
    buildBytes,
    markSaved,
  };
}
