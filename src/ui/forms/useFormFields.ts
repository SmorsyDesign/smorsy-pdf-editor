import { useEffect, useState } from 'react';
import type { PdfDocument } from '../../engine/document';
import { hasAnswer, isFillable, type FieldValue, type FormField } from '../../engine/forms/fields';
import type { DocumentEditor } from '../editing/useDocumentEditor';

/** A document's form: what's in it, and what's been answered so far. */
export function useFormFields(document: PdfDocument, editor: DocumentEditor) {
  const { answers, apply, reportProblem } = editor;
  const [fields, setFields] = useState<readonly FormField[]>([]);
  const [focusFieldId, setFocusFieldId] = useState<string | null>(null);
  // Counts each time a field gets focus, so typing undoes in runs rather than letter by letter.
  const [session, setSession] = useState(0);

  useEffect(() => {
    let cancelled = false;
    document
      .formFields()
      .then((found) => {
        if (!cancelled) setFields(found);
      })
      .catch((error: unknown) => {
        console.error(error);
        if (!cancelled) {
          reportProblem('The form in this PDF couldn’t be read, so its fields can’t be filled in.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [document, reportProblem]);

  const valueOf = (field: FormField): FieldValue => answers.get(field.name) ?? field.value;

  // A radio group is one question, however many buttons it has.
  const questions = [...new Map(fields.filter(isFillable).map((f) => [f.name, f])).values()].filter(
    (field) => field.kind !== 'signature',
  );
  const unanswered = questions.filter((field) => !hasAnswer(valueOf(field)));
  const required = unanswered.filter((field) => field.required);

  return {
    fields,
    valueOf,
    isAnswered: (field: FormField) => answers.has(field.name),
    answer: (field: FormField, value: FieldValue) => {
      apply({ kind: 'fill-field', name: field.name, value }, `fill-${field.name}-${session}`);
    },
    fieldFocused: () => {
      setSession((current) => current + 1);
    },
    total: questions.length,
    answered: questions.length - unanswered.length,
    // With nothing marked as required, everything left is worth pointing out.
    stillNeeded: required.length > 0 ? required : unanswered,
    focusFieldId,
    focusField: setFocusFieldId,
    fieldFocusedDone: () => {
      setFocusFieldId(null);
    },
  };
}

export type FormFields = ReturnType<typeof useFormFields>;
