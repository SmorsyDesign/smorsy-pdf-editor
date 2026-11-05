import { useCallback, useEffect, useRef, useState } from 'react';
import { openDocument, type PdfDocument } from '../engine/document';
import { copyFileName } from '../engine/copy';
import {
  ReadFailure,
  SaveFailure,
  type MenuCommand,
  type OpenedFile,
  type Platform,
  type SaveFailureKind,
} from '../platform';
import { pdfAssets } from '../workers/pdf-setup';
import { AlertDialog } from './AlertDialog';
import { DocumentView, type DocumentViewHandle } from './DocumentView';
import { useDocumentEditor } from './editing/useDocumentEditor';
import { explainOpenFailure, explainSaveFailure, type OpenProblem } from './messages';
import { StartScreen } from './StartScreen';
import { installTabFocus } from './tabFocus';

type Session =
  | { readonly status: 'empty' }
  | { readonly status: 'failed'; readonly fileName: string; readonly problem: OpenProblem }
  | {
      readonly status: 'open';
      readonly id: number;
      readonly file: OpenedFile;
      readonly document: PdfDocument;
    };

/** What was asked for when unsaved changes got in the way. */
type LeaveAction = 'close' | 'open' | 'quit';

// Each dialog keeps the file it's about, so it can't act on a different document.
type Dialog =
  | { readonly kind: 'confirm-replace'; readonly file: OpenedFile; readonly path: string }
  | { readonly kind: 'save-failed'; readonly failure: SaveFailureKind; readonly detail: string }
  | { readonly kind: 'open-failed'; readonly fileName: string; readonly problem: OpenProblem }
  | { readonly kind: 'unsaved'; readonly fileName: string; readonly then: LeaveAction };

const APP_NAME = 'Smorsy PDF Editor';

const logProblem = (error: unknown) => {
  console.error(error);
};

