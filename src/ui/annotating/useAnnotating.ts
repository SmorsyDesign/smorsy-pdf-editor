import { useEffect, useRef, useState } from 'react';
import {
  LINE_WIDTH,
  WHITE,
  annotationMovedTo,
  defaultRect,
  mergedLines,
  type Annotation,
  type MarkupKind,
} from '../../engine/edits/annotations';
import type { Color, Rect } from '../../engine/edits/model';
import { LETTER_PAGE, type PageSize } from '../../engine/zoom';
import type { DocumentEditor } from '../editing/useDocumentEditor';

export type AnnotationTool = Annotation['kind'];

export interface Swatch {
  readonly name: string;
  /** Pale enough to read text through. */
  readonly marker: Color;
  /** Strong enough to see as a line. */
  readonly ink: Color;
}

const hex = (value: string): Color => ({
  r: parseInt(value.slice(1, 3), 16) / 255,
  g: parseInt(value.slice(3, 5), 16) / 255,
  b: parseInt(value.slice(5, 7), 16) / 255,
});

export const SWATCHES: readonly Swatch[] = [
  { name: 'yellow', marker: hex('#ffe98a'), ink: hex('#a66a00') },
  { name: 'green', marker: hex('#a8e6b0'), ink: hex('#1a7f37') },
  { name: 'pink', marker: hex('#f7b6c2'), ink: hex('#c8102e') },
  { name: 'blue', marker: hex('#9fd4f5'), ink: hex('#0b66a0') },
];

const MARKUP_TOOLS: ReadonlySet<AnnotationTool> = new Set(['highlight', 'underline', 'strikeout']);
export const isMarkupTool = (tool: AnnotationTool | null): tool is MarkupKind =>
  tool !== null && MARKUP_TOOLS.has(tool);

/** How wide a default arrow is. */
const ARROW_LENGTH = 96;

