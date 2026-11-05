import { useEffect, useRef, useState } from 'react';
import type { PdfDocument } from '../engine/document';
import { EngineError } from '../engine/errors';

interface PdfCanvasProps {
  readonly document: PdfDocument;
  readonly pageNumber: number;
  readonly zoomPercent: number;
  readonly width: number;
  readonly height: number;
  readonly active: boolean;
  readonly label?: string;
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
  label,
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
          if (error instanceof EngineError) setFailed(true);
          else throw error;
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
        role="img"
        aria-label={label ?? `Page ${pageNumber}`}
        style={{ width, height }}
      />
      {failed && (
        <span className="page-failed" role="alert">
          This page couldn’t be drawn. The rest of the file is still safe to read.
        </span>
      )}
    </>
  );
}
