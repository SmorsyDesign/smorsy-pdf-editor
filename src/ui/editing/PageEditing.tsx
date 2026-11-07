import type { PdfDocument } from '../../engine/document';
import type { PageText } from '../../engine/extract';
import type { SearchMatch } from '../../engine/search';
import type { PageSize } from '../../engine/zoom';
import { AnnotationArt, Highlights, WhiteoutBoxes } from '../annotating/AnnotationArt';
import { AnnotationControls } from '../annotating/AnnotationControls';
import { CommentReader } from '../annotating/CommentReader';
import { DrawLayer } from '../annotating/DrawLayer';
import { MarkupLines } from '../annotating/MarkupLines';
import { isMarkupTool, type Annotating } from '../annotating/useAnnotating';
import { FormLayer } from '../forms/FormLayer';
import type { FormFields } from '../forms/useFormFields';
import { PlacedSignatures } from '../signing/PlacedSignatures';
import { SignLayer } from '../signing/SignLayer';
import type { Signing } from '../signing/useSigning';
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
  readonly signing: Signing;
  readonly annotating: Annotating;
  readonly form: FormFields;
  readonly canFillForm: boolean;
  readonly onSign: () => void;
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
  signing,
  annotating,
  form,
  canFillForm,
  onSign,
  matches,
  currentMatch,
  pageText,
}: PageEditingProps) {
  const { draft } = session;
  const marks = annotating.annotations.filter((annotation) => annotation.pageNumber === pageNumber);
  // The rest are saved in the file exactly as they are, so the page already shows them.
  const drawn = marks.filter(editor.isDrawnByApp);
  const annotatingHere = mode === 'note';
  const marking = annotatingHere && isMarkupTool(annotating.tool);
  const pickable = annotatingHere && annotating.tool === null;
  const fontCard = editor.notice && needsFontCard(editor.notice) && !draft ? editor.notice : null;
  return (
    <PageOverlay
      showsTextLayer={mode === 'select' || marking}
      beneath={<WhiteoutBoxes annotations={drawn} scale={scale} outlined={annotatingHere} />}
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
      onAddAt={(x, y) => {
        session.clickEmptyPage(pageNumber, x, y, page);
      }}
    >
      <FormLayer
        form={form}
        pageNumber={pageNumber}
        scale={scale}
        interactive={mode === 'select' && canFillForm}
        onSign={onSign}
      />
      {annotatingHere && (
        <DrawLayer
          annotating={annotating}
          pageNumber={pageNumber}
          page={page}
          scale={scale}
          onEmptyClick={() => {
            signing.select(null);
          }}
        />
      )}
      {/* Before annotations, because a saved image is part of the page and they go over it. */}
      {mode === 'sign' && (
        <SignLayer signing={signing} pageNumber={pageNumber} page={page} scale={scale} />
      )}
      <PlacedSignatures
        placements={editor.signatures.filter((placed) => placed.pageNumber === pageNumber)}
        signing={signing}
        scale={scale}
        page={page}
        isInteractive={(placed) => (placed.purpose === 'image' ? pickable : mode === 'sign')}
      />
      <Highlights annotations={drawn} scale={scale} />
      <AnnotationArt annotations={drawn} page={page} scale={scale} />
      {marking && (
        <MarkupLines
          annotating={annotating}
          pageNumber={pageNumber}
          scale={scale}
          pageText={pageText}
        />
      )}
      <AnnotationControls
        annotations={marks}
        annotating={annotating}
        scale={scale}
        page={page}
        interactive={pickable}
        isDrawn={editor.isDrawnByApp}
      />
      {mode === 'select' && (
        <CommentReader
          document={document}
          pageNumber={pageNumber}
          page={page}
          scale={scale}
          comments={marks}
          hidden={editor.hiddenAnnotations.get(pageNumber) ?? []}
        />
      )}
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
