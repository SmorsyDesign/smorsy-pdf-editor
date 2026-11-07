import { useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  annotationLabel,
  boundsOfAnnotation,
  canMove,
  movedAnnotation,
  type Annotation,
} from '../../engine/edits/annotations';
import type { Rect } from '../../engine/edits/model';
import type { PageSize } from '../../engine/zoom';
import { ARROWS, FINE_KEY_STEP, KEY_STEP } from '../nudgeKeys';
import { useDragPreview } from '../signing/useDragPreview';
import { useFocusOnRequest } from '../useFocusOnRequest';
import { pinColor } from './AnnotationArt';
import { AnnotationToolbar } from './AnnotationToolbar';
import { CommentCard } from './CommentCard';
import type { Annotating } from './useAnnotating';

/** How far a press can move and still be a click rather than a drag. */
const CLICK_SLOP = 4;
const MIN_TARGET = 24;

interface ControlProps {
  readonly annotation: Annotation;
  readonly annotating: Annotating;
  readonly scale: number;
  readonly page: PageSize;
  readonly interactive: boolean;
  /** The saved file's own drawing is already on the page, unless this has changed since. */
  readonly drawn: boolean;
}

/** A flat arrow or a thin line has almost no area of its own, so this keeps it easy to pick up. */
function hitArea(bounds: Rect, scale: number) {
  const width = Math.max(MIN_TARGET, bounds.width * scale);
  const height = Math.max(MIN_TARGET, bounds.height * scale);
  return {
    left: (bounds.x + bounds.width / 2) * scale - width / 2,
    top: (bounds.y + bounds.height / 2) * scale - height / 2,
    width,
    height,
  };
}

function Control({ annotation, annotating, scale, page, interactive, drawn }: ControlProps) {
  const selected = annotating.selected?.id === annotation.id;
  const rootRef = useRef<HTMLDivElement>(null);
  const pressedAt = useRef({ x: 0, y: 0 });
  const { id } = annotation;
  const { preview, trackPointer } = useDragPreview<Annotation>(selected, scale, (finished) => {
    annotating.change(finished);
  });
  const shown = preview ?? annotation;

  useFocusOnRequest(rootRef, id, annotating.focusId, annotating.focused);

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !interactive) return;
    pressedAt.current = { x: event.clientX, y: event.clientY };
    annotating.select(id);
    rootRef.current?.focus({ preventScroll: true });
    if (!canMove(annotation)) return;
    const { clientX, clientY } = event;
    trackPointer(event, (move) =>
      movedAnnotation(
        annotation,
        (move.clientX - clientX) / scale,
        (move.clientY - clientY) / scale,
        page,
      ),
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const arrow = ARROWS[event.key];
    if (arrow && canMove(annotation)) {
      event.preventDefault();
      const step = event.shiftKey ? FINE_KEY_STEP : KEY_STEP;
      annotating.change(
        movedAnnotation(annotation, arrow[0] * step, arrow[1] * step, page),
        `move-${id}`,
      );
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      annotating.remove(id);
    } else if (event.key === 'Enter' && annotation.kind === 'comment') {
      event.preventDefault();
      annotating.toggleComment(id);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      annotating.select(null);
    }
  };

  const bounds = boundsOfAnnotation(shown);
  const isComment = annotation.kind === 'comment';
  return (
    <>
      <div
        ref={rootRef}
        className={selected ? 'annotation-hit is-selected' : 'annotation-hit'}
        data-testid="annotation"
        data-kind={annotation.kind}
        role="group"
        aria-label={
          interactive
            ? `${annotationLabel(annotation)}. ${canMove(annotation) ? 'Use the arrow keys to move it, or Delete to remove it.' : 'Press Delete to remove it.'}`
            : annotationLabel(annotation)
        }
        {...(interactive ? { tabIndex: 0 } : {})}
        style={{
          ...hitArea(bounds, scale),
          pointerEvents: interactive ? 'auto' : 'none',
        }}
        onClick={(event) => {
          event.stopPropagation();
          // The end of a drag also counts as a click, which shouldn't open the comment as well.
          const travelled = Math.hypot(
            event.clientX - pressedAt.current.x,
            event.clientY - pressedAt.current.y,
          );
          if (isComment && interactive && travelled < CLICK_SLOP) annotating.toggleComment(id);
        }}
        onFocus={(event) => {
          if (interactive && event.target === event.currentTarget) annotating.select(id);
        }}
        onPointerDown={startDrag}
        onKeyDown={interactive ? onKeyDown : undefined}
      >
        {isComment && drawn && (
          <span className="comment-pin" style={{ background: pinColor(annotation.color) }} />
        )}
      </div>
      {annotation.kind === 'comment' && annotating.openCommentId === id && (
        <CommentCard comment={annotation} annotating={annotating} scale={scale} page={page} />
      )}
      {selected && interactive && (
        <AnnotationToolbar annotation={shown} annotating={annotating} scale={scale} page={page} />
      )}
    </>
  );
}

interface AnnotationControlsProps {
  readonly annotations: readonly Annotation[];
  readonly annotating: Annotating;
  readonly scale: number;
  readonly page: PageSize;
  readonly interactive: boolean;
  readonly isDrawn: (annotation: Annotation) => boolean;
}

/** What can be picked up and changed, laid over what's been drawn. */
export function AnnotationControls({
  annotations,
  annotating,
  scale,
  page,
  interactive,
  isDrawn,
}: AnnotationControlsProps) {
  return annotations.map((annotation) => (
    <Control
      key={annotation.id}
      annotation={annotation}
      annotating={annotating}
      scale={scale}
      page={page}
      interactive={interactive}
      drawn={isDrawn(annotation)}
    />
  ));
}
