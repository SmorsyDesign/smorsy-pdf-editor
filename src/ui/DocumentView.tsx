import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { PdfDocument } from '../engine/document';
import { hasDigitalSignature, isEncrypted } from '../engine/extract';
import { isIdentity } from '../engine/pages/layout';
import { LETTER_PAGE, zoomIn, zoomOut } from '../engine/zoom';
import { PagesView } from './pages/PagesView';
import { usePageSelection } from './pages/usePageSelection';
import type { OpenedFile, OsFamily, Platform } from '../platform';
import { DocumentStrip, ScanCard, SignedWarning } from './editing/Notices';
import { EditToasts } from './editing/EditToasts';
import { PageEditing } from './editing/PageEditing';
import type { DocumentEditor } from './editing/useDocumentEditor';
import { useScanCheck } from './editing/useScanCheck';
import { useTextSession } from './editing/useTextSession';
import { SignatureDialog } from './signing/SignatureDialog';
import { decodeImage, explainImageProblem, signatureImageFrom } from './signing/makeSignature';
import { useSigning } from './signing/useSigning';
import { AnnotateBar } from './annotating/AnnotateBar';
import { useAnnotating } from './annotating/useAnnotating';
import { useFormFields } from './forms/useFormFields';
import { fileStateLabel, modeHint } from './statusText';
import { PageStack } from './PageStack';
import { SidePanel } from './SidePanel';
import { SearchBar } from './SearchBar';
import { StatusBar } from './StatusBar';
import { Thumbnails } from './Thumbnails';
import { TopBar, type EditorMode } from './TopBar';
import { useDocumentCommands, type DocumentViewHandle } from './useDocumentCommands';
import { usePageSizes } from './usePageSizes';
import { usePageText } from './usePageText';
import { useReportUnsavedWork } from './useReportUnsavedWork';
import { useDocumentSearch } from './useSearch';
import { useZoom } from './useZoom';

interface DocumentViewProps {
  readonly file: OpenedFile;
  readonly document: PdfDocument;
  readonly os: OsFamily;
  readonly announcement: string;
  readonly extracted: string;
  readonly originalNote: string | null;
  readonly onUnsavedWorkChange: (unsaved: boolean) => void;
  readonly editor: DocumentEditor;
  readonly saveLabel: string;
  readonly onSave: () => void;
  readonly handleRef: RefObject<DocumentViewHandle | null>;
  readonly platform: Platform;
  readonly onExtract: (positions: ReadonlySet<number>) => void;
}

const NEW_TEXT_INSET = 72;

