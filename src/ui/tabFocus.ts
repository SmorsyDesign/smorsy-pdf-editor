const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

function isVisible(element: HTMLElement): boolean {
  return element.getClientRects().length > 0;
}

/**
 * WebKit's Tab key skips buttons unless the person has changed a macOS setting, which would leave
 * Mac keyboard users stuck. So the app moves focus itself, the same way on every platform, and
 * stays inside an open dialog.
 */
export function installTabFocus(): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || event.metaKey || event.ctrlKey || event.altKey) return;

    const scope = document.querySelector<HTMLElement>('dialog[open]') ?? document.body;
    const items = Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isVisible);
    if (items.length === 0) return;

    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const step = event.shiftKey ? -1 : 1;
    const fallback = event.shiftKey ? items.length - 1 : 0;
    const next = current === -1 ? fallback : (current + step + items.length) % items.length;
    items[next]?.focus();
  };

  document.addEventListener('keydown', onKeyDown);
  return () => {
    document.removeEventListener('keydown', onKeyDown);
  };
}
