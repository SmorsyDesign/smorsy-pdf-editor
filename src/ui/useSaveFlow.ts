import { useCallback, useEffect, useRef, useState } from 'react';
import { copyFileName, extractFileName } from '../engine/copy';
import { PLAIN_PROBLEM, UNSUPPORTED_TEXT } from '../engine/errors';
import { openDocument } from '../engine/document';
import { SaveFailure, type OpenedFile, type Platform, type SaveFailureKind } from '../platform';
import type { DocumentEditor } from './editing/useDocumentEditor';
import { explainFormChanges } from './messages';

export type SaveDialog =
  | { readonly kind: 'confirm-replace'; readonly file: OpenedFile; readonly path: string }
  | { readonly kind: 'save-failed'; readonly failure: SaveFailureKind; readonly detail: string }
  /** Something to know about a save that worked, before going on to close or quit. */
  | { readonly kind: 'save-note'; readonly message: string; readonly then: () => void };

/** 'asking' means a dialog will decide, so anything waiting on the save keeps waiting. */
type Outcome = 'saved' | 'asking' | 'stopped';

function failureDialog(error: unknown, otherwise: SaveFailureKind): SaveDialog {
  if (error instanceof SaveFailure) {
    return { kind: 'save-failed', failure: error.kind, detail: error.message };
  }
  const detail = error instanceof Error ? error.message : String(error);
  if (detail.startsWith(PLAIN_PROBLEM)) {
    return {
      kind: 'save-failed',
      failure: 'plain-problem',
      detail: detail.slice(PLAIN_PROBLEM.length),
    };
  }
  return detail.startsWith(UNSUPPORTED_TEXT)
    ? {
        kind: 'save-failed',
        failure: 'unsupported-text',
        detail: detail.slice(UNSUPPORTED_TEXT.length),
      }
    : { kind: 'save-failed', failure: otherwise, detail };
}

interface SaveFlowOptions {
  readonly platform: Platform;
  readonly file: OpenedFile | null;
  readonly editor: DocumentEditor;
  readonly flush: () => Promise<boolean>;
  readonly exclusively: (task: () => Promise<Outcome>) => Promise<Outcome | undefined>;
  readonly showDialog: (dialog: SaveDialog) => void;
  readonly hasUnfinishedEdit: () => boolean;
}

