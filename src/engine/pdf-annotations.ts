import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  fieldFromWidget,
  type FormField,
  type WidgetData,
  withBoxGroupsAsChoices,
} from './forms/fields';
import { noteFromAnnotation, type ExistingNote, type NoteData } from './notes';

/** pdf.js reports an annotation's corners in the file's own coordinates, not the displayed page's. */
function cornersToDisplay(page: PDFPageProxy) {
  const viewport = page.getViewport({ scale: 1 });
  return ([x1 = 0, y1 = 0, x2 = 0, y2 = 0]: readonly number[]): readonly number[] => [
    ...(viewport.convertToViewportPoint(x1, y1) as readonly number[]),
    ...(viewport.convertToViewportPoint(x2, y2) as readonly number[]),
  ];
}

export async function readExistingNotes(page: PDFPageProxy): Promise<readonly ExistingNote[]> {
  const toDisplay = cornersToDisplay(page);
  const annotations = (await page.getAnnotations()) as readonly NoteData[];
  return annotations.flatMap((data) => noteFromAnnotation(data, toDisplay) ?? []);
}

export async function readFormFields(
  proxy: PDFDocumentProxy,
  loadPage: (pageNumber: number) => Promise<PDFPageProxy>,
): Promise<readonly FormField[]> {
  const objects = await proxy.getFieldObjects();
  if (!objects) return [];
  const pageNumbers = new Set<number>();
  for (const entries of objects.values()) {
    for (const entry of entries as readonly { page?: number }[]) {
      // A field that only groups others isn't on any page, which it reports as page -1.
      if (typeof entry.page === 'number' && entry.page >= 0) pageNumbers.add(entry.page + 1);
    }
  }
  const fields: FormField[] = [];
  for (const pageNumber of [...pageNumbers].sort((one, two) => one - two)) {
    const page = await loadPage(pageNumber);
    const toDisplay = cornersToDisplay(page);
    const widgets = (await page.getAnnotations()) as readonly WidgetData[];
    for (const widget of widgets) {
      const field = fieldFromWidget(widget, pageNumber, toDisplay);
      if (field) fields.push(field);
    }
  }
  return withBoxGroupsAsChoices(fields);
}
