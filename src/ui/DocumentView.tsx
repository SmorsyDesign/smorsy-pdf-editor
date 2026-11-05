import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type { PdfDocument } from '../engine/document';
import { wrapText } from '../engine/edits/layout';
import type { Rect, TextBox, TextStyle } from '../engine/edits/model';
import { hasDigitalSignature, type PageText, type TextBlock } from '../engine/extract';
import {
  LETTER_PAGE,
  clampZoom,
  fitWidthZoom,
  zoomIn,
  zoomOut,
  type PageSize,
} from '../engine/zoom';
import type { MenuCommand, OpenedFile, OsFamily } from '../platform';
import { AlertDialog } from './AlertDialog';
import { draftForBlock, draftForBox, draftForNewText, type TextDraft } from './editing/drafts';
import { FontNotice, ScanCard, SignedStrip } from './editing/Notices';
import { PageOverlay } from './editing/PageOverlay';
import { preparedMeasure } from './editing/preview';
import { TextEditor, type TextEditorHandle } from './editing/TextEditor';
import type { DocumentEditor, FontNoticeState } from './editing/useDocumentEditor';
import { PageStack, PAGE_STACK_PADDING } from './PageStack';
import { SearchBar } from './SearchBar';
import { StatusBar } from './StatusBar';
import { Thumbnails } from './Thumbnails';
import { TopBar, type EditorMode } from './TopBar';
import { usePageSizes } from './usePageSizes';
import { useSearch } from './useSearch';

export interface DocumentViewHandle {
  command(command: MenuCommand): void;
  /** Finishes any text being typed, so a save includes it. */
  flush(): Promise<void>;
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

type ZoomState = { readonly mode: 'fit' } | { readonly mode: 'manual'; readonly percent: number };

const COVERED_NOTICE_KEY = 'smorsy.coveredNoticeSeen';

function coveredNoticeSeen(): boolean {
  try {
    return localStorage.getItem(COVERED_NOTICE_KEY) === 'yes';
  } catch {
    return false;
  }
}

function rememberCoveredNotice(): void {
  try {
    localStorage.setItem(COVERED_NOTICE_KEY, 'yes');
  } catch {
    // Worst case, the note shows again next time.
  }
}

const isSubstitution = ({ box, outcome }: FontNoticeState) =>
  box.original !== null && (outcome.match === 'closest' || outcome.missing.length > 0);

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
  const [zoom, setZoom] = useState<ZoomState>({ mode: 'fit' });
  const [availableWidth, setAvailableWidth] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [mode, setMode] = useState<EditorMode>('select');
  const [signedLocked, setSignedLocked] = useState(() => hasDigitalSignature(file.bytes));
  const [signedWarning, setSignedWarning] = useState(false);
  const [draft, setDraft] = useState<TextDraft | null>(null);
  const [coveredSeen, setCoveredSeen] = useState(coveredNoticeSeen);
  const [notFlatIds, setNotFlatIds] = useState<ReadonlySet<string>>(() => new Set());
  const [scanned, setScanned] = useState(false);
  const [scanDismissed, setScanDismissed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);
  const scrollToPageRef = useRef<((pageNumber: number, yOffset?: number) => void) | null>(null);
  const editorHandleRef = useRef<TextEditorHandle | null>(null);
  const pendingCommit = useRef<Promise<void>>(Promise.resolve());
  const commitsInProgress = useRef(0);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const textCache = useMemo(() => new Map<number, Promise<PageText>>(), []);
  const pageText = useCallback(
    (pageNumber: number) => {
      let cached = textCache.get(pageNumber);
      if (!cached) {
        cached = pdf.pageText(pageNumber);
        textCache.set(pageNumber, cached);
      }
      return cached;
    },
    [pdf, textCache],
  );
  const search = useSearch(pdf.pageCount, pageText);
  const currentMatch = search.matches[Math.min(matchIndex, search.matches.length - 1)] ?? null;

  const firstPage = pageSizes[0] ?? LETTER_PAGE;
  const percent =
    zoom.mode === 'manual'
      ? zoom.percent
      : fitWidthZoom(firstPage, availableWidth - PAGE_STACK_PADDING * 2);

  const applyZoom = useCallback((next: number) => {
    setZoom({ mode: 'manual', percent: clampZoom(next) });
  }, []);

