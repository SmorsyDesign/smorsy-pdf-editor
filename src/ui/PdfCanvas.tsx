import { useEffect, useRef, useState } from 'react';
import type { PdfDocument } from '../engine/document';

interface PdfCanvasProps {
  readonly document: PdfDocument;
  readonly pageNumber: number;
  readonly zoomPercent: number;
  readonly width: number;
  readonly height: number;
  readonly active: boolean;
  /** Thumbnails repeat what the page itself says, so screen readers skip them. */
  readonly decorative?: boolean;
}

// Waits for a zoom gesture to settle; the old bitmap scales with CSS until then.
const RENDER_DELAY_MS = 120;

export function PdfCanvas({
  document,
  pageNumber,
  zoomPercent,
  width,
  height,
  active,
  decorative = false,
}: PdfCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!active) {
      // Off-screen pages give their memory back; a long document would otherwise run out.
      canvas.width = 0;
      canvas.height = 0;
      document.release(pageNumber);
      return;
    }

    let task: ReturnType<PdfDocument['render']> | null = null;
    const delay = canvas.width === 0 ? 0 : RENDER_DELAY_MS;
    const timer = window.setTimeout(() => {
      task = document.render({
        pageNumber,
        canvas,
        zoomPercent,
        devicePixelRatio: window.devicePixelRatio,
      });
      task.finished
        .then(() => {
          setFailed(false);
        })
        .catch((error: unknown) => {
          console.error(error);
          setFailed(true);
        });
    }, delay);

    return () => {
      window.clearTimeout(timer);
      task?.cancel();
    };
  }, [active, document, pageNumber, zoomPercent]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="pdf-canvas"
        {...(decorative
          ? { 'aria-hidden': true }
          : { role: 'img', 'aria-label': `Page ${pageNumber}` })}
        style={{ width, height }}
      />
      {failed && !decorative && (
        <span className="page-failed" role="alert">
          Page {pageNumber} couldn’t be drawn. It may be damaged. The rest of the file can still be
          read.
        </span>
      )}
    </>
  );
}
