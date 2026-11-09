import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFStream,
  degrees,
  type PDFContext,
  type PDFDocument,
  type PDFObject,
  type PDFPage,
} from '@cantoo/pdf-lib';
import { isIdentity, type Layout } from '../pages/layout';
import { eraseAnnotation } from './annotation-erasing';
import { name } from './page-annotations';

// A page inherits these from the page tree above it, which it leaves when it's moved.
const INHERITED = ['MediaBox', 'CropBox', 'Rotate', 'Resources'];

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

// Keys that point back up to the page tree, a parent field or the page an annotation is on.
const UPWARD = new Set(['Parent', 'P', 'Pg', 'Obj', 'StructTreeRoot']);

function partsOfPage(context: PDFContext, page: PDFPage, found: Set<PDFRef>): void {
  found.add(page.ref);
  reachable(context, page.node, found, page.node);
}

/** Everything the form refers to, which stays whichever pages its fields were on. */
function formParts(doc: PDFDocument, found: Set<PDFRef>): void {
  reachable(doc.context, doc.catalog.get(name('AcroForm')), found);
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

/** Which page an internal link or bookmark goes to, if it's one of these. */
function goesTo(context: PDFContext, item: PDFDict, gone: ReadonlySet<PDFRef>): boolean {
  const action = context.lookup(item.get(name('A')));
  const target = context.lookup(
    item.get(name('Dest')) ?? (action instanceof PDFDict ? action.get(name('D')) : undefined),
  );
  const page = target instanceof PDFArray ? target.get(0) : undefined;
  return page instanceof PDFRef && gone.has(page);
}

/** Links to a page that's gone would go nowhere, so they go too. Bookmarks keep their names. */
function dropWaysToPages(doc: PDFDocument, kept: readonly PDFPage[], gone: ReadonlySet<PDFRef>) {
  const { context } = doc;
  // A document set to open on a page that's gone would open nowhere.
  const opening = context.lookup(doc.catalog.get(name('OpenAction')));
  const openingTarget = opening instanceof PDFArray ? opening : null;
  if (openingTarget?.get(0) instanceof PDFRef && gone.has(openingTarget.get(0) as PDFRef)) {
    doc.catalog.delete(name('OpenAction'));
  }
  for (const page of kept) {
    const list = context.lookup(page.node.get(name('Annots')));
    if (!(list instanceof PDFArray)) continue;
    for (const entry of list.asArray()) {
      const link = context.lookup(entry);
      if (link instanceof PDFDict && link.get(name('Subtype')) === PDFName.of('Link')) {
        if (goesTo(context, link, gone)) eraseAnnotation(page, link);
      }
    }
  }
  const outline = context.lookup(doc.catalog.get(name('Outlines')));
  const visit = (value: PDFObject | undefined, depth: number) => {
    const item = context.lookup(value);
    if (!(item instanceof PDFDict) || depth > 10_000) return;
    if (goesTo(context, item, gone)) {
      item.delete(name('Dest'));
      item.delete(name('A'));
    }
    visit(item.get(name('First')), depth + 1);
    visit(item.get(name('Next')), depth + 1);
  };
  if (outline instanceof PDFDict) visit(outline.get(name('First')), 0);
}

/** Fields with every box on pages that are going have nothing left to show, so they go too. */
function dropFieldsOn(doc: PDFDocument, going: ReadonlySet<PDFRef>): void {
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
 * Puts the file's pages in the order and turns of the layout, leaving out the rest. It runs after
 * every other edit, which are all made on the file's own pages. Pages left out are erased, not just
 * unlisted, since a save writes everything it knows of.
 */
export function arrangePages(doc: PDFDocument, layout: Layout): void {
  const pages = doc.getPages();
  if (layout.length === pages.length && isIdentity(layout)) return;
  const { context } = doc;
  const keptSources = new Set(layout.map((slot) => slot.source));
  const leaving = pages.filter((_, index) => !keptSources.has(index + 1));
  const leavingRefs = new Set(leaving.map((page) => page.ref));
  dropFieldsOn(doc, leavingRefs);

  for (const page of pages) {
    for (const key of INHERITED) {
      if (!page.node.has(name(key))) {
        const value = page.node.getInheritableAttribute(name(key));
        if (value) page.node.set(name(key), value);
      }
    }
  }
  const kept = layout.map((slot) => {
    const page = pages[slot.source - 1];
    if (!page) throw new Error(`The document has no page ${String(slot.source)}.`);
    if (slot.turns !== 0)
      page.setRotation(degrees((page.getRotation().angle + slot.turns * 90) % 360));
    return page;
  });

  // One level of pages straight under the root, in the new order. Any old levels between go.
  const rootRef = doc.catalog.get(name('Pages'));
  const root = context.lookup(rootRef);
  if (!(rootRef instanceof PDFRef) || !(root instanceof PDFDict)) {
    throw new Error('This file’s list of pages couldn’t be read.');
  }
  const levels = new Set<PDFRef>();
  const collectLevels = (node: PDFDict, depth: number) => {
    const kids = context.lookup(node.get(name('Kids')));
    if (!(kids instanceof PDFArray) || depth > 64) return;
    for (const kid of kids.asArray()) {
      const child = context.lookup(kid);
      if (
        kid instanceof PDFRef &&
        child instanceof PDFDict &&
        child.get(name('Type')) === PDFName.of('Pages')
      ) {
        levels.add(kid);
        collectLevels(child, depth + 1);
      }
    }
  };
  collectLevels(root, 0);
  root.set(name('Kids'), context.obj(kept.map((page) => page.ref)));
  root.set(name('Count'), PDFNumber.of(kept.length));
  for (const page of kept) page.node.set(name('Parent'), rootRef);
  for (const level of levels) context.delete(level);

  if (leaving.length === 0) return;
  dropWaysToPages(doc, kept, leavingRefs);
  const going = new Set<PDFRef>();
  for (const page of leaving) partsOfPage(context, page, going);
  dropStructure(doc, going);
  const staying = new Set<PDFRef>();
  for (const page of kept) partsOfPage(context, page, staying);
  formParts(doc, staying);
  for (const ref of going) {
    if (!staying.has(ref) && context.lookup(ref) !== undefined) context.delete(ref);
  }
}
