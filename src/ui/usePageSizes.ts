import { useEffect, useState } from 'react';
import type { PdfDocument } from '../engine/document';
import type { PageSize } from '../engine/zoom';

const BATCH = 32;

/**
 * Measures the first page immediately, so it can show at once, then the rest in small batches.
 * Pages not measured yet are undefined; callers estimate from the first page until they arrive.
 */
export function usePageSizes(document: PdfDocument): readonly (PageSize | undefined)[] {
  const [sizes, setSizes] = useState<readonly (PageSize | undefined)[]>(() =>
    new Array<PageSize | undefined>(document.pageCount).fill(undefined),
  );

  useEffect(() => {
    const stop = new AbortController();
    const stopped = () => stop.signal.aborted;

    const measure = async () => {
      const found = new Array<PageSize | undefined>(document.pageCount).fill(undefined);
      for (let start = 1; start <= document.pageCount && !stopped(); start += BATCH) {
        const end = Math.min(start + BATCH - 1, document.pageCount);
        const batch = await Promise.all(
          Array.from({ length: end - start + 1 }, (_, index) => document.pageSize(start + index)),
        );
        batch.forEach((size, index) => {
          found[start - 1 + index] = size;
        });
        if (!stopped()) setSizes([...found]);
      }
    };

    // This rejects if the document closes mid-measure, or a page is damaged. Unmeasured pages keep
    // their estimated size, and a damaged page explains itself when it fails to draw.
    measure().catch(() => {
      stop.abort();
    });
    return () => {
      stop.abort();
    };
  }, [document]);

  return sizes;
}
