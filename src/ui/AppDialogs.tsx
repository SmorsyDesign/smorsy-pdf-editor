import { AlertDialog } from './AlertDialog';
import { explainSaveFailure, type OpenProblem } from './messages';
import type { SaveDialog } from './useSaveFlow';

/** Each dialog keeps the file it's about, so it can't act on a different document. */
export type Dialog<LeaveAction> =
  | SaveDialog
  | { readonly kind: 'open-failed'; readonly fileName: string; readonly problem: OpenProblem }
  | { readonly kind: 'unsaved'; readonly fileName: string; readonly then: LeaveAction }
  | { readonly kind: 'unplaced'; readonly copy: boolean; readonly then?: LeaveAction };

interface AppDialogsProps<LeaveAction> {
  readonly dialog: Dialog<LeaveAction> | null;
  readonly onClose: () => void;
  readonly onReplaceOriginal: (dialog: Extract<SaveDialog, { kind: 'confirm-replace' }>) => void;
  readonly onKeepOriginal: () => void;
  readonly onSaveElsewhere: () => void;
  readonly onChooseAnother: () => void;
  readonly onSaveAndLeave: (then: LeaveAction) => void;
  readonly onLeaveWithoutSaving: (then: LeaveAction) => void;
  readonly onSaveWithoutPlacing: (copy: boolean, then?: LeaveAction) => void;
}

export function AppDialogs<LeaveAction>({
  dialog,
  onClose,
  onReplaceOriginal,
  onKeepOriginal,
  onSaveElsewhere,
  onChooseAnother,
  onSaveAndLeave,
  onLeaveWithoutSaving,
  onSaveWithoutPlacing,
}: AppDialogsProps<LeaveAction>) {
  switch (dialog?.kind) {
    case 'confirm-replace':
      return (
        <AlertDialog
          title="Replace your original file?"
          message={`This saves over ${dialog.file.name}. You can’t undo this.`}
          confirmLabel="Replace original"
          cancelLabel="Cancel"
          destructive
          onConfirm={() => {
            onClose();
            onReplaceOriginal(dialog);
          }}
          onCancel={() => {
            onClose();
            onKeepOriginal();
          }}
        />
      );
    case 'save-failed':
      // Another location wouldn't help with either of these, so it isn't offered.
      return dialog.failure === 'unsupported-text' || dialog.failure === 'build-failed' ? (
        <AlertDialog
          icon="warn"
          title="Your copy wasn’t saved"
          message={explainSaveFailure(dialog.failure, dialog.detail)}
          detail="Your edits are still here, and your original file is unchanged."
          {...(dialog.failure === 'build-failed' ? { technical: dialog.detail } : {})}
          cancelLabel="Keep editing"
          onCancel={onClose}
        />
      ) : (
        <AlertDialog
          title="Your copy wasn’t saved"
          message={explainSaveFailure(dialog.failure)}
          detail="Your edits are still here, and your original file is unchanged."
          technical={dialog.detail}
          confirmLabel="Save somewhere else"
          cancelLabel="Keep editing"
          onConfirm={() => {
            onClose();
            onSaveElsewhere();
          }}
          onCancel={onClose}
        />
      );
    case 'open-failed':
      return (
        <AlertDialog
          title={`${dialog.fileName} can’t be opened`}
          message={dialog.problem.reason}
          detail={dialog.problem.advice}
          technical={dialog.problem.technical}
          confirmLabel="Choose another file"
          cancelLabel="Keep current file"
          onConfirm={() => {
            onClose();
            onChooseAnother();
          }}
          onCancel={onClose}
        />
      );
    case 'unplaced':
      return (
        <AlertDialog
          icon="warn"
          title="Your signature isn’t on the page yet"
          message="You’ve made a signature but haven’t placed it, so this save won’t include it."
          cancelLabel="Go back"
          confirmLabel="Save without it"
          onConfirm={() => {
            onClose();
            onSaveWithoutPlacing(dialog.copy, dialog.then);
          }}
          onCancel={onClose}
        />
      );
    case 'unsaved':
      return (
        <AlertDialog
          icon="warn"
          title={`Save your changes to ${dialog.fileName}?`}
          message="If you don’t save, your changes will be lost. Your original file stays as it is."
          cancelLabel="Cancel"
          alternativeLabel="Don’t save"
          confirmLabel="Save"
          onConfirm={() => {
            onClose();
            onSaveAndLeave(dialog.then);
          }}
          onAlternative={() => {
            onClose();
            onLeaveWithoutSaving(dialog.then);
          }}
          onCancel={onClose}
        />
      );
    default:
      return null;
  }
}
