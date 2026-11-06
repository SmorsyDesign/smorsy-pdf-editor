import {
  PDFButton,
  PDFDropdown,
  PDFOptionList,
  PDFSignature,
  PDFTextField,
  type PDFDocument,
  type PDFField,
  type PDFFont,
  type PDFPage,
} from '@cantoo/pdf-lib';
import { FIELD_PROBLEM } from '../errors';
import { friendlyName } from '../forms/fields';
import { checkCharacters } from './field-filling';
import { currentLook, drawLooksIntoPage } from './field-looks';
import { hasValue } from './form-fields';
import { isShown, name, rectOf } from './page-annotations';

function pageOfWidget(doc: PDFDocument, field: PDFField, index: number): PDFPage | undefined {
  const widget = field.acroField.getWidgets()[index];
  if (!widget) return undefined;
  const listed = widget.P();
  const onPage = listed && doc.getPages().find((page) => page.ref === listed);
  if (onPage) return onPage;
  const ref = doc.context.getObjectRef(widget.dict) ?? field.ref;
  return doc.findPageForAnnotationRef(ref);
}

/** Regenerated looks use this font, which would otherwise draw missing letters as empty boxes. */
function prepareLooks(field: PDFField, font: PDFFont): void {
  if (!field.needsAppearancesUpdate()) return;
  if (field instanceof PDFTextField) checkCharacters(field.getText() ?? '', font);
  if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
    // A new drawing shows whatever the field holds, which can be a code rather than the words.
    const options = field.acroField.getOptions();
    const shown = field
      .getSelected()
      .map(
        (stored) =>
          options.find((option) => option.value.decodeText() === stored)?.display.decodeText() ??
          stored,
      );
    checkCharacters(shown.join(''), font);
    if (shown.length > 0) field.select(shown);
  }
}

function paintWidgets(doc: PDFDocument, field: PDFField): void {
  const { context } = doc;
  field.acroField.getWidgets().forEach((widget, index) => {
    // Whoever made the form chose not to show these, so they shouldn't appear once locked.
    if (!isShown(context, widget.dict)) return;
    const page = pageOfWidget(doc, field, index);
    const rect = rectOf(context, widget.dict);
    // With no place on any page, or no size, nobody can see this one anyway.
    if (!page || !rect || rect.left === rect.right || rect.bottom === rect.top) return;
    const look = currentLook(context, widget.dict);
    const painted = look !== null && drawLooksIntoPage(page, widget.dict, look);
    if (!painted && hasValue(context, widget.dict)) {
      throw new Error(
        `${FIELD_PROBLEM}The answer in “${friendlyName(field.getName())}” couldn’t be made part of the page, so nothing was saved. Try saving without locking answers.`,
      );
    }
  });
}

/**
 * Answers become part of the page. This doesn't use the library's flatten because that paints
 * hidden fields, ignores how a field's drawing maps onto its box, and removes a field even after
 * failing to paint it, losing the answer without a word.
 */
export function lockAnswers(doc: PDFDocument, font: PDFFont): void {
  const form = doc.getForm();
  const fields = form.getFields();
  for (const field of fields) prepareLooks(field, font);
  form.updateFieldAppearances(font);
  for (const field of fields) {
    // A signature is proof rather than an answer, and an empty one can still be signed.
    if (field instanceof PDFSignature) continue;
    // A form's own button does nothing once the form is locked, so it isn't worth a picture of it.
    if (!(field instanceof PDFButton)) paintWidgets(doc, field);
    form.removeField(field);
  }
  if (form.getFields().length === 0) doc.catalog.delete(name('AcroForm'));
}
