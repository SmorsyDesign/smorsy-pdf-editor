import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type { PdfDocument } from '../engine/document';
import { hasDigitalSignature, isEncrypted } from '../engine/extract';
import { LETTER_PAGE, zoomIn, zoomOut } from '../engine/zoom';
import type { MenuCommand, OpenedFile, OsFamily } from '../platform';
import {
  EditNote,
  ProblemNote,
  ProtectedStrip,
  ScanCard,
  SignedStrip,
  SignedWarning,
  needsFontCard,
} from './editing/Notices';
import { PageEditing } from './editing/PageEditing';
import type { DocumentEditor } from './editing/useDocumentEditor';
import { useScanCheck } from './editing/useScanCheck';
import { useTextSession } from './editing/useTextSession';
import { PageStack } from './PageStack';
import { SearchBar } from './SearchBar';
import { StatusBar } from './StatusBar';
import { Thumbnails } from './Thumbnails';
import { TopBar, type EditorMode } from './TopBar';
import { usePageSizes } from './usePageSizes';
import { usePageText } from './usePageText';
import { useSearch } from './useSearch';
import { useZoom } from './useZoom';

export interface DocumentViewHandle {
  command(command: MenuCommand): void;
  /** Finishes any text being typed, so a save includes it. False if it couldn't be applied. */
  flush(): Promise<boolean>;
  /** True while text is being typed or an edit is still being recorded. */
  hasUnfinishedEdit(): boolean;
}

interface DocumentViewProps {
  readonly file: OpenedFile;
  readonly document: PdfDocument;
  readonly os: OsFamily;
  readonly announcement: string;
  readonly editor: DocumentEditor;
  readonly saveLabel: string;
  readonly onSave: () => void;
  readonly handleRef: RefObject<DocumentViewHandle | null>;
}

const NEW_TEXT_INSET = 72;

const isTyping = () => document.activeElement instanceof HTMLTextAreaElement;

