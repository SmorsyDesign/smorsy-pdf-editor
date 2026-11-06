import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { PlacedSignature } from '../../engine/edits/model';

type Shape = Pick<PlacedSignature, 'rect' | 'angle'>;

/** Follows a pointer drag of a placed signature, and hands over the shape it ends on. */
export function useDragPreview(selected: boolean, scale: number, onFinish: (shape: Shape) => void) {
  // While dragging only this preview changes. The edit is recorded once, when it ends.
  const [preview, setPreview] = useState<Shape | null>(null);
  const endDrag = useRef<(() => void) | null>(null);

  // Deselecting removes the handles, and a drag held by one would never hear the pointer lift.
  useEffect(() => {
    if (!selected) endDrag.current?.();
  }, [selected]);

  // A drag works in the scale it began at, so a zoom or the page leaving view ends it unrecorded.
  useEffect(
    () => () => {
      endDrag.current?.();
    },
    [scale],
  );

  const trackPointer = (
    event: ReactPointerEvent<HTMLElement>,
    update: (move: PointerEvent) => Shape,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    let latest: Shape | null = null;
    const onMove = (move: PointerEvent) => {
      latest = update(move);
      setPreview(latest);
    };
    // Wherever focus happens to be, Esc takes back the drag and nothing else.
    const onKey = (key: globalThis.KeyboardEvent) => {
      if (key.key !== 'Escape') return;
      key.preventDefault();
      key.stopPropagation();
      stop();
    };
    const stop = () => {
      window.removeEventListener('keydown', onKey, true);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', stop);
      target.removeEventListener('lostpointercapture', stop);
      endDrag.current = null;
      setPreview(null);
    };
    const onUp = () => {
      const finished = latest;
      stop();
      if (finished) onFinish(finished);
    };
    window.addEventListener('keydown', onKey, true);
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', stop);
    target.addEventListener('lostpointercapture', stop);
    endDrag.current = stop;
  };

  return { preview, trackPointer };
}
