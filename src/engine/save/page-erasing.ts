import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFRef,
  PDFStream,
  type PDFContext,
  type PDFDocument,
  type PDFObject,
  type PDFPage,
} from '@cantoo/pdf-lib';
import { name } from './page-annotations';

// Keys that point back up to the page tree, a parent field or the page an annotation is on.
const UPWARD = new Set(['Parent', 'P', 'Pg', 'Obj', 'StructTreeRoot']);

/**
 * Everything reachable from a starting object: its drawing, pictures and their masks, fonts,
 * thumbnails, attached files, annotations and the rest. It stops at other pages and at what points
 * back up, so a page's own things come out, not the whole document. Run for the pages that stay as
 * well as the ones that go, so anything they share is kept.
 */
function reachable(
  context: PDFContext,
  start: PDFObject | undefined,
  found: Set<PDFRef>,
  self?: PDFDict,
): void {
  const stack: (PDFObject | undefined)[] = [start];
  const seen = new Set<object>();
  while (stack.length > 0) {
    const value = stack.pop();
    if (value instanceof PDFRef) {
      if (found.has(value)) continue;
      const target = context.lookup(value);
      // Another page is reached through a link, and it isn't this page's to take.
      if (
        target instanceof PDFDict &&
        target !== self &&
        target.get(name('Type')) === PDFName.of('Page')
      ) {
        continue;
      }
      found.add(value);
      stack.push(target);
      continue;
    }
    if (value === undefined || seen.has(value)) continue;
    seen.add(value);
    const dict = value instanceof PDFStream ? value.dict : value;
    if (dict instanceof PDFDict) {
      for (const [key, item] of dict.entries()) {
        if (!UPWARD.has(key.decodeText())) stack.push(item);
      }
    } else if (dict instanceof PDFArray) {
      stack.push(...dict.asArray());
    }
  }
}

function partsOfPage(context: PDFContext, page: PDFPage, found: Set<PDFRef>): void {
  found.add(page.ref);
  reachable(context, page.node, found, page.node);
}

/**
 * The tags screen readers use describe every page, including any text on pages that are going. A
 * tree can't be trimmed reliably, so it goes, which also takes those pages' words out of the file.
 */
function dropStructure(doc: PDFDocument, going: Set<PDFRef>): void {
  const { context, catalog } = doc;
  reachable(context, catalog.get(name('StructTreeRoot')), going);
  catalog.delete(name('StructTreeRoot'));
  catalog.delete(name('MarkInfo'));
}

/** Fields with every box on pages that are going have nothing left to show, so they go too. */
export function dropFieldsOn(doc: PDFDocument, going: ReadonlySet<PDFRef>): void {
  if (!(doc.context.lookup(doc.catalog.get(name('AcroForm'))) instanceof PDFDict)) return;
  const form = doc.getForm();
  for (const field of form.getFields()) {
    const pages = field.acroField.getWidgets().map((widget) => {
      const listed = widget.P();
      if (listed) return listed;
      const ref = doc.context.getObjectRef(widget.dict);
      return ref ? doc.findPageForAnnotationRef(ref)?.ref : undefined;
    });
    if (pages.length > 0 && pages.every((page) => page !== undefined && going.has(page))) {
      form.removeField(field);
      continue;
    }
    // A field on several pages loses only its boxes on the pages that are going.
    for (let index = pages.length - 1; index >= 0; index -= 1) {
      const page = pages[index];
      if (page !== undefined && going.has(page) && field.acroField.getWidgets().length > 1) {
        field.acroField.removeWidget(index);
      }
    }
  }
}

/**
 * Erases what only the leaving pages used. A save writes everything it knows of, so pages that are
 * merely unlisted would still carry their words and pictures into the file.
 */
export function eraseLeftPages(
  doc: PDFDocument,
  kept: readonly PDFPage[],
  leaving: readonly PDFPage[],
): void {
  const { context } = doc;
  const going = new Set<PDFRef>();
  for (const page of leaving) partsOfPage(context, page, going);
  dropStructure(doc, going);
  const staying = new Set<PDFRef>();
  for (const page of kept) partsOfPage(context, page, staying);
  // Everything the form refers to stays, whichever pages its fields were on.
  reachable(context, doc.catalog.get(name('AcroForm')), staying);
  // Whatever the document as a whole refers to stays too: layers, colour profiles, attachments
  // and scripts can be shared with a page that's going.
  for (const [key, value] of doc.catalog.entries()) {
    if (!['Pages', 'StructTreeRoot', 'AcroForm'].includes(key.decodeText())) {
      reachable(context, value, staying);
    }
  }
  for (const ref of going) {
    if (!staying.has(ref) && context.lookup(ref) !== undefined) context.delete(ref);
  }
}
