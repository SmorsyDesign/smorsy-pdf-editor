import type { TextBox } from '../../engine/edits/model';
import { cleanFontName } from '../../engine/fonts/match';
import type { FontOutcome } from '../../engine/save/editor';
import { Icon } from '../Icon';
import { previewFamily } from './preview';

const FAMILY_NAMES = {
  sans: 'Liberation Sans',
  serif: 'Liberation Serif',
  mono: 'Liberation Mono',
  carlito: 'Carlito',
  caladea: 'Caladea',
} as const;

interface FontNoticeProps {
  readonly box: TextBox;
  readonly outcome: FontOutcome;
  readonly showCovered: boolean;
  readonly backgroundNotFlat: boolean;
  readonly scale: number;
  readonly pageHeight: number;
  readonly onKeep: () => void;
  readonly onChooseFont: () => void;
  readonly onUndo: () => void;
}

/** Says plainly when an edit couldn't be fully faithful. Shows nothing when it was. */
export function FontNotice({
  box,
  outcome,
  showCovered,
  backgroundNotFlat,
  scale,
  pageHeight,
  onKeep,
  onChooseFont,
  onUndo,
}: FontNoticeProps) {
  const substituted =
    box.original !== null && (outcome.match === 'closest' || outcome.missing.length > 0);
  if (!substituted && !showCovered && !backgroundNotFlat) return null;

  const originalName = cleanFontName(box.original?.name ?? '') || 'The original font';
  const familyName = outcome.family ? FAMILY_NAMES[outcome.family] : 'the closest match';
  const bottom = (box.rect.y + box.rect.height) * scale;
  const fitsBelow = bottom + 300 < pageHeight * scale;
  const left = Math.max(8, box.rect.x * scale);

  return (
    <section
      className={substituted ? 'notice notice-caution font-card' : 'notice notice-toast'}
      role="status"
      // A substitution sits by the text it's about. A general note stays out of the way of the page.
      style={
        substituted
          ? fitsBelow
            ? { left, top: bottom + 8 }
            : { left, bottom: pageHeight * scale - box.rect.y * scale + 56 }
          : undefined
      }
    >
      {substituted && (
        <>
          <h3>
            <Icon name="warn" />
            {originalName} can’t show this text
          </h3>
          <p>
            {outcome.missing.length > 0
              ? `This file only stores the characters it used, and it’s missing ${outcome.missing.slice(0, 6).join(' ')}. `
              : 'That font isn’t available to the app. '}
            Your edit uses {familyName} instead, so it looks slightly different.
          </p>
          <div className="compare">
            <div className="compare-row">
              <span>Your edit</span>
              <div style={{ fontFamily: `"${previewFamily(box.style, box.original)}"` }}>
                {box.lines[0]?.slice(0, 48)}
              </div>
            </div>
          </div>
          <div className="notice-actions">
            <button type="button" className="btn btn-primary" onClick={onKeep}>
              Keep {familyName}
            </button>
            <button type="button" className="btn" onClick={onChooseFont}>
              Choose another font
            </button>
            <button type="button" className="btn" onClick={onUndo}>
              Undo edit
            </button>
          </div>
        </>
      )}
      {backgroundNotFlat && (
        <div className="covered">
          <Icon name="warn" />
          <span>
            The background here isn’t a single colour, so the patch over the old text may be
            visible.
          </span>
        </div>
      )}
      {showCovered && (
        <div className="covered">
          <Icon name="info" />
          <span>
            The old text is covered, not removed, so search and copy can still find it. Don’t rely
            on this to hide anything sensitive.
          </span>
        </div>
      )}
      {!substituted && (
        <div className="notice-actions">
          <button type="button" className="btn" onClick={onKeep}>
            Got it
          </button>
        </div>
      )}
    </section>
  );
}

export function ScanCard({ onAddText, onClose }: { onAddText: () => void; onClose: () => void }) {
  return (
    <section className="notice scan-card" role="status">
      <h3>
        <Icon name="info" />
        This page is a scan, so there’s no text to edit
      </h3>
      <p>It’s a picture of the page rather than text. You can still add new text on top of it.</p>
      <div className="notice-actions">
        <button type="button" className="btn btn-primary" onClick={onAddText}>
          Add text
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </section>
  );
}

export function SignedStrip({ onEditAnyway }: { onEditAnyway: () => void }) {
  return (
    <div className="signed-strip" role="status">
      <Icon name="lock" />
      <span>
        This PDF has a digital signature. You’re viewing it, so the signature stays valid.
      </span>
      <button type="button" className="btn" onClick={onEditAnyway}>
        Edit anyway
      </button>
    </div>
  );
}
