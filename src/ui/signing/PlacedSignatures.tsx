import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { PlacedSignature } from '../../engine/edits/model';
import {
  angleToPoint,
  movedRect,
  resizeFromCorner,
  turnedBy,
  type Corner,
} from '../../engine/signatures/placement';
import type { PageSize } from '../../engine/zoom';
import { PlacedToolbar } from './PlacedToolbar';
import type { Signing } from './useSigning';

const MIN_WIDTH = 24;
const KEY_STEP = 4;
const FINE_KEY_STEP = 1;
const TURN_STEP = 5;

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

interface PlacedProps {
  readonly placement: PlacedSignature;
  readonly signing: Signing;
  readonly scale: number;
  readonly page: PageSize;
  readonly interactive: boolean;
  readonly selected: boolean;
}

function Placed({ placement, signing, scale, page, interactive, selected }: PlacedProps) {
  // While dragging only this preview changes. The edit is recorded once, when it ends.
  const [preview, setPreview] = useState<Pick<PlacedSignature, 'rect' | 'angle'> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const { id } = placement;
  const rect = preview?.rect ?? placement.rect;
  const angle = preview?.angle ?? placement.angle;

  // Selecting moves focus here, so the arrow keys work straight away.
  useEffect(() => {
    if (selected) rootRef.current?.focus();
  }, [selected]);

  const trackPointer = (
    event: ReactPointerEvent<HTMLElement>,
    update: (move: PointerEvent) => Pick<PlacedSignature, 'rect' | 'angle'>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    let latest: Pick<PlacedSignature, 'rect' | 'angle'> | null = null;
    const onMove = (move: PointerEvent) => {
      latest = update(move);
      setPreview(latest);
    };
    const onEnd = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onEnd);
      target.removeEventListener('pointercancel', onEnd);
      if (latest) signing.change(id, latest);
      setPreview(null);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onEnd);
    target.addEventListener('pointercancel', onEnd);
  };

  const startMove = (event: ReactPointerEvent<HTMLElement>) => {
    signing.select(id);
    const { clientX, clientY } = event;
    trackPointer(event, (move) => ({
      rect: movedRect(
        placement.rect,
        (move.clientX - clientX) / scale,
        (move.clientY - clientY) / scale,
        page,
      ),
      angle: placement.angle,
    }));
  };

  const startResize = (event: ReactPointerEvent<HTMLElement>, corner: Corner) => {
    const { clientX, clientY } = event;
    trackPointer(event, (move) => ({
      rect: resizeFromCorner(
        placement.rect,
        placement.angle,
        corner,
        (move.clientX - clientX) / scale,
        (move.clientY - clientY) / scale,
        MIN_WIDTH,
      ),
      angle: placement.angle,
    }));
  };

  const startTurn = (event: ReactPointerEvent<HTMLElement>) => {
    const box = rootRef.current?.getBoundingClientRect();
    if (!box) return;
    const middleX = box.left + box.width / 2;
    const middleY = box.top + box.height / 2;
    trackPointer(event, (move) => ({
      rect: placement.rect,
      angle: angleToPoint(move.clientX - middleX, move.clientY - middleY),
    }));
  };

  // A run of key presses undoes together, so holding an arrow isn't dozens of undo steps.
  const keyGroup = (action: string) => `${action}-${id}`;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const arrow = ARROWS[event.key];
    if (arrow) {
      event.preventDefault();
      const step = event.shiftKey ? FINE_KEY_STEP : KEY_STEP;
      signing.change(
        id,
        { rect: movedRect(placement.rect, arrow[0] * step, arrow[1] * step, page) },
        keyGroup('move'),
      );
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
    const rectNext = resizeFromCorner(
      placement.rect,
      placement.angle,
      corner,
      arrow[0] * KEY_STEP,
      arrow[1] * KEY_STEP,
      MIN_WIDTH,
    );
    signing.change(id, { rect: rectNext }, keyGroup('resize'));
  };

  const onTurnKey = (event: KeyboardEvent) => {
    const arrow = ARROWS[event.key];
    if (!arrow) return;
    event.preventDefault();
    event.stopPropagation();
    const direction = arrow[0] + arrow[1];
    signing.change(
      id,
      { angle: turnedBy(placement.angle, direction * TURN_STEP) },
      keyGroup('turn'),
    );
  };

  return (
    <>
      <div
        ref={rootRef}
        className={selected ? 'placed-signature is-selected' : 'placed-signature'}
        data-testid="placed-signature"
        role="group"
        aria-label={
          interactive
            ? 'Placed signature. Use the arrow keys to move it, or Delete to remove it.'
            : 'Placed signature'
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
            <span className="h-stem" />
            <button
              type="button"
              className="handle h-rot"
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
  readonly interactive: boolean;
}

export function PlacedSignatures({
  placements,
  signing,
  scale,
  page,
  interactive,
}: PlacedSignaturesProps) {
  return placements.map((placement) => (
    <Placed
      key={placement.id}
      placement={placement}
      signing={signing}
      scale={scale}
      page={page}
      interactive={interactive}
      selected={interactive && signing.selected?.id === placement.id}
    />
  ));
}