/** The first save makes a new file, and later saves update that copy. */
export function useSaveFlow({
  platform,
  file,
  editor,
  flush,
  exclusively,
  showDialog,
  hasUnfinishedEdit,
}: SaveFlowOptions) {
  const { buildBytes, markSaved, isDirty, problem, reportProblem } = editor;
  const [saved, setSaved] = useState<{
    readonly file: OpenedFile;
    readonly path: string;
    readonly message: string;
    /** Saving again writes over the original, which was confirmed once already. */
    readonly overOriginal: boolean;
    /** The original has been replaced at some point, so it can't be called unchanged. */
    readonly originalChanged: boolean;
  } | null>(null);
  const afterSave = useRef<(() => void) | null>(null);
  const [extracted, setExtracted] = useState('');
  // Only until something changes, after which it would be news about a document that's moved on.
  const { changes } = editor;
  useEffect(() => {
    setExtracted('');
  }, [changes, file]);
  const saveNote = useRef<string | null>(null);
  const shownNote = useRef<string | null>(null);
  const current = saved?.file === file ? saved : null;
  const savedPath = current?.path ?? null;

  /** Runs once the save has let go of the app, because what's next may need a turn of its own. */
  const settle = useCallback(
    (outcome: Outcome | undefined, waiting = false) => {
      if (outcome === undefined) {
        // A plain save dropped during another one does no harm, but this one was meant to lead on.
        if (waiting) reportProblem('The app is still busy. Try again in a moment.');
        return;
      }
      if (outcome === 'asking') return;
      const next = afterSave.current;
      afterSave.current = null;
      const note = saveNote.current;
      saveNote.current = null;
      if (outcome !== 'saved') return;
      if (!next) {
        // A note about the last save shouldn't still be up after a save it no longer applies to.
        if (note || problem === shownNote.current) reportProblem(note);
        shownNote.current = note;
      } else if (isDirty() || hasUnfinishedEdit()) {
        // Anything added while saving isn't in the file, so carrying on would lose it.
        reportProblem('You kept editing during the save, so nothing was closed. Save again first.');
      } else if (note) {
        // On the way out, because a note on the page would close along with it unread.
        showDialog({ kind: 'save-note', message: note, then: next });
      } else {
        next();
      }
    },
    [hasUnfinishedEdit, isDirty, problem, reportProblem, showDialog],
  );

  const writeTo = useCallback(
    async (target: OpenedFile, path: string, overOriginal: boolean): Promise<Outcome> => {
      setExtracted('');
      try {
        const { bytes, edited, entry, fieldsRetired, fieldsOnTop, annotationsRetired } =
          await buildBytes();
        if (edited) {
          // Proves the result opens, before it can replace anything on disk.
          const check = await openDocument(bytes);
          await check.close();
        }
        await platform.writeFile(path, bytes);
        markSaved(entry);
        saveNote.current = explainFormChanges(fieldsRetired, fieldsOnTop, annotationsRetired);
        setSaved((previous) => ({
          file: target,
          path,
          overOriginal,
          originalChanged: overOriginal || (previous?.file === target && previous.originalChanged),
          message: overOriginal ? 'Original file updated' : 'Copy saved',
        }));
        return 'saved';
      } catch (error) {
        showDialog(failureDialog(error, 'build-failed'));
        return 'stopped';
      }
    },
    [buildBytes, markSaved, platform, showDialog],
  );

  const saveCopy = useCallback(
    async (next?: () => void) => {
      const outcome = await exclusively(async () => {
        if (!file) return 'stopped';
        afterSave.current = next ?? null;
        setSaved((previous) => previous && { ...previous, message: '' });
        try {
          if (!(await flush())) return 'stopped';
          const path = await platform.chooseSaveLocation(copyFileName(file.name));
          if (path === null) return 'stopped';
          if (await platform.isSameFile(file.path, path)) {
            showDialog({ kind: 'confirm-replace', file, path });
            return 'asking';
          }
          return await writeTo(file, path, false);
        } catch (error) {
          showDialog(failureDialog(error, 'other'));
          return 'stopped';
        }
      });
      settle(outcome, next !== undefined);
    },
    [exclusively, file, flush, platform, settle, showDialog, writeTo],
  );

  const save = useCallback(
    async (next?: () => void) => {
      if (!file) return;
      if (savedPath === null) {
        await saveCopy(next);
        return;
      }
      const overOriginal = current?.overOriginal ?? false;
      const outcome = await exclusively(async () => {
        afterSave.current = next ?? null;
        return (await flush()) ? writeTo(file, savedPath, overOriginal) : 'stopped';
      });
      settle(outcome, next !== undefined);
    },
    [current?.overOriginal, exclusively, file, flush, savedPath, saveCopy, settle, writeTo],
  );

  const replaceOriginal = useCallback(
    async (target: OpenedFile, path: string) => {
      const outcome = await exclusively(() => writeTo(target, path, true));
      settle(outcome);
    },
    [exclusively, settle, writeTo],
  );

  /** Saves just these pages as a new file, leaving the document being worked on as it is. */
  const extractPages = useCallback(
    async (positions: ReadonlySet<number>) => {
      const outcome = await exclusively(async () => {
        if (!file) return 'stopped';
        try {
          if (!(await flush())) return 'stopped';
          const path = await platform.chooseSaveLocation(extractFileName(file.name, positions));
          if (path === null) return 'stopped';
          const replacing =
            (await platform.isSameFile(file.path, path)) ||
            (savedPath !== null && (await platform.isSameFile(savedPath, path)));
          if (replacing) {
            showDialog({
              kind: 'save-failed',
              failure: 'plain-problem',
              detail:
                'That’s the file you’re working on. Choose a new name for the pages, so it isn’t replaced.',
            });
            return 'stopped';
          }
          const { bytes, fieldsRetired, fieldsOnTop, annotationsRetired } =
            await buildBytes(positions);
          const check = await openDocument(bytes);
          await check.close();
          await platform.writeFile(path, bytes);
          setExtracted(
            positions.size === 1 ? 'Page saved as a new file' : 'Pages saved as a new file',
          );
          // The same notes as any save, since the new file can have had fields flattened too.
          reportProblem(explainFormChanges(fieldsRetired, fieldsOnTop, annotationsRetired));
          return 'saved';
        } catch (error) {
          showDialog(failureDialog(error, 'build-failed'));
          return 'stopped';
        }
      });
      // Nothing waits on this, and it changes nothing about what's saved.
      if (outcome === undefined) reportProblem('The app is still busy. Try again in a moment.');
    },
    [buildBytes, exclusively, file, flush, platform, reportProblem, savedPath, showDialog],
  );

  const keepOriginal = useCallback(() => {
    settle('stopped');
  }, [settle]);

  return {
    announcement: current?.message ?? '',
    /** Says pages went to a new file, which is news whether or not this document has unsaved changes. */
    extracted,
    /** What to say about the original, once saying it's unchanged would be untrue. */
    originalNote: current?.originalChanged
      ? current.overOriginal
        ? 'Saving updates your original file'
        : 'Your original file was replaced'
      : null,
    saveLabel: savedPath === null ? 'Save a copy' : 'Save',
    save,
    saveCopy,
    extractPages,
    replaceOriginal,
    keepOriginal,
  };
}
