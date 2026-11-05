import { useEffect, useRef } from 'react';
import type { PdfDocument } from '../engine/document';

interface SelectLayerProps {
  readonly document: PdfDocument;
  readonly pageNumber: number;
  readonly zoomPercent: number;
  readonly scale: number;
}

/** Invisible text laid exactly over the page, which is what makes it selectable and copyable. */
export function SelectLayer({ document, pageNumber, zoomPercent, scale }: SelectLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.replaceChildren();
    container.style.setProperty('--total-scale-factor', String(scale));
    const task = document.renderTextLayer(pageNumber, container, zoomPercent);
    task.finished.catch((error: unknown) => {
      // The page itself already explains if it's unreadable; it just isn't selectable.
      console.error(error);
    });
    return () => {
      task.cancel();
    };
  }, [document, pageNumber, scale, zoomPercent]);

  return <div ref={containerRef} className="textLayer" data-testid="select-layer" />;
}
