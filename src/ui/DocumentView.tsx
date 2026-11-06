import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { PdfDocument } from '../engine/document';
import { hasDigitalSignature, isEncrypted } from '../engine/extract';
import { LETTER_PAGE, zoomIn, zoomOut } from '../engine/zoom';
import type { OpenedFile, OsFamily, Platform } from '../platform';
import { ProtectedStrip, ScanCard, SignedStrip, SignedWarning } from './editing/Notices';
import { EditToasts } from './editing/EditToasts';
import { PageEditing } from './editing/PageEditing';
import type { DocumentEditor } from './editing/useDocumentEditor';
import { useScanCheck } from './editing/useScanCheck';
import { useTextSession } from './editing/useTextSession';
import { SignatureDialog } from './signing/SignatureDialog';
import { SignPanel } from './signing/SignPanel';
import { useSigning } from './signing/useSigning';
import { PageStack } from './PageStack';
import { SearchBar } from './SearchBar';
import { StatusBar } from './StatusBar';
import { Thumbnails } from './Thumbnails';
import { TopBar, type EditorMode } from './TopBar';
import { useDocumentCommands, type DocumentViewHandle } from './useDocumentCommands';
import { usePageSizes } from './usePageSizes';
import { usePageText } from './usePageText';
import { useDocumentSearch } from './useSearch';
import { useZoom } from './useZoom';

interface DocumentViewProps {
  readonly file: OpenedFile;
  readonly document: PdfDocument;
  readonly os: OsFamily;
  readonly announcement: string;
  readonly originalNote: string | null;
  readonly onUnsavedWorkChange: (unsaved: boolean) => void;
  readonly editor: DocumentEditor;
  readonly saveLabel: string;
  readonly onSave: () => void;
  readonly handleRef: RefObject<DocumentViewHandle | null>;
  readonly platform: Platform;
}

const NEW_TEXT_INSET = 72;

