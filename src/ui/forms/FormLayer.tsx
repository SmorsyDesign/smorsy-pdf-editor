import { useEffect, useRef } from 'react';
import { placedOnPage } from '../editing/preview';
import type { FormField } from '../../engine/forms/fields';
import { hasAnswer, isFillable } from '../../engine/forms/fields';
import { Icon } from '../Icon';
import type { FormFields } from './useFormFields';

const MAX_TEXT_SIZE = 14;
const TEXT_SHARE = 0.65;

interface FieldInputProps {
  readonly field: FormField;
  readonly form: FormFields;
  readonly scale: number;
  readonly interactive: boolean;
  readonly onSign: () => void;
}

function FieldInput({ field, form, scale, interactive, onSign }: FieldInputProps) {
  const ref = useRef<HTMLElement | null>(null);
  const value = form.valueOf(field);
  const { focusFieldId, fieldFocusedDone } = form;

  useEffect(() => {
    if (focusFieldId !== field.id) return;
    ref.current?.focus();
    fieldFocusedDone();
  }, [field.id, fieldFocusedDone, focusFieldId]);

  const label = field.label;
  const style = {
    ...placedOnPage(field.rect, 0, scale),
    fontSize: Math.min(MAX_TEXT_SIZE, field.rect.height * TEXT_SHARE) * scale,
  };
  const disabled = !interactive || field.readOnly;

  switch (field.kind) {
    case 'checkbox':
    case 'radio':
      return (
        <input
          ref={(element) => {
            ref.current = element;
          }}
          className="form-choice"
          type={field.kind}
          name={field.kind === 'radio' ? `form-${field.name}` : undefined}
          aria-label={field.kind === 'radio' ? `${label}: ${field.onValue}` : label}
          style={style}
          disabled={disabled}
          checked={field.kind === 'radio' ? value === field.onValue : value === true}
          onFocus={form.fieldFocused}
          onChange={(event) => {
            form.answer(field, field.kind === 'radio' ? field.onValue : event.target.checked);
          }}
        />
      );
    case 'dropdown':
    case 'list':
      return (
        <select
          ref={(element) => {
            ref.current = element;
          }}
          className="f-input form-field"
          aria-label={label}
          style={style}
          disabled={disabled}
          {...(typeof value === 'string' ? {} : { multiple: true })}
          value={typeof value === 'string' ? value : [...(value as readonly string[])]}
          onFocus={form.fieldFocused}
          onChange={(event) => {
            form.answer(
              field,
              event.target.multiple
                ? [...event.target.selectedOptions].map((option) => option.value)
                : event.target.value,
            );
          }}
        >
          {field.kind === 'dropdown' && <option value="" />}
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    case 'signature':
      return interactive ? (
        <button type="button" className="f-sign form-field" style={style} onClick={onSign}>
          <Icon name="sign" />
          Click to sign
        </button>
      ) : null;
    case 'button':
      return null;
    default:
      return field.multiline ? (
        <textarea
          ref={(element) => {
            ref.current = element;
          }}
          className="f-input form-field"
          aria-label={label}
          style={style}
          disabled={disabled}
          {...(field.maxLength > 0 ? { maxLength: field.maxLength } : {})}
          value={value as string}
          onFocus={form.fieldFocused}
          onChange={(event) => {
            form.answer(field, event.target.value);
          }}
        />
      ) : (
        <input
          ref={(element) => {
            ref.current = element;
          }}
          className="f-input form-field"
          type="text"
          aria-label={label}
          style={style}
          disabled={disabled}
          {...(field.maxLength > 0 ? { maxLength: field.maxLength } : {})}
          value={value as string}
          onFocus={form.fieldFocused}
          onChange={(event) => {
            form.answer(field, event.target.value);
          }}
        />
      );
  }
}

interface FormLayerProps {
  readonly form: FormFields;
  readonly pageNumber: number;
  readonly scale: number;
  /** Where answers can be changed. Elsewhere they still show, because they're part of the file. */
  readonly interactive: boolean;
  readonly onSign: () => void;
}

export function FormLayer({ form, pageNumber, scale, interactive, onSign }: FormLayerProps) {
  const onPage = form.fields.filter((field) => field.pageNumber === pageNumber);
  const shown = interactive
    ? onPage.filter((field) => isFillable(field) || hasAnswer(field.value))
    : onPage.filter((field) => form.isAnswered(field));
  return shown.map((field) => (
    <FieldInput
      key={field.id}
      field={field}
      form={form}
      scale={scale}
      interactive={interactive}
      onSign={onSign}
    />
  ));
}
