import { useEffect, useRef, useState } from 'react';
import type { PdfDocument } from '../../engine/document';
import {
  movePages,
  removePages,
  turnPages,
  type Layout,
  type PageSlot,
} from '../../engine/pages/layout';
import type { PageSize } from '../../engine/zoom';
import { Icon, type IconName } from '../Icon';
import { useVisibleItems } from '../useVisibleItems';
import { onPageGridKeyDown } from './pageKeys';
import { PageTile } from './PageTile';
import { usePageDrag } from './usePageDrag';
import type { PageSelection } from './usePageSelection';

interface PagesViewProps {
  readonly document: PdfDocument;
  readonly pageSizes: readonly (PageSize | undefined)[];
  readonly layout: Layout;
  readonly selection: PageSelection;
  readonly changesOn: (position: number) => number;
  readonly onArrange: (layout: Layout) => void;
  readonly onExtract: (positions: ReadonlySet<number>) => void;
  readonly onOpenPage: (position: number) => void;
  /** Turning works from each page's size, so nothing can change until every page is measured. */
  readonly ready: boolean;
}

const MEASURING = 'Still measuring the pages. Try again in a moment.';

const sameLayout = (one: Layout, two: Layout) =>
  one.length === two.length &&
  one.every((slot, index) => slot.source === two[index]?.source && slot.turns === two[index].turns);

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
  ready,
}: PagesViewProps) {
  const gridRef = useRef<HTMLOListElement>(null);
  const visible = useVisibleItems(gridRef, 'data-tile', '400px 0px', layout.length);
  const [said, setSaid] = useState('');
  // The layout this view last produced. Any other one came from undo or redo.
  const produced = useRef(layout);
  useEffect(() => {
    // By what's in it, as the same order is worked out afresh whenever page sizes arrive.
    if (sameLayout(layout, produced.current)) return;
    produced.current = layout;
    selection.reset(layout.length);
  }, [layout, selection]);
  /** A live region repeats nothing, so the same words twice need telling apart. */
  const say = (message: string) => {
    setSaid((current) => (current === message ? `${message}\u00a0` : message));
  };
  // Each visit starts fresh, as pages may have changed while this was away, by undo for one.
  useEffect(() => {
    selection.reset(layout.length);
    // Only when Pages mode opens.
  }, [selection.reset]);
  const { selected, focused } = selection;
  const count = layout.length;
  // Something to act on: what's chosen, or failing that the page with the keyboard. Only pages that
  // exist, in case anything is out of step.
  const chosen = new Set([...selected].filter((position) => position >= 1 && position <= count));
  const target = chosen.size > 0 ? chosen : new Set([Math.min(focused, count)]);
  const everything = target.size >= count;
  const pageWord = (size: number) => (size === 1 ? 'page' : 'pages');

  const focusTile = (position: number) => {
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-tile="${String(position)}"] button`)
      ?.focus({ preventScroll: false });
  };

  const arrange = (next: Layout) => {
    produced.current = next;
    onArrange(next);
  };

  /** Turning keeps pages where they are, and moving keeps the same slots, so either can be followed. */
  const rearrange = (next: Layout, moving: ReadonlySet<number>, message: string) => {
    const slots = [...moving].flatMap((position) => layout[position - 1] ?? []);
    arrange(next);
    const found = positionsOf(slots, next);
    const after = found.size === moving.size ? found : moving;
    const focus = Math.min(...after);
    selection.replace(after, focus);
    say(message);
    requestAnimationFrame(() => {
      focusTile(focus);
    });
  };

  const turn = (by: 1 | -1) => {
    if (!ready) return;
    rearrange(
      turnPages(layout, target, by),
      target,
      `Turned ${String(target.size)} ${pageWord(target.size)} ${by === 1 ? 'right' : 'left'}`,
    );
  };

  const move = (before: number, moving: ReadonlySet<number> = target) => {
    if (!ready) return;
    const next = movePages(layout, moving, before);
    if (next.every((slot, index) => slot === layout[index])) return;
    rearrange(next, moving, `Moved ${String(moving.size)} ${pageWord(moving.size)}`);
  };

  const remove = () => {
    if (everything) {
      say('A document needs at least one page, so they can’t all be deleted.');
      return;
    }
    if (!ready) {
      say(MEASURING);
      return;
    }
    const first = Math.min(...target);
    arrange(removePages(layout, target));
    selection.clear();
    const focus = Math.min(first, count - target.size);
    selection.setFocused(focus);
    say(`Deleted ${String(target.size)} ${pageWord(target.size)}. Undo brings them back.`);
    requestAnimationFrame(() => {
      focusTile(focus);
    });
  };

  const measuring = ready ? null : MEASURING;
  const earliest = Math.min(...target);
  const latest = Math.max(...target);
  /** Moves what's chosen this many places, keeping it within the document. */
  const moveBy = (step: number) => {
    move(step < 0 ? Math.max(1, earliest + step) : Math.min(count + 1, latest + step + 1));
  };

  const { dragging, handlersFor, justDragged } = usePageDrag(gridRef, selection, ready, move);

  /** Unavailable tools stay focusable, so the reason they can't be used can be heard and seen. */
  const tool = (icon: IconName, label: string, action: () => void, unavailable: string | null) => (
    <button
      type="button"
      className="tool"
      title={unavailable ?? label}
      aria-disabled={unavailable !== null}
      {...(unavailable ? { 'aria-description': unavailable } : {})}
      onClick={() => {
        if (unavailable === null) action();
        else say(unavailable);
      }}
    >
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
          measuring,
        )}
        {tool(
          'rotr',
          'Rotate right',
          () => {
            turn(1);
          },
          measuring,
        )}
        <span className="sep" />
        {tool(
          'up',
          'Move earlier',
          () => {
            moveBy(-1);
          },
          measuring ?? (earliest <= 1 ? 'The first page can’t move any earlier.' : null),
        )}
        {tool(
          'down',
          'Move later',
          () => {
            moveBy(1);
          },
          measuring ?? (latest >= count ? 'The last page can’t move any later.' : null),
        )}
        <span className="sep" />
        {tool(
          'trash',
          'Delete',
          remove,
          measuring ?? (everything ? 'A document needs at least one page.' : null),
        )}
        {tool(
          'extract',
          'Extract',
          () => {
            onExtract(target);
          },
          null,
        )}
      </div>
      <p className="visually-hidden" role="status">
        {said}
      </p>
      <ol
        ref={gridRef}
        className={dragging?.before ? 'page-grid is-dragging' : 'page-grid'}
        aria-label="Pages in this document"
        onKeyDown={(event) => {
          onPageGridKeyDown(event, {
            grid: gridRef.current,
            count,
            selection,
            moveBy,
            focusTile,
            remove,
            openPage: onOpenPage,
          });
        }}
      >
        {layout.map((slot, index) => {
          const position = index + 1;
          return (
            <PageTile
              key={slot.source}
              document={document}
              position={position}
              size={pageSizes[index]}
              visible={visible.has(position)}
              isSelected={selected.has(position)}
              hasKeyboard={position === focused}
              changes={changesOn(position)}
              insertBefore={dragging?.before === position}
              insertAfter={dragging?.before === count + 1 && position === count}
              dragHandlers={handlersFor(position)}
              onFocus={() => {
                selection.markFocused(position);
              }}
              onClick={(event) => {
                if (justDragged()) return;
                const modifier = event.metaKey || event.ctrlKey;
                if (event.shiftKey) selection.extendTo(position);
                else if (modifier) selection.toggle(position);
                else selection.pick(position);
              }}
              onOpen={() => {
                onOpenPage(position);
              }}
            />
          );
        })}
      </ol>
    </div>
  );
}
