import type { Annotation } from './annotations';

const LABELS: Readonly<Record<Exclude<Annotation['kind'], 'foreign'>, string>> = {
  highlight: 'Highlight',
  underline: 'Underline',
  strikeout: 'Strikethrough',
  pen: 'Pen drawing',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  arrow: 'Arrow',
  comment: 'Comment',
  whiteout: 'Whiteout box',
};

const FOREIGN_LABELS: Readonly<Record<string, string>> = {
  Highlight: 'Highlight',
  Underline: 'Underline',
  StrikeOut: 'Strikethrough',
  Squiggly: 'Squiggly underline',
  Ink: 'Pen drawing',
  Square: 'Rectangle',
  Circle: 'Ellipse',
  Line: 'Line',
  PolyLine: 'Line',
  Polygon: 'Polygon',
  FreeText: 'Text box',
  Stamp: 'Stamp',
  Caret: 'Insertion mark',
  FileAttachment: 'Attached file',
};

export const annotationLabel = (annotation: Annotation) =>
  annotation.kind === 'foreign'
    ? (FOREIGN_LABELS[annotation.subtype] ?? 'Annotation')
    : LABELS[annotation.kind];

export type AnnotationCategory = 'comment' | 'markup' | 'drawing';

const FOREIGN_MARKUP: ReadonlySet<string> = new Set([
  'Highlight',
  'Underline',
  'StrikeOut',
  'Squiggly',
]);

/** Which tab of the panel something belongs on. */
export function annotationCategory(annotation: Annotation): AnnotationCategory {
  switch (annotation.kind) {
    case 'comment':
      return 'comment';
    case 'highlight':
    case 'underline':
    case 'strikeout':
      return 'markup';
    case 'foreign':
      return FOREIGN_MARKUP.has(annotation.subtype) ? 'markup' : 'drawing';
    default:
      return 'drawing';
  }
}
