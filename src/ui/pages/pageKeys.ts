import type { KeyboardEvent } from 'react';
import type { PageSelection } from './usePageSelection';

interface PageKeyActions {
  readonly grid: HTMLElement | null;
  readonly count: number;
  readonly selection: PageSelection;
  /** Moves what's chosen this many places, as an alternative to dragging. */
  readonly moveBy: (step: number) => void;
  readonly focusTile: (position: number) => void;
  readonly remove: () => void;
  readonly openPage: (position: number) => void;
}

/** How many tiles fit across, for moving up and down a row with the keyboard. */
function tilesPerRow(grid: HTMLElement | null): number {
  const tiles = [...(grid?.querySelectorAll<HTMLElement>('[data-tile]') ?? [])];
  const top = tiles[0]?.offsetTop;
  return Math.max(1, tiles.filter((tile) => tile.offsetTop === top).length);
}

/** The keys of the page grid, which works like a file list. */
export function onPageGridKeyDown(
  event: KeyboardEvent<HTMLElement>,
  { grid, count, selection, moveBy, focusTile, remove, openPage }: PageKeyActions,
): void {
  const { focused, selected } = selection;
  const modifier = event.metaKey || event.ctrlKey;
  const row = tilesPerRow(grid);
  const steps: Readonly<Record<string, number>> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -row,
    ArrowDown: row,
    Home: -count,
    End: count,
  };
  const step = steps[event.key];
  if (step !== undefined) {
    event.preventDefault();
    if (event.altKey) {
      moveBy(step);
      return;
    }
    const next = Math.min(count, Math.max(1, focused + step));
    if (event.shiftKey) selection.extendTo(next);
    else selection.setFocused(next);
    focusTile(next);
  } else if (event.key === ' ') {
    event.preventDefault();
    selection.toggle(focused);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    openPage(focused);
  } else if (modifier && event.key.toLowerCase() === 'a') {
    event.preventDefault();
    selection.selectAll(count);
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    remove();
  } else if (event.key === 'Escape' && selected.size > 0) {
    event.preventDefault();
    selection.clear();
  }
}
