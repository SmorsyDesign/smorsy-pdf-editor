import type { MouseEvent } from 'react';
import type { PdfDocument } from '../../engine/document';
import { displayedPageSize, type PageSize } from '../../engine/zoom';
import { Icon } from '../Icon';
import { PdfCanvas } from '../PdfCanvas';
import type { DragHandlers } from './usePageDrag';

const SHEET = { width: 148, height: 192 };

interface PageTileProps {
  readonly document: PdfDocument;
  readonly position: number;
  readonly size: PageSize | undefined;
  readonly visible: boolean;
  readonly isSelected: boolean;
  readonly hasKeyboard: boolean;
  readonly changes: number;
  /** Where a drag would drop the pages: just before this one, or after it as the last page. */
  readonly insertBefore: boolean;
  readonly insertAfter: boolean;
  readonly dragHandlers: DragHandlers;
  readonly onFocus: () => void;
  readonly onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  readonly onOpen: () => void;
}

export function PageTile({
  document,
  position,
  size,
  visible,
  isSelected,
  hasKeyboard,
  changes,
  insertBefore,
  insertAfter,
  dragHandlers,
  onFocus,
  onClick,
  onOpen,
}: PageTileProps) {
  // Fitted on screen pixels, which is what a zoom of 100 per cent gives.
  const natural = size ? displayedPageSize(size, 100) : SHEET;
  const zoom = Math.floor(
    Math.min(SHEET.width / natural.width, SHEET.height / natural.height) * 100,
  );
  const shown = size ? displayedPageSize(size, zoom) : SHEET;
  let tag = '';
  if (changes === 1) tag = '1 change';
  else if (changes > 1) tag = `${String(changes)} changes`;
  return (
    <li data-tile={position}>
      {insertBefore && <span className="insert-mark" aria-hidden="true" />}
      {insertAfter && <span className="insert-mark is-after" aria-hidden="true" />}
      <button
        type="button"
        className="tile"
        aria-pressed={isSelected}
        aria-label={`Page ${String(position)}${tag ? `, ${tag}` : ''}`}
        tabIndex={hasKeyboard ? 0 : -1}
        onFocus={onFocus}
        onClick={onClick}
        onDoubleClick={onOpen}
        {...dragHandlers}
      >
        {isSelected && (
          <span className="tile-check">
            <Icon name="check" />
          </span>
        )}
        <span className="tile-sheet" style={{ width: shown.width, height: shown.height }}>
          <PdfCanvas
            document={document}
            pageNumber={position}
            zoomPercent={zoom}
            width={shown.width}
            height={shown.height}
            active={size !== undefined && visible}
            decorative
          />
        </span>
        <span className="tile-num">{position}</span>
        <span className="tile-tag">{tag}</span>
      </button>
    </li>
  );
}
