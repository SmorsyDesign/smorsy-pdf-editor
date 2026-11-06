import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from '../Icon';
import type { SignatureKind, SignatureSlip, Signing } from './useSigning';

interface SignPanelProps {
  readonly signing: Signing;
  readonly currentPage: number;
  readonly onClose: () => void;
}

const DRAG_START_DISTANCE = 4;

const LABELS: Readonly<Record<SignatureKind, { heading: string; add: string; noun: string }>> = {
  signature: { heading: 'Signatures', add: 'Create signature', noun: 'signature' },
  initials: { heading: 'Initials', add: 'Create initials', noun: 'initials' },
};

export function SignPanel({ signing, currentPage, onClose }: SignPanelProps) {
  const [ghost, setGhost] = useState<{
    readonly url: string;
    readonly x: number;
    readonly y: number;
  } | null>(null);
  const dragged = useRef(false);
  const stopDrag = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      stopDrag.current?.();
    },
    [],
  );

  // Pointer events rather than HTML drag and drop, because the desktop shell intercepts file drags.
  const startDrag = (event: ReactPointerEvent, slip: SignatureSlip) => {
    if (event.button !== 0) return;
    dragged.current = false;
    const originX = event.clientX;
    const originY = event.clientY;
    const url = signing.urlFor(slip.image);
    const onMove = (move: PointerEvent) => {
      const far = Math.hypot(move.clientX - originX, move.clientY - originY) >= DRAG_START_DISTANCE;
      if (!dragged.current && !far) return;
      dragged.current = true;
      setGhost({ url, x: move.clientX, y: move.clientY });
    };
    const stop = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', stop);
      stopDrag.current = null;
      setGhost(null);
    };
    const onUp = (up: PointerEvent) => {
      stop();
      if (dragged.current) signing.dropAt(slip, up.clientX, up.clientY);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', stop);
    stopDrag.current = stop;
  };

  const section = (kind: SignatureKind) => {
    const { heading, add, noun } = LABELS[kind];
    const slips = signing.slips.filter((slip) => slip.kind === kind);
    return (
      <>
        <h3>{heading}</h3>
        {slips.length > 0 && (
          <ul className="slips">
            {slips.map((slip, index) => (
              <li key={slip.image.id} className="slip">
                <button
                  type="button"
                  className="slip-pick"
                  aria-pressed={signing.pickedId === slip.image.id}
                  aria-label={`Place ${noun} ${index + 1}: ${slip.label}`}
                  onPointerDown={(event) => {
                    startDrag(event, slip);
                  }}
                  ref={(button) => {
                    if (button && signing.focusSlipId === slip.image.id) {
                      button.focus();
                      signing.slipFocused();
                    }
                  }}
                  onClick={(event) => {
                    // A click from the keyboard has no pointer, so it can't say where it goes.
                    if (event.detail === 0) {
                      signing.placeInView(slip, currentPage);
                    } else if (!dragged.current) {
                      signing.pick(signing.pickedId === slip.image.id ? null : slip.image.id);
                    }
                    dragged.current = false;
                  }}
                >
                  <img src={signing.urlFor(slip.image)} alt="" draggable={false} />
                </button>
                <button
                  type="button"
                  className="icon-btn slip-del"
                  aria-label={`Remove ${noun} ${index + 1} from this list`}
                  title="Remove from this list. Anything already placed stays."
                  onClick={(event) => {
                    signing.removeSlip(slip.image.id);
                    // This button is about to go, and keyboard users shouldn't lose their place.
                    event.currentTarget
                      .closest('.panel')
                      ?.querySelector<HTMLElement>('.btn.add')
                      ?.focus();
                  }}
                >
                  <Icon name="trash" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="btn add"
          onClick={() => {
            signing.startCreating(kind);
          }}
        >
          <Icon name="plus" />
          {add}
        </button>
      </>
    );
  };

  return (
    <aside className="panel" aria-label="Signatures">
      <div className="panel-head">
        <h2>Add a signature</h2>
        <button type="button" className="icon-btn" aria-label="Close signatures" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <p className="hint" role="status">
        {signing.picked || signing.moving
          ? 'Click where it goes on the page. Press Esc to cancel.'
          : 'Drag one onto the page, or select it and click where it goes.'}
      </p>
      {section('signature')}
      <p className="slot-note">Kept until you close this PDF, and never stored on this computer.</p>
      {section('initials')}
      <label className="check">
        <input
          type="checkbox"
          checked={signing.addDate}
          onChange={(event) => {
            signing.setAddDate(event.target.checked);
          }}
        />
        Add today’s date beside it
      </label>
      <div className="panel-foot">
        <p>This places a picture of your signature. It isn’t a certified digital signature.</p>
      </div>
      {ghost && (
        <img
          className="slip-ghost"
          src={ghost.url}
          alt=""
          style={{ transform: `translate(${ghost.x}px, ${ghost.y}px)` }}
        />
      )}
    </aside>
  );
}
