import type { PlacedSignature, Rect } from '../../engine/edits/model';
import { boundsOf, keptOnPage, scaledRect, turnedBy } from '../../engine/signatures/placement';
import type { PageSize } from '../../engine/zoom';
import { Icon } from '../Icon';
import type { Signing } from './useSigning';

const BAR_WIDTH = 272;
const BAR_HEIGHT = 40;
const GAP = 8;
// Below the signature it clears the rotate handle, which can stand there near the top of a page.
const CLEAR_BELOW = 48;
// Past the rotate handle, which stands above the middle of the signature.
const CLEAR_OF_HANDLE = 24;
const EDGE = 8;
const STEP = 1.1;
const MIN_WIDTH = 24;

interface PlacedToolbarProps {
  readonly placement: PlacedSignature;
  readonly rect: Rect;
  readonly angle: number;
  readonly scale: number;
  readonly page: PageSize;
  readonly signing: Signing;
}

/** Everything here also works with single clicks, for anyone who can't drag. */
export function PlacedToolbar({
  placement,
  rect,
  angle,
  scale,
  page,
  signing,
}: PlacedToolbarProps) {
  const { id } = placement;
  const bounds = boundsOf(rect, angle);
  const middle = (bounds.x + bounds.width / 2) * scale;
  const pageWidth = page.width * scale;
  const above = bounds.y * scale - BAR_HEIGHT - GAP;
  const toRight = middle + CLEAR_OF_HANDLE;
  const toLeft = middle - CLEAR_OF_HANDLE - BAR_WIDTH;
  const fitsRight = toRight + BAR_WIDTH <= pageWidth - EDGE;
  const fitsLeft = toLeft >= EDGE;
  const besideHandle = above >= EDGE && (fitsRight || fitsLeft);
  const position = besideHandle
    ? { left: Math.round(fitsRight ? toRight : toLeft), top: Math.round(above) }
    : {
        // With no room beside the handle it goes underneath, where it can't cover the handle.
        left: Math.round(Math.max(EDGE, Math.min(middle - BAR_WIDTH / 2, pageWidth - BAR_WIDTH))),
        top: Math.round((bounds.y + bounds.height) * scale + CLEAR_BELOW),
      };

  const resize = (factor: number) => {
    signing.change(
      id,
      { rect: scaledRect(placement.rect, placement.angle, factor, MIN_WIDTH, page) },
      `resize-${id}`,
    );
  };

  return (
    <div
      className="float-bar placed-bar"
      role="toolbar"
      aria-label="Signature actions"
      style={position}
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <button
        type="button"
        className="icon-btn"
        aria-label="Rotate 90 degrees"
        onClick={() => {
          const next = turnedBy(placement.angle, 90);
          signing.change(id, { angle: next, rect: keptOnPage(placement.rect, next, page) });
        }}
      >
        <Icon name="rotr" />
      </button>
      <span className="count" data-testid="signature-angle">
        {Math.round(angle)}°
      </span>
      <span className="sep" />
      <button
        type="button"
        className="icon-btn"
        aria-label="Make smaller"
        onClick={() => {
          resize(1 / STEP);
        }}
      >
        <Icon name="minus" />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label="Make larger"
        onClick={() => {
          resize(STEP);
        }}
      >
        <Icon name="plus" />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label="Move: click where it should go"
        aria-pressed={signing.moving?.id === id}
        onClick={() => {
          signing.toggleMoving(id);
        }}
      >
        <Icon name="move" />
      </button>
      <span className="sep" />
      <button
        type="button"
        className="icon-btn"
        aria-label="Duplicate"
        onClick={() => {
          signing.duplicate(placement, page);
        }}
      >
        <Icon name="copy" />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label="Delete"
        onClick={() => {
          signing.remove(id);
        }}
      >
        <Icon name="trash" />
      </button>
    </div>
  );
}
