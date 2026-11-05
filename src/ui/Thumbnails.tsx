import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { PdfDocument } from '../engine/document';
import { LETTER_PAGE, displayedPageSize, type PageSize } from '../engine/zoom';
import { PdfCanvas } from './PdfCanvas';
import { useVisibleItems } from './useVisibleItems';

interface ThumbnailsProps {
  readonly document: PdfDocument;
  readonly pageSizes: readonly (PageSize | undefined)[];
  readonly currentPage: number;
  readonly onSelect: (pageNumber: number) => void;
}

const THUMB_WIDTH = 92;

function thumbZoom(page: PageSize): number {
  return (THUMB_WIDTH / displayedPageSize(page, 100).width) * 100;
}

export function Thumbnails({ document, pageSizes, currentPage, onSelect }: ThumbnailsProps) {
  const listRef = useRef<HTMLElement>(null);
  const activeThumbs = useVisibleItems(listRef, 'data-thumb', '200px 0px', pageSizes.length);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-thumb="${currentPage}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [currentPage]);

  // The list is one Tab stop, with arrows inside it. A long document would otherwise take
  // hundreds of Tabs to get past.
  const moveFocus = (event: KeyboardEvent<HTMLElement>) => {
    const moves: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };
    const step = moves[event.key];
    const from = (event.target as HTMLElement).getAttribute('data-thumb');
    if (!step || !from) return;
    event.preventDefault();
    listRef.current?.querySelector<HTMLElement>(`[data-thumb="${Number(from) + step}"]`)?.focus();
  };

  const estimate = pageSizes[0] ?? LETTER_PAGE;

  return (
    <aside ref={listRef} className="thumbs" aria-label="Pages" onKeyDown={moveFocus}>
      <ol>
        {pageSizes.map((size, index) => {
          const pageNumber = index + 1;
          const page = size ?? estimate;
          const zoom = thumbZoom(page);
          const { width, height } = displayedPageSize(page, zoom);
          const isCurrent = pageNumber === currentPage;
          return (
            <li key={pageNumber}>
              <button
                className="thumb"
                data-thumb={pageNumber}
                aria-label={`Page ${pageNumber}`}
                tabIndex={isCurrent ? 0 : -1}
                aria-current={isCurrent ? 'page' : undefined}
                onClick={() => {
                  onSelect(pageNumber);
                }}
              >
                <span className="thumb-page" style={{ width, height }}>
                  <PdfCanvas
                    document={document}
                    pageNumber={pageNumber}
                    zoomPercent={zoom}
                    width={width}
                    height={height}
                    active={size !== undefined && activeThumbs.has(pageNumber)}
                    decorative
                  />
                </span>
                <span className="thumb-label">{pageNumber}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
