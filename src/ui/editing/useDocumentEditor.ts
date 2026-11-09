import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EMPTY_LOG,
  activeEdits,
  canRedo,
  canUndo,
  changesSince,
  currentEntry,
  deriveAnnotations,
  deriveFieldAnswers,
  deriveLock,
  deriveSignatures,
  record,
  redo,
  undo,
  type Edit,
  type EditEntry,
  type EditLog,
  type PlacedSignature,
  type TextBox,
} from '../../engine/edits/model';
import type { Annotation } from '../../engine/edits/annotations';
import { embeddingAllowed } from '../../engine/fonts/embedded';
import type { FieldValue } from '../../engine/forms/fields';
import type { FontOutcome, SystemFontStyle } from '../../engine/save/choose-font';
import { unchangedCopy } from '../../engine/copy';
import type { OpenedFile, Platform } from '../../platform';
import { SaveClient } from '../../workers/save-client';
import { isIdentity, keepPages, type Layout } from '../../engine/pages/layout';
import type { PageSize } from '../../engine/zoom';
import { arrangeEdits } from './arrangement';
import { useExistingAnnotations } from './useExistingAnnotations';

const SYSTEM_STYLES: readonly SystemFontStyle[] = ['regular', 'bold', 'italic', 'bold-italic'];

export interface FontNoticeState {
  readonly box: TextBox;
  readonly outcome: FontOutcome;
}

/** What a save produced, and the exact state it contains. */
interface BuiltFile {
  readonly bytes: Uint8Array;
  readonly edited: boolean;
  readonly entry: EditEntry | undefined;
  /** Filled-in form fields under an edit, which are now simply part of the page. */
  readonly fieldsRetired: number;
  /** Form fields left in place that could still hide an edit beneath them. */
  readonly fieldsOnTop: number;
  readonly annotationsRetired: number;
}

export interface DocumentEditor {
  readonly boxes: readonly TextBox[];
  readonly signatures: readonly PlacedSignature[];
  readonly annotations: readonly Annotation[];
  /** Saved annotations that have changed since, which shouldn't be drawn from the file. */
  readonly hiddenAnnotations: ReadonlyMap<number, readonly string[]>;
  /** Whether the app draws this, rather than the page showing the file's own drawing of it. */
  readonly isDrawnByApp: (annotation: Annotation) => boolean;
  /** Annotations the file has that can't be offered for editing, which people should hear about. */
  readonly unreadAnnotations: number;
  /** The order and turns of the pages, which every page number on screen follows. */
  readonly layout: Layout;
  /** The file's own pages as measured, which edits on turned pages are worked out from. */
  readonly setFileSizes: (sizes: readonly PageSize[]) => void;
  /** Form answers that have been changed, by field name. */
  readonly answers: ReadonlyMap<string, FieldValue>;
  /** Whether saving makes answers part of the page. */
  readonly locksAnswers: boolean;
  readonly setLocksAnswers: (locks: boolean) => void;
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
  /** Edits given the same group undo together. */
  readonly apply: (edit: Edit, group?: string) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  /** The bytes to write: the original exactly, unless there are edits. */
  readonly buildBytes: (keep?: ReadonlySet<number>) => Promise<BuiltFile>;
  readonly markSaved: (entry: EditEntry | undefined) => void;
}

