import type { FormFields } from './useFormFields';

interface FormPanelProps {
  readonly form: FormFields;
  readonly locked: boolean;
  readonly onLockChange: (locked: boolean) => void;
  readonly onJump: (pageNumber: number, fieldId: string, y: number) => void;
}

export function FormPanel({ form, locked, onLockChange, onJump }: FormPanelProps) {
  return (
    <aside className="panel" aria-label="Form progress">
      <div className="panel-head">
        <h2>Fill in this form</h2>
      </div>
      <p className="hint">Press Tab to move to the next field.</p>
      <p className="slot-note" role="status">
        {form.answered} of {form.total} fields filled
      </p>
      {form.stillNeeded.length > 0 && (
        <>
          <h3>Still needed</h3>
          <div>
            {form.stillNeeded.map((field) => (
              <button
                key={field.id}
                type="button"
                className="jump"
                onClick={() => {
                  onJump(field.pageNumber, field.id, field.rect.y);
                }}
              >
                {field.label}
              </button>
            ))}
          </div>
        </>
      )}
      <label className="lock">
        <input
          type="checkbox"
          checked={locked}
          onChange={(event) => {
            onLockChange(event.target.checked);
          }}
        />
        <span>
          Lock answers when saving
          <small>
            Answers become part of the page, so nobody can change them. Your original file stays
            fillable.
          </small>
        </span>
      </label>
    </aside>
  );
}
