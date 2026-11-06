import { useCallback, useRef, useState } from 'react';
import { copyFileName } from '../engine/copy';
import { UNSUPPORTED_TEXT } from '../engine/errors';
import { openDocument } from '../engine/document';
import { SaveFailure, type OpenedFile, type Platform, type SaveFailureKind } from '../platform';
import type { DocumentEditor } from './editing/useDocumentEditor';

export type SaveDialog =
  | { readonly kind: 'confirm-replace'; readonly file: OpenedFile; readonly path: string }
  | { readonly kind: 'save-failed'; readonly failure: SaveFailureKind; readonly detail: string };

/** 'asking' means a dialog will decide, so anything waiting on the save keeps waiting. */
type Outcome = 'saved' | 'asking' | 'stopped';

function failureDialog(error: unknown, otherwise: SaveFailureKind): SaveDialog {
  if (error instanceof SaveFailure) {
    return { kind: 'save-failed', failure: error.kind, detail: error.message };
  }
  const detail = error instanceof Error ? error.message : String(error);
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
  const { buildBytes, markSaved, isDirty, reportProblem } = editor;
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
      if (outcome !== 'saved' || !next) return;
      // Anything added while saving isn't in the file, so carrying on would lose it.
      if (isDirty() || hasUnfinishedEdit()) {
        reportProblem('You kept editing during the save, so nothing was closed. Save again first.');
      } else {
        next();
      }
    },
    [hasUnfinishedEdit, isDirty, reportProblem],
  );

  const writeTo = useCallback(
    async (target: OpenedFile, path: string, overOriginal: boolean): Promise<Outcome> => {
      try {
        const { bytes, edited, entry } = await buildBytes();
        if (edited) {
          // Proves the result opens, before it can replace anything on disk.
          const check = await openDocument(bytes);
          await check.close();
        }
        await platform.writeFile(path, bytes);
        markSaved(entry);
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
      settle(outcome);
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

  const keepOriginal = useCallback(() => {
    settle('stopped');
  }, [settle]);

  return {
    announcement: current?.message ?? '',
    /** What to say about the original, once saying it's unchanged would be untrue. */
    originalNote: current?.originalChanged
      ? current.overOriginal
        ? 'Saving updates your original file'
        : 'Your original file was replaced'
      : null,
    saveLabel: savedPath === null ? 'Save a copy' : 'Save',
    save,
    saveCopy,
    replaceOriginal,
    keepOriginal,
  };
}
