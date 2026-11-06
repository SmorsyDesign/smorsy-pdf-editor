import type { PlacedSignature, Rect } from '../../engine/edits/model';
import { boundsOf, turnedBy } from '../../engine/signatures/placement';
import type { PageSize } from '../../engine/zoom';
import { Icon } from '../Icon';
import type { Signing } from './useSigning';

const BAR_WIDTH = 168;
const BAR_HEIGHT = 40;
const GAP = 12;
// Leaves room for the rotate handle, which stands above the signature.
const ABOVE_HANDLE = 44;

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
  const right = (bounds.x + bounds.width) * scale;
  const top = bounds.y * scale;
  const fitsBeside = right + GAP + BAR_WIDTH <= page.width * scale;
  const fitsAbove = top >= BAR_HEIGHT + ABOVE_HANDLE;
  const below = (bounds.y + bounds.height) * scale + GAP;

  return (
    <div
      className="float-bar placed-bar"
      role="toolbar"
      aria-label="Signature actions"
      style={
        fitsBeside
          ? { left: right + GAP, top }
          : {
              left: Math.max(8, (page.width * scale - BAR_WIDTH) / 2),
              top: fitsAbove ? top - BAR_HEIGHT - ABOVE_HANDLE : below,
            }
      }
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
