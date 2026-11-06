import { useEffect, useState, type ReactNode } from 'react';
import type { PdfDocument } from '../../engine/document';
import type { TextBox } from '../../engine/edits/model';
import type { PageText, TextBlock } from '../../engine/extract';
import type { SearchMatch } from '../../engine/search';
import { SelectLayer } from '../SelectLayer';
import type { EditorMode } from '../TopBar';
import { EditedBoxes } from './EditedBoxes';
import { EditLayer } from './EditLayer';
import { placedOnPage } from './preview';

interface PageOverlayProps {
  readonly document: PdfDocument;
  readonly pageNumber: number;
  readonly zoomPercent: number;
  readonly scale: number;
  readonly mode: EditorMode;
  readonly boxes: readonly TextBox[];
  readonly editingId: string | null;
  readonly flaggedId: string | null;
  readonly matches: readonly SearchMatch[];
  readonly currentMatch: SearchMatch | null;
  readonly pageText: (pageNumber: number) => Promise<PageText>;
  readonly onOpenBlock: (block: TextBlock, pageElement: HTMLElement) => void;
  readonly onDeleteBlock: (block: TextBlock, pageElement: HTMLElement) => void;
  readonly onOpenBox: (box: TextBox) => void;
  readonly onAddAt: (x: number, y: number) => void;
  /** Whether text can be selected, which marking it needs too. */
  readonly showsTextLayer: boolean;
  /** What's painted under text edits, because it goes in the page before them when saved. */
  readonly beneath: ReactNode;
  readonly children: ReactNode;
}

/** Everything over a drawn page: edits, the current mode's layer, search marks, and the editor. */
export function PageOverlay({
  document,
  pageNumber,
  zoomPercent,
  scale,
  mode,
  boxes,
  editingId,
  flaggedId,
  matches,
  currentMatch,
  pageText,
  onOpenBlock,
  onDeleteBlock,
  onOpenBox,
  onAddAt,
  showsTextLayer,
  beneath,
  children,
}: PageOverlayProps) {
  const [text, setText] = useState<PageText | null>(null);

  useEffect(() => {
    if (mode !== 'edit') return;
    let cancelled = false;
    pageText(pageNumber)
      .then((result) => {
        if (!cancelled) setText(result);
      })
      .catch((error: unknown) => {
        // The page explains itself if it's damaged; it just has nothing to edit.
        console.error(error);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, pageNumber, pageText]);

  return (
    <div className="overlay">
      {showsTextLayer && (
        <SelectLayer
          document={document}
          pageNumber={pageNumber}
          zoomPercent={zoomPercent}
          scale={scale}
        />
      )}
      {mode === 'edit' && (
        <EditLayer
          text={text}
          boxes={boxes}
          scale={scale}
          onOpenBlock={onOpenBlock}
          onDeleteBlock={onDeleteBlock}
          onAddAt={onAddAt}
        />
      )}
      {beneath}
      <EditedBoxes
        boxes={boxes}
        scale={scale}
        hiddenId={editingId}
        flaggedId={flaggedId}
        onOpen={mode === 'edit' ? onOpenBox : null}
      />
      {matches.map((match, index) => (
        <div
          key={index}
          className={match === currentMatch ? 'search-hit search-hit-current' : 'search-hit'}
          style={placedOnPage(match.rect, match.angle, scale)}
        />
      ))}
      {children}
    </div>
  );
}
