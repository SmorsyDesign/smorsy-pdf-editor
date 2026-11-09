import { useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import type { PageSelection } from './usePageSelection';

// How far a press can travel before it counts as dragging pages rather than clicking one.
const DRAG_START = 6;
const EDGE_SCROLL = 48;
const AFTER_DRAG = 400;

export interface Dragging {
  readonly moving: ReadonlySet<number>;
  /** The gap the pages would go into, as the position of the page after it. */
  readonly before: number | null;
}

/** Which gap the pointer is over: before the page it's on, or after it past its middle. */
function gapAt(x: number, y: number): number | null {
  const tile = window.document
    .elementsFromPoint(x, y)
    .find((element) => element instanceof HTMLElement && element.dataset['tile'] !== undefined);
  if (!(tile instanceof HTMLElement)) return null;
  const position = Number(tile.dataset['tile']);
  const box = tile.getBoundingClientRect();
  return x < box.left + box.width / 2 ? position : position + 1;
}

/** Dragging tiles to move pages, with the grid scrolling when the pointer nears its edge. */
export function usePageDrag(
  gridRef: RefObject<HTMLOListElement | null>,
  selection: PageSelection,
  ready: boolean,
  onDrop: (before: number, moving: ReadonlySet<number>) => void,
) {
  const [dragging, setShownDrag] = useState<Dragging | null>(null);
  // Read by the pointer handlers, which can run again before React has drawn the last change.
  const dragRef = useRef<Dragging | null>(null);
  const setDragging = (next: Dragging | null) => {
    dragRef.current = next;
    setShownDrag(next);
  };
  const pressed = useRef<{ x: number; y: number; position: number } | null>(null);
  // When the last drag ended. Clicks just after it are the drag's own, however many a browser sends.
  const draggedAt = useRef(0);
  const { selected } = selection;

  const handlersFor = (position: number) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      pressed.current = { x: event.clientX, y: event.clientY, position };
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      const start = pressed.current;
      if (!start) return;
      const travelled = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (!ready || (!dragRef.current && travelled < DRAG_START)) return;
      if (!dragRef.current) {
        event.currentTarget.setPointerCapture(event.pointerId);
        const moving = selected.has(start.position) ? selected : new Set([start.position]);
        if (!selected.has(start.position)) selection.pick(start.position);
        setDragging({ moving, before: null });
        return;
      }
      const grid = gridRef.current;
      if (grid) {
        const box = grid.getBoundingClientRect();
        if (event.clientY < box.top + EDGE_SCROLL) grid.scrollBy(0, -12);
        if (event.clientY > box.bottom - EDGE_SCROLL) grid.scrollBy(0, 12);
      }
      const before = gapAt(event.clientX, event.clientY);
      setDragging({ ...dragRef.current, before });
    },
    onPointerUp: () => {
      pressed.current = null;
      const finished = dragRef.current;
      if (!finished) return;
      draggedAt.current = performance.now();
      setDragging(null);
      if (finished.before !== null) onDrop(finished.before, finished.moving);
    },
    onPointerCancel: () => {
      pressed.current = null;
      setDragging(null);
    },
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Escape' && dragRef.current) {
        event.stopPropagation();
        pressed.current = null;
        setDragging(null);
      }
    },
  });

  return {
    dragging,
    handlersFor,
    /** The end of a drag counts as a click, which would undo choosing several pages. */
    justDragged: () => performance.now() - draggedAt.current < AFTER_DRAG,
  };
}

export type DragHandlers = ReturnType<ReturnType<typeof usePageDrag>['handlersFor']>;
