import { useEffect, type RefObject } from 'react';

/** Takes focus when asked. `onFocused` clears the request, so it only happens the once. */
export function useFocusOnRequest(
  element: RefObject<HTMLElement | null>,
  id: string,
  requestedId: string | null,
  onFocused: () => void,
): void {
  useEffect(() => {
    if (requestedId !== id) return;
    element.current?.focus();
    onFocused();
  }, [element, id, onFocused, requestedId]);
}
