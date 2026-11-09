import { useRef, useState, type KeyboardEvent } from 'react';
import type { PdfDocument } from '../../engine/document';
import {
  movePages,
  removePages,
  turnPages,
  type Layout,
  type PageSlot,
} from '../../engine/pages/layout';
import { displayedPageSize, type PageSize } from '../../engine/zoom';
import { Icon, type IconName } from '../Icon';
import { PdfCanvas } from '../PdfCanvas';
import { useVisibleItems } from '../useVisibleItems';
import type { PageSelection } from './usePageSelection';

const SHEET = { width: 148, height: 192 };
// How far a press can travel before it counts as dragging pages rather than clicking one.
const DRAG_START = 6;
const EDGE_SCROLL = 48;

interface PagesViewProps {
  readonly document: PdfDocument;
  readonly pageSizes: readonly (PageSize | undefined)[];
  readonly layout: Layout;
  readonly selection: PageSelection;
  readonly changesOn: (position: number) => number;
  readonly onArrange: (layout: Layout, group?: string) => void;
  readonly onExtract: (positions: ReadonlySet<number>) => void;
  readonly onOpenPage: (position: number) => void;
}

interface Dragging {
  readonly moving: ReadonlySet<number>;
  readonly before: number | null;
}

/** Where the given pages are once a layout has changed, by finding the same slots again. */
function positionsOf(slots: readonly PageSlot[], layout: Layout): ReadonlySet<number> {
  return new Set(slots.map((slot) => layout.indexOf(slot) + 1).filter((position) => position > 0));
}

