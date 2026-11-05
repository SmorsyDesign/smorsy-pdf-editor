import { useCallback, useEffect, useRef, useState } from 'react';
import { openDocument, type PdfDocument } from '../engine/document';
import { copyFileName, isSameFile, unchangedCopy } from '../engine/save';
import {
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
  | { readonly status: 'opening' }
  | { readonly status: 'failed'; readonly fileName: string; readonly problem: OpenProblem }
  | { readonly status: 'open'; readonly file: OpenedFile; readonly document: PdfDocument };

type SaveDialog =
  | { readonly kind: 'confirm-replace'; readonly path: string }
  | { readonly kind: 'failed'; readonly failure: SaveFailureKind }
  | null;

const APP_NAME = 'Smorsy PDF Editor';

export function App({ platform }: { platform: Platform }) {
  const [session, setSession] = useState<Session>({ status: 'empty' });
  const [saveDialog, setSaveDialog] = useState<SaveDialog>(null);
  const [announcement, setAnnouncement] = useState('');
  const openDocumentRef = useRef<PdfDocument | null>(null);
  const zoomCommandRef = useRef<((command: MenuCommand) => void) | null>(null);

  const closeCurrent = useCallback(() => {
    const current = openDocumentRef.current;
    openDocumentRef.current = null;
    return current?.close();
  }, []);

  const chooseAndOpen = useCallback(async () => {
    let chosenName = '';
    try {
      const file = await platform.chooseFileToOpen();
      if (!file) return;
      chosenName = file.name;
      setSession({ status: 'opening' });
      setAnnouncement('');
      await closeCurrent();
      const document = await openDocument(file.bytes, pdfAssets);
      openDocumentRef.current = document;
      setSession({ status: 'open', file, document });
    } catch (error) {
      await closeCurrent();
      setSession({
        status: 'failed',
        fileName: chosenName || 'This file',
        problem: explainOpenFailure(error),
      });
    }
  }, [closeCurrent, platform]);

  const writeCopy = useCallback(
    async (file: OpenedFile, path: string) => {
      try {
        await platform.writeFile(path, unchangedCopy(file.bytes));
        setAnnouncement('Copy saved');
      } catch (error) {
        setSaveDialog({
          kind: 'failed',
          failure: error instanceof SaveFailure ? error.kind : 'other',
        });
      }
    },
    [platform],
  );

  const saveCopy = useCallback(async () => {
    if (session.status !== 'open') return;
    setAnnouncement('');
    const path = await platform.chooseSaveLocation(copyFileName(session.file.name));
    if (path === null) return;
    if (isSameFile(path, session.file.path, platform.os)) {
      setSaveDialog({ kind: 'confirm-replace', path });
      return;
    }
    await writeCopy(session.file, path);
  }, [platform, session, writeCopy]);

  const closeDocument = useCallback(async () => {
    await closeCurrent();
    setSession({ status: 'empty' });
    setAnnouncement('');
  }, [closeCurrent]);

  useEffect(installTabFocus, []);

  useEffect(() => {
    const title = session.status === 'open' ? `${session.file.name} - ${APP_NAME}` : APP_NAME;
    void platform.setWindowTitle(title);
    void platform.setDocumentOpen(session.status === 'open');
  }, [platform, session]);

  useEffect(() => {
    const onCommand = (command: MenuCommand) => {
      switch (command) {
        case 'open':
          void chooseAndOpen();
          break;
        case 'save-copy':
          void saveCopy();
          break;
        case 'close-document':
          void closeDocument();
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
      void subscription.then((stop) => {
        stop();
      });
    };
  }, [chooseAndOpen, closeDocument, platform, saveCopy]);

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
          busy={session.status === 'opening'}
          failure={session.status === 'failed' ? session : null}
          onChooseFile={() => {
            void chooseAndOpen();
          }}
        />
      )}

      {saveDialog?.kind === 'confirm-replace' && session.status === 'open' && (
        <AlertDialog
          title="Replace your original file?"
          message={`This saves over ${session.file.name}. You can’t undo this.`}
          confirmLabel="Replace original"
          cancelLabel="Cancel"
          destructive
          onConfirm={() => {
            const { path } = saveDialog;
            setSaveDialog(null);
            void writeCopy(session.file, path);
          }}
          onCancel={() => {
            setSaveDialog(null);
          }}
        />
      )}

      {saveDialog?.kind === 'failed' && (
        <AlertDialog
          title="Your copy wasn’t saved"
          message={explainSaveFailure(saveDialog.failure)}
          detail="Your original file is unchanged."
          confirmLabel="Save somewhere else"
          cancelLabel="Cancel"
          onConfirm={() => {
            setSaveDialog(null);
            void saveCopy();
          }}
          onCancel={() => {
            setSaveDialog(null);
          }}
        />
      )}
    </>
  );
}
