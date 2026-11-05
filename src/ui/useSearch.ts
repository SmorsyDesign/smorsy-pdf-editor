import { useEffect, useMemo, useState } from 'react';
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
export function useSearch(
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
