import { useEffect, useState } from 'react';
import type { PageText } from '../engine/extract';
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
  pageText: (pageNumber: number) => Promise<PageText>,
): SearchState {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<readonly SearchMatch[]>([]);
  const [searching, setSearching] = useState(false);

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
            const { blocks } = await pageText(pageNumber);
            found.push(...findMatches(blocks, query));
          } catch (error) {
            // A damaged page has no text to search, and it explains itself where it's shown.
            console.error(error);
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
  }, [pageCount, pageText, query]);

  return { query, setQuery, matches, searching };
}
