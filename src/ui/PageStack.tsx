import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import type { PdfDocument } from '../engine/document';
import { LETTER_PAGE, MAX_ZOOM, MIN_ZOOM, displayedPageSize, type PageSize } from '../engine/zoom';
import { PdfCanvas } from './PdfCanvas';
import { useVisibleItems } from './useVisibleItems';

export const PAGE_STACK_PADDING = 24;

interface PageStackProps {
  readonly document: PdfDocument;
  readonly pageSizes: readonly (PageSize | undefined)[];
  readonly percent: number;
  readonly measured: boolean;
  readonly fileName: string;
  readonly onCurrentPageChange: (pageNumber: number) => void;
  readonly onAvailableWidthChange: (width: number) => void;
  readonly onZoomTo: (percent: number) => void;
  readonly keepOverlayOn: number | null;
  readonly onBackgroundClick: () => void;
  readonly scrollToPageRef: RefObject<((pageNumber: number, yOffset?: number) => void) | null>;
  /** Saved annotations that have changed since, and so shouldn't be drawn from the file. */
  readonly hiddenAnnotations: ReadonlyMap<number, readonly string[]>;
  readonly renderOverlay: (pageNumber: number, page: PageSize, scale: number) => ReactNode;
}

// One notch of a mouse wheel, 100 units, changes the zoom by about a fifth.
const WHEEL_SENSITIVITY = 400;

export function PageStack({
  document,
  pageSizes,
  percent,
  measured,
  fileName,
  onCurrentPageChange,
  onAvailableWidthChange,
  onZoomTo,
  keepOverlayOn,
  onBackgroundClick,
  scrollToPageRef,
  hiddenAnnotations,
  renderOverlay,
}: PageStackProps) {
  const scrollerRef = useRef<HTMLElement>(null);
  const previousHeight = useRef(0);
  const pageSizesRef = useRef(pageSizes);
  pageSizesRef.current = pageSizes;
  // Pinches arrive as tiny steps, so the exact value is kept: rounding each would lose them.
  const exactPercent = useRef(percent);
  if (Math.round(exactPercent.current) !== percent) exactPercent.current = percent;

  // Pages draw when within a screen of the viewport, so scrolling rarely shows blanks.
  const activePages = useVisibleItems(scrollerRef, 'data-page', '100% 0px', pageSizes.length);

  // Measured before the first paint, so the first zoom is never based on a guessed width.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    onAvailableWidthChange(scroller.clientWidth);
    const observer = new ResizeObserver(() => {
      onAvailableWidthChange(scroller.clientWidth);
    });
    observer.observe(scroller);
    return () => {
      observer.disconnect();
    };
  }, [onAvailableWidthChange]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const middle = scroller.getBoundingClientRect().top + scroller.clientHeight / 2;
      const pages = scroller.querySelectorAll<HTMLElement>('[data-page]');
      let low = 0;
      let high = pages.length - 1;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        const page = pages[mid];
        if (page && page.getBoundingClientRect().bottom < middle) low = mid + 1;
        else high = mid;
      }
      onCurrentPageChange(low + 1);
    };
    const onScroll = () => {
      frame ||= requestAnimationFrame(update);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [onCurrentPageChange]);

  // Keeps the same part of the document in view when the zoom changes.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (previousHeight.current > 0 && previousHeight.current !== scroller.scrollHeight) {
      scroller.scrollTop = Math.round(
        (scroller.scrollTop / previousHeight.current) * scroller.scrollHeight,
      );
    }
    previousHeight.current = scroller.scrollHeight;
  }, [percent]);

  // Trackpad pinch: Chromium reports it as ctrl+wheel and WebKit as gesture events.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const zoomTo = (next: number) => {
      exactPercent.current = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
      onZoomTo(exactPercent.current);
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      zoomTo(exactPercent.current * Math.exp(-event.deltaY / WHEEL_SENSITIVITY));
    };
    let gestureStart = 100;
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      gestureStart = exactPercent.current;
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      const { scale } = event as Event & { scale: number };
      zoomTo(gestureStart * scale);
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    scroller.addEventListener('gesturestart', onGestureStart);
    scroller.addEventListener('gesturechange', onGestureChange);
    return () => {
      scroller.removeEventListener('wheel', onWheel);
      scroller.removeEventListener('gesturestart', onGestureStart);
      scroller.removeEventListener('gesturechange', onGestureChange);
    };
  }, [onZoomTo]);

  useEffect(() => {
    scrollToPageRef.current = (pageNumber, yOffset) => {
      const scroller = scrollerRef.current;
      const page = scroller?.querySelector<HTMLElement>(`[data-page="${pageNumber}"]`);
      if (!scroller || !page) return;
      page.scrollIntoView({ block: 'start' });
      if (yOffset !== undefined) {
        const size = pageSizesRef.current[pageNumber - 1] ?? LETTER_PAGE;
        const position = (yOffset / size.height) * page.clientHeight;
        scroller.scrollTop += Math.max(0, position - scroller.clientHeight / 3);
      }
    };
    return () => {
      scrollToPageRef.current = null;
    };
  }, [scrollToPageRef]);

  const estimate = pageSizes[0] ?? LETTER_PAGE;

  return (
    <main
      ref={scrollerRef}
      className="canvas"
      tabIndex={0}
      aria-label={`Pages of ${fileName}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onBackgroundClick();
      }}
    >
      {pageSizes.map((size, index) => {
        const pageNumber = index + 1;
        const { width, height } = displayedPageSize(size ?? estimate, percent);
        return (
          <div className="page" data-page={pageNumber} key={pageNumber} style={{ width, height }}>
            <PdfCanvas
              document={document}
              pageNumber={pageNumber}
              zoomPercent={percent}
              width={width}
              height={height}
              active={measured && size !== undefined && activePages.has(pageNumber)}
              hiddenAnnotations={hiddenAnnotations.get(pageNumber)?.join(' ') ?? ''}
            />
            {measured &&
              size !== undefined &&
              (activePages.has(pageNumber) || keepOverlayOn === pageNumber) &&
              renderOverlay(pageNumber, size, width / size.width)}
          </div>
        );
      })}
    </main>
  );
}
