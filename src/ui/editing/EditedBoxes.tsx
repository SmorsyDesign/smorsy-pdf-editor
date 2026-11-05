import type { TextBox } from '../../engine/edits/model';
import { baselineWithinLine, previewFamily, previewFont } from './preview';

interface EditedBoxesProps {
  readonly boxes: readonly TextBox[];
  readonly scale: number;
  readonly hiddenId: string | null;
  /** The box a notice is about, marked as the design shows. */
  readonly flaggedId: string | null;
  readonly onOpen: ((box: TextBox) => void) | null;
}

const cssColor = ({ r, g, b }: { r: number; g: number; b: number }) =>
  `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;

/** Draws edits over the untouched page: the patches first, then the new text. */
export function EditedBoxes({ boxes, scale, hiddenId, flaggedId, onOpen }: EditedBoxesProps) {
  return (
    <>
      {boxes.flatMap((box) =>
        box.covers.map(({ rect, angle, color }, index) => (
          <div
            key={`${box.id}-cover-${index}`}
            className="edit-cover"
            style={{
              left: rect.x * scale,
              top: rect.y * scale,
              width: rect.width * scale,
              height: rect.height * scale,
              background: cssColor(color),
              transform: `rotate(${angle}deg)`,
            }}
          />
        )),
      )}
      {boxes
        .filter((box) => box.id !== hiddenId && box.lines.length > 0)
        .map((box) => {
          const lineHeight = box.lineHeight * scale;
          const flag = box.id === flaggedId ? ' edit-box-flagged' : '';
          const font = previewFont(box.style, box.original, box.style.size * scale);
          const shift = box.firstBaseline * scale - baselineWithinLine(font, lineHeight);
          const content = box.lines.map((line, index) => (
            <span
              key={index}
              className="edit-line"
              style={{ top: shift + index * lineHeight, height: lineHeight }}
            >
              {line}
            </span>
          ));
          const style = {
            left: box.rect.x * scale,
            top: box.rect.y * scale,
            width: box.rect.width * scale,
            height: box.lines.length * lineHeight + Math.max(0, shift),
            color: cssColor(box.style.color),
            fontFamily: `"${previewFamily(box.style, box.original)}"`,
            fontSize: box.style.size * scale,
            fontWeight: box.style.bold ? 700 : 400,
            fontStyle: box.style.italic ? 'italic' : 'normal',
            lineHeight: `${lineHeight}px`,
            textAlign: box.style.align,
            transform: `rotate(${box.angle}deg)`,
          } as const;
          return onOpen ? (
            <button
              key={box.id}
              type="button"
              className={`edit-box edit-box-open${flag}`}
              style={style}
              aria-label={`Edit text: ${box.text.slice(0, 60)}`}
              onClick={(event) => {
                event.stopPropagation();
                onOpen(box);
              }}
            >
              {content}
            </button>
          ) : (
            <div key={box.id} className={`edit-box${flag}`} style={style}>
              {content}
            </div>
          );
        })}
    </>
  );
}
