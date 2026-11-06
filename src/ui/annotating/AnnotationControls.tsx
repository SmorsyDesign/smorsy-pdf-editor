import {
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useState,
} from 'react';
import {
  boundsOfAnnotation,
  canMove,
  canResize,
  movedAnnotation,
  scaledAnnotation,
  type Annotation,
} from '../../engine/edits/annotations';
import type { PageSize } from '../../engine/zoom';
import { Icon } from '../Icon';
import { useDragPreview } from '../signing/useDragPreview';
import { noteColor, noteCardPlace } from './AnnotationArt';
import type { Annotating } from './useAnnotating';

const KEY_STEP = 4;
const FINE_KEY_STEP = 1;
const STEP = 1.1;
const BAR_HEIGHT = 40;
const GAP = 8;
const EDGE = 8;

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

interface ControlProps {
  readonly annotation: Annotation;
  readonly annotating: Annotating;
  readonly scale: number;
  readonly page: PageSize;
  readonly interactive: boolean;
}

function Toolbar({ annotation, annotating, scale, page }: Omit<ControlProps, 'interactive'>) {
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

function NoteCard({ annotation, annotating, scale, page }: Omit<ControlProps, 'interactive'>) {
  // Mounted once per opening, so all the typing in one visit is one undo.
  const [typing] = useState(() => `note-${crypto.randomUUID()}`);
  if (annotation.kind !== 'note') return null;
  return (
    <div
      className="note-card"
      data-testid="note-card"
      style={{
        ...noteCardPlace(boundsOfAnnotation(annotation), scale, page),
        background: noteColor(annotation.color),
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <textarea
        aria-label="Note"
        // A note is opened to be typed in, so it should be ready straight away.
        ref={(field) => {
          if (field && !annotation.text) field.focus();
        }}
        defaultValue={annotation.text}
        rows={4}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            event.currentTarget.blur();
          }
        }}
        // As it's typed rather than on leaving, because a shortcut can save without leaving the box.
        onChange={(event) => {
          annotating.change({ ...annotation, text: event.target.value }, typing);
        }}
        onBlur={(event) => {
          // A note with nothing in it would just be a stray mark on the page.
          if (event.target.value.trim() === '') annotating.remove(annotation.id);
          annotating.closeNote();
        }}
      />
    </div>
  );
}

function Control({ annotation, annotating, scale, page, interactive }: ControlProps) {
  const selected = annotating.selected?.id === annotation.id;
  const rootRef = useRef<HTMLDivElement>(null);
  const { id } = annotation;
  const onDone = useMemo(
    () => (finished: Annotation) => {
      annotating.change(finished);
    },
    [annotating],
  );
  const { preview, trackPointer } = useDragPreview<Annotation>(selected, scale, onDone);
  const shown = preview ?? annotation;

  const { focusId, focused } = annotating;
  useEffect(() => {
    if (focusId !== id) return;
    rootRef.current?.focus();
    focused();
  }, [focusId, focused, id]);

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !interactive) return;
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
    } else if (event.key === 'Enter' && annotation.kind === 'note') {
      event.preventDefault();
      annotating.toggleNote(id);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      annotating.select(null);
    }
  };

  const bounds = boundsOfAnnotation(shown);
  const isNote = annotation.kind === 'note';
  return (
    <>
      <div
        ref={rootRef}
        className={selected ? 'annotation-hit is-selected' : 'annotation-hit'}
        data-testid="annotation"
        data-kind={annotation.kind}
        role="group"
        aria-label={`${annotation.kind} annotation`}
        {...(interactive ? { tabIndex: 0 } : {})}
        style={{
          left: bounds.x * scale,
          top: bounds.y * scale,
          width: bounds.width * scale,
          height: bounds.height * scale,
          pointerEvents: interactive ? 'auto' : 'none',
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (isNote && interactive) annotating.toggleNote(id);
        }}
        onFocus={(event) => {
          if (interactive && event.target === event.currentTarget) annotating.select(id);
        }}
        onPointerDown={startDrag}
        onKeyDown={interactive ? onKeyDown : undefined}
      >
        {isNote && (
          <span className="note-pin" style={{ background: noteColor(annotation.color) }}>
            <Icon name="pin" />
          </span>
        )}
      </div>
      {annotating.openNoteId === id && (
        <NoteCard annotation={annotation} annotating={annotating} scale={scale} page={page} />
      )}
      {selected && interactive && (
        <Toolbar annotation={shown} annotating={annotating} scale={scale} page={page} />
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
}

/** What can be picked up and changed, laid over what's been drawn. */
export function AnnotationControls({
  annotations,
  annotating,
  scale,
  page,
  interactive,
}: AnnotationControlsProps) {
  return annotations.map((annotation) => (
    <Control
      key={annotation.id}
      annotation={annotation}
      annotating={annotating}
      scale={scale}
      page={page}
      interactive={interactive}
    />
  ));
}