export function PagesView({
  document,
  pageSizes,
  layout,
  selection,
  changesOn,
  onArrange,
  onExtract,
  onOpenPage,
}: PagesViewProps) {
  const gridRef = useRef<HTMLOListElement>(null);
  const visible = useVisibleItems(gridRef, 'data-tile', '400px 0px', layout.length);
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const [said, setSaid] = useState('');
  const pressed = useRef<{ x: number; y: number; position: number } | null>(null);
  const { selected, focused } = selection;
  const count = layout.length;
  // Something to act on: what's chosen, or failing that the page with the keyboard.
  const target = selected.size > 0 ? selected : new Set([focused]);
  const everything = target.size >= count;
  const pageWord = (size: number) => (size === 1 ? 'page' : 'pages');

  const focusTile = (position: number) => {
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-tile="${String(position)}"] button`)
      ?.focus({ preventScroll: false });
  };

  /** Turning keeps pages where they are, and moving keeps the same slots, so either can be followed. */
  const rearrange = (next: Layout, moving: ReadonlySet<number>, message: string) => {
    const slots = [...moving].map((position) => layout[position - 1]).filter(Boolean) as PageSlot[];
    onArrange(next);
    const found = positionsOf(slots, next);
    const after = found.size === moving.size ? found : moving;
    const focus = Math.min(...after);
    selection.replace(after, focus);
    setSaid(message);
    requestAnimationFrame(() => {
      focusTile(focus);
    });
  };

  const turn = (by: 1 | -1) => {
    rearrange(
      turnPages(layout, target, by),
      target,
      `Turned ${String(target.size)} ${pageWord(target.size)} ${by === 1 ? 'right' : 'left'}`,
    );
  };

  const move = (before: number, moving: ReadonlySet<number> = target) => {
    const next = movePages(layout, moving, before);
    if (next.every((slot, index) => slot === layout[index])) return;
    rearrange(next, moving, `Moved ${String(moving.size)} ${pageWord(moving.size)}`);
  };

  const remove = () => {
    if (everything) return;
    const first = Math.min(...target);
    onArrange(removePages(layout, target));
    selection.clear();
    const focus = Math.min(first, count - target.size);
    selection.setFocused(focus);
    setSaid(`Deleted ${String(target.size)} ${pageWord(target.size)}. Undo brings them back.`);
    requestAnimationFrame(() => {
      focusTile(focus);
    });
  };

  const earliest = Math.min(...target);
  const latest = Math.max(...target);

  /** How many tiles fit across, for moving up and down a row with the keyboard. */
  const perRow = () => {
    const tiles = [...(gridRef.current?.querySelectorAll<HTMLElement>('[data-tile]') ?? [])];
    const top = tiles[0]?.offsetTop;
    return Math.max(1, tiles.filter((tile) => tile.offsetTop === top).length);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    const modifier = event.metaKey || event.ctrlKey;
    const steps: Readonly<Record<string, number>> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -perRow(),
      ArrowDown: perRow(),
      Home: -count,
      End: count,
    };
    const step = steps[event.key];
    if (step !== undefined) {
      event.preventDefault();
      if (event.altKey) {
        // Moves what's chosen, as an alternative to dragging.
        move(step < 0 ? Math.max(1, earliest + step) : Math.min(count + 1, latest + step + 1));
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
      onOpenPage(focused);
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
  };

  /** Which gap the pointer is over: before the page it's on, or after it past its middle. */
  const gapAt = (x: number, y: number): number | null => {
    const tile = window.document
      .elementsFromPoint(x, y)
      .find((element) => element instanceof HTMLElement && element.dataset['tile'] !== undefined);
    if (!(tile instanceof HTMLElement)) return null;
    const position = Number(tile.dataset['tile']);
    const box = tile.getBoundingClientRect();
    return x < box.left + box.width / 2 ? position : position + 1;
  };

  const tool = (icon: IconName, label: string, action: () => void, disabled: boolean) => (
    <button type="button" className="tool" title={label} disabled={disabled} onClick={action}>
      <Icon name={icon} />
      <span className="tool-label">{label}</span>
    </button>
  );

  return (
    <div className="pages-stage">
      <div className="pages-tools" role="toolbar" aria-label="Page tools">
        {tool(
          'rotl',
          'Rotate left',
          () => {
            turn(-1);
          },
          false,
        )}
        {tool(
          'rotr',
          'Rotate right',
          () => {
            turn(1);
          },
          false,
        )}
        <span className="sep" />
        {tool(
          'up',
          'Move earlier',
          () => {
            move(Math.max(1, earliest - 1));
          },
          earliest <= 1,
        )}
        {tool(
          'down',
          'Move later',
          () => {
            move(Math.min(count + 1, latest + 2));
          },
          latest >= count,
        )}
        <span className="sep" />
        {tool('trash', 'Delete', remove, everything)}
        {tool(
          'extract',
          'Extract',
          () => {
            onExtract(target);
          },
          false,
        )}
      </div>
      <p className="visually-hidden" role="status">
        {said}
      </p>
      <ol
        ref={gridRef}
        className={dragging?.before ? 'page-grid is-dragging' : 'page-grid'}
        aria-label="Pages in this document"
        onKeyDown={onKeyDown}
      >
        {layout.map((slot, index) => {
          const position = index + 1;
          const size = pageSizes[index];
          const zoom = size
            ? Math.floor(Math.min(SHEET.width / size.width, SHEET.height / size.height) * 100)
            : 1;
          const shown = size ? displayedPageSize(size, zoom) : SHEET;
          const isSelected = selected.has(position);
          const changes = changesOn(position);
          const tag =
            changes === 0 ? '' : changes === 1 ? '1 change' : `${String(changes)} changes`;
          return (
            <li key={slot.source} data-tile={position}>
              {dragging?.before === position && <span className="insert-mark" aria-hidden="true" />}
              {dragging?.before === count + 1 && position === count && (
                <span className="insert-mark is-after" aria-hidden="true" />
              )}
              <button
                type="button"
                className="tile"
                aria-pressed={isSelected}
                aria-label={`Page ${String(position)}${tag ? `, ${tag}` : ''}`}
                tabIndex={position === focused ? 0 : -1}
                onFocus={() => {
                  selection.setFocused(position);
                }}
                onClick={(event) => {
                  const modifier = event.metaKey || event.ctrlKey;
                  if (event.shiftKey) selection.extendTo(position);
                  else if (modifier) selection.toggle(position);
                  else selection.pick(position);
                }}
                onDoubleClick={() => {
                  onOpenPage(position);
                }}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  pressed.current = { x: event.clientX, y: event.clientY, position };
                }}
                onPointerMove={(event) => {
                  const start = pressed.current;
                  if (!start) return;
                  const travelled = Math.hypot(event.clientX - start.x, event.clientY - start.y);
                  if (!dragging && travelled < DRAG_START) return;
                  if (!dragging) {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    const moving = selected.has(start.position)
                      ? selected
                      : new Set([start.position]);
                    if (!selected.has(start.position)) selection.pick(start.position);
                    setDragging({ moving, before: null });
                    return;
                  }
                  const grid = gridRef.current;
                  if (grid) {
                    const box = grid.getBoundingClientRect();
                    if (event.clientY < box.top + EDGE_SCROLL) grid.scrollBy(0, -12);
                    if (event.clientY > box.bottom - EDGE_SCROLL) grid.scrollBy(0, 12);
                  }
                  const before = gapAt(event.clientX, event.clientY);
                  setDragging({ ...dragging, before });
                }}
                onPointerUp={() => {
                  pressed.current = null;
                  if (!dragging) return;
                  setDragging(null);
                  if (dragging.before !== null) move(dragging.before, dragging.moving);
                }}
                onPointerCancel={() => {
                  pressed.current = null;
                  setDragging(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && dragging) {
                    event.stopPropagation();
                    pressed.current = null;
                    setDragging(null);
                  }
                }}
              >
                {isSelected && (
                  <span className="tile-check">
                    <Icon name="check" />
                  </span>
                )}
                <span className="tile-sheet" style={{ width: shown.width, height: shown.height }}>
                  <PdfCanvas
                    document={document}
                    pageNumber={position}
                    zoomPercent={zoom}
                    width={shown.width}
                    height={shown.height}
                    active={size !== undefined && visible.has(position)}
                    decorative
                  />
                </span>
                <span className="tile-num">{position}</span>
                <span className="tile-tag">{tag}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
