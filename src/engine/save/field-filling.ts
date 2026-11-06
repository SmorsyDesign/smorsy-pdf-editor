import {
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  type PDFDocument,
  type PDFFont,
} from '@cantoo/pdf-lib';
import { UNSUPPORTED_TEXT, nameCharacter } from '../errors';
import type { FieldValue } from '../forms/fields';

export type FieldAnswers = readonly (readonly [string, FieldValue])[];

function checkCharacters(text: string, font: PDFFont): void {
  const known = new Set(font.getCharacterSet());
  const missing = [...new Set(Array.from(text))].filter(
    (character) => !known.has(character.codePointAt(0) ?? 0),
  );
  if (missing.length > 0) throw new Error(UNSUPPORTED_TEXT + missing.map(nameCharacter).join(' '));
}

/** Writes answers into the file's own form, redrawing each so viewers show the new value. */
export function fillFields(doc: PDFDocument, answers: FieldAnswers, font: PDFFont): void {
  const form = doc.getForm();
  for (const [name, value] of answers) {
    const field = form.getFieldMaybe(name);
    if (!field) throw new Error(`The form field “${name}” couldn’t be found.`);
    if (field instanceof PDFTextField && typeof value === 'string') {
      checkCharacters(value, font);
      field.setText(value === '' ? undefined : value);
      field.updateAppearances(font);
    } else if (field instanceof PDFCheckBox) {
      if (value === true) field.check();
      else field.uncheck();
    } else if (field instanceof PDFRadioGroup && typeof value === 'string') {
      if (value === '') field.clear();
      else field.select(value);
    } else if (field instanceof PDFDropdown && typeof value === 'string') {
      if (value === '') field.clear();
      else field.select(value);
      field.updateAppearances(font);
    } else if (field instanceof PDFOptionList && typeof value !== 'boolean') {
      if (value.length === 0) field.clear();
      else field.select(typeof value === 'string' ? value : [...value]);
      field.updateAppearances(font);
    } else {
      throw new Error(`The form field “${name}” can’t hold that answer.`);
    }
  }
}

/** Answers become part of the page. A field missing its looks gets them first, or it would vanish. */
export function lockAnswers(doc: PDFDocument, font: PDFFont): void {
  const form = doc.getForm();
  form.updateFieldAppearances(font);
  form.flatten({ updateFieldAppearances: false });
}
