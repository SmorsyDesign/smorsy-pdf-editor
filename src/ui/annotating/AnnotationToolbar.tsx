import {
  boundsOfAnnotation,
  canMove,
  canResize,
  scaledAnnotation,
  type Annotation,
} from '../../engine/edits/annotations';
import type { PageSize } from '../../engine/zoom';
import { Icon } from '../Icon';
import type { Annotating } from './useAnnotating';

const STEP = 1.1;
const BAR_HEIGHT = 40;
const GAP = 8;
const EDGE = 8;

interface AnnotationToolbarProps {
  readonly annotation: Annotation;
  readonly annotating: Annotating;
  readonly scale: number;
  readonly page: PageSize;
}

export function AnnotationToolbar({ annotation, annotating, scale, page }: AnnotationToolbarProps) {
  const { id } = annotation;
  const bounds = boundsOfAnnotation(annotation);
  const above = bounds.y * scale - BAR_HEIGHT - GAP;
  const width = 40 + (canResize(annotation) ? 64 : 0) + (canMove(annotation) ? 32 : 0);
  const left = Math.max(EDGE, Math.min(bounds.x * scale, page.width * scale - width - EDGE));
  const position = {
    left: Math.round(left),
    top: Math.round(above >= EDGE ? above : (bounds.y + bounds.height) * scale + GAP),
  };
  return (
    <div
      className="float-bar placed-bar"
      role="toolbar"
      aria-label="Annotation actions"
      style={position}
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      {canResize(annotation) && (
        <>
          <button
            type="button"
            className="icon-btn"
            aria-label="Make smaller"
            onClick={() => {
              annotating.change(scaledAnnotation(annotation, 1 / STEP, page), `resize-${id}`);
            }}
          >
            <Icon name="minus" />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Make larger"
            onClick={() => {
              annotating.change(scaledAnnotation(annotation, STEP, page), `resize-${id}`);
            }}
          >
            <Icon name="plus" />
          </button>
        </>
      )}
      {canMove(annotation) && (
        <button
          type="button"
          className="icon-btn"
          aria-label="Move: click where it should go"
          aria-pressed={annotating.moving?.id === id}
          onClick={() => {
            annotating.toggleMoving(id);
          }}
        >
          <Icon name="move" />
        </button>
      )}
      <button
        type="button"
        className="icon-btn"
        aria-label="Delete"
        onClick={() => {
          annotating.remove(id);
        }}
      >
        <Icon name="trash" />
      </button>
    </div>
  );
}
