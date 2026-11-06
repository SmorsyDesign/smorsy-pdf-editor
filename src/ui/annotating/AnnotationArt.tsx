import type { Annotation } from '../../engine/edits/annotations';
import type { Color, Rect } from '../../engine/edits/model';
import type { PageSize } from '../../engine/zoom';
import { cssInk } from '../signing/makeSignature';

const ARROW_HEAD = 10;

function arrowHead(annotation: Extract<Annotation, { kind: 'arrow' }>): string {
  const { from, to } = annotation;
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const barb = (turn: number) =>
    `${to.x - ARROW_HEAD * Math.cos(angle + turn)},${to.y - ARROW_HEAD * Math.sin(angle + turn)}`;
  return `M${barb(Math.PI / 6)} L${to.x},${to.y} L${barb(-Math.PI / 6)}`;
}

function Shape({ annotation }: { annotation: Annotation }) {
  const stroke = cssInk(annotation.color);
  switch (annotation.kind) {
    case 'pen':
      return (
        <polyline
          points={annotation.points.map((point) => `${point.x},${point.y}`).join(' ')}
          stroke={stroke}
          strokeWidth={annotation.width}
          fill="none"
        />
      );
    case 'rect':
      return (
        <rect {...annotation.rect} stroke={stroke} strokeWidth={annotation.width} fill="none" />
      );
    case 'ellipse': {
      const { x, y, width, height } = annotation.rect;
      return (
        <ellipse
          cx={x + width / 2}
          cy={y + height / 2}
          rx={width / 2}
          ry={height / 2}
          stroke={stroke}
          strokeWidth={annotation.width}
          fill="none"
        />
      );
    }
    case 'arrow':
      return (
        <>
          <line
            x1={annotation.from.x}
            y1={annotation.from.y}
            x2={annotation.to.x}
            y2={annotation.to.y}
            stroke={stroke}
            strokeWidth={annotation.width}
          />
          <path
            d={arrowHead(annotation)}
            stroke={stroke}
            strokeWidth={annotation.width}
            fill="none"
          />
        </>
      );
    case 'underline':
    case 'strikeout': {
      const position = annotation.kind === 'underline' ? 0.92 : 0.55;
      return annotation.rects.map((rect, index) => {
        const y = rect.y + rect.height * position;
        return (
          <line
            key={index}
            x1={rect.x}
            x2={rect.x + rect.width}
            y1={y}
            y2={y}
            stroke={stroke}
            strokeWidth={1.5}
          />
        );
      });
    }
    default:
      return null;
  }
}

interface AnnotationArtProps {
  readonly annotations: readonly Annotation[];
  readonly page: PageSize;
  readonly scale: number;
}

/**
 * Draws in page points, so it needs no working out at any zoom. Highlights and whiteout aren't
 * here: highlights blend with the page, and whiteout goes under text edits, as it does when saved.
 */
export function AnnotationArt({ annotations, page, scale }: AnnotationArtProps) {
  return (
    <svg
      className="annotation-art"
      viewBox={`0 0 ${page.width} ${page.height}`}
      width={page.width * scale}
      height={page.height * scale}
      aria-hidden="true"
    >
      {annotations.map((annotation) => (
        <Shape key={annotation.id} annotation={annotation} />
      ))}
    </svg>
  );
}

const placed = (rect: { x: number; y: number; width: number; height: number }, scale: number) => ({
  left: rect.x * scale,
  top: rect.y * scale,
  width: rect.width * scale,
  height: rect.height * scale,
});

/** What's painted beneath text edits, because it is when saved too. */
export function WhiteoutBoxes({
  annotations,
  scale,
  outlined = false,
}: {
  annotations: readonly Annotation[];
  scale: number;
  /** Shows where one is on blank paper, while annotating. It isn't part of the file. */
  outlined?: boolean;
}) {
  return annotations.flatMap((annotation) =>
    annotation.kind === 'whiteout'
      ? [
          <div
            key={annotation.id}
            className={outlined ? 'whiteout is-outlined' : 'whiteout'}
            style={placed(annotation.rect, scale)}
          />,
        ]
      : [],
  );
}

export function Highlights({
  annotations,
  scale,
}: {
  annotations: readonly Annotation[];
  scale: number;
}) {
  return annotations.flatMap((annotation) =>
    annotation.kind === 'highlight'
      ? annotation.rects.map((rect, index) => (
          <div
            key={`${annotation.id}-${index}`}
            className="annotation-highlight"
            style={{ ...placed(rect, scale), background: cssInk(annotation.color) }}
          />
        ))
      : [],
  );
}

export const noteColor = (color: Color) => cssInk(color);

const NOTE_CARD_WIDTH = 200;
const NOTE_CARD_HEIGHT = 112;
const NOTE_CARD_GAP = 8;

/** Under the pin, unless that would run off the page, so the words are never cut off. */
export function noteCardPlace(pin: Rect, scale: number, page: PageSize) {
  const left = pin.x * scale;
  const below = (pin.y + pin.height) * scale + NOTE_CARD_GAP;
  const fitsBelow = below + NOTE_CARD_HEIGHT <= page.height * scale;
  return {
    left: Math.round(Math.max(0, Math.min(left, page.width * scale - NOTE_CARD_WIDTH))),
    top: Math.round(
      fitsBelow ? below : Math.max(0, pin.y * scale - NOTE_CARD_GAP - NOTE_CARD_HEIGHT),
    ),
  };
}
