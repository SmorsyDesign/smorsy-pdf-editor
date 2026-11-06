import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { PlacedSignature } from '../../engine/edits/model';
import {
  MIN_SIGNATURE_WIDTH,
  angleToPoint,
  keptOnPage,
  movedRect,
  resizeFromCorner,
  turnedBy,
  type Corner,
} from '../../engine/signatures/placement';
import type { PageSize } from '../../engine/zoom';
import { PlacedToolbar } from './PlacedToolbar';
import { useDragPreview } from './useDragPreview';
import type { Signing } from './useSigning';

const KEY_STEP = 4;
const FINE_KEY_STEP = 1;
const TURN_STEP = 5;
// The handle stands this far above the signature, which needs room on the page.
const HANDLE_ROOM = 44;

const CORNERS: readonly (readonly [Corner, string, string])[] = [
  ['top-left', 'h-tl', 'Resize from top left'],
  ['top-right', 'h-tr', 'Resize from top right'],
  ['bottom-left', 'h-bl', 'Resize from bottom left'],
  ['bottom-right', 'h-br', 'Resize from bottom right'],
];

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

type Shape = Pick<PlacedSignature, 'rect' | 'angle'>;

interface PlacedProps {
  readonly placement: PlacedSignature;
  readonly signing: Signing;
  readonly scale: number;
  readonly page: PageSize;
  readonly interactive: boolean;
  readonly selected: boolean;
}