  const commitDraft = useCallback(
    (current: TextDraft, text: string, rect: Rect, style: TextStyle) => {
      setDraft(null);
      const unchanged =
        text === current.text &&
        rect === current.rect &&
        JSON.stringify(style) === JSON.stringify(current.style);
      if (unchanged || (current.kind === 'add' && text.trim() === '')) return;

      commitsInProgress.current += 1;
      pendingCommit.current = (async () => {
        const measure = await preparedMeasure(style, current.original);
        const ratio = style.size / current.style.size;
        const lineHeight = current.lineHeight * ratio;
        const firstBaseline = current.firstBaseline * ratio;
        const lines = wrapText(text, rect.width, measure);
        const fields = {
          rect: { ...rect, height: Math.max(lines.length, 1) * lineHeight },
          text,
          lines,
          style,
          lineHeight,
          firstBaseline,
        };
        if (current.kind === 'update') {
          if (lines.length === 0 && current.covers.length === 0) {
            editor.apply({ kind: 'remove-text', id: current.id });
          } else {
            editor.apply({ kind: 'update-text', id: current.id, changes: fields });
          }
          return;
        }
        const box: TextBox = {
          id: current.id,
          pageNumber: current.pageNumber,
          angle: current.angle,
          covers: current.covers,
          original: current.original,
          ...fields,
        };
        editor.apply({ kind: current.kind === 'add' ? 'add-text' : 'replace-text', box });
      })().finally(() => {
        commitsInProgress.current -= 1;
      });
      if (current.backgroundNotFlat) {
        setNotFlatIds((ids) => new Set(ids).add(current.id));
      }
    },
    [editor],
  );

  const finishTyping = useCallback(async () => {
    editorHandleRef.current?.commit();
    await pendingCommit.current;
  }, []);

  // An edit being recorded has to land first, or undo would act on the one before it.
  const undoEdit = useCallback(() => {
    void pendingCommit.current.then(editor.undo);
  }, [editor.undo]);
  const redoEdit = useCallback(() => {
    void pendingCommit.current.then(editor.redo);
  }, [editor.redo]);

  const changeMode = useCallback(
    (next: EditorMode) => {
      void finishTyping();
      if (next === 'edit' && signedLocked) {
        setSignedWarning(true);
        return;
      }
      setMode(next);
    },
    [finishTyping, signedLocked],
  );

