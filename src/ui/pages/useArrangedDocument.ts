import { useEffect, useMemo } from 'react';
import type { PdfDocument } from '../../engine/document';
import { isIdentity, type Layout } from '../../engine/pages/layout';
import { LETTER_PAGE, type PageSize } from '../../engine/zoom';
import { usePageSizes } from '../usePageSizes';

/**
 * The document with its pages as arranged now, which every page number on screen follows. Edits on
 * turned pages are worked out from the file's own page sizes, so those are measured and passed on.
 */
export function useArrangedDocument(
  filePdf: PdfDocument,
  layout: Layout,
  setFileSizes: (sizes: readonly PageSize[]) => void,
) {
  const fileSizes = usePageSizes(filePdf);
  useEffect(() => {
    setFileSizes(fileSizes.map((size) => size ?? LETTER_PAGE));
  }, [fileSizes, setFileSizes]);
  const pdf = useMemo(
    () =>
      // Empty until the pages are measured, which means the file's own order.
      layout.length === 0 || (layout.length === filePdf.pageCount && isIdentity(layout))
        ? filePdf
        : filePdf.arranged(layout),
    [filePdf, layout],
  );
  return { pdf, allMeasured: fileSizes.every((size) => size !== undefined) };
}