export function DocumentView({
  file,
  document: pdf,
  os,
  announcement,
  editor,
  saveLabel,
  onSave,
  handleRef,
}: DocumentViewProps) {
  const pageSizes = usePageSizes(pdf);
  const zoom = useZoom(pageSizes[0] ?? LETTER_PAGE);
  const { percent, applyZoom, fit } = zoom;
  const [currentPage, setCurrentPage] = useState(1);
  const [mode, setMode] = useState<EditorMode>('select');
  const [isProtected] = useState(() => isEncrypted(file.bytes));
  const [signedLocked, setSignedLocked] = useState(() => hasDigitalSignature(file.bytes));
  const [signedWarning, setSignedWarning] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);
  const scrollToPageRef = useRef<((pageNumber: number, yOffset?: number) => void) | null>(null);
  const session = useTextSession(editor);
  const { draft, finishOpenEdit } = session;
  const pageText = usePageText(pdf);
  const scan = useScanCheck(mode, currentPage, pageText);
  const readForSearch = useCallback((page: number) => pdf.searchableText(page), [pdf]);
  const search = useSearch(pdf.pageCount, readForSearch);
  const currentMatch = search.matches[Math.min(matchIndex, search.matches.length - 1)] ?? null;

  const changeMode = useCallback(
    (next: EditorMode) => {
      finishOpenEdit();
      if (next === 'edit' && signedLocked) {
        setSignedWarning(true);
        return;
      }
      setMode(next);
    },
    [finishOpenEdit, signedLocked],
  );

  const addTextToCurrentPage = () => {
    if (signedLocked) {
      setSignedWarning(true);
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

  useImperativeHandle(handleRef, () => ({
    flush: session.flush,
    hasUnfinishedEdit: session.hasUnfinishedEdit,
    command(command) {
      switch (command) {
        case 'zoom-in':
          applyZoom(zoomIn(percent));
          break;
        case 'zoom-out':
          applyZoom(zoomOut(percent));
          break;
        case 'zoom-actual':
          applyZoom(100);
          break;
        case 'zoom-fit':
          fit();
          break;
        case 'undo':
          // While typing, undo belongs to the text field rather than the document. Menus intercept
          // the shortcut before the field sees it, and this is the only way to pass it on.
          // eslint-disable-next-line @typescript-eslint/no-deprecated
          if (isTyping()) window.document.execCommand('undo');
          else session.undo();
          break;
        case 'redo':
          // eslint-disable-next-line @typescript-eslint/no-deprecated
          if (isTyping()) window.document.execCommand('redo');
          else session.redo();
          break;
        case 'find':
          setSearchOpen(true);
          break;
        case 'add-text':
          if (!isProtected) addTextToCurrentPage();
          break;
        default:
          break;
      }
    },
  }));

  useEffect(() => {
    if (currentMatch) {
      scrollToPageRef.current?.(currentMatch.pageNumber, currentMatch.rect.y);
    }
  }, [currentMatch]);

  const stepMatch = (direction: 1 | -1) => {
    const count = search.matches.length;
    if (count > 0) setMatchIndex((index) => (index + direction + count) % count);
  };

  const stateLabel = () => {
    if (editor.changes > 0) {
      return editor.changes === 1 ? '1 unsaved change' : `${editor.changes} unsaved changes`;
    }
    if (isProtected) return 'Protected';
    if (signedLocked) return 'Looks signed';
    return pdf.pageCount === 1 ? '1 page' : `${pdf.pageCount} pages`;
  };

  const { notice } = editor;

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
        onSearch={() => {
          setSearchOpen(true);
        }}
        onUndo={session.undo}
        onRedo={session.redo}
        onSave={onSave}
      />

      <div className="body">
        <Thumbnails
          document={pdf}
          pageSizes={pageSizes}
          currentPage={currentPage}
          onSelect={(pageNumber) => scrollToPageRef.current?.(pageNumber)}
        />
        <div className="stage">
          {isProtected && <ProtectedStrip />}
          {!isProtected && signedLocked && (
            <SignedStrip
              onEditAnyway={() => {
                setSignedWarning(true);
              }}
            />
          )}
          {!isProtected && !signedLocked && <span />}
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
                matches={
                  searchOpen ? search.matches.filter((m) => m.pageNumber === pageNumber) : []
                }
                currentMatch={currentMatch}
                pageText={pageText}
              />
            )}
          />
          {searchOpen && (
            <SearchBar
              query={search.query}
              current={Math.min(matchIndex, search.matches.length - 1)}
              total={search.matches.length}
              searching={search.searching}
              onQueryChange={(query) => {
                setMatchIndex(0);
                search.setQuery(query);
              }}
              onStep={stepMatch}
              onClose={() => {
                setSearchOpen(false);
                search.setQuery('');
              }}
            />
          )}
          {notice && !needsFontCard(notice) && !draft && (
            <EditNote
              notice={notice}
              showCovered={session.showCovered}
              showSameWidths={session.showSameWidths}
              onDismiss={session.dismissNotice}
            />
          )}
          {editor.problem && (
            <ProblemNote
              message={editor.problem}
              onDismiss={() => {
                editor.reportProblem(null);
              }}
            />
          )}
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
      </div>

      <StatusBar
        os={os}
        page={`Page ${currentPage} of ${pdf.pageCount}`}
        hint={
          mode === 'edit'
            ? 'Click a line to edit it, or click an empty area to add text'
            : 'Drag across text to select it'
        }
        fontsReplaced={editor.substitutedFonts}
        message={
          announcement ||
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

      {signedWarning && (
        <SignedWarning
          onKeepViewing={() => {
            setSignedWarning(false);
          }}
          onEdit={() => {
            setSignedWarning(false);
            setSignedLocked(false);
            setMode('edit');
          }}
        />
      )}
    </div>
  );
}
