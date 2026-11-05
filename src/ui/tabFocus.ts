const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex], [contenteditable="true"]';

function canTabTo(element: HTMLElement): boolean {
  return element.tabIndex >= 0 && element.getClientRects().length > 0;
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
    const items = Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(canTabTo);
    if (items.length === 0) return;

    event.preventDefault();
    const active = document.activeElement as HTMLElement;
    const current = items.indexOf(active);
    const step = event.shiftKey ? -1 : 1;
    // Focus can sit on something outside the Tab order, such as a thumbnail reached by arrow keys.
    const fromList = active
      .closest('[aria-label="Pages"]')
      ?.querySelector<HTMLElement>('[tabindex="0"]');
    const anchor = current === -1 && fromList ? items.indexOf(fromList) : current;
    const fallback = event.shiftKey ? items.length - 1 : 0;
    const next = anchor === -1 ? fallback : (anchor + step + items.length) % items.length;
    items[next]?.focus();
  };

  document.addEventListener('keydown', onKeyDown);
  return () => {
    document.removeEventListener('keydown', onKeyDown);
  };
}