export function DocumentView({
  file,
  document: filePdf,
  os,
  announcement,
  extracted,
  originalNote,
  onUnsavedWorkChange,
  editor,
  saveLabel,
  onSave,
  handleRef,
  platform,
  onExtract,
}: DocumentViewProps) {
  // Edits on turned pages are worked out from the file's own page sizes.
  const fileSizes = usePageSizes(filePdf);
  const { setFileSizes, layout } = editor;
  useEffect(() => {
    setFileSizes(fileSizes.map((size) => size ?? LETTER_PAGE));
  }, [fileSizes, setFileSizes]);
  // Every page number on screen follows the pages as arranged now.
  const pdf = useMemo(
    () =>
      layout.length === filePdf.pageCount && isIdentity(layout)
        ? filePdf
        : filePdf.arranged(layout),
    [filePdf, layout],
  );
  const pageSizes = usePageSizes(pdf);
  const selection = usePageSelection();
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
  const signing = useSigning(editor, mode === 'sign' || mode === 'note', pageSizes);
  const annotating = useAnnotating(editor, mode === 'note', pageSizes);
  const form = useFormFields(pdf, editor);
  const { draft, finishOpenEdit } = session;
  const pageText = usePageText(pdf);
  const scan = useScanCheck(mode, currentPage, pageText);
  const search = useDocumentSearch(pdf, scrollToPageRef);
  const currentPageSize = pageSizes[currentPage - 1] ?? LETTER_PAGE;

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
    session.addText(currentPage, NEW_TEXT_INSET, NEW_TEXT_INSET, currentPageSize);
  };

  useDocumentCommands({
    handleRef,
    session,
    hasPendingPlacement: () => signing.picked !== null,
    percent,
    applyZoom,
    fit,
    onFind: search.show,
    onAddText: () => {
      if (!isProtected) addTextToCurrentPage();
    },
  });

  useReportUnsavedWork(
    draft !== null || session.recording || editor.changes > 0,
    onUnsavedWorkChange,
  );

  const chooseImage = async () => {
    try {
      const picked = await platform.chooseImage();
      if (!picked) return;
      const image = await signatureImageFrom(await decodeImage(picked.bytes), null);
      annotating.clearTool();
      signing.placeImage(image, currentPage);
    } catch (error) {
      console.error(error);
      editor.reportProblem(explainImageProblem(error));
    }
  };

  const canFillForm = !isProtected && !signedLocked;
  const showsFormPanel = mode === 'select' && canFillForm && form.total > 0;
  const hasPanel = mode === 'sign' || mode === 'note' || showsFormPanel;
  const pagesMode = mode === 'pages';
  const changesOn = (position: number) =>
    editor.boxes.filter((box) => box.pageNumber === position).length +
    editor.signatures.filter((placed) => placed.pageNumber === position).length +
    editor.annotations.filter((one) => one.pageNumber === position && !one.saved).length;

  return (
    <div className="window" data-os={os}>
      <TopBar
        os={os}
        fileName={file.name}
        fileState={fileStateLabel({
          changes: editor.changes,
          isProtected,
          signedLocked,
          pageCount: pdf.pageCount,
        })}
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

      {pagesMode ? (
        <div className="body is-pages">
          <PagesView
            document={pdf}
            pageSizes={pageSizes}
            layout={layout}
            selection={selection}
            changesOn={changesOn}
            onArrange={(next) => {
              editor.apply({ kind: 'arrange-pages', layout: next });
            }}
            onExtract={onExtract}
            ready={fileSizes.every((size) => size !== undefined)}
            onOpenPage={(position) => {
              setMode('select');
              requestAnimationFrame(() => scrollToPageRef.current?.(position));
            }}
          />
        </div>
      ) : (
        <div className={hasPanel ? 'body has-panel' : 'body'}>
          <Thumbnails
            document={pdf}
            pageSizes={pageSizes}
            currentPage={currentPage}
            onSelect={(pageNumber) => scrollToPageRef.current?.(pageNumber)}
          />
          <div className="stage">
            <DocumentStrip
              isProtected={isProtected}
              signedLocked={signedLocked}
              onEditAnyway={() => {
                setSignedWarning('edit');
              }}
            />
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
              hiddenAnnotations={editor.hiddenAnnotations}
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
                  annotating={annotating}
                  form={form}
                  canFillForm={canFillForm}
                  onSign={() => {
                    setMode('sign');
                  }}
                  matches={search.matchesOn(pageNumber)}
                  currentMatch={search.currentMatch}
                  pageText={pageText}
                />
              )}
            />
            {mode === 'note' && (
              <AnnotateBar
                annotating={annotating}
                currentPage={currentPage}
                centre={{ x: currentPageSize.width / 2, y: currentPageSize.height / 2 }}
                onChooseImage={() => {
                  void chooseImage();
                }}
              />
            )}
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
          <SidePanel
            mode={mode}
            showsFormPanel={showsFormPanel}
            form={form}
            editor={editor}
            annotating={annotating}
            signing={signing}
            currentPage={currentPage}
            onLeaveSign={() => {
              setMode('select');
            }}
            onGoToPage={(pageNumber, y) => {
              scrollToPageRef.current?.(pageNumber, y);
            }}
            onJumpToField={(pageNumber, fieldId, y) => {
              scrollToPageRef.current?.(pageNumber, y);
              form.focusField(fieldId);
            }}
          />
        </div>
      )}

      <StatusBar
        os={os}
        page={
          pagesMode
            ? selection.selected.size === 0
              ? `${String(pdf.pageCount)} ${pdf.pageCount === 1 ? 'page' : 'pages'}`
              : `${String(selection.selected.size)} of ${String(pdf.pageCount)} pages selected`
            : `Page ${currentPage} of ${pdf.pageCount}`
        }
        hint={
          pagesMode
            ? `Drag pages to reorder them, or hold ${os === 'mac' ? 'Option' : 'Alt'} and use the arrow keys`
            : modeHint(mode, annotating, signing, scan.pageIsScan)
        }
        fontsReplaced={editor.substitutedFonts}
        message={
          (extracted || (editor.changes === 0 && announcement) || originalNote) ??
          (signedLocked ? 'Signature unchanged' : 'Your original file stays unchanged')
        }
        percent={percent}
        showsZoom={!pagesMode}
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
          onCancel={signing.stopCreating}
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