  useImperativeHandle(
    handleRef,
    () => ({
      flush: finishTyping,
      hasUnfinishedEdit: () => draftRef.current !== null || commitsInProgress.current > 0,
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
            setZoom({ mode: 'fit' });
            break;
          case 'undo':
            // While typing, undo belongs to the text field rather than the document. Menus intercept
            // the shortcut before the field sees it, and this is the only way to pass it on.
            // eslint-disable-next-line @typescript-eslint/no-deprecated
            if (isTyping()) window.document.execCommand('undo');
            else undoEdit();
            break;
          case 'redo':
            // eslint-disable-next-line @typescript-eslint/no-deprecated
            if (isTyping()) window.document.execCommand('redo');
            else redoEdit();
            break;
          case 'find':
            setSearchOpen(true);
            break;
          default:
            break;
        }
      },
    }),
    [applyZoom, finishTyping, percent, redoEdit, undoEdit],
  );

  // A scan explains itself as soon as it's in view in Edit text.
  useEffect(() => {
    if (mode !== 'edit') {
      setScanned(false);
      return;
    }
    let cancelled = false;
    setScanDismissed(false);
    pageText(currentPage)
      .then((result) => {
        if (!cancelled) setScanned(result.scanned);
      })
      .catch((error: unknown) => {
        console.error(error);
      });
    return () => {
      cancelled = true;
    };
  }, [currentPage, mode, pageText]);

  useEffect(() => {
    if (currentMatch) {
      scrollToPageRef.current?.(currentMatch.pageNumber, currentMatch.rect.y);
    }
  }, [currentMatch]);

  const stepMatch = (direction: 1 | -1) => {
    const count = search.matches.length;
    if (count > 0) setMatchIndex((index) => (index + direction + count) % count);
  };

  const dismissNotice = () => {
    if (editor.notice && editor.notice.box.covers.length > 0) {
      rememberCoveredNotice();
      setCoveredSeen(true);
    }
    editor.dismissNotice();
  };

  const openBlock = (block: TextBlock, pageElement: HTMLElement, scale: number, page: PageSize) => {
    editorHandleRef.current?.commit();
    dismissNotice();
    setDraft(draftForBlock(block, page, pageElement, scale));
  };

  const stateLabel = () => {
    if (editor.changes > 0) {
      return editor.changes === 1 ? '1 unsaved change' : `${editor.changes} unsaved changes`;
    }
    if (signedLocked) return 'Digitally signed';
    return pdf.pageCount === 1 ? '1 page' : `${pdf.pageCount} pages`;
  };

  const renderOverlay = (pageNumber: number, page: PageSize, scale: number) => {
    const notice = editor.notice?.box.pageNumber === pageNumber ? editor.notice : null;
    return (
      <PageOverlay
        document={pdf}
        pageNumber={pageNumber}
        zoomPercent={percent}
        scale={scale}
        mode={mode}
        boxes={editor.boxes.filter((box) => box.pageNumber === pageNumber)}
        editingId={draft?.id ?? null}
        matches={searchOpen ? search.matches.filter((m) => m.pageNumber === pageNumber) : []}
        currentMatch={currentMatch}
        pageText={pageText}
        onOpenBlock={(block, element) => {
          openBlock(block, element, scale, page);
        }}
        onDeleteBlock={(block, element) => {
          const target = draftForBlock(block, page, element, scale);
          commitDraft(target, '', target.rect, target.style);
        }}
        onOpenBox={(box) => {
          editorHandleRef.current?.commit();
          dismissNotice();
          setDraft(draftForBox(box));
        }}
        onAddAt={(number, x, y) => {
          dismissNotice();
          if (draft) editorHandleRef.current?.commit();
          else setDraft(draftForNewText(number, x, y, page));
        }}
      >
        {draft?.pageNumber === pageNumber && (
          <TextEditor
            key={draft.id}
            draft={draft}
            page={page}
            scale={scale}
            timesAvailable={editor.timesAvailable}
            handleRef={editorHandleRef}
            onCommit={(text, rect, style) => {
              commitDraft(draft, text, rect, style);
            }}
            onCancel={() => {
              setDraft(null);
            }}
          />
        )}
        {notice && !draft && isSubstitution(notice) && (
          <FontNotice
            box={notice.box}
            outcome={notice.outcome}
            showCovered={notice.box.covers.length > 0 && !coveredSeen}
            backgroundNotFlat={notFlatIds.has(notice.box.id)}
            scale={scale}
            pageHeight={page.height}
            onKeep={dismissNotice}
            onChooseFont={() => {
              dismissNotice();
              setDraft(draftForBox(notice.box));
            }}
            onUndo={() => {
              dismissNotice();
              undoEdit();
            }}
          />
        )}
      </PageOverlay>
    );
  };

  return (
    <div className="window" data-os={os}>
      <TopBar
        os={os}
        fileName={file.name}
        fileState={stateLabel()}
        mode={mode}
        canUndo={editor.canUndo}
        canRedo={editor.canRedo}
        saveLabel={saveLabel}
        onModeChange={changeMode}
        onSearch={() => {
          setSearchOpen(true);
        }}
        onUndo={undoEdit}
        onRedo={redoEdit}
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
          {signedLocked ? (
            <SignedStrip
              onEditAnyway={() => {
                setSignedWarning(true);
              }}
            />
          ) : (
            <span />
          )}
          <PageStack
            document={pdf}
            pageSizes={pageSizes}
            percent={percent}
            measured={availableWidth > 0}
            fileName={file.name}
            keepOverlayOn={draft?.pageNumber ?? null}
            onCurrentPageChange={setCurrentPage}
            onAvailableWidthChange={setAvailableWidth}
            onZoomTo={applyZoom}
            onBackgroundClick={() => {
              editorHandleRef.current?.commit();
            }}
            scrollToPageRef={scrollToPageRef}
            renderOverlay={renderOverlay}
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
          {editor.notice && !draft && !isSubstitution(editor.notice) && (
            <FontNotice
              box={editor.notice.box}
              outcome={editor.notice.outcome}
              showCovered={editor.notice.box.covers.length > 0 && !coveredSeen}
              backgroundNotFlat={notFlatIds.has(editor.notice.box.id)}
              scale={1}
              pageHeight={0}
              onKeep={dismissNotice}
              onChooseFont={dismissNotice}
              onUndo={dismissNotice}
            />
          )}
          {scanned && !scanDismissed && mode === 'edit' && !draft && (
            <ScanCard
              onAddText={() => {
                setScanDismissed(true);
                setDraft(
                  draftForNewText(currentPage, 72, 72, pageSizes[currentPage - 1] ?? LETTER_PAGE),
                );
              }}
              onClose={() => {
                setScanDismissed(true);
              }}
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
          (signedLocked ? 'Signature still valid' : 'Your original file stays unchanged')
        }
        percent={percent}
        fitting={zoom.mode === 'fit'}
        onFit={() => {
          setZoom({ mode: 'fit' });
        }}
        onZoomOut={() => {
          applyZoom(zoomOut(percent));
        }}
        onZoomIn={() => {
          applyZoom(zoomIn(percent));
        }}
      />

      {signedWarning && (
        <AlertDialog
          icon="warn"
          title="Editing will break the signature"
          message="This PDF has a digital signature. If you edit it, your copy’s signature will show as invalid in other PDF apps."
          detail="Your original file keeps its valid signature."
          cancelLabel="Keep viewing"
          confirmLabel="Edit anyway"
          onCancel={() => {
            setSignedWarning(false);
          }}
          onConfirm={() => {
            setSignedWarning(false);
            setSignedLocked(false);
            setMode('edit');
          }}
        />
      )}
    </div>
  );
}
