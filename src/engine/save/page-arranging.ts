import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRef,
  degrees,
  type PDFDocument,
  type PDFPage,
} from '@cantoo/pdf-lib';
import { isIdentity, type Layout } from '../pages/layout';
import { name } from './page-annotations';
import { dropFieldsOn, eraseLeftPages } from './page-erasing';
import { dropWaysToPages } from './page-links';

// A page inherits these from the page tree above it, which it leaves when it's moved.
const INHERITED = ['MediaBox', 'CropBox', 'Rotate', 'Resources'];

/** One level of pages straight under the root, in the new order. Any old levels between go. */
function listPagesInOrder(doc: PDFDocument, kept: readonly PDFPage[]): void {
  const { context } = doc;
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
}

/**
 * Puts the file's pages in the order and turns of the layout, leaving out the rest. It runs after
 * every other edit, which are all made on the file's own pages. Pages left out are erased, not just
 * unlisted, since a save writes everything it knows of.
 */
export function arrangePages(doc: PDFDocument, layout: Layout): void {
  const pages = doc.getPages();
  if (layout.length === pages.length && isIdentity(layout)) return;
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
  listPagesInOrder(doc, kept);

  if (leaving.length === 0) return;
  dropWaysToPages(doc, kept, leavingRefs);
  eraseLeftPages(doc, kept, leaving);
}
