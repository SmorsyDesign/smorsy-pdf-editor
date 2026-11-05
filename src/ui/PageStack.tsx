import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { PdfDocument } from '../engine/document';
import { displayedPageSize, type PageSize } from '../engine/zoom';
import { PdfCanvas } from './PdfCanvas';

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
  readonly scrollToPageRef: RefObject<((pageNumber: number) => void) | null>;
}

const FALLBACK_PAGE: PageSize = { width: 612, height: 792 };

export function PageStack({
  document,
  pageSizes,
  percent,
  measured,
  fileName,
  onCurrentPageChange,
  onAvailableWidthChange,
  onZoomTo,
  scrollToPageRef,
}: PageStackProps) {
  const scrollerRef = useRef<HTMLElement>(null);
  const [activePages, setActivePages] = useState<ReadonlySet<number>>(() => new Set([1]));
  const previousHeight = useRef(0);
  const percentRef = useRef(percent);
  percentRef.current = percent;

  // Measured before the first paint, so pages never lay out or draw at a wrong zoom.
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

  // Pages draw when within a screen of the viewport, so scrolling rarely shows blanks.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setActivePages((current) => {
          const next = new Set(current);
          for (const entry of entries) {
            const pageNumber = Number((entry.target as HTMLElement).dataset['page']);
            if (entry.isIntersecting) next.add(pageNumber);
            else next.delete(pageNumber);
          }
          return next;
        });
      },
      { root: scroller, rootMargin: '100% 0px' },
    );
    scroller.querySelectorAll('[data-page]').forEach((element) => {
      observer.observe(element);
    });
    return () => {
      observer.disconnect();
    };
  }, [document]);

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
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      onZoomTo(percentRef.current * Math.exp(-event.deltaY / 100));
    };
    let gestureStart = 100;
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      gestureStart = percentRef.current;
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      const { scale } = event as Event & { scale: number };
      onZoomTo(gestureStart * scale);
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
    scrollToPageRef.current = (pageNumber) => {
      scrollerRef.current
        ?.querySelector(`[data-page="${pageNumber}"]`)
        ?.scrollIntoView({ block: 'start' });
    };
    return () => {
      scrollToPageRef.current = null;
    };
  }, [scrollToPageRef]);

  const estimate = pageSizes[0] ?? FALLBACK_PAGE;

  return (
    <main ref={scrollerRef} className="canvas" tabIndex={0} aria-label={`Pages of ${fileName}`}>
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
            />
          </div>
        );
      })}
    </main>
  );
}