/** What a tool's annotation looks like, and how it behaves. */
export function useAnnotating(
  editor: DocumentEditor,
  active: boolean,
  pageSizes: readonly (PageSize | undefined)[],
) {
  const { apply, annotations } = editor;
  const [tool, setTool] = useState<AnnotationTool | null>('highlight');
  const [swatch, setSwatch] = useState<Swatch>(SWATCHES[0] as Swatch);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  // Kept out of the edit log until it has words, so one left empty changes nothing about the file.
  const [newNote, setNewNote] = useState<Annotation | null>(null);
  // Asked for once, because focusing whenever a page reappears would steal it and move the view.
  const [focusId, setFocusId] = useState<string | null>(null);

  const shown = newNote ? [...annotations, newNote] : annotations;
  const selected = shown.find((annotation) => annotation.id === selectedId) ?? null;
  const moving = selected && movingId === selected.id ? selected : null;

  useEffect(() => {
    if (active) return;
    setSelectedId(null);
    setMovingId(null);
    setOpenNoteId(null);
    setNewNote(null);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (movingId) setMovingId(null);
      else setTool(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [active, movingId]);

  const colorFor = (kind: AnnotationTool, from: Swatch = swatch): Color => {
    if (kind === 'whiteout') return WHITE;
    return kind === 'highlight' || kind === 'note' ? from.marker : from.ink;
  };

  const add = (annotation: Annotation, focus = false) => {
    apply({ kind: 'add-annotation', annotation });
    if (focus) {
      setSelectedId(annotation.id);
      setFocusId(annotation.id);
    }
  };

  /** A note opens to be typed in. Its own text box takes focus, so nothing else should ask for it. */
  const startNote = (note: Annotation) => {
    setNewNote(note);
    setOpenNoteId(note.id);
    setSelectedId(note.id);
    // One note at a time: a click on the page shouldn't leave another one behind this one.
    setTool(null);
  };

  const change = (annotation: Annotation, group?: string) => {
    if (newNote?.id !== annotation.id) {
      apply({ kind: 'change-annotation', annotation }, group);
    } else if (annotation.kind === 'note' && annotation.text.trim() !== '') {
      apply({ kind: 'add-annotation', annotation }, group);
      setNewNote(null);
    } else {
      setNewNote(annotation);
    }
  };

  const remove = (id: string) => {
    if (newNote?.id === id) setNewNote(null);
    else apply({ kind: 'remove-annotation', id });
    setSelectedId(null);
    setMovingId(null);
    setOpenNoteId(null);
  };

  const base = (kind: AnnotationTool, pageNumber: number) => ({
    id: crypto.randomUUID(),
    pageNumber,
    color: colorFor(kind),
  });

  /** A shape, arrow or note at a point, for when there's been no dragging to give it a size. */
  const placeAt = (
    kind: AnnotationTool,
    pageNumber: number,
    centre: { readonly x: number; readonly y: number },
    focus = false,
  ) => {
    const start = base(kind, pageNumber);
    const page = pageSizes[pageNumber - 1] ?? LETTER_PAGE;
    let annotation: Annotation | null = null;
    if (kind === 'rect' || kind === 'ellipse' || kind === 'whiteout') {
      annotation = { ...start, kind, rect: defaultRect(centre), width: LINE_WIDTH };
    } else if (kind === 'arrow') {
      annotation = {
        ...start,
        kind,
        from: { x: centre.x - ARROW_LENGTH / 2, y: centre.y },
        to: { x: centre.x + ARROW_LENGTH / 2, y: centre.y },
        width: LINE_WIDTH,
      };
    } else if (kind === 'note') {
      annotation = { ...start, kind, at: centre, text: '' };
    }
    if (!annotation) return;
    const placed = annotationMovedTo(annotation, pageNumber, centre, page);
    if (placed.kind === 'note') startNote(placed);
    else add(placed, focus);
  };

  /** Marks text that's been worked out already, such as a whole line from the keyboard. */
  const markText = (kind: MarkupKind, pageNumber: number, rects: readonly Rect[], text: string) => {
    const lines = mergedLines(rects);
    if (lines.length === 0) return;
    add({ ...base(kind, pageNumber), kind, rects: lines, text: text.replace(/\s+/g, ' ').trim() });
  };

  const pickSwatch = (next: Swatch) => {
    setSwatch(next);
    if (selected && selected.kind !== 'whiteout') {
      change({ ...selected, color: colorFor(selected.kind, next) });
    }
  };

  const markTextRef = useRef(markText);
  markTextRef.current = markText;

  // Marks whatever text was just selected. It listens on the window, so it hears the pointer lift
  // wherever that happens, including on another page.
  const markupTool = isMarkupTool(tool) ? tool : null;
  useEffect(() => {
    if (!active || !markupTool) return;
    const onLift = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
      const clientRects = [...selection.getRangeAt(0).getClientRects()];
      const text = selection.toString();
      const sheets = document.querySelectorAll<HTMLElement>('[data-page]');
      for (const sheet of sheets) {
        const pageNumber = Number(sheet.dataset['page']);
        const page = pageSizes[pageNumber - 1];
        if (!page) continue;
        const bounds = sheet.getBoundingClientRect();
        const scale = bounds.width / page.width;
        const rects = clientRects
          .filter((rect) => rect.top < bounds.bottom && rect.bottom > bounds.top)
          .map((rect) => ({
            x: (rect.left - bounds.left) / scale,
            y: (rect.top - bounds.top) / scale,
            width: rect.width / scale,
            height: rect.height / scale,
          }));
        if (rects.length > 0) markTextRef.current(markupTool, pageNumber, rects, text);
      }
      selection.removeAllRanges();
    };
    window.addEventListener('pointerup', onLift);
    return () => {
      window.removeEventListener('pointerup', onLift);
    };
  }, [active, markupTool, pageSizes]);

  return {
    annotations: shown,
    tool,
    pickTool: (next: AnnotationTool) => {
      setTool((current) => (current === next ? null : next));
      setSelectedId(null);
      setMovingId(null);
    },
    clearTool: () => {
      setTool(null);
    },
    swatch,
    pickSwatch,
    colorFor,
    selected,
    select: (id: string | null) => {
      setSelectedId(id);
      setMovingId(null);
      if (id) setTool(null);
    },
    moving,
    toggleMoving: (id: string) => {
      setMovingId((current) => (current === id ? null : id));
    },
    moveFinished: (id: string) => {
      setMovingId(null);
      setFocusId(id);
    },
    openNoteId,
    toggleNote: (id: string) => {
      setOpenNoteId((current) => (current === id ? null : id));
    },
    closeNote: () => {
      setOpenNoteId(null);
    },
    focusId,
    focused: () => {
      setFocusId(null);
    },
    add,
    change,
    remove,
    placeAt,
    markText,
  };
}

export type Annotating = ReturnType<typeof useAnnotating>;
