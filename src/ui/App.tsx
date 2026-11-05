import { useCallback, useEffect, useRef, useState } from 'react';
import { openDocument, type PdfDocument } from '../engine/document';
import { copyFileName, unchangedCopy } from '../engine/save';
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
import { DocumentView } from './DocumentView';
import { explainOpenFailure, explainSaveFailure, type OpenProblem } from './messages';
import { StartScreen } from './StartScreen';
import { installTabFocus } from './tabFocus';

type Session =
  | { readonly status: 'empty' }
  | { readonly status: 'failed'; readonly fileName: string; readonly problem: OpenProblem }
  | { readonly status: 'open'; readonly file: OpenedFile; readonly document: PdfDocument };

// Each dialog keeps the file it's about, so it can't act on a different document.
type Dialog =
  | { readonly kind: 'confirm-replace'; readonly file: OpenedFile; readonly path: string }
  | { readonly kind: 'save-failed'; readonly failure: SaveFailureKind; readonly detail: string }
  | { readonly kind: 'open-failed'; readonly fileName: string; readonly problem: OpenProblem };

const APP_NAME = 'Smorsy PDF Editor';

const logProblem = (error: unknown) => {
  console.error(error);
};

export function App({ platform }: { platform: Platform }) {
  const [session, setSession] = useState<Session>({ status: 'empty' });
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [opening, setOpening] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const zoomCommandRef = useRef<((command: MenuCommand) => void) | null>(null);
  // Only one native dialog or file open at a time, however fast the menu is used.
  const busyRef = useRef(false);
  const hasDocumentRef = useRef(false);
  hasDocumentRef.current = session.status === 'open';

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
          setSession({ status: 'open', file, document });
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

  const writeCopy = useCallback(
    async (file: OpenedFile, path: string) => {
      try {
        await platform.writeFile(path, unchangedCopy(file.bytes));
        setAnnouncement('Copy saved');
      } catch (error) {
        setDialog(
          error instanceof SaveFailure
            ? { kind: 'save-failed', failure: error.kind, detail: error.message }
            : { kind: 'save-failed', failure: 'other', detail: String(error) },
        );
      }
    },
    [platform],
  );

  const saveCopy = useCallback(
    () =>
      exclusively(async () => {
        if (session.status !== 'open') return;
        const { file } = session;
        setAnnouncement('');
        try {
          const path = await platform.chooseSaveLocation(copyFileName(file.name));
          if (path === null) return;
          if (await platform.isSameFile(file.path, path)) {
            setDialog({ kind: 'confirm-replace', file, path });
            return;
          }
          await writeCopy(file, path);
        } catch (error) {
          setDialog({ kind: 'save-failed', failure: 'other', detail: String(error) });
        }
      }),
    [exclusively, platform, session, writeCopy],
  );

  const closeDocument = useCallback(() => {
    setSession({ status: 'empty' });
    setAnnouncement('');
  }, []);

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
          void chooseAndOpen();
          break;
        case 'save-copy':
          void saveCopy();
          break;
        case 'close-document':
          if (!busyRef.current) closeDocument();
          break;
        case 'zoom-in':
        case 'zoom-out':
        case 'zoom-actual':
        case 'zoom-fit':
          zoomCommandRef.current?.(command);
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
  }, [chooseAndOpen, closeDocument, dialogIsOpen, platform, saveCopy]);

  const closeDialog = () => {
    setDialog(null);
  };

  return (
    <>
      {session.status === 'open' ? (
        <DocumentView
          key={session.file.path}
          file={session.file}
          document={session.document}
          os={platform.os}
          announcement={announcement}
          onSaveCopy={() => {
            void saveCopy();
          }}
          zoomCommandRef={zoomCommandRef}
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
            void writeCopy(dialog.file, dialog.path);
          }}
          onCancel={closeDialog}
        />
      )}

      {dialog?.kind === 'save-failed' && (
        <AlertDialog
          title="Your copy wasn’t saved"
          message={explainSaveFailure(dialog.failure)}
          detail="Your original file is unchanged."
          technical={dialog.detail}
          confirmLabel="Save somewhere else"
          cancelLabel="Cancel"
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
    </>
  );
}
