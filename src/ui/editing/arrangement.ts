import type { Annotation } from '../../engine/edits/annotations';
import {
  deriveAnnotations,
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
import { positionOf, type Layout } from '../../engine/pages/layout';
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
