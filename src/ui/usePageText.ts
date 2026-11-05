import { useCallback, useMemo } from 'react';
import type { PdfDocument } from '../engine/document';
import type { PageText } from '../engine/extract';

/** Reads each page's text once. A failure isn't kept, so a later try can still work. */
export function usePageText(document: PdfDocument) {
  const cache = useMemo(() => new Map<number, Promise<PageText>>(), []);
  return useCallback(
    (pageNumber: number) => {
      let cached = cache.get(pageNumber);
      if (!cached) {
        cached = document.pageText(pageNumber);
        cache.set(pageNumber, cached);
        cached.catch(() => {
          cache.delete(pageNumber);
        });
      }
      return cached;
    },
    [cache, document],
  );
}
