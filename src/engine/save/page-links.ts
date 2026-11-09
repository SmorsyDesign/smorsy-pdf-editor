import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFRef,
  type PDFContext,
  type PDFDocument,
  type PDFObject,
  type PDFPage,
} from '@cantoo/pdf-lib';
import { eraseAnnotation } from './annotation-erasing';
import { name } from './page-annotations';

/** Which page an internal link or bookmark goes to, if it's one of these. */
function goesTo(context: PDFContext, item: PDFDict, gone: ReadonlySet<PDFRef>): boolean {
  const action = context.lookup(item.get(name('A')));
  const target = context.lookup(
    item.get(name('Dest')) ?? (action instanceof PDFDict ? action.get(name('D')) : undefined),
  );
  const page = target instanceof PDFArray ? target.get(0) : undefined;
  return page instanceof PDFRef && gone.has(page);
}

/** Named links to a page that's gone, in either of the two places a file keeps them. */
function dropNamedWays(doc: PDFDocument, gone: ReadonlySet<PDFRef>): void {
  const { context } = doc;
  const toGonePage = (value: PDFObject | undefined) => {
    const target = context.lookup(value);
    const destination = target instanceof PDFDict ? context.lookup(target.get(name('D'))) : target;
    const page = destination instanceof PDFArray ? destination.get(0) : undefined;
    return page instanceof PDFRef && gone.has(page);
  };
  const dests = context.lookup(doc.catalog.get(name('Dests')));
  if (dests instanceof PDFDict) {
    for (const [key, value] of dests.entries()) if (toGonePage(value)) dests.delete(key);
  }
  const names = context.lookup(doc.catalog.get(name('Names')));
  const tree = names instanceof PDFDict ? context.lookup(names.get(name('Dests'))) : null;
  const visit = (node: PDFObject | undefined, depth: number) => {
    const dict = context.lookup(node);
    if (!(dict instanceof PDFDict) || depth > 32) return;
    const pairs = context.lookup(dict.get(name('Names')));
    if (pairs instanceof PDFArray) {
      for (let index = pairs.size() - 2; index >= 0; index -= 2) {
        if (toGonePage(pairs.get(index + 1))) {
          pairs.remove(index + 1);
          pairs.remove(index);
        }
      }
    }
    const kids = context.lookup(dict.get(name('Kids')));
    if (kids instanceof PDFArray) for (const kid of kids.asArray()) visit(kid, depth + 1);
  };
  visit(tree ?? undefined, 0);
}

/** Links to a page that's gone would go nowhere, so they go too. Bookmarks keep their names. */
export function dropWaysToPages(
  doc: PDFDocument,
  kept: readonly PDFPage[],
  gone: ReadonlySet<PDFRef>,
): void {
  const { context } = doc;
  // A document set to open on a page that's gone would open nowhere, whichever way it's written.
  const opening = context.lookup(doc.catalog.get(name('OpenAction')));
  const openingAction = opening instanceof PDFDict ? context.lookup(opening.get(name('D'))) : null;
  const openingTarget = opening instanceof PDFArray ? opening : openingAction;
  const openingPage = openingTarget instanceof PDFArray ? openingTarget.get(0) : undefined;
  if (openingPage instanceof PDFRef && gone.has(openingPage)) {
    doc.catalog.delete(name('OpenAction'));
  }
  dropNamedWays(doc, gone);
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
