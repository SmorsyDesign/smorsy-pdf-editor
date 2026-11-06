import type { PdfDocument } from '../../engine/document';
import type { PageText } from '../../engine/extract';
import type { SearchMatch } from '../../engine/search';
import type { PageSize } from '../../engine/zoom';
import type { EditorMode } from '../TopBar';
import { FontCard, needsFontCard } from './Notices';
import { PageOverlay } from './PageOverlay';
import { TextEditor } from './TextEditor';
import type { DocumentEditor } from './useDocumentEditor';
import type { TextSession } from './useTextSession';

interface PageEditingProps {
  readonly document: PdfDocument;
  readonly pageNumber: number;
  readonly page: PageSize;
  readonly scale: number;
  readonly zoomPercent: number;
  readonly mode: EditorMode;
  readonly editor: DocumentEditor;
  readonly session: TextSession;
  readonly matches: readonly SearchMatch[];
  readonly currentMatch: SearchMatch | null;
  readonly pageText: (pageNumber: number) => Promise<PageText>;
}

/** One page's overlay, with the text editor and any font card that belongs on it. */
export function PageEditing({
  document,
  pageNumber,
  page,
  scale,
  zoomPercent,
  mode,
  editor,
  session,
  matches,
  currentMatch,
  pageText,
}: PageEditingProps) {
  const { draft } = session;
  const fontCard = editor.notice && needsFontCard(editor.notice) && !draft ? editor.notice : null;
  return (
    <PageOverlay
      document={document}
      pageNumber={pageNumber}
      zoomPercent={zoomPercent}
      scale={scale}
      mode={mode}
      boxes={editor.boxes.filter((box) => box.pageNumber === pageNumber)}
      editingId={draft?.id ?? null}
      flaggedId={fontCard?.box.id ?? null}
      matches={matches}
      currentMatch={currentMatch}
      pageText={pageText}
      onOpenBlock={(block, element) => {
        void session.openBlock(block, element, scale, page);
      }}
      onDeleteBlock={(block, element) => {
        session.deleteBlock(block, element, scale, page);
      }}
      onOpenBox={session.openBox}
      onAddAt={(number, x, y) => {
        session.clickEmptyPage(number, x, y, page);
      }}
    >
      {draft?.pageNumber === pageNumber && (
        <TextEditor
          key={draft.id}
          draft={draft}
          page={page}
          scale={scale}
          timesAvailable={editor.timesAvailable}
          handleRef={session.editorHandleRef}
          onCommit={(text, rect, style) => {
            session.commitDraft(draft, text, rect, style);
          }}
          onCancel={session.cancelDraft}
        />
      )}
      {fontCard?.box.pageNumber === pageNumber && (
        <FontCard
          notice={fontCard}
          showCovered={session.showCovered}
          scale={scale}
          pageHeight={page.height}
          onKeep={session.dismissNotice}
          onChooseFont={() => {
            session.openBox(fontCard.box);
          }}
          onUndo={() => {
            session.dismissNotice();
            session.undo();
          }}
        />
      )}
    </PageOverlay>
  );
}
