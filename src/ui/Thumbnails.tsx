import { useEffect, useRef, useState } from 'react';
import type { PdfDocument } from '../engine/document';
import { displayedPageSize, type PageSize } from '../engine/zoom';
import { PdfCanvas } from './PdfCanvas';

interface ThumbnailsProps {
  readonly document: PdfDocument;
  readonly pageSizes: readonly (PageSize | undefined)[];
  readonly currentPage: number;
  readonly onSelect: (pageNumber: number) => void;
}

const THUMB_WIDTH = 92;
const FALLBACK_PAGE: PageSize = { width: 612, height: 792 };

function thumbZoom(page: PageSize): number {
  return (THUMB_WIDTH / displayedPageSize(page, 100).width) * 100;
}

export function Thumbnails({ document, pageSizes, currentPage, onSelect }: ThumbnailsProps) {
  const listRef = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set([1]));

  // A thumbnail stays drawn once seen: they're small, and redrawing while scrolling flickers.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => Number((entry.target as HTMLElement).dataset['thumb']));
        if (visible.length > 0) setSeen((current) => new Set([...current, ...visible]));
      },
      { root: list, rootMargin: '200px 0px' },
    );
    list.querySelectorAll('[data-thumb]').forEach((element) => {
      observer.observe(element);
    });
    return () => {
      observer.disconnect();
    };
  }, [document]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-thumb="${currentPage}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [currentPage]);

  const estimate = pageSizes[0] ?? FALLBACK_PAGE;

  return (
    <aside ref={listRef} className="thumbs" aria-label="Pages">
      <ol>
        {pageSizes.map((size, index) => {
          const pageNumber = index + 1;
          const page = size ?? estimate;
          const zoom = thumbZoom(page);
          const { width, height } = displayedPageSize(page, zoom);
          return (
            <li key={pageNumber}>
              <button
                className="thumb"
                data-thumb={pageNumber}
                aria-label={`Page ${pageNumber}`}
                {...(pageNumber === currentPage ? { 'aria-current': 'page' as const } : {})}
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
                    active={size !== undefined && seen.has(pageNumber)}
                    label=""
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
