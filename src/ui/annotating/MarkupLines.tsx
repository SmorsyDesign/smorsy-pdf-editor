import { useEffect, useState } from 'react';
import type { Rect } from '../../engine/edits/model';
import type { PageText } from '../../engine/extract';
import { isMarkupTool, type Annotating } from './useAnnotating';

interface MarkupLinesProps {
  readonly annotating: Annotating;
  readonly pageNumber: number;
  readonly scale: number;
  readonly pageText: (pageNumber: number) => Promise<PageText>;
}

/** The space a turned line takes up. It turns around its top left, as text does. */
function boundsOfLine(rect: Rect, angle: number): Rect {
  const radians = (angle * Math.PI) / 180;
  const xs = [0, rect.width * Math.cos(radians), -rect.height * Math.sin(radians)];
  const ys = [0, rect.width * Math.sin(radians), rect.height * Math.cos(radians)];
  xs.push((xs[1] ?? 0) + (xs[2] ?? 0));
  ys.push((ys[1] ?? 0) + (ys[2] ?? 0));
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return {
    x: rect.x + left,
    y: rect.y + top,
    width: Math.max(...xs) - left,
    height: Math.max(...ys) - top,
  };
}

/**
 * Selecting text takes a pointer, so each line can also be reached with Tab and marked with Enter.
 * They only show when focused, and let the pointer through to the text underneath.
 */
export function MarkupLines({ annotating, pageNumber, scale, pageText }: MarkupLinesProps) {
  const [text, setText] = useState<PageText | null>(null);
  const { tool } = annotating;

  useEffect(() => {
    if (!isMarkupTool(tool)) return;
    let cancelled = false;
    pageText(pageNumber)
      .then((result) => {
        if (!cancelled) setText(result);
      })
      .catch((error: unknown) => {
        // The page explains itself if it's damaged; it just has nothing to mark.
        console.error(error);
      });
    return () => {
      cancelled = true;
    };
  }, [pageNumber, pageText, tool]);

  if (!isMarkupTool(tool) || !text) return null;
  return text.blocks.flatMap((block) =>
    block.lines.map((line, index) => {
      const bounds = boundsOfLine(line.rect, block.angle);
      return (
        <button
          key={`${block.id}-${index}`}
          type="button"
          className="markup-line"
          aria-label={`Mark line: ${line.text.slice(0, 60)}`}
          style={{
            left: bounds.x * scale,
            top: bounds.y * scale,
            width: bounds.width * scale,
            height: bounds.height * scale,
          }}
          onClick={() => {
            annotating.markText(tool, pageNumber, [bounds], line.text);
          }}
        />
      );
    }),
  );
}
