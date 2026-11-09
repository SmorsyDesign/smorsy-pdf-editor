import { useCallback, useState } from 'react';

/** Which pages are chosen in Pages mode, by where they are now, and which one has the keyboard. */
export function usePageSelection() {
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [anchor, setAnchor] = useState(1);
  const [focused, setFocused] = useState(1);

  const range = (from: number, to: number) => {
    const low = Math.min(from, to);
    return new Set(Array.from({ length: Math.abs(to - from) + 1 }, (_, index) => low + index));
  };

  return {
    selected,
    focused,
    /** Moving with the keyboard alone also moves where a Shift range starts. */
    setFocused: useCallback((position: number) => {
      setFocused(position);
      setAnchor(position);
    }, []),
    /** After pages change some other way, such as undo, choices no longer mean the same pages. */
    /** Focus arriving by click or Tab, which shouldn't move where a Shift range starts. */
    markFocused: setFocused,
    reset: useCallback((count: number) => {
      setSelected(new Set());
      setFocused((current) => Math.min(Math.max(1, current), Math.max(1, count)));
      setAnchor(1);
    }, []),
    /** A plain click picks just this page, the way a file list does. */
    pick: useCallback((position: number) => {
      setSelected(new Set([position]));
      setAnchor(position);
      setFocused(position);
    }, []),
    toggle: useCallback((position: number) => {
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(position)) next.delete(position);
        else next.add(position);
        return next;
      });
      setAnchor(position);
      setFocused(position);
    }, []),
    extendTo: (position: number) => {
      setSelected(range(anchor, position));
      setFocused(position);
    },
    selectAll: useCallback((count: number) => {
      setSelected(new Set(Array.from({ length: count }, (_, index) => index + 1)));
    }, []),
    /** After pages move, the same pages stay chosen wherever they've gone. */
    replace: useCallback((positions: ReadonlySet<number>, focus: number) => {
      setSelected(positions);
      setAnchor(focus);
      setFocused(focus);
    }, []),
    clear: useCallback(() => {
      setSelected(new Set());
    }, []),
  };
}

export type PageSelection = ReturnType<typeof usePageSelection>;
