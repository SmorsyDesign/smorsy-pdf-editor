import {
  PDFCheckBox,
  PDFDropdown,
  PDFHexString,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  type PDFDocument,
  type PDFFont,
} from '@cantoo/pdf-lib';
import { FIELD_PROBLEM, UNSUPPORTED_TEXT, nameCharacter } from '../errors';
import { friendlyName, type FieldValue } from '../forms/fields';
import { name } from './page-annotations';

export type FieldAnswers = readonly (readonly [string, FieldValue])[];

// These lay text out rather than draw anything, so no font needs to have them.
const LAYOUT_CHARACTERS = /[\r\n\t]/g;

export function checkCharacters(text: string, font: PDFFont): void {
  const known = new Set(font.getCharacterSet());
  const missing = [...new Set(Array.from(text.replace(LAYOUT_CHARACTERS, '')))].filter(
    (character) => !known.has(character.codePointAt(0) ?? 0),
  );
  if (missing.length > 0) throw new Error(UNSUPPORTED_TEXT + missing.map(nameCharacter).join(' '));
}

/** Same-named boxes with different meanings share one value, and only the matching one shows it. */
function setBoxesTo(field: PDFCheckBox, value: string): void {
  const state = PDFName.of(value === '' ? 'Off' : value);
  field.acroField.dict.set(name('V'), state);
  for (const widget of field.acroField.getWidgets()) {
    widget.setAppearanceState(widget.getOnValue() === state ? state : PDFName.of('Off'));
  }
}

/** The library stores what's displayed, but a file should hold what each option stands for. */
function setChoices(
  field: PDFDropdown | PDFOptionList,
  chosen: readonly string[],
  font: PDFFont,
): void {
  checkCharacters(chosen.join(''), font);
  if (chosen.length === 0) field.clear();
  else field.select([...chosen]);
  field.updateAppearances(font);
  if (chosen.length === 0) return;
  const options = field.acroField.getOptions();
  const stored = chosen.map(
    (text) =>
      options.find((option) => option.display.decodeText() === text)?.value ??
      PDFHexString.fromText(text),
  );
  const single = stored.length === 1 ? stored[0] : undefined;
  field.acroField.dict.set(name('V'), single ?? field.doc.context.obj(stored));
  if (chosen.length > 1) {
    // The library sorts these as text, putting 10 before 2, where the format needs them in order.
    const places = chosen.map((text) =>
      options.findIndex((option) => option.display.decodeText() === text),
    );
    const inOrder = places.sort((one, two) => one - two);
    field.acroField.dict.set(name('I'), field.doc.context.obj(inOrder));
  }
}

function fillOne(field: unknown, value: FieldValue, font: PDFFont): boolean {
  if (field instanceof PDFTextField && typeof value === 'string') {
    checkCharacters(value, font);
    field.setText(value === '' ? undefined : value);
    field.updateAppearances(font);
  } else if (field instanceof PDFCheckBox) {
    if (typeof value === 'string') setBoxesTo(field, value);
    else if (value === true) field.check();
    else field.uncheck();
  } else if (field instanceof PDFRadioGroup && typeof value === 'string') {
    if (value === '') field.clear();
    else field.select(value);
  } else if (field instanceof PDFDropdown && typeof value === 'string') {
    setChoices(field, value === '' ? [] : [value], font);
  } else if (field instanceof PDFOptionList && typeof value !== 'boolean') {
    setChoices(field, typeof value === 'string' ? (value === '' ? [] : [value]) : value, font);
  } else {
    return false;
  }
  return true;
}

/** Writes answers into the file's own form, redrawing each so viewers show the new value. */
export function fillFields(doc: PDFDocument, answers: FieldAnswers, font: PDFFont): void {
  const form = doc.getForm();
  for (const [fieldName, value] of answers) {
    const label = friendlyName(fieldName);
    const field = form.getFieldMaybe(fieldName);
    if (!field) {
      throw new Error(`${FIELD_PROBLEM}The form field “${label}” couldn’t be found in the file.`);
    }
    let filled = false;
    try {
      filled = fillOne(field, value, font);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith(UNSUPPORTED_TEXT)) throw error;
      console.error(error);
    }
    if (!filled) {
      throw new Error(
        `${FIELD_PROBLEM}The form field “${label}” can’t hold that answer, so nothing was saved. Change the answer and save again.`,
      );
    }
  }
}