export function DocumentView({
  file,
  document: pdf,
  os,
  announcement,
  originalNote,
  onUnsavedWorkChange,
  editor,
  saveLabel,
  onSave,
  handleRef,
  platform,
}: DocumentViewProps) {
  const pageSizes = usePageSizes(pdf);
  const zoom = useZoom(pageSizes[0] ?? LETTER_PAGE);
  const { percent, applyZoom, fit } = zoom;
  const [currentPage, setCurrentPage] = useState(1);
  const [mode, setMode] = useState<EditorMode>('select');
  const [isProtected] = useState(() => isEncrypted(file.bytes));
  const [signedLocked, setSignedLocked] = useState(() => hasDigitalSignature(file.bytes));
  // Which mode the warning is holding back, for the choice of going on to it.
  const [signedWarning, setSignedWarning] = useState<EditorMode | null>(null);
  const scrollToPageRef = useRef<((pageNumber: number, yOffset?: number) => void) | null>(null);
  const session = useTextSession(editor);
  const signing = useSigning(editor, mode === 'sign', pageSizes);
  const { draft, finishOpenEdit } = session;
  const pageText = usePageText(pdf);
  const scan = useScanCheck(mode, currentPage, pageText);
  const search = useDocumentSearch(pdf, scrollToPageRef);

  const changeMode = useCallback(
    (next: EditorMode) => {
      finishOpenEdit();
      if (next !== 'select' && signedLocked) {
        setSignedWarning(next);
        return;
      }
      setMode(next);
    },
    [finishOpenEdit, signedLocked],
  );

  const addTextToCurrentPage = () => {
    if (signedLocked) {
      setSignedWarning('edit');
      return;
    }
    setMode('edit');
    session.addText(
      currentPage,
      NEW_TEXT_INSET,
      NEW_TEXT_INSET,
      pageSizes[currentPage - 1] ?? LETTER_PAGE,
    );
  };

  useDocumentCommands({
    handleRef,
    session,
    percent,
    applyZoom,
    fit,
    onFind: search.show,
    onAddText: () => {
      if (!isProtected) addTextToCurrentPage();
    },
  });

  const hasUnsavedWork = draft !== null || session.recording || editor.changes > 0;
  useEffect(() => {
    onUnsavedWorkChange(hasUnsavedWork);
  }, [hasUnsavedWork, onUnsavedWorkChange]);
  // Closing the document, or a crash, leaves nothing to protect.
  useEffect(
    () => () => {
      onUnsavedWorkChange(false);
    },
    [onUnsavedWorkChange],
  );

  const hintFor = () => {
    if (mode === 'edit') return 'Click a line to edit it, or click an empty area to add text';
    if (mode === 'select') return 'Drag across text to select it';
    if (signing.selected) return 'Drag the corners to resize, or the top handle to rotate';
    return signing.picked ? 'Click where it goes on the page' : 'Create a signature to place it';
  };

  const stateLabel = () => {
    if (editor.changes > 0) {
      return editor.changes === 1 ? '1 unsaved change' : `${editor.changes} unsaved changes`;
    }
    if (isProtected) return 'Protected';
    if (signedLocked) return 'Looks signed';
    return pdf.pageCount === 1 ? '1 page' : `${pdf.pageCount} pages`;
  };

  return (
    <div className="window" data-os={os}>
      <TopBar
        os={os}
        fileName={file.name}
        fileState={stateLabel()}
        mode={mode}
        editBlocked={isProtected ? 'This PDF is protected against changes.' : null}
        canUndo={editor.canUndo}
        canRedo={editor.canRedo}
        saveLabel={saveLabel}
        onModeChange={changeMode}
        onSearch={search.show}
        onUndo={session.undo}
        onRedo={session.redo}
        onSave={onSave}
      />

      <div className={mode === 'sign' ? 'body has-panel' : 'body'}>
        <Thumbnails
          document={pdf}
          pageSizes={pageSizes}
          currentPage={currentPage}
          onSelect={(pageNumber) => scrollToPageRef.current?.(pageNumber)}
        />
        <div className="stage">
          {isProtected ? (
            <ProtectedStrip />
          ) : signedLocked ? (
            <SignedStrip
              onEditAnyway={() => {
                setSignedWarning('edit');
              }}
            />
          ) : (
            <span />
          )}
          <PageStack
            document={pdf}
            pageSizes={pageSizes}
            percent={percent}
            measured={zoom.measured}
            fileName={file.name}
            keepOverlayOn={draft?.pageNumber ?? null}
            onCurrentPageChange={setCurrentPage}
            onAvailableWidthChange={zoom.setAvailableWidth}
            onZoomTo={applyZoom}
            onBackgroundClick={finishOpenEdit}
            scrollToPageRef={scrollToPageRef}
            renderOverlay={(pageNumber, page, scale) => (
              <PageEditing
                document={pdf}
                pageNumber={pageNumber}
                page={page}
                scale={scale}
                zoomPercent={percent}
                mode={mode}
                editor={editor}
                session={session}
                signing={signing}
                matches={search.matchesOn(pageNumber)}
                currentMatch={search.currentMatch}
                pageText={pageText}
              />
            )}
          />
          {search.open && <SearchBar {...search.barProps} />}
          <EditToasts editor={editor} session={session} />
          {scan.showScanCard && !draft && (
            <ScanCard
              onAddText={() => {
                scan.dismissScanCard();
                addTextToCurrentPage();
              }}
              onClose={scan.dismissScanCard}
            />
          )}
        </div>
        {mode === 'sign' && (
          <SignPanel
            signing={signing}
            currentPage={currentPage}
            onClose={() => {
              setMode('select');
            }}
          />
        )}
      </div>

      <StatusBar
        os={os}
        page={`Page ${currentPage} of ${pdf.pageCount}`}
        hint={hintFor()}
        fontsReplaced={editor.substitutedFonts}
        message={
          ((editor.changes === 0 && announcement) || originalNote) ??
          (signedLocked ? 'Signature unchanged' : 'Your original file stays unchanged')
        }
        percent={percent}
        fitting={zoom.fitting}
        onFit={fit}
        onZoomOut={() => {
          applyZoom(zoomOut(percent));
        }}
        onZoomIn={() => {
          applyZoom(zoomIn(percent));
        }}
      />

      {signing.creating && (
        <SignatureDialog
          platform={platform}
          initialKind={signing.creating}
          onUse={signing.addSlip}
          onCancel={() => {
            signing.startCreating(null);
          }}
        />
      )}

      {signedWarning !== null && (
        <SignedWarning
          onKeepViewing={() => {
            setSignedWarning(null);
          }}
          onEdit={() => {
            setSignedWarning(null);
            setSignedLocked(false);
            setMode(signedWarning);
          }}
        />
      )}
    </div>
  );
}
