import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import type { Rect, TextStyle } from '../../engine/edits/model';
import type { PageSize } from '../../engine/zoom';
import { Icon } from '../Icon';
import { FormatBar } from './FormatBar';
import { previewFamily } from './preview';
import type { TextDraft } from './drafts';

export interface TextEditorHandle {
  commit(): void;
}

interface TextEditorProps {
  readonly draft: TextDraft;
  readonly page: PageSize;
  readonly scale: number;
  readonly timesAvailable: boolean;
  readonly handleRef: RefObject<TextEditorHandle | null>;
  readonly onCommit: (text: string, rect: Rect, style: TextStyle) => void;
  readonly onCancel: () => void;
}

const MIN_WIDTH = 24;
const KEY_STEP = 4;
const BAR_ROOM_POINTS = 48;

export function TextEditor({
  draft,
  page,
  scale,
  timesAvailable,
  handleRef,
  onCommit,
  onCancel,
}: TextEditorProps) {
  const [text, setText] = useState(draft.text);
  const [rect, setRect] = useState(draft.rect);
  const [style, setStyle] = useState(draft.style);
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(handleRef, () => ({
    commit: () => {
      onCommit(text, rect, style);
    },
  }));

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, []);

  // The box grows with what's typed, as the text will when it's saved.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = '0px';
    field.style.height = `${field.scrollHeight}px`;
  }, [text, style, rect.width, scale]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onCommit(text, rect, style);
    }
  };

  const drag = (
    event: PointerEvent<HTMLButtonElement>,
    update: (dx: number, dy: number, start: Rect) => Rect,
  ) => {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const start = rect;
    const originX = event.clientX;
    const originY = event.clientY;
    const onMove = (move: globalThis.PointerEvent) => {
      setRect(update((move.clientX - originX) / scale, (move.clientY - originY) / scale, start));
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      fieldRef.current?.focus();
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  };

  const moved = (dx: number, dy: number, start: Rect): Rect => ({
    ...start,
    x: Math.min(page.width - 8, Math.max(0, start.x + dx)),
    y: Math.min(page.height - 8, Math.max(0, start.y + dy)),
  });
  const resized = (dx: number, _dy: number, start: Rect): Rect => ({
    ...start,
    width: Math.max(MIN_WIDTH, start.width + dx),
  });

  const nudge = (event: KeyboardEvent<HTMLButtonElement>, resizing: boolean) => {
    const steps: Readonly<Record<string, readonly [number, number]>> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    setRect((current) => (resizing ? resized : moved)(step[0], step[1], current));
  };

  return (
    <div
      className={draft.substituted ? 'edit-open substituted' : 'edit-open'}
      data-testid="text-editor"
      style={{
        left: rect.x * scale,
        top: rect.y * scale,
        width: rect.width * scale,
        transform: `rotate(${draft.angle}deg)`,
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <FormatBar
        style={style}
        original={draft.original}
        timesAvailable={timesAvailable}
        placeBelow={rect.y < BAR_ROOM_POINTS}
        onChange={setStyle}
        onDelete={() => {
          onCommit('', rect, style);
        }}
      />
      <textarea
        ref={fieldRef}
        aria-label="Text"
        spellCheck={false}
        value={text}
        rows={1}
        style={{
          color: `rgb(${style.color.r * 255} ${style.color.g * 255} ${style.color.b * 255})`,
          fontFamily: `"${previewFamily(style, draft.original)}"`,
          fontSize: style.size * scale,
          fontWeight: style.bold ? 700 : 400,
          fontStyle: style.italic ? 'italic' : 'normal',
          lineHeight: `${draft.lineHeight * scale}px`,
          textAlign: style.align,
        }}
        onChange={(event) => {
          setText(event.target.value);
        }}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        className="edit-grip edit-move"
        aria-label="Move text. Use the arrow keys."
        title="Drag to move"
        onPointerDown={(event) => {
          drag(event, moved);
        }}
        onKeyDown={(event) => {
          nudge(event, false);
        }}
      >
        <Icon name="move" />
      </button>
      <button
        type="button"
        className="edit-grip edit-resize"
        aria-label="Resize text box. Use the left and right arrow keys."
        title="Drag to resize"
        onPointerDown={(event) => {
          drag(event, resized);
        }}
        onKeyDown={(event) => {
          nudge(event, true);
        }}
      />
    </div>
  );
}
