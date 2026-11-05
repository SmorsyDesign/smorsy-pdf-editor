import { useEffect, useState, type RefObject } from 'react';

/**
 * Tracks which numbered items are near the visible part of a scrolling area. Items are found by
 * a data attribute holding their number, so a long list needs only one observer.
 */
export function useVisibleItems(
  rootRef: RefObject<HTMLElement | null>,
  attribute: string,
  rootMargin: string,
  itemCount: number,
): ReadonlySet<number> {
  const [visible, setVisible] = useState<ReadonlySet<number>>(() => new Set([1]));

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setVisible((current) => {
          const next = new Set(current);
          for (const entry of entries) {
            const item = Number(entry.target.getAttribute(attribute));
            if (entry.isIntersecting) next.add(item);
            else next.delete(item);
          }
          return next;
        });
      },
      { root, rootMargin },
    );
    root.querySelectorAll(`[${attribute}]`).forEach((element) => {
      observer.observe(element);
    });
    return () => {
      observer.disconnect();
    };
  }, [attribute, itemCount, rootMargin, rootRef]);

  return visible;
}
