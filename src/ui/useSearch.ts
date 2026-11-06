import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import type { PdfDocument } from '../engine/document';
import type { TextBlock } from '../engine/extract';
import { findMatches, type SearchMatch } from '../engine/search';

const TYPING_PAUSE_MS = 200;

interface SearchState {
  readonly query: string;
  readonly setQuery: (query: string) => void;
  readonly matches: readonly SearchMatch[];
  readonly searching: boolean;
}

/** Goes through pages in the background, showing matches as they're found. */
function useSearch(
  pageCount: number,
  readPage: (pageNumber: number) => Promise<readonly TextBlock[]>,
): SearchState {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<readonly SearchMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const pages = useMemo(() => new Map<number, Promise<readonly TextBlock[]>>(), []);

  useEffect(() => {
    setMatches([]);
    if (query.trim() === '') {
      setSearching(false);
      return;
    }
    const stop = new AbortController();
    const stopped = () => stop.signal.aborted;
    const timer = window.setTimeout(() => {
      void (async () => {
        setSearching(true);
        const found: SearchMatch[] = [];
        for (let pageNumber = 1; pageNumber <= pageCount && !stopped(); pageNumber += 1) {
          try {
            let page = pages.get(pageNumber);
            if (!page) {
              page = readPage(pageNumber);
              pages.set(pageNumber, page);
            }
            found.push(...findMatches(await page, query));
          } catch (error) {
            // A damaged page has no text to search, and it explains itself where it's shown.
            console.error(error);
            pages.delete(pageNumber);
          }
          if (!stopped()) setMatches([...found]);
        }
        if (!stopped()) setSearching(false);
      })();
    }, TYPING_PAUSE_MS);
    return () => {
      window.clearTimeout(timer);
      stop.abort();
    };
  }, [pageCount, pages, query, readPage]);

  return { query, setQuery, matches, searching };
}

/** The search bar's state for one document, and scrolling to whichever match is current. */
export function useDocumentSearch(
  pdf: PdfDocument,
  scrollToPageRef: RefObject<((pageNumber: number, yOffset?: number) => void) | null>,
) {
  const [open, setOpen] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);
  const readPage = useCallback((page: number) => pdf.searchableText(page), [pdf]);
  const { query, setQuery, matches, searching } = useSearch(pdf.pageCount, readPage);
  const current = Math.min(matchIndex, matches.length - 1);
  const currentMatch = matches[current] ?? null;

  useEffect(() => {
    if (currentMatch) {
      scrollToPageRef.current?.(currentMatch.pageNumber, currentMatch.rect.y);
    }
  }, [currentMatch, scrollToPageRef]);

  return {
    open,
    show: () => {
      setOpen(true);
    },
    currentMatch,
    matchesOn: (pageNumber: number) =>
      open ? matches.filter((match) => match.pageNumber === pageNumber) : [],
    barProps: {
      query,
      current,
      total: matches.length,
      searching,
      onQueryChange: (next: string) => {
        setMatchIndex(0);
        setQuery(next);
      },
      onStep: (direction: 1 | -1) => {
        const count = matches.length;
        if (count > 0) setMatchIndex((index) => (index + direction + count) % count);
      },
      onClose: () => {
        setOpen(false);
        setQuery('');
      },
    },
  };
}
