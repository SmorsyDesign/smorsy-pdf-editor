import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { PdfDocument } from '../engine/document';
import { LETTER_PAGE, clampZoom, fitWidthZoom, zoomIn, zoomOut } from '../engine/zoom';
import type { MenuCommand, OpenedFile, OsFamily } from '../platform';
import { Icon } from './Icon';
import { PageStack, PAGE_STACK_PADDING } from './PageStack';
import { shortcutLabel } from './shortcuts';
import { Thumbnails } from './Thumbnails';
import { usePageSizes } from './usePageSizes';

interface DocumentViewProps {
  readonly file: OpenedFile;
  readonly document: PdfDocument;
  readonly os: OsFamily;
  readonly announcement: string;
  readonly onSaveCopy: () => void;
  readonly zoomCommandRef: RefObject<((command: MenuCommand) => void) | null>;
}

type ZoomState = { readonly mode: 'fit' } | { readonly mode: 'manual'; readonly percent: number };

export function DocumentView({
  file,
  document,
  os,
  announcement,
  onSaveCopy,
  zoomCommandRef,
}: DocumentViewProps) {
  const pageSizes = usePageSizes(document);
  const [zoom, setZoom] = useState<ZoomState>({ mode: 'fit' });
  const [availableWidth, setAvailableWidth] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const scrollToPageRef = useRef<((pageNumber: number) => void) | null>(null);

  const firstPage = pageSizes[0] ?? LETTER_PAGE;
  const percent =
    zoom.mode === 'manual'
      ? zoom.percent
      : fitWidthZoom(firstPage, availableWidth - PAGE_STACK_PADDING * 2);

  const applyZoom = useCallback((next: number) => {
    setZoom({ mode: 'manual', percent: clampZoom(next) });
  }, []);

  useEffect(() => {
    zoomCommandRef.current = (command) => {
      if (command === 'zoom-in') applyZoom(zoomIn(percent));
      if (command === 'zoom-out') applyZoom(zoomOut(percent));
      if (command === 'zoom-actual') applyZoom(100);
      if (command === 'zoom-fit') setZoom({ mode: 'fit' });
    };
    return () => {
      zoomCommandRef.current = null;
    };
  }, [applyZoom, percent, zoomCommandRef]);

  return (
    <div className="window" data-os={os}>
      <header className="bar" data-tauri-drag-region>
        <div className="file" data-tauri-drag-region>
          <span className="file-name" data-tauri-drag-region>
            {file.name}
          </span>
          <span className="file-state" data-tauri-drag-region>
            {document.pageCount === 1 ? '1 page' : `${document.pageCount} pages`}
          </span>
        </div>
        <button
          className="btn btn-primary"
          title={`Save a copy (${shortcutLabel(os, 'S')})`}
          onClick={onSaveCopy}
        >
          Save a copy
        </button>
      </header>

      <div className="body">
        <Thumbnails
          document={document}
          pageSizes={pageSizes}
          currentPage={currentPage}
          onSelect={(pageNumber) => scrollToPageRef.current?.(pageNumber)}
        />
        <PageStack
          document={document}
          pageSizes={pageSizes}
          percent={percent}
          measured={availableWidth > 0}
          fileName={file.name}
          onCurrentPageChange={setCurrentPage}
          onAvailableWidthChange={setAvailableWidth}
          onZoomTo={applyZoom}
          scrollToPageRef={scrollToPageRef}
        />
      </div>

      <footer className="status">
        <div className="status-part">
          <span data-testid="page-indicator">
            Page {currentPage} of {document.pageCount}
          </span>
        </div>
        <div className="status-part">
          <span role="status">{announcement || 'Your original file stays unchanged'}</span>
          <div className="zoom" role="group" aria-label="Zoom">
            <button
              className="icon-btn"
              aria-label="Fit to width"
              title={`Fit to width (${shortcutLabel(os, '9')})`}
              aria-pressed={zoom.mode === 'fit'}
              onClick={() => {
                setZoom({ mode: 'fit' });
              }}
            >
              <Icon name="fit" />
            </button>
            <button
              className="icon-btn"
              aria-label="Zoom out"
              title={`Zoom out (${shortcutLabel(os, '-')})`}
              onClick={() => {
                applyZoom(zoomOut(percent));
              }}
            >
              <Icon name="minus" />
            </button>
            <span className="zoom-value" data-testid="zoom-value" aria-live="polite">
              {percent}%
            </span>
            <button
              className="icon-btn"
              aria-label="Zoom in"
              title={`Zoom in (${shortcutLabel(os, '=')})`}
              onClick={() => {
                applyZoom(zoomIn(percent));
              }}
            >
              <Icon name="plus" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
