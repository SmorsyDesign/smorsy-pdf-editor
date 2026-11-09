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
    setFocused,
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