function changedBoxId(edit: Edit): string | undefined {
  if (edit.kind === 'add-text' || edit.kind === 'replace-text') return edit.box.id;
  if (edit.kind === 'update-text') return edit.id;
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

  const { existing, existingRef, unreadAnnotations } = useExistingAnnotations(
    file,
    clientRef,
    setProblem,
  );

  // The file's pages as measured, which edits on turned pages are worked out from.
  const [fileSizes, setFileSizes] = useState<readonly PageSize[]>([]);
  const fileSizesRef = useRef(fileSizes);
  fileSizesRef.current = fileSizes;
  const arranged = useMemo(
    () => arrangeEdits(activeEdits(log), existing, fileSizes),
    [log, existing, fileSizes],
  );
  const { boxes, signatures, annotations, savedChange, hiddenAnnotations, layout } = arranged;
  const redrawn = useMemo(
    () => new Set(savedChange.changed.filter(({ saved }) => !saved?.foreign).map(({ id }) => id)),
    [savedChange],
  );
  const answers = useMemo(() => deriveFieldAnswers(activeEdits(log)), [log]);
  const locksAnswers = useMemo(() => deriveLock(activeEdits(log)), [log]);

  const moveTo = useCallback((next: EditLog) => {
    logRef.current = next;
    latestChange.current += 1;
    setLog(next);
    setNotice(null);
  }, []);

  const apply = useCallback(
    (edit: Edit, group?: string) => {
      const next = record(logRef.current, edit, group);
      moveTo(next);
      const id = changedBoxId(edit);
      const now = arrangeEdits(activeEdits(next), existingRef.current, fileSizesRef.current);
      // The font check reads the file's own page, and the notice points at the box as shown.
      const fileBox = now.fileBoxes.find((one) => one.id === id);
      const box = now.boxes.find((one) => one.id === id);
      const client = clientRef.current;
      if (!fileBox || !box || !client) return;
      const change = latestChange.current;
      client
        .then((opened) => opened.resolveFont(fileBox))
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

  const buildBytes = useCallback(
    async (keep?: ReadonlySet<number>): Promise<BuiltFile> => {
      const current = logRef.current;
      const entry = currentEntry(current);
      const edits = activeEdits(current);
      // Saving works on the file's own pages, and arranges them only at the end.
      const now = arrangeEdits(edits, existingRef.current, fileSizesRef.current);
      const { onFile, fileBoxes: active } = now;
      const placed = deriveSignatures(onFile);
      const { changed, removed } = now.savedChange;
      const marks = [...deriveAnnotations(onFile).filter(({ saved }) => !saved), ...changed];
      const filled = [...deriveFieldAnswers(edits)];
      const lock = deriveLock(edits);
      const layout = keep ? keepPages(now.layout, keep) : now.layout;
      const kept = new Set(layout.map((slot) => slot.source));
      const keptOnly = <T extends { readonly pageNumber: number }>(items: readonly T[]) =>
        fileSizesRef.current.length === 0
          ? items
          : items.filter((item) => kept.has(item.pageNumber));
      const nothingToDo =
        active.length === 0 &&
        placed.length === 0 &&
        marks.length === 0 &&
        removed.length === 0 &&
        filled.length === 0 &&
        layout.length === fileSizesRef.current.length &&
        isIdentity(layout);
      if (nothingToDo && !lock) {
        if (!file) throw new Error('The document closed before it could be saved.');
        return {
          bytes: unchangedCopy(file.bytes),
          edited: false,
          entry,
          fieldsRetired: 0,
          fieldsOnTop: 0,
          annotationsRetired: 0,
        };
      }
      let client = await clientRef.current;
      if (!client) throw new Error('The document closed before it could be saved.');
      // The edits are safe on this side, so a worker that died only needs replacing.
      if (client.failed && createClientRef.current) {
        client.close();
        clientRef.current = createClientRef.current();
        client = await clientRef.current;
      }
      const report = await client.save(keptOnly(active), keptOnly(placed), {
        annotations: keptOnly(marks),
        removedSaved: removed,
        answers: filled,
        lock,
        layout,
      });
      return { ...report, edited: true, entry };
    },
    [file],
  );

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
    signatures,
    annotations,
    hiddenAnnotations,
    layout,
    setFileSizes,
    isDrawnByApp: (annotation: Annotation) =>
      !annotation.saved || annotation.saved.noLook === true || redrawn.has(annotation.id),
    unreadAnnotations,
    answers,
    locksAnswers,
    setLocksAnswers: (lock: boolean) => {
      apply({ kind: 'lock-answers', lock });
    },
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
