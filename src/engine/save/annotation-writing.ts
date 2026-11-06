import { popGraphicsState, pushGraphicsState, type PDFPage } from '@cantoo/pdf-lib';
import type { PageBox } from '../coordinates';
import type { Annotation } from '../edits/annotations';
import { BLEND_NAME, drawnAnnotation, type Drawn } from './annotation-drawing';
import { boundsAround, type UserBounds } from './page-annotations';

const PRINT_FLAG = 4;
const HIGHLIGHT_BLEND = 'Multiply';
// Room for line ends, which reach half a line's width past the points they join.
const STROKE_ROOM = 2;

function boundsWithRoom({ points }: Drawn): UserBounds {
  const { left, right, bottom, top } = boundsAround(points);
  return {
    left: left - STROKE_ROOM,
    right: right + STROKE_ROOM,
    bottom: bottom - STROKE_ROOM,
    top: top + STROKE_ROOM,
  };
}

/** Where an annotation lands in the PDF, including room for how thick its lines are. */
export function annotationBounds(annotation: Annotation, box: PageBox): UserBounds | null {
  const drawn = drawnAnnotation(annotation, box);
  return drawn && boundsWithRoom(drawn);
}

/**
 * Adds a real annotation, so it stays editable in other PDF apps. Its appearance is drawn in page
 * coordinates, which makes it right on rotated pages without any further working out.
 */
export function writeAnnotation(page: PDFPage, annotation: Annotation, box: PageBox): void {
  const drawn = drawnAnnotation(annotation, box);
  if (!drawn) return;
  const bounds = boundsWithRoom(drawn);
  const { context } = page.doc;
  const { r, g, b } = annotation.color;
  const appearance = context.formXObject(
    [pushGraphicsState(), ...drawn.operators, popGraphicsState()],
    {
      BBox: [bounds.left, bounds.bottom, bounds.right, bounds.top],
      Resources: drawn.blend ? { ExtGState: { [BLEND_NAME]: { BM: HIGHLIGHT_BLEND } } } : {},
    },
  );
  const dict = context.obj({
    Type: 'Annot',
    Subtype: drawn.subtype,
    Rect: [bounds.left, bounds.bottom, bounds.right, bounds.top],
    C: [r, g, b],
    F: PRINT_FLAG,
    AP: { N: context.register(appearance) },
    ...drawn.extra,
  });
  page.node.addAnnot(context.register(dict));
}
