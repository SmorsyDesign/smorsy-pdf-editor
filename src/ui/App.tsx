import { useCallback, useEffect, useRef, useState } from 'react';
import { openDocument, type PdfDocument } from '../engine/document';
import { ReadFailure, type MenuCommand, type OpenedFile, type Platform } from '../platform';
import { pdfAssets } from '../workers/pdf-setup';
import { AppDialogs, type Dialog } from './AppDialogs';
import { DocumentView } from './DocumentView';
import type { DocumentViewHandle } from './useDocumentCommands';
import { useDocumentEditor } from './editing/useDocumentEditor';
import { explainOpenFailure, type OpenProblem } from './messages';
import { StartScreen } from './StartScreen';
import { installTabFocus } from './tabFocus';
import { useSaveFlow } from './useSaveFlow';

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

const APP_NAME = 'Smorsy PDF Editor';

const logProblem = (error: unknown) => {
  console.error(error);
};

export function App({ platform }: { platform: Platform }) {
  const [session, setSession] = useState<Session>({ status: 'empty' });
  const [dialog, setDialog] = useState<Dialog<LeaveAction> | null>(null);
  const [opening, setOpening] = useState(false);
  const viewRef = useRef<DocumentViewHandle | null>(null);
  // Only one native dialog or file open at a time, however fast the menu is used.
  const busyRef = useRef(false);
  const sessionCounter = useRef(0);
  const hasDocumentRef = useRef(false);
  hasDocumentRef.current = session.status === 'open';
  const dialogIsOpen = dialog !== null;
  const dialogOpenRef = useRef(false);
  dialogOpenRef.current = dialogIsOpen;

  const openFile = session.status === 'open' ? session.file : null;
  const editor = useDocumentEditor(openFile, platform);
  const isDirtyRef = useRef(editor.isDirty);
  isDirtyRef.current = editor.isDirty;
  const fileNameRef = useRef('');
  fileNameRef.current = openFile?.name ?? '';

  const exclusively = useCallback(async <Result,>(task: () => Promise<Result>) => {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    try {
      return await task();
    } finally {
      busyRef.current = false;
    }
  }, []);

  /** Finishes any typing. False means it couldn't be applied, and the person has been told. */
  const flush = useCallback(async () => (await viewRef.current?.flush()) ?? true, []);

  const saving = useSaveFlow({
    platform,
    file: openFile,
    editor,
    flush,
    exclusively,
    showDialog: setDialog,
    hasUnfinishedEdit: () => viewRef.current?.hasUnfinishedEdit() ?? false,
  });
  const { save, saveCopy, replaceOriginal, keepOriginal } = saving;

  /** A save that reports success with the signature missing would be worse than asking. */
  const askToSave = useCallback(
    (copy: boolean) => {
      if (viewRef.current?.hasPendingPlacement()) setDialog({ kind: 'unplaced', copy });
      else void (copy ? saveCopy() : save());
    },
    [save, saveCopy],
  );

  const chooseAndOpen = useCallback(
    () =>
      exclusively(async () => {
        let chosenName = '';
        try {
          const file = await platform.chooseFileToOpen();
          if (!file) return;
          chosenName = file.name;
          setOpening(true);
          const document = await openDocument(file.bytes, pdfAssets);
          sessionCounter.current += 1;
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

  const carryOut = useCallback(
    (action: LeaveAction) => {
      if (action === 'close') setSession({ status: 'empty' });
      if (action === 'open') void chooseAndOpen();
      if (action === 'quit') platform.closeWindow().catch(logProblem);
    },
    [chooseAndOpen, platform],
  );

  /** Asks about unsaved changes first, then does what was asked. */
  const leaveDocument = useCallback(
    async (action: LeaveAction) => {
      // Anything still being typed counts, so it can't be lost by acting quickly.
      if (!(await flush())) return;
      if (isDirtyRef.current()) {
        setDialog({ kind: 'unsaved', fileName: fileNameRef.current, then: action });
        return;
      }
      carryOut(action);
    },
    [carryOut, flush],
  );

  const onUnsavedWorkChange = useCallback(
    (unsaved: boolean) => {
      platform.setUnsavedWork(unsaved).catch(logProblem);
    },
    [platform],
  );

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
      if (!dialogOpenRef.current) void leaveDocument('quit');
      return false;
    });
    // After a crash there's nothing left to ask, and the window has to be able to close.
    return () => {
      platform.setCloseGuard(() => true);
    };
  }, [leaveDocument, platform]);

  useEffect(() => {
    const title = session.status === 'open' ? `${session.file.name} - ${APP_NAME}` : APP_NAME;
    platform.setWindowTitle(title).catch(logProblem);
    platform.setDocumentOpen(session.status === 'open').catch(logProblem);
  }, [platform, session]);

  useEffect(() => {
    const onCommand = (command: MenuCommand) => {
      // Native menus stay live behind an open dialog, so they must not change what it's about.
      if (dialogIsOpen || document.querySelector('dialog[open]')) return;
      switch (command) {
        case 'open':
          if (!busyRef.current) void leaveDocument('open');
          break;
        case 'save':
          askToSave(false);
          break;
        case 'save-copy':
          askToSave(true);
          break;
        case 'close-document':
          if (!busyRef.current) void leaveDocument('close');
          break;
        case 'quit':
          if (!busyRef.current) void leaveDocument('quit');
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
  }, [askToSave, dialogIsOpen, leaveDocument, platform]);

  return (
    <>
      {session.status === 'open' ? (
        <DocumentView
          key={session.id}
          file={session.file}
          document={session.document}
          os={platform.os}
          announcement={saving.announcement}
          originalNote={saving.originalNote}
          onUnsavedWorkChange={onUnsavedWorkChange}
          editor={editor}
          saveLabel={saving.saveLabel}
          onSave={() => {
            askToSave(false);
          }}
          handleRef={viewRef}
          platform={platform}
          onExtract={(positions) => {
            void saving.extractPages(positions);
          }}
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
      <AppDialogs
        dialog={dialog}
        onClose={() => {
          setDialog(null);
        }}
        onReplaceOriginal={({ file, path }) => {
          void replaceOriginal(file, path);
        }}
        onKeepOriginal={keepOriginal}
        onSaveElsewhere={() => {
          void saveCopy();
        }}
        onChooseAnother={() => {
          void chooseAndOpen();
        }}
        onSaveAndLeave={(then) => {
          if (viewRef.current?.hasPendingPlacement()) {
            setDialog({ kind: 'unplaced', copy: false, then });
          } else {
            void save(() => {
              carryOut(then);
            });
          }
        }}
        onLeaveWithoutSaving={carryOut}
        onSaveWithoutPlacing={(copy, then) => {
          if (copy) {
            void saveCopy();
          } else {
            void save(
              then &&
                (() => {
                  carryOut(then);
                }),
            );
          }
        }}
      />
    </>
  );
}
