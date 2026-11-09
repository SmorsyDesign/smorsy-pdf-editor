import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  fieldFromWidget,
  type FormField,
  type WidgetData,
  withBoxGroupsAsChoices,
} from './forms/fields';
import { noteFromAnnotation, type ExistingNote, type NoteData } from './notes';

/** pdf.js reports an annotation's corners in the file's own coordinates, not the displayed page's. */
function cornersToDisplay(viewport: PageViewport) {
  return ([x1 = 0, y1 = 0, x2 = 0, y2 = 0]: readonly number[]): readonly number[] => [
    ...(viewport.convertToViewportPoint(x1, y1) as readonly number[]),
    ...(viewport.convertToViewportPoint(x2, y2) as readonly number[]),
  ];
}

export async function readExistingNotes(
  page: PDFPageProxy,
  viewport: PageViewport,
): Promise<readonly ExistingNote[]> {
  const toDisplay = cornersToDisplay(viewport);
  const annotations = (await page.getAnnotations()) as readonly NoteData[];
  return annotations.flatMap((data) => noteFromAnnotation(data, toDisplay) ?? []);
}

interface ShownPage {
  readonly page: PDFPageProxy;
  /** Where it is in the document as arranged now. */
  readonly position: number;
  readonly viewport: PageViewport;
}

export async function readFormFields(
  proxy: PDFDocumentProxy,
  loadPage: (source: number) => Promise<ShownPage | null>,
): Promise<readonly FormField[]> {
  const objects = await proxy.getFieldObjects();
  if (!objects) return [];
  const sources = new Set<number>();
  for (const entries of objects.values()) {
    for (const entry of entries as readonly { page?: number }[]) {
      // A field that only groups others isn't on any page, which it reports as page -1.
      if (typeof entry.page === 'number' && entry.page >= 0) sources.add(entry.page + 1);
    }
  }
  const fields: FormField[] = [];
  for (const source of sources) {
    const shown = await loadPage(source);
    if (!shown) continue;
    const toDisplay = cornersToDisplay(shown.viewport);
    const widgets = (await shown.page.getAnnotations()) as readonly WidgetData[];
    for (const widget of widgets) {
      const field = fieldFromWidget(widget, shown.position, toDisplay);
      if (field) fields.push(field);
    }
  }
  return withBoxGroupsAsChoices(fields.sort((one, two) => one.pageNumber - two.pageNumber));
}