function Placed({ placement, signing, scale, page, interactive, selected }: PlacedProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { id } = placement;

  const { focusPlacedId, placedFocused } = signing;
  useEffect(() => {
    if (focusPlacedId !== id) return;
    rootRef.current?.focus();
    placedFocused();
  }, [focusPlacedId, id, placedFocused]);

  const { preview, trackPointer } = useDragPreview<Shape>(selected, scale, (shape) => {
    signing.change(id, shape);
  });
  const rect = preview?.rect ?? placement.rect;
  const angle = preview?.angle ?? placement.angle;

  const startMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    signing.select(id);
    rootRef.current?.focus({ preventScroll: true });
    const { clientX, clientY } = event;
    trackPointer(event, (move) => ({
      rect: movedRect(
        placement.rect,
        placement.angle,
        (move.clientX - clientX) / scale,
        (move.clientY - clientY) / scale,
        page,
      ),
      angle: placement.angle,
    }));
  };

  const startResize = (event: ReactPointerEvent<HTMLElement>, corner: Corner) => {
    if (event.button !== 0) return;
    const { clientX, clientY } = event;
    trackPointer(event, (move) => ({
      rect: keptOnPage(
        resizeFromCorner(
          placement.rect,
          placement.angle,
          corner,
          (move.clientX - clientX) / scale,
          (move.clientY - clientY) / scale,
          MIN_SIGNATURE_WIDTH,
        ),
        placement.angle,
        page,
      ),
      angle: placement.angle,
    }));
  };

  const middleOnScreen = () => {
    const box = rootRef.current?.getBoundingClientRect();
    return box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null;
  };

  // Near the top of the page the handle goes underneath, so it can always be reached.
  const handleBelow = placement.rect.y * scale < HANDLE_ROOM;

  const startTurn = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const middle = middleOnScreen();
    if (!middle) return;
    const side = handleBelow ? -1 : 1;
    trackPointer(event, (move) => {
      const next = angleToPoint(side * (move.clientX - middle.x), side * (move.clientY - middle.y));
      return { angle: next, rect: keptOnPage(placement.rect, next, page) };
    });
  };

  // A run of key presses undoes together, so holding an arrow isn't dozens of undo steps.
  const keyGroup = (action: string) => `${action}-${id}`;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const arrow = ARROWS[event.key];
    if (arrow) {
      event.preventDefault();
      const step = event.shiftKey ? FINE_KEY_STEP : KEY_STEP;
      const moved = movedRect(
        placement.rect,
        placement.angle,
        arrow[0] * step,
        arrow[1] * step,
        page,
      );
      signing.change(id, { rect: moved }, keyGroup('move'));
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      signing.remove(id);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      signing.select(null);
    }
  };

  const onCornerKey = (event: KeyboardEvent, corner: Corner) => {
    const arrow = ARROWS[event.key];
    if (!arrow) return;
    event.preventDefault();
    event.stopPropagation();
    const resized = resizeFromCorner(
      placement.rect,
      placement.angle,
      corner,
      arrow[0] * KEY_STEP,
      arrow[1] * KEY_STEP,
      MIN_SIGNATURE_WIDTH,
    );
    signing.change(id, { rect: keptOnPage(resized, placement.angle, page) }, keyGroup('resize'));
  };

  const onTurnKey = (event: KeyboardEvent) => {
    const arrow = ARROWS[event.key];
    if (!arrow) return;
    event.preventDefault();
    event.stopPropagation();
    const next = turnedBy(placement.angle, (arrow[0] + arrow[1]) * TURN_STEP);
    signing.change(
      id,
      { angle: next, rect: keptOnPage(placement.rect, next, page) },
      keyGroup('turn'),
    );
  };

  const noun = placement.purpose ?? 'signature';

  return (
    <>
      <div
        ref={rootRef}
        className={selected ? 'placed-signature is-selected' : 'placed-signature'}
        data-testid="placed-signature"
        role="group"
        aria-label={
          interactive
            ? `Placed ${noun}. Use the arrow keys to move it, or Delete to remove it.`
            : `Placed ${noun}`
        }
        {...(interactive ? { tabIndex: 0 } : {})}
        style={{
          left: rect.x * scale,
          top: rect.y * scale,
          width: rect.width * scale,
          height: rect.height * scale,
          transform: `rotate(${angle}deg)`,
          pointerEvents: interactive ? 'auto' : 'none',
        }}
        onClick={(event) => {
          event.stopPropagation();
        }}
        onFocus={(event) => {
          if (interactive && event.target === event.currentTarget) signing.select(id);
        }}
        onPointerDown={interactive ? startMove : undefined}
        onKeyDown={interactive ? onKeyDown : undefined}
      >
        <img src={signing.urlFor(placement.image)} alt="" draggable={false} />
        {selected && (
          <>
            {CORNERS.map(([corner, className, label]) => (
              <button
                key={corner}
                type="button"
                className={`handle ${className}`}
                aria-label={label}
                onPointerDown={(event) => {
                  startResize(event, corner);
                }}
                onKeyDown={(event) => {
                  onCornerKey(event, corner);
                }}
              />
            ))}
            <span className={handleBelow ? 'h-stem is-below' : 'h-stem'} />
            <button
              type="button"
              className={handleBelow ? 'handle h-rot is-below' : 'handle h-rot'}
              aria-label="Rotate signature"
              onPointerDown={startTurn}
              onKeyDown={onTurnKey}
            />
          </>
        )}
      </div>
      {selected && (
        <PlacedToolbar
          placement={placement}
          rect={rect}
          angle={angle}
          scale={scale}
          page={page}
          signing={signing}
        />
      )}
    </>
  );
}

interface PlacedSignaturesProps {
  readonly placements: readonly PlacedSignature[];
  readonly signing: Signing;
  readonly scale: number;
  readonly page: PageSize;
  readonly isInteractive: (placement: PlacedSignature) => boolean;
}

export function PlacedSignatures({
  placements,
  signing,
  scale,
  page,
  isInteractive,
}: PlacedSignaturesProps) {
  return placements.map((placement) => (
    <Placed
      key={placement.id}
      placement={placement}
      signing={signing}
      scale={scale}
      page={page}
      interactive={isInteractive(placement)}
      selected={isInteractive(placement) && signing.selected?.id === placement.id}
    />
  ));
}
