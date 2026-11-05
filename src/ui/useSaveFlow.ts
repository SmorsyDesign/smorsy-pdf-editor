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

function failureDialog(error: unknown): SaveDialog {
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
    : { kind: 'save-failed', failure: 'other', detail };
}

interface SaveFlowOptions {
  readonly platform: Platform;
  readonly file: OpenedFile | null;
  readonly editor: DocumentEditor;
  readonly flush: () => Promise<boolean>;
  readonly exclusively: (task: () => Promise<Outcome>) => Promise<Outcome | undefined>;
  readonly showDialog: (dialog: SaveDialog) => void;
}

/** The first save makes a new file, and later saves update that copy. */
export function useSaveFlow({
  platform,
  file,
  editor,
  flush,
  exclusively,
  showDialog,
}: SaveFlowOptions) {
  const { buildBytes, markSaved, isDirty } = editor;
  const [saved, setSaved] = useState<{
    readonly file: OpenedFile;
    readonly path: string;
    readonly message: string;
  } | null>(null);
  const afterSave = useRef<(() => void) | null>(null);
  const current = saved?.file === file ? saved : null;
  const savedPath = current?.path ?? null;

  /** Runs once the save has let go of the app, because what's next may need a turn of its own. */
  const settle = useCallback(
    (outcome: Outcome | undefined) => {
      if (outcome === 'asking') return;
      const next = afterSave.current;
      afterSave.current = null;
      // An edit made while saving isn't in the file, so it's not safe to carry on and lose it.
      if (outcome === 'saved' && !isDirty()) next?.();
    },
    [isDirty],
  );

  const writeTo = useCallback(
    async (target: OpenedFile, path: string): Promise<Outcome> => {
      try {
        const { bytes, edited, entry } = await buildBytes();
        if (edited) {
          // Proves the result opens, before it can replace anything on disk.
          const check = await openDocument(bytes);
          await check.close();
        }
        await platform.writeFile(path, bytes);
        markSaved(entry);
        setSaved({
          file: target,
          path,
          message: path === target.path ? 'Original file updated' : 'Copy saved',
        });
        return 'saved';
      } catch (error) {
        showDialog(failureDialog(error));
        return 'stopped';
      }
    },
    [buildBytes, markSaved, platform, showDialog],
  );

  const saveCopy = useCallback(async () => {
    const outcome = await exclusively(async () => {
      if (!file) return 'stopped';
      setSaved((previous) => previous && { ...previous, message: '' });
      try {
        if (!(await flush())) return 'stopped';
        const path = await platform.chooseSaveLocation(copyFileName(file.name));
        if (path === null) return 'stopped';
        if (await platform.isSameFile(file.path, path)) {
          showDialog({ kind: 'confirm-replace', file, path });
          return 'asking';
        }
        return await writeTo(file, path);
      } catch (error) {
        showDialog(failureDialog(error));
        return 'stopped';
      }
    });
    settle(outcome);
  }, [exclusively, file, flush, platform, settle, showDialog, writeTo]);

  const save = useCallback(async () => {
    if (!file) return;
    if (savedPath === null) {
      await saveCopy();
      return;
    }
    const outcome = await exclusively(async () =>
      (await flush()) ? writeTo(file, savedPath) : 'stopped',
    );
    settle(outcome);
  }, [exclusively, file, flush, savedPath, saveCopy, settle, writeTo]);

  const replaceOriginal = useCallback(
    async (target: OpenedFile, path: string) => {
      settle(await exclusively(() => writeTo(target, path)));
    },
    [exclusively, settle, writeTo],
  );

  const keepOriginal = useCallback(() => {
    settle('stopped');
  }, [settle]);

  const saveThen = useCallback(
    (next: () => void) => {
      afterSave.current = next;
      return save();
    },
    [save],
  );

  return {
    announcement: current?.message ?? '',
    saveLabel: savedPath === null ? 'Save a copy' : 'Save',
    save,
    saveCopy,
    saveThen,
    replaceOriginal,
    keepOriginal,
  };
}
