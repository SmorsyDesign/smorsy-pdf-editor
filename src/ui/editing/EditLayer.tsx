import type { MouseEvent } from 'react';
import type { TextBox } from '../../engine/edits/model';
import type { PageText, TextBlock } from '../../engine/extract';

interface EditLayerProps {
  readonly text: PageText | null;
  readonly boxes: readonly TextBox[];
  readonly scale: number;
  readonly onOpenBlock: (block: TextBlock, pageElement: HTMLElement) => void;
  readonly onDeleteBlock: (block: TextBlock, pageElement: HTMLElement) => void;
  readonly onAddAt: (xPoints: number, yPoints: number) => void;
}

const READ_ONLY_REASON = {
  skewed: 'This text is skewed, so it can’t be edited faithfully.',
  'complex-script':
    'This script can’t be edited faithfully yet, because its letters join or reorder.',
} as const;

/** The clickable outline over each line or paragraph, and the empty page for adding new text. */
export function EditLayer({
  text,
  boxes,
  scale,
  onOpenBlock,
  onDeleteBlock,
  onAddAt,
}: EditLayerProps) {
  const replaced = new Set(boxes.map((box) => box.id));

  const onLayerClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    onAddAt((event.clientX - bounds.left) / scale, (event.clientY - bounds.top) / scale);
  };

  const pageOf = (element: HTMLElement) => element.closest<HTMLElement>('[data-page]');

  return (
    <div className="edit-layer" data-testid="edit-layer" onClick={onLayerClick}>
      {text?.blocks
        .filter((block) => !replaced.has(block.id))
        .map((block) => {
          const reason = block.readOnly && READ_ONLY_REASON[block.readOnly];
          return (
            <button
              key={block.id}
              type="button"
              className={reason ? 'text-block text-block-locked' : 'text-block'}
              aria-label={reason ?? `Edit text: ${block.text.slice(0, 60)}`}
              {...(reason ? { 'aria-disabled': true, title: reason } : {})}
              style={{
                left: block.rect.x * scale,
                top: block.rect.y * scale,
                width: block.rect.width * scale,
                height: block.rect.height * scale,
                transform: `rotate(${block.angle}deg)`,
              }}
              onClick={(event) => {
                event.stopPropagation();
                const page = pageOf(event.currentTarget);
                if (page && !reason) onOpenBlock(block, page);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Delete' && event.key !== 'Backspace') return;
                const page = pageOf(event.currentTarget);
                if (page && !reason) {
                  event.preventDefault();
                  onDeleteBlock(block, page);
                }
              }}
            />
          );
        })}
    </div>
  );
}
