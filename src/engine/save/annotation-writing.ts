import {
  PDFDict,
  PDFHexString,
  PDFRef,
  popGraphicsState,
  pushGraphicsState,
  type PDFPage,
} from '@cantoo/pdf-lib';
import type { PageBox } from '../coordinates';
import type { Annotation, SavedSource } from '../edits/annotations';
import { DRAWING_KEY, TAGS_KEY, cleanTags, drawingOf } from '../edits/saved-data';
import { BLEND_NAME, drawnAnnotation, type Drawn } from './annotation-drawing';
import { boundsAround, name, removeAnnotation, type UserBounds } from './page-annotations';

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

const hex = (value: unknown) => PDFHexString.fromText(JSON.stringify(value));

/** What lets this app edit it again after reopening, which other apps ignore. */
function keptData(annotation: Annotation) {
  const tags = cleanTags(annotation.tags ?? []);
  return {
    [DRAWING_KEY]: hex(drawingOf(annotation)),
    ...(tags.length > 0 ? { [TAGS_KEY]: hex(tags) } : {}),
  };
}

/** The object a saved annotation's name refers to, as long as this page really lists it. */
function findSaved(page: PDFPage, { ref }: SavedSource) {
  const match = /^(\d+)R(\d*)$/.exec(ref);
  if (!match) return null;
  const wanted = PDFRef.of(Number(match[1]), Number(match[2] ?? 0));
  const listed = page.node.Annots()?.asArray().includes(wanted);
  return listed === true ? page.doc.context.lookupMaybe(wanted, PDFDict) : null;
}

/** Takes a saved annotation off its page, because something's replacing it or it's been deleted. */
export function removeSaved(page: PDFPage, source: SavedSource): void {
  const dict = findSaved(page, source);
  if (dict) removeAnnotation(page, dict);
}

/** Changes what's safe to change about another app's annotation, leaving how it looks alone. */
export function updateForeign(page: PDFPage, annotation: Annotation): void {
  if (!annotation.saved) return;
  const dict = findSaved(page, annotation.saved);
  if (!dict) return;
  if (annotation.kind === 'comment') {
    dict.set(name('Contents'), PDFHexString.fromText(annotation.text));
  }
  const tags = cleanTags(annotation.tags ?? []);
  if (tags.length > 0) dict.set(name(TAGS_KEY), hex(tags));
  else dict.delete(name(TAGS_KEY));
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
    ...keptData(annotation),
  });
  page.node.addAnnot(context.register(dict));
}
