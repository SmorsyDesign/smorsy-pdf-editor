import { cleanFontName } from '../../engine/fonts/match';
import { AlertDialog } from '../AlertDialog';
import { Icon } from '../Icon';
import { previewFamily } from './preview';
import type { FontNoticeState } from './useDocumentEditor';

const FAMILY_NAMES = {
  sans: 'Liberation Sans',
  serif: 'Liberation Serif',
  mono: 'Liberation Mono',
  carlito: 'Carlito',
  caladea: 'Caladea',
} as const;

const listed = (characters: readonly string[]) =>
  characters
    .slice(0, 6)
    .map((character) => (character === ' ' ? 'space' : character))
    .join(' ');

const familyNameOf = ({ outcome }: FontNoticeState) =>
  outcome.family ? FAMILY_NAMES[outcome.family] : 'the closest match';

/** A card sits by the text it's about. Anything else is a note that stays out of the way. */
export function needsFontCard({ box, outcome }: FontNoticeState): boolean {
  if (box.lines.length === 0) return false;
  if (outcome.uncovered.length > 0) return true;
  return box.original !== null && (outcome.match === 'closest' || outcome.missing.length > 0);
}

/** The font a same-widths note would be about, or null if there's no note to give. */
export function sameWidthsFont(notice: FontNoticeState): string | null {
  if (needsFontCard(notice) || notice.box.lines.length === 0) return null;
  if (notice.outcome.match !== 'same-widths' || !notice.box.original) return null;
  return cleanFontName(notice.box.original.name);
}

interface FontCardProps {
  readonly notice: FontNoticeState;
  readonly scale: number;
  readonly pageHeight: number;
  readonly onKeep: () => void;
  readonly onChooseFont: () => void;
  readonly onUndo: () => void;
}

/** Says plainly when an edit couldn't be fully faithful. */
export function FontCard({
  notice,
  scale,
  pageHeight,
  onKeep,
  onChooseFont,
  onUndo,
}: FontCardProps) {
  const { box, outcome } = notice;
  const bottom = (box.rect.y + box.rect.height) * scale;
  const fitsBelow = bottom + 300 < pageHeight * scale;
  const left = Math.max(8, box.rect.x * scale);
  const placement = fitsBelow
    ? { left, top: bottom + 8 }
    : { left, bottom: pageHeight * scale - box.rect.y * scale + 56 };

  if (outcome.uncovered.length > 0) {
    return (
      <section className="notice notice-caution font-card" role="status" style={placement}>
        <h3>
          <Icon name="warn" />
          These characters can’t be saved
        </h3>
        <p>
          No font available to the app has {listed(outcome.uncovered)}. Change or remove them before
          you save.
        </p>
        <div className="notice-actions">
          <button type="button" className="btn btn-primary" onClick={onChooseFont}>
            Edit text
          </button>
          <button type="button" className="btn" onClick={onUndo}>
            Undo edit
          </button>
        </div>
      </section>
    );
  }

  const originalName = cleanFontName(box.original?.name ?? '') || 'The original font';
  const familyName = familyNameOf(notice);
  return (
    <section className="notice notice-caution font-card" role="status" style={placement}>
      <h3>
        <Icon name="warn" />
        {originalName} can’t show this text
      </h3>
      <p>
        {outcome.missing.length > 0
          ? `This file only stores the characters it used, and it’s missing ${listed(outcome.missing)}. `
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
    </section>
  );
}

interface EditNoteProps {
  readonly notice: FontNoticeState;
  readonly showCovered: boolean;
  readonly showSameWidths: boolean;
  readonly onDismiss: () => void;
}

export function EditNote({ notice, showCovered, showSameWidths, onDismiss }: EditNoteProps) {
  if (!showCovered && !showSameWidths) return null;
  return (
    <section className="notice notice-toast" role="status">
      {showSameWidths && (
        <div className="covered">
          <Icon name="info" />
          <span>
            {sameWidthsFont(notice)} can’t be used for this edit, so it uses {familyNameOf(notice)}.
            It has the same letter widths, so the layout holds.
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
      <div className="notice-actions">
        <button type="button" className="btn" onClick={onDismiss}>
          Got it
        </button>
      </div>
    </section>
  );
}

export function ProblemNote({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <section className="notice notice-toast" role="alert">
      <div className="covered">
        <Icon name="warn" />
        <span>{message}</span>
      </div>
      <div className="notice-actions">
        <button type="button" className="btn" onClick={onDismiss}>
          Got it
        </button>
      </div>
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
        This PDF looks digitally signed, though the app can’t check signatures yet. You’re only
        viewing it, so nothing has changed.
      </span>
      <button type="button" className="btn" onClick={onEditAnyway}>
        Edit anyway
      </button>
    </div>
  );
}

export function SignedWarning({
  onKeepViewing,
  onEdit,
}: {
  onKeepViewing: () => void;
  onEdit: () => void;
}) {
  return (
    <AlertDialog
      icon="warn"
      title="Editing will break the signature"
      message="This PDF looks digitally signed. If you edit it, your copy’s signature will show as invalid in other PDF apps."
      detail="Your original file and its signature stay as they are."
      cancelLabel="Keep viewing"
      confirmLabel="Edit anyway"
      onCancel={onKeepViewing}
      onConfirm={onEdit}
    />
  );
}

export function ProtectedStrip() {
  return (
    <div className="signed-strip" role="status">
      <Icon name="lock" />
      <span>
        This PDF is protected against changes. You can read it and save a copy, but not edit it.
      </span>
    </div>
  );
}
