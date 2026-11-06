import { rectFromCorners } from '../coordinates';
import type { Rect } from '../edits/model';

export type FieldValue = string | boolean | readonly string[];

type FieldKind = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'list' | 'signature' | 'button';

export interface FormField {
  /** Unique to this spot on the page: a radio group has one name and several spots. */
  readonly id: string;
  readonly name: string;
  /** What to call it: the file's own description, or failing that, the field's name. */
  readonly label: string;
  readonly kind: FieldKind;
  readonly pageNumber: number;
  /** In points as displayed, like everything on a page. */
  readonly rect: Rect;
  readonly value: FieldValue;
  /** The value this spot stands for, for a radio button. */
  readonly onValue: string;
  readonly options: readonly string[];
  readonly multiline: boolean;
  readonly maxLength: number;
  readonly readOnly: boolean;
  readonly required: boolean;
}

/** The parts of a pdf.js widget this uses. Everything is optional, because files vary. */
export interface WidgetData {
  readonly id?: string;
  readonly subtype?: string;
  readonly fieldType?: string;
  readonly fieldName?: string;
  readonly alternativeText?: string;
  readonly fieldValue?: unknown;
  readonly rect?: readonly number[];
  readonly readOnly?: boolean;
  readonly required?: boolean;
  readonly hidden?: boolean;
  readonly multiLine?: boolean;
  readonly maxLen?: number;
  readonly options?: readonly { readonly exportValue?: string; readonly displayValue?: string }[];
  readonly checkBox?: boolean;
  readonly radioButton?: boolean;
  readonly pushButton?: boolean;
  readonly exportValue?: string;
  readonly buttonValue?: string;
  readonly combo?: boolean;
  readonly multiSelect?: boolean;
}

/** A field's name is written for software, so this makes one like "student.name" read better. */
export function friendlyName(name: string): string {
  const words = name
    .replace(/\[\d+\]/g, '')
    .replace(/[._-]+/g, ' ')
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1) || name;
}

function kindOf(widget: WidgetData): FieldKind | null {
  switch (widget.fieldType) {
    case 'Tx':
      return 'text';
    case 'Ch':
      return widget.combo ? 'dropdown' : 'list';
    case 'Sig':
      return 'signature';
    case 'Btn':
      if (widget.pushButton) return 'button';
      return widget.radioButton ? 'radio' : 'checkbox';
    default:
      return null;
  }
}

function asStrings(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string');
  return typeof value === 'string' && value !== '' ? [value] : [];
}

/** Choice fields hold their export values, but the app works with what the person reads. */
function displayedChoices(widget: WidgetData): readonly string[] {
  const options = widget.options ?? [];
  return asStrings(widget.fieldValue).map(
    (value) => options.find((option) => option.exportValue === value)?.displayValue ?? value,
  );
}

function valueOf(widget: WidgetData, kind: FieldKind): FieldValue {
  switch (kind) {
    case 'checkbox':
      return widget.fieldValue === widget.exportValue && widget.fieldValue !== 'Off';
    case 'radio':
      return typeof widget.fieldValue === 'string' && widget.fieldValue !== 'Off'
        ? widget.fieldValue
        : '';
    case 'dropdown':
      return displayedChoices(widget)[0] ?? '';
    case 'list':
      return widget.multiSelect ? displayedChoices(widget) : (displayedChoices(widget)[0] ?? '');
    default:
      return typeof widget.fieldValue === 'string' ? widget.fieldValue : '';
  }
}

/** Turns what pdf.js reports into a field. Returns null for what isn't really a form field. */
export function fieldFromWidget(
  widget: WidgetData,
  pageNumber: number,
  toDisplay: (rect: readonly number[]) => readonly number[],
): FormField | null {
  if (widget.subtype !== 'Widget' || widget.hidden || !widget.fieldName || !widget.rect) {
    return null;
  }
  const kind = kindOf(widget);
  if (!kind) return null;
  const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = toDisplay(widget.rect);
  return {
    id: widget.id ?? `${widget.fieldName}-${pageNumber}-${x1}-${y1}`,
    name: widget.fieldName,
    label: widget.alternativeText?.trim() || friendlyName(widget.fieldName),
    kind,
    pageNumber,
    rect: rectFromCorners(x1, y1, x2, y2),
    value: valueOf(widget, kind),
    onValue: widget.buttonValue ?? widget.exportValue ?? '',
    options: (widget.options ?? []).map(
      (option) => option.displayValue ?? option.exportValue ?? '',
    ),
    multiline: widget.multiLine === true,
    maxLength: widget.maxLen ?? 0,
    readOnly: widget.readOnly === true,
    required: widget.required === true,
  };
}

/**
 * Same-named boxes that stand for different things share one value, so only one can be ticked at a
 * time. That's how radio buttons behave, and treating them as boxes would save the wrong answer.
 */
export function withBoxGroupsAsChoices(fields: readonly FormField[]): readonly FormField[] {
  const meanings = new Map<string, Set<string>>();
  for (const field of fields) {
    if (field.kind !== 'checkbox') continue;
    const known = meanings.get(field.name) ?? new Set();
    meanings.set(field.name, known.add(field.onValue));
  }
  const ticked = new Map(
    fields.filter((field) => field.value === true).map((field) => [field.name, field.onValue]),
  );
  return fields.map((field) =>
    field.kind === 'checkbox' && (meanings.get(field.name)?.size ?? 0) > 1
      ? { ...field, kind: 'radio', value: ticked.get(field.name) ?? '' }
      : field,
  );
}

/** Whether a field has been answered, for the count of what's still needed. */
export function hasAnswer(value: FieldValue): boolean {
  if (typeof value === 'boolean') return value;
  return value.length > 0;
}

/** Fields a person can answer. A form's own buttons do things rather than hold anything. */
export const isFillable = (field: FormField) => field.kind !== 'button' && !field.readOnly;
