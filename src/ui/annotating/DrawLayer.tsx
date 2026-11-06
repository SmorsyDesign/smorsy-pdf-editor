import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Point } from '../../engine/coordinates';
import {
  LINE_WIDTH,
  annotationMovedTo,
  rectBetween,
  type Annotation,
} from '../../engine/edits/annotations';
import type { PageSize } from '../../engine/zoom';
import { AnnotationArt, WhiteoutBoxes } from './AnnotationArt';
import { isMarkupTool, type Annotating } from './useAnnotating';

// Skips points too close together to matter, which keeps long pen strokes from growing huge.
const MIN_PEN_STEP = 1;

interface DrawLayerProps {
  readonly annotating: Annotating;
  readonly pageNumber: number;
  readonly page: PageSize;
  readonly scale: number;
  readonly onEmptyClick: () => void;
}

/** Takes the pointer in Annotate mode, for whichever tool is picked. */
export function DrawLayer({ annotating, pageNumber, page, scale, onEmptyClick }: DrawLayerProps) {
  const { tool, moving } = annotating;
  const [draft, setDraft] = useState<Annotation | null>(null);
  const started = useRef<Point | null>(null);

  const pointIn = (event: { clientX: number; clientY: number }, element: Element): Point => {
    const bounds = element.getBoundingClientRect();
    return {
      x: Math.min(page.width, Math.max(0, (event.clientX - bounds.left) / scale)),
      y: Math.min(page.height, Math.max(0, (event.clientY - bounds.top) / scale)),
    };
  };

  const draftFor = (from: Point, to: Point): Annotation | null => {
    if (!tool) return null;
    const common = { id: 'draft', pageNumber, color: annotating.colorFor(tool), width: LINE_WIDTH };
    if (tool === 'arrow') return { ...common, kind: 'arrow', from, to };
    if (tool === 'rect' || tool === 'ellipse' || tool === 'whiteout') {
      const rect = rectBetween(from, to);
      return rect && { ...common, kind: tool, rect };
    }
    return null;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !tool || isMarkupTool(tool) || tool === 'note') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointIn(event, event.currentTarget);
    started.current = point;
    if (tool === 'pen') {
      setDraft({
        id: 'draft',
        pageNumber,
        kind: 'pen',
        color: annotating.colorFor('pen'),
        width: LINE_WIDTH,
        points: [point],
      });
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const from = started.current;
    if (!from) return;
    const point = pointIn(event, event.currentTarget);
    if (tool === 'pen') {
      setDraft((current) => {
        if (current?.kind !== 'pen') return current;
        const last = current.points.at(-1);
        if (last && Math.hypot(point.x - last.x, point.y - last.y) < MIN_PEN_STEP) return current;
        return { ...current, points: [...current.points, point] };
      });
    } else {
      setDraft(draftFor(from, point));
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const from = started.current;
    started.current = null;
    if (!from) return;
    const finished = draft;
    setDraft(null);
    if (finished && (finished.kind !== 'pen' || finished.points.length > 1)) {
      annotating.add({ ...finished, id: crypto.randomUUID() });
    } else if (tool && tool !== 'pen') {
      // A click with no drag is a shape of a sensible size, for anyone who can't drag.
      annotating.placeAt(tool, pageNumber, pointIn(event, event.currentTarget));
    }
  };

  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const point = pointIn(event, event.currentTarget);
    if (moving) {
      annotating.change(annotationMovedTo(moving, pageNumber, point, page));
      annotating.moveFinished(moving.id);
    } else if (tool === 'note') {
      annotating.placeAt('note', pageNumber, point, true);
    } else if (!tool) {
      annotating.select(null);
      onEmptyClick();
    }
  };

  // Marking text needs the text beneath, so this stays out of the way of it.
  const takesPointer = !isMarkupTool(tool) || moving !== null;

  return (
    <div
      className={tool || moving ? 'draw-layer is-drawing' : 'draw-layer'}
      data-testid="draw-layer"
      style={{ pointerEvents: takesPointer ? 'auto' : 'none' }}
      onPointerDown={moving ? undefined : onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        started.current = null;
        setDraft(null);
      }}
      onClick={onClick}
    >
      {draft && (
        <>
          <WhiteoutBoxes annotations={[draft]} scale={scale} />
          <AnnotationArt annotations={[draft]} page={page} scale={scale} />
        </>
      )}
    </div>
  );
}
