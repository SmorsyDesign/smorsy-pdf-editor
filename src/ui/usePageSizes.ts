import { useEffect, useState } from 'react';
import type { PdfDocument } from '../engine/document';
import { LETTER_PAGE, type PageSize } from '../engine/zoom';

const BATCH = 32;

/**
 * Measures pages in small batches, so a long document doesn't hold everything up.
 * Pages not measured yet are undefined; callers estimate until they arrive. A page that can't be
 * measured gets an estimated size, so it still has a place to explain that it couldn't be drawn.
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
        const batch = await Promise.allSettled(
          Array.from({ length: end - start + 1 }, (_, index) => document.pageSize(start + index)),
        );
        batch.forEach((result, index) => {
          found[start - 1 + index] =
            result.status === 'fulfilled'
              ? result.value
              : (found.find((size) => size !== undefined) ?? LETTER_PAGE);
        });
        if (!stopped()) setSizes([...found]);
      }
    };

    void measure();
    return () => {
      stop.abort();
    };
  }, [document]);

  return sizes;
}
