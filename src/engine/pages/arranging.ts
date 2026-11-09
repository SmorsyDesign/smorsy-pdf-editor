import type { Annotation } from '../edits/annotations';
import type { Edit, PlacedSignature, TextBox } from '../edits/model';
import type { PageSize } from '../zoom';
import { identityLayout, positionOf, type Layout } from './layout';
import {
  sizeAfter,
  turnAngle,
  turnAnnotation,
  turnPlacement,
  turnPlacementRect,
  turnPoint,
  turnTextBox,
} from './turning';

/** The arrangement of pages after these edits. */
export function deriveLayout(edits: readonly Edit[], pageCount: number): Layout {
  let layout = identityLayout(pageCount);
  for (const edit of edits) if (edit.kind === 'arrange-pages') layout = edit.layout;
  return layout;
}

/**
 * Edits are made on pages as they were arranged at the time, which can have moved or turned since.
 * This restates every edit against the file's own pages, unturned, which is what saving works on
 * and what stays true however the pages are arranged next.
 */
export function editsOnFilePages(
  edits: readonly Edit[],
  fileSizes: readonly PageSize[],
): readonly Edit[] {
  let layout = identityLayout(fileSizes.length);
  // Which page a text box or signature is on, for edits that name only its id.
  const pageOfText = new Map<string, number>();
  const pageOfSignature = new Map<string, number>();
  // As kept on the file's page, for a signature moved without its angle being restated.
  const angleOfSignature = new Map<string, number>();
  const result: Edit[] = [];

  /** Undoes the page's turning, from how it's shown at this moment back to the file's own page. */
  const onFilePage = (position: number) => {
    const slot = layout[position - 1];
    if (!slot) return null;
    const fileSize = fileSizes[slot.source - 1];
    if (!fileSize) return null;
    const back = (4 - slot.turns) % 4;
    return { source: slot.source, shown: sizeAfter(fileSize, slot.turns), back };
  };

  for (const edit of edits) {
    switch (edit.kind) {
      case 'arrange-pages':
        layout = edit.layout;
        break;
      case 'add-text':
      case 'replace-text': {
        const page = onFilePage(edit.box.pageNumber);
        if (!page) break;
        pageOfText.set(edit.box.id, page.source);
        result.push({
          ...edit,
          box: { ...turnTextBox(edit.box, page.shown, page.back), pageNumber: page.source },
        });
        break;
      }
      case 'update-text': {
        const source = pageOfText.get(edit.id);
        const position = source === undefined ? null : positionOf(layout, source);
        const page = position === null ? null : onFilePage(position);
        const { rect } = edit.changes;
        if (!page || !rect) {
          result.push(edit);
          break;
        }
        const corner = turnPoint(rect, page.shown, page.back);
        result.push({ ...edit, changes: { ...edit.changes, rect: { ...rect, ...corner } } });
        break;
      }
      case 'place-signature': {
        const page = onFilePage(edit.placement.pageNumber);
        if (!page) break;
        pageOfSignature.set(edit.placement.id, page.source);
        angleOfSignature.set(edit.placement.id, turnAngle(edit.placement.angle, page.back));
        result.push({
          ...edit,
          placement: {
            ...turnPlacement(edit.placement, page.shown, page.back),
            pageNumber: page.source,
          },
        });
        break;
      }
      case 'update-signature': {
        const { changes } = edit;
        const currentSource = pageOfSignature.get(edit.id);
        const position =
          changes.pageNumber ??
          (currentSource === undefined ? null : positionOf(layout, currentSource));
        const page = position === null ? null : onFilePage(position);
        if (!page) {
          result.push(edit);
          break;
        }
        // Moved to a page turned differently, it keeps looking the way it did, so its angle on the
        // file's page changes even though the move didn't mention one.
        let { angle } = changes;
        if (
          angle === undefined &&
          changes.pageNumber !== undefined &&
          currentSource !== undefined
        ) {
          const fromPosition = positionOf(layout, currentSource);
          const fromSlot = fromPosition === null ? undefined : layout[fromPosition - 1];
          const before = angleOfSignature.get(edit.id);
          if (fromSlot && before !== undefined) angle = turnAngle(before, fromSlot.turns);
        }
        if (changes.pageNumber !== undefined) pageOfSignature.set(edit.id, page.source);
        const fileAngle = angle === undefined ? undefined : turnAngle(angle, page.back);
        if (fileAngle !== undefined) angleOfSignature.set(edit.id, fileAngle);
        result.push({
          ...edit,
          changes: {
            ...changes,
            ...(changes.pageNumber === undefined ? {} : { pageNumber: page.source }),
            ...(changes.rect
              ? { rect: turnPlacementRect(changes.rect, page.shown, page.back) }
              : {}),
            ...(fileAngle === undefined ? {} : { angle: fileAngle }),
          },
        });
        break;
      }
      case 'add-annotation':
      case 'change-annotation': {
        const page = onFilePage(edit.annotation.pageNumber);
        if (!page) break;
        result.push({
          ...edit,
          annotation: {
            ...turnAnnotation(edit.annotation, page.shown, page.back),
            pageNumber: page.source,
          },
        });
        break;
      }
      default:
        result.push(edit);
    }
  }
  return result;
}

/** Shows things worked out on the file's own pages where those pages are now, turned as they are. */
function shownOnLayout<T extends { readonly pageNumber: number }>(
  items: readonly T[],
  layout: Layout,
  fileSizes: readonly PageSize[],
  turn: (item: T, size: PageSize, turns: number) => T,
): readonly T[] {
  return items.flatMap((item) => {
    const position = positionOf(layout, item.pageNumber);
    const slot = position === null ? undefined : layout[position - 1];
    const size = fileSizes[item.pageNumber - 1];
    if (position === null || !slot || !size) return [];
    return [{ ...turn(item, size, slot.turns), pageNumber: position }];
  });
}

export const textBoxesShown = (
  boxes: readonly TextBox[],
  layout: Layout,
  fileSizes: readonly PageSize[],
) => shownOnLayout(boxes, layout, fileSizes, turnTextBox);

export const signaturesShown = (
  placed: readonly PlacedSignature[],
  layout: Layout,
  fileSizes: readonly PageSize[],
) => shownOnLayout(placed, layout, fileSizes, turnPlacement);

export const annotationsShown = (
  annotations: readonly Annotation[],
  layout: Layout,
  fileSizes: readonly PageSize[],
) => shownOnLayout(annotations, layout, fileSizes, turnAnnotation);
