import type { PlacedSignature, Rect } from '../../engine/edits/model';
import { boundsOf, turnedBy } from '../../engine/signatures/placement';
import type { PageSize } from '../../engine/zoom';
import { Icon } from '../Icon';
import type { Signing } from './useSigning';

const BAR_WIDTH = 136;
const BAR_HEIGHT = 40;
const GAP = 8;
// Past the rotate handle, which stands above the middle of the signature.
const CLEAR_OF_HANDLE = 24;
const EDGE = 8;

interface PlacedToolbarProps {
  readonly placement: PlacedSignature;
  readonly rect: Rect;
  readonly angle: number;
  readonly scale: number;
  readonly page: PageSize;
  readonly signing: Signing;
}

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
  const top = bounds.y * scale - BAR_HEIGHT - GAP;
  // Above the signature, so it never sits on a date stamp beside it.
  const position = {
    left: Math.max(EDGE, Math.min(middle + CLEAR_OF_HANDLE, page.width * scale - BAR_WIDTH - EDGE)),
    top: top >= EDGE ? top : (bounds.y + bounds.height) * scale + GAP,
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
          signing.change(id, { angle: turnedBy(placement.angle, 90) });
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
