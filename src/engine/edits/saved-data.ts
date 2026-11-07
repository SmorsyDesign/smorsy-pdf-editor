import type { Point } from '../coordinates';
import type { Annotation } from './annotations';
import type { Rect } from './model';

/** Dictionary keys of our own. PDF allows them, and other apps ignore what they don't know. */
export const DRAWING_KEY = 'SmorsyAnnotation';
export const TAGS_KEY = 'SmorsyTags';

export const MAX_TAGS = 50;
const MAX_TAG_LENGTH = 60;
// A PDF page can't be bigger than this, so anything further away is a damaged or hostile file.
const LARGEST_COORDINATE = 100_000;
const MOST_POINTS = 200_000;
// Far past a real pen stroke, and short enough that a hostile one can't hold up reading the file.
export const LONGEST_DRAWING = 8_000_000;

/** The geometry that a saved annotation's appearance can't give back. */
export type SavedDrawing =
  | { readonly kind: 'highlight' | 'underline' | 'strikeout'; readonly rects: readonly Rect[] }
  | { readonly kind: 'pen'; readonly points: readonly Point[]; readonly width: number }
  | { readonly kind: 'rect' | 'ellipse'; readonly rect: Rect; readonly width: number }
  | {
      readonly kind: 'arrow';
      readonly from: Point;
      readonly to: Point;
      readonly width: number;
    }
  | { readonly kind: 'comment'; readonly at: Point };

const round = (value: number) => Math.round(value * 100) / 100;
const roundedPoint = ({ x, y }: Point): Point => ({ x: round(x), y: round(y) });
const roundedRect = (rect: Rect): Rect => ({
  ...roundedPoint(rect),
  width: round(rect.width),
  height: round(rect.height),
});

/** What to keep in the file so this annotation can be edited again, or null if it can't be. */
export function drawingOf(annotation: Annotation): SavedDrawing | null {
  switch (annotation.kind) {
    case 'highlight':
    case 'underline':
    case 'strikeout':
      return { kind: annotation.kind, rects: annotation.rects.map(roundedRect) };
    case 'pen':
      return {
        kind: 'pen',
        points: annotation.points.map(roundedPoint),
        width: annotation.width,
      };
    case 'rect':
    case 'ellipse':
      return { kind: annotation.kind, rect: roundedRect(annotation.rect), width: annotation.width };
    case 'arrow':
      return {
        kind: 'arrow',
        from: roundedPoint(annotation.from),
        to: roundedPoint(annotation.to),
        width: annotation.width,
      };
    case 'comment':
      return { kind: 'comment', at: roundedPoint(annotation.at) };
    default:
      return null;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCoordinate = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= LARGEST_COORDINATE;

function pointFrom(value: unknown): Point | null {
  if (!isRecord(value)) return null;
  const { x, y } = value;
  return isCoordinate(x) && isCoordinate(y) ? { x, y } : null;
}

function rectFrom(value: unknown): Rect | null {
  if (!isRecord(value)) return null;
  const { x, y, width, height } = value;
  return isCoordinate(x) && isCoordinate(y) && isCoordinate(width) && isCoordinate(height)
    ? { x, y, width, height }
    : null;
}

function listFrom<T>(value: unknown, read: (item: unknown) => T | null): readonly T[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MOST_POINTS) return null;
  const items: T[] = [];
  for (const item of value as readonly unknown[]) {
    const read_ = read(item);
    if (read_ === null) return null;
    items.push(read_);
  }
  return items;
}

const widthFrom = (value: unknown) =>
  isCoordinate(value) && value > 0 && value <= 100 ? value : null;

function drawingFromRecord(data: Record<string, unknown>): SavedDrawing | null {
  const { kind } = data;
  if (kind === 'highlight' || kind === 'underline' || kind === 'strikeout') {
    const rects = listFrom(data['rects'], rectFrom);
    return rects && { kind, rects };
  }
  if (kind === 'pen') {
    const points = listFrom(data['points'], pointFrom);
    const width = widthFrom(data['width']);
    return points && width !== null ? { kind, points, width } : null;
  }
  if (kind === 'rect' || kind === 'ellipse') {
    const rect = rectFrom(data['rect']);
    const width = widthFrom(data['width']);
    return rect && width !== null ? { kind, rect, width } : null;
  }
  if (kind === 'arrow') {
    const from = pointFrom(data['from']);
    const to = pointFrom(data['to']);
    const width = widthFrom(data['width']);
    return from && to && width !== null ? { kind, from, to, width } : null;
  }
  if (kind === 'comment') {
    const at = pointFrom(data['at']);
    return at && { kind, at };
  }
  return null;
}

function parsed(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    // Anyone can write anything in a file, so this just means it isn't ours to trust.
    return null;
  }
}

/** Reads what a file says about a drawing. A file can say anything, so nothing is assumed. */
export function readDrawing(json: string): SavedDrawing | null {
  if (json === '') return null;
  const data = parsed(json);
  return isRecord(data) ? drawingFromRecord(data) : null;
}

/** The same tag in different capitals is the same tag, spelled as it was first typed. */
function tidiedTags(tags: readonly string[]): readonly string[] {
  const kept = new Map<string, string>();
  for (const tag of tags) {
    const clean = tag.replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH);
    const key = clean.toLowerCase();
    if (clean !== '' && !kept.has(key)) kept.set(key, clean);
  }
  return [...kept.values()];
}

/** The tags for one annotation, up to the most it can have. */
export function cleanTags(tags: readonly string[]): readonly string[] {
  return tidiedTags(tags).slice(0, MAX_TAGS);
}

export function readTags(json: string): readonly string[] {
  const data = parsed(json);
  if (!Array.isArray(data)) return [];
  return cleanTags((data as readonly unknown[]).filter((tag) => typeof tag === 'string'));
}

/** Every tag in use, in alphabetical order, for offering and filtering. */
export function allTags(annotations: readonly Annotation[]): readonly string[] {
  return [...tidiedTags(annotations.flatMap((annotation) => annotation.tags ?? []))].sort(
    (one, two) => one.localeCompare(two, undefined, { numeric: true }),
  );
}
