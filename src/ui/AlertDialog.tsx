import { useEffect, useRef } from 'react';
import { Icon, type IconName } from './Icon';

interface AlertDialogProps {
  readonly title: string;
  readonly message: string;
  readonly detail?: string;
  readonly technical?: string;
  /** Left out when there's nothing to do but acknowledge. */
  readonly confirmLabel?: string;
  readonly cancelLabel: string;
  readonly destructive?: boolean;
  readonly icon?: IconName;
  readonly alternativeLabel?: string;
  readonly onAlternative?: () => void;
  readonly onConfirm?: () => void;
  readonly onCancel: () => void;
}

/** Built on <dialog> for Esc to cancel and a blocked background. tabFocus.ts keeps Tab inside. */
export function AlertDialog({
  title,
  message,
  detail,
  technical,
  confirmLabel,
  cancelLabel,
  destructive = false,
  icon = 'error',
  alternativeLabel,
  onAlternative,
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
        <Icon
          name={icon}
          className={icon === 'warn' ? 'error-icon alert-icon-warn' : 'error-icon'}
        />
        <div>
          <h2 id="alert-title">{title}</h2>
          <p id="alert-message">{message}</p>
          {detail && <p>{detail}</p>}
          {technical && (
            <details>
              <summary>Technical details</summary>
              {technical}
            </details>
          )}
        </div>
      </div>
      <div className="alert-foot">
        {/* Cancel takes first focus, so Enter can't confirm something destructive by accident. */}
        <button className="btn" autoFocus onClick={onCancel}>
          {cancelLabel}
        </button>
        {alternativeLabel && (
          <button className="btn" onClick={onAlternative}>
            {alternativeLabel}
          </button>
        )}
        {confirmLabel && (
          <button
            className={destructive ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        )}
      </div>
    </dialog>
  );
}
