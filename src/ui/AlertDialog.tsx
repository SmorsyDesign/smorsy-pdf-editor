import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

interface AlertDialogProps {
  readonly title: string;
  readonly message: string;
  readonly detail?: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly destructive?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** Built on <dialog>, which gives focus trapping and Esc to cancel for free. */
export function AlertDialog({
  title,
  message,
  detail,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: AlertDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      dialog?.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="alert"
      role="alertdialog"
      aria-labelledby="alert-title"
      aria-describedby="alert-message"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div className="alert-body">
        <Icon name="error" className="alert-icon" />
        <div>
          <h2 id="alert-title">{title}</h2>
          <p id="alert-message">{message}</p>
          {detail && <p>{detail}</p>}
        </div>
      </div>
      <div className="alert-foot">
        {/* Cancel takes first focus, so Enter can't confirm something destructive by accident. */}
        <button className="btn" autoFocus onClick={onCancel}>
          {cancelLabel}
        </button>
        <button className={destructive ? 'btn btn-danger' : 'btn btn-primary'} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
