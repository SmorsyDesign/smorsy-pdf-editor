import type { Annotation } from '../../engine/edits/annotations';
import {
  deriveAnnotations,
  deriveFieldAnswers,
  deriveLock,
  deriveSignatures,
  deriveTextBoxes,
  savedChanges,
  type Edit,
} from '../../engine/edits/model';
import {
  annotationsShown,
  deriveLayout,
  editsOnFilePages,
  signaturesShown,
  textBoxesShown,
} from '../../engine/pages/arranging';
import { isIdentity, keepPages, positionOf, type Layout } from '../../engine/pages/layout';
import type { SaveExtras } from '../../engine/save/editor';
import type { PageSize } from '../../engine/zoom';

/**
 * Everything the edits add up to, both on the file's own pages, which is what saving needs, and as
 * shown with the pages arranged as they are now, which is what everything on screen uses.
 */
export function arrangeEdits(
  edits: readonly Edit[],
  existing: readonly Annotation[],
  fileSizes: readonly PageSize[],
) {
  const measured = fileSizes.length > 0;
  const layout: Layout = deriveLayout(edits, fileSizes.length);
  // Nothing can be arranged before the pages are measured, so edits stand as made until then.
  const onFile = measured ? editsOnFilePages(edits, fileSizes) : edits;
  const fileBoxes = deriveTextBoxes(onFile);
  const fileSignatures = deriveSignatures(onFile);
  const fileAnnotations = deriveAnnotations(onFile, existing);
  const savedChange = savedChanges(onFile, existing);

  const hiddenAnnotations = new Map<number, string[]>();
  const hidden = [
    ...savedChange.removed,
    ...savedChange.changed.flatMap(({ saved }) => (saved && !saved.foreign ? [saved] : [])),
  ];
  for (const { pageNumber, ref } of hidden) {
    const position = measured ? positionOf(layout, pageNumber) : pageNumber;
    if (position !== null) {
      hiddenAnnotations.set(position, [...(hiddenAnnotations.get(position) ?? []), ref]);
    }
  }

  return {
    layout,
    onFile,
    fileBoxes,
    savedChange,
    boxes: measured ? textBoxesShown(fileBoxes, layout, fileSizes) : fileBoxes,
    signatures: measured ? signaturesShown(fileSignatures, layout, fileSizes) : fileSignatures,
    annotations: measured ? annotationsShown(fileAnnotations, layout, fileSizes) : fileAnnotations,
    hiddenAnnotations: hiddenAnnotations as ReadonlyMap<number, readonly string[]>,
  };
}

/**
 * What a save writes, all on the file's own pages, which are arranged only at the end. With `keep`,
 * just those pages, as when making a new file from some of them.
 */
export function editsToSave(
  edits: readonly Edit[],
  existing: readonly Annotation[],
  fileSizes: readonly PageSize[],
  keep?: ReadonlySet<number>,
) {
  const now = arrangeEdits(edits, existing, fileSizes);
  const { onFile, fileBoxes } = now;
  const placed = deriveSignatures(onFile);
  const { changed, removed } = now.savedChange;
  const marks = [...deriveAnnotations(onFile).filter(({ saved }) => !saved), ...changed];
  const answers = [...deriveFieldAnswers(edits)];
  const lock = deriveLock(edits);
  const layout = keep ? keepPages(now.layout, keep) : now.layout;
  const kept = new Set(layout.map((slot) => slot.source));
  const keptOnly = <T extends { readonly pageNumber: number }>(items: readonly T[]) =>
    fileSizes.length === 0 ? items : items.filter((item) => kept.has(item.pageNumber));
  const unchanged =
    fileBoxes.length === 0 &&
    placed.length === 0 &&
    marks.length === 0 &&
    removed.length === 0 &&
    answers.length === 0 &&
    layout.length === fileSizes.length &&
    isIdentity(layout) &&
    !lock;
  const extras: SaveExtras = {
    annotations: keptOnly(marks),
    removedSaved: removed,
    answers,
    lock,
    layout,
  };
  return { unchanged, boxes: keptOnly(fileBoxes), signatures: keptOnly(placed), extras };
}
