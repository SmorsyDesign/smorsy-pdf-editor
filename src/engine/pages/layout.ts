/** One page of the document as it's arranged now. */
export interface PageSlot {
  /** Its page in the file as opened, counting from 1. */
  readonly source: number;
  /** Quarter turns clockwise, on top of however the file already shows it. */
  readonly turns: number;
}

export type Layout = readonly PageSlot[];

export function identityLayout(pageCount: number): Layout {
  return Array.from({ length: pageCount }, (_, index) => ({ source: index + 1, turns: 0 }));
}

export const isIdentity = (layout: Layout) =>
  layout.every((slot, index) => slot.source === index + 1 && slot.turns === 0);

const quarter = (turns: number) => ((turns % 4) + 4) % 4;

/** Turns the pages at these positions, counting from 1, a quarter turn either way. */
export function turnPages(layout: Layout, positions: ReadonlySet<number>, by: 1 | -1): Layout {
  return layout.map((slot, index) =>
    positions.has(index + 1) ? { ...slot, turns: quarter(slot.turns + by) } : slot,
  );
}

/** Leaves these pages out. A document can't be left with none, so that's refused. */
export function removePages(layout: Layout, positions: ReadonlySet<number>): Layout {
  const kept = layout.filter((_, index) => !positions.has(index + 1));
  if (kept.length === 0) throw new Error('A document has to keep at least one page.');
  return kept;
}

/**
 * Moves these pages, in their current order, to just before the page now at `before`. A `before`
 * past the last page puts them at the end.
 */
export function movePages(layout: Layout, positions: ReadonlySet<number>, before: number): Layout {
  const moving = layout.filter((_, index) => positions.has(index + 1));
  const staying = layout.filter((_, index) => !positions.has(index + 1));
  const ahead = layout.slice(0, before - 1).filter((_, index) => !positions.has(index + 1)).length;
  return [...staying.slice(0, ahead), ...moving, ...staying.slice(ahead)];
}

/** Keeps just these pages, in their current order, as when making a new file from them. */
export function keepPages(layout: Layout, positions: ReadonlySet<number>): Layout {
  const kept = layout.filter((_, index) => positions.has(index + 1));
  if (kept.length === 0) throw new Error('Choose at least one page.');
  return kept;
}

/** Where a page of the file as opened is now, or null if it's been removed. */
export function positionOf(layout: Layout, source: number): number | null {
  const index = layout.findIndex((slot) => slot.source === source);
  return index < 0 ? null : index + 1;
}