export function App({ platform }: { platform: Platform }) {
  const [session, setSession] = useState<Session>({ status: 'empty' });
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [opening, setOpening] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  // The first save makes a new file, and later saves update that copy.
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const viewRef = useRef<DocumentViewHandle | null>(null);
  // Only one native dialog or file open at a time, however fast the menu is used.
  const busyRef = useRef(false);
  const afterSaveRef = useRef<(() => void) | null>(null);
  const sessionCounter = useRef(0);
  const hasDocumentRef = useRef(false);
  hasDocumentRef.current = session.status === 'open';

  const openFile = session.status === 'open' ? session.file : null;
  const editor = useDocumentEditor(openFile, platform);
  const isDirtyRef = useRef(editor.isDirty);
  isDirtyRef.current = editor.isDirty;
  const fileNameRef = useRef('');
  fileNameRef.current = openFile?.name ?? '';

  const exclusively = useCallback(async (task: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      await task();
    } finally {
      busyRef.current = false;
    }
  }, []);

  const chooseAndOpen = useCallback(
    () =>
      exclusively(async () => {
        let chosenName = '';
        try {
          const file = await platform.chooseFileToOpen();
          if (!file) return;
          chosenName = file.name;
          setOpening(true);
          setAnnouncement('');
          const document = await openDocument(file.bytes, pdfAssets);
          sessionCounter.current += 1;
          setSavedPath(null);
          setSession({ status: 'open', id: sessionCounter.current, file, document });
        } catch (error) {
          const fileName =
            error instanceof ReadFailure ? error.fileName : chosenName || 'This file';
          const problem = explainOpenFailure(error);
          // A document that's already open stays open: a bad file shouldn't take it away.
          if (hasDocumentRef.current) setDialog({ kind: 'open-failed', fileName, problem });
          else setSession({ status: 'failed', fileName, problem });
        } finally {
          setOpening(false);
        }
      }),
    [exclusively, platform],
  );

  const closeDocument = useCallback(() => {
    setSession({ status: 'empty' });
    setSavedPath(null);
    setAnnouncement('');
  }, []);

  const carryOut = useCallback(
    (action: LeaveAction) => {
      if (action === 'close') closeDocument();
      if (action === 'open') void chooseAndOpen();
      if (action === 'quit') platform.closeWindow().catch(logProblem);
    },
    [chooseAndOpen, closeDocument, platform],
  );

  /** Asks about unsaved changes first, then does what was asked. */
  const leaveDocument = useCallback(
    async (action: LeaveAction) => {
      // Anything still being typed counts, so it can't be lost by acting quickly.
      await viewRef.current?.flush();
      if (isDirtyRef.current()) {
        setDialog({ kind: 'unsaved', fileName: fileNameRef.current, then: action });
        return;
      }
      carryOut(action);
    },
    [carryOut],
  );

  const writeTo = useCallback(
    async (file: OpenedFile, path: string) => {
      try {
        const bytes = await editor.buildBytes();
        if (editor.isDirty()) {
          // Proves the result opens, before it can replace anything on disk.
          const check = await openDocument(bytes);
          await check.close();
        }
        await platform.writeFile(path, bytes);
        setSavedPath(path);
        editor.markSaved();
        setAnnouncement(path === file.path ? 'Original file updated' : 'Copy saved');
        const next = afterSaveRef.current;
        afterSaveRef.current = null;
        next?.();
      } catch (error) {
        afterSaveRef.current = null;
        setDialog(
          error instanceof SaveFailure
            ? { kind: 'save-failed', failure: error.kind, detail: error.message }
            : { kind: 'save-failed', failure: 'other', detail: String(error) },
        );
      }
    },
    [editor, platform],
  );

  const saveCopy = useCallback(
    () =>
      exclusively(async () => {
        if (session.status !== 'open') return;
        const { file } = session;
        setAnnouncement('');
        try {
          await viewRef.current?.flush();
          const path = await platform.chooseSaveLocation(copyFileName(file.name));
          if (path === null) {
            afterSaveRef.current = null;
            return;
          }
          if (await platform.isSameFile(file.path, path)) {
            setDialog({ kind: 'confirm-replace', file, path });
            return;
          }
          await writeTo(file, path);
        } catch (error) {
          afterSaveRef.current = null;
          setDialog({ kind: 'save-failed', failure: 'other', detail: String(error) });
        }
      }),
    [exclusively, platform, session, writeTo],
  );

  const save = useCallback(async () => {
    if (session.status !== 'open') return;
    if (savedPath === null) {
      await saveCopy();
      return;
    }
    await exclusively(async () => {
      await viewRef.current?.flush();
      await writeTo(session.file, savedPath);
    });
  }, [exclusively, savedPath, saveCopy, session, writeTo]);

  const openDocumentInUse = session.status === 'open' ? session.document : null;

  // Runs after the view has unmounted, so nothing is still drawing from a closed document.
  useEffect(() => {
    if (!openDocumentInUse) return;
    return () => {
      openDocumentInUse.close().catch(logProblem);
    };
  }, [openDocumentInUse]);

  useEffect(installTabFocus, []);

  useEffect(() => {
    platform.setCloseGuard(() => {
      if (!isDirtyRef.current() && !viewRef.current?.hasUnfinishedEdit()) return true;
      void (async () => {
        await viewRef.current?.flush();
        setDialog({ kind: 'unsaved', fileName: fileNameRef.current, then: 'quit' });
      })();
      return false;
    });
  }, [platform]);

  useEffect(() => {
    const title = session.status === 'open' ? `${session.file.name} - ${APP_NAME}` : APP_NAME;
    platform.setWindowTitle(title).catch(logProblem);
    platform.setDocumentOpen(session.status === 'open').catch(logProblem);
  }, [platform, session]);

  const dialogIsOpen = dialog !== null;

  useEffect(() => {
    const onCommand = (command: MenuCommand) => {
      // Native menus stay live behind an open dialog, so they must not change what it's about.
      if (dialogIsOpen) return;
      switch (command) {
        case 'open':
          if (!busyRef.current) void leaveDocument('open');
          break;
        case 'save':
          void save();
          break;
        case 'save-copy':
          void saveCopy();
          break;
        case 'close-document':
          if (!busyRef.current) void leaveDocument('close');
          break;
        default:
          viewRef.current?.command(command);
          break;
      }
    };
    const subscription = platform.onCommand(onCommand);
    return () => {
      subscription
        .then((stop) => {
          stop();
        })
        .catch(logProblem);
    };
  }, [dialogIsOpen, leaveDocument, platform, save, saveCopy]);

  const closeDialog = () => {
    setDialog(null);
  };

  return (
    <>
      {session.status === 'open' ? (
        <DocumentView
          key={session.id}
          file={session.file}
          document={session.document}
          os={platform.os}
          announcement={announcement}
          editor={editor}
          saveLabel={savedPath === null ? 'Save a copy' : 'Save'}
          onSave={() => {
            void save();
          }}
          handleRef={viewRef}
        />
      ) : (
        <StartScreen
          os={platform.os}
          busy={opening}
          failure={session.status === 'failed' ? session : null}
          onChooseFile={() => {
            void chooseAndOpen();
          }}
        />
      )}

      {dialog?.kind === 'confirm-replace' && (
        <AlertDialog
          title="Replace your original file?"
          message={`This saves over ${dialog.file.name}. You can’t undo this.`}
          confirmLabel="Replace original"
          cancelLabel="Cancel"
          destructive
          onConfirm={() => {
            closeDialog();
            void writeTo(dialog.file, dialog.path);
          }}
          onCancel={() => {
            afterSaveRef.current = null;
            closeDialog();
          }}
        />
      )}

      {dialog?.kind === 'save-failed' && (
        <AlertDialog
          title="Your copy wasn’t saved"
          message={explainSaveFailure(dialog.failure)}
          detail="Your edits are still here, and your original file is unchanged."
          technical={dialog.detail}
          confirmLabel="Save somewhere else"
          cancelLabel="Keep editing"
          onConfirm={() => {
            closeDialog();
            void saveCopy();
          }}
          onCancel={closeDialog}
        />
      )}

      {dialog?.kind === 'open-failed' && (
        <AlertDialog
          title={`${dialog.fileName} can’t be opened`}
          message={dialog.problem.reason}
          detail={dialog.problem.advice}
          technical={dialog.problem.technical}
          confirmLabel="Choose another file"
          cancelLabel="Keep current file"
          onConfirm={() => {
            closeDialog();
            void chooseAndOpen();
          }}
          onCancel={closeDialog}
        />
      )}

      {dialog?.kind === 'unsaved' && (
        <AlertDialog
          icon="warn"
          title={`Save your changes to ${dialog.fileName}?`}
          message="If you don’t save, your changes will be lost. Your original file stays as it is."
          cancelLabel="Cancel"
          alternativeLabel="Don’t save"
          confirmLabel="Save"
          onConfirm={() => {
            const { then } = dialog;
            closeDialog();
            afterSaveRef.current = () => {
              carryOut(then);
            };
            void save();
          }}
          onAlternative={() => {
            const { then } = dialog;
            closeDialog();
            carryOut(then);
          }}
          onCancel={closeDialog}
        />
      )}
    </>
  );
}
