import { AnnotatePanel } from './annotating/AnnotatePanel';
import type { Annotating } from './annotating/useAnnotating';
import type { DocumentEditor } from './editing/useDocumentEditor';
import { FormPanel } from './forms/FormPanel';
import type { FormFields } from './forms/useFormFields';
import { SignPanel } from './signing/SignPanel';
import type { Signing } from './signing/useSigning';
import type { EditorMode } from './TopBar';

interface SidePanelProps {
  readonly mode: EditorMode;
  readonly showsFormPanel: boolean;
  readonly form: FormFields;
  readonly editor: DocumentEditor;
  readonly annotating: Annotating;
  readonly signing: Signing;
  readonly currentPage: number;
  readonly onLeaveSign: () => void;
  readonly onJumpToField: (pageNumber: number, fieldId: string, y: number) => void;
  readonly onGoToPage: (pageNumber: number, y: number) => void;
}

/** The panel beside the pages, which depends on what's being done. */
export function SidePanel({
  mode,
  showsFormPanel,
  form,
  editor,
  annotating,
  signing,
  currentPage,
  onLeaveSign,
  onJumpToField,
  onGoToPage,
}: SidePanelProps) {
  if (mode === 'sign') {
    return <SignPanel signing={signing} currentPage={currentPage} onClose={onLeaveSign} />;
  }
  if (mode === 'note') {
    return (
      <AnnotatePanel
        annotating={annotating}
        signing={signing}
        images={editor.signatures.filter((item) => item.purpose === 'image')}
        currentPage={currentPage}
        unread={editor.unreadAnnotations}
        onGoTo={onGoToPage}
      />
    );
  }
  if (!showsFormPanel) return null;
  return (
    <FormPanel
      form={form}
      locked={editor.locksAnswers}
      onLockChange={editor.setLocksAnswers}
      onJump={onJumpToField}
    />
  );
}
