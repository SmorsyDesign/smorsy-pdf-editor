import {
  PDFArray,
  PDFContentStream,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFStream,
  PDFString,
  concatTransformationMatrix,
  decodePDFRawStream,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
  type PDFContext,
  type PDFDocument,
  type PDFObject,
  type PDFPage,
} from '@cantoo/pdf-lib';
import {
  annotationsOver,
  boundsAround,
  isWidget,
  name,
  numbersIn,
  rectOf,
  removeAnnotation,
  type UserBounds,
} from './page-annotations';

const MAX_FIELD_DEPTH = 16;

// Drawing commands that paint an area: fills, shadings and images or nested drawings.
const PAINTS_AREA = /(^|\s)([fFbB]\*?|sh|Do)(\s|$)/;

const HEX_STRINGS = /<[0-9a-fA-F\s]*>/g;

const PUSH_BUTTON = 65536;

/** What's showing now, including the drawing for the state a checkbox or radio button is in. */
export function currentLook(context: PDFContext, annotation: PDFDict): PDFStream | null {
  const appearances = context.lookup(annotation.get(name('AP')));
  if (!(appearances instanceof PDFDict)) return null;
  const normal = context.lookup(appearances.get(name('N')));
  if (normal instanceof PDFStream) return normal;
  const state = context.lookup(annotation.get(name('AS')));
  if (!(normal instanceof PDFDict) || !(state instanceof PDFName)) return null;
  const drawing = context.lookup(normal.get(state));
  return drawing instanceof PDFStream ? drawing : null;
}

function appearanceOf(context: PDFContext, widget: PDFDict): PDFStream | null {
  const appearances = context.lookup(widget.get(name('AP')));
  if (!(appearances instanceof PDFDict)) return null;
  const normal = context.lookup(appearances.get(name('N')));
  return normal instanceof PDFStream ? normal : null;
}

/** Text in an appearance could otherwise read as a drawing command. Strings can nest. */
function withoutStrings(drawing: string): string {
  let kept = '';
  let depth = 0;
  for (let at = 0; at < drawing.length; at += 1) {
    const character = drawing.charAt(at);
    if (depth > 0 && character === '\\') at += 1;
    else if (character === '(') depth += 1;
    else if (character === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0) kept += character;
  }
  return kept.replace(HEX_STRINGS, ' ');
}

/** A drawing from the file is compressed, while one made during this save isn't yet. */
function contentsOf(appearance: PDFStream): Uint8Array {
  if (appearance instanceof PDFRawStream) return decodePDFRawStream(appearance).decode();
  if (appearance instanceof PDFContentStream) return appearance.getUnencodedContents();
  throw new Error('This form field’s drawing is in an unknown format.');
}

/** Whether a field paints a solid area, which would hide a signature beneath it. */
function paintsSolid(context: PDFContext, widget: PDFDict, appearance: PDFStream): boolean {
  if (hasBackground(context, widget)) return true;
  try {
    const drawing = new TextDecoder('latin1').decode(contentsOf(appearance));
    return PAINTS_AREA.test(withoutStrings(drawing));
  } catch {
    // If its drawing can't be read, it's safest to assume that it could cover the signature.
    return true;
  }
}

/** Draws what an annotation shows into the page itself, fitted to its box as a viewer would. */
export function drawLooksIntoPage(
  page: PDFPage,
  annotation: PDFDict,
  appearance: PDFStream,
): boolean {
  const { context } = page.doc;
  const rect = rectOf(context, annotation);
  const box = numbersIn(context, appearance.dict.get(name('BBox')));
  const [boxLeft = 0, boxBottom = 0, boxRight = 0, boxTop = 0] = box;
  if (!rect || boxRight === boxLeft || boxTop === boxBottom) return false;

  const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = numbersIn(
    context,
    appearance.dict.get(name('Matrix')),
  );
  const { left, right, bottom, top } = boundsAround(
    [
      [boxLeft, boxBottom],
      [boxRight, boxBottom],
      [boxLeft, boxTop],
      [boxRight, boxTop],
    ].map(([x = 0, y = 0]) => ({ x: a * x + c * y + e, y: b * x + d * y + f })),
  );
  const scaleX = (rect.right - rect.left) / (right - left);
  const scaleY = (rect.top - rect.bottom) / (top - bottom);

  const appearanceRef = context.getObjectRef(appearance);
  if (!appearanceRef) return false;
  const key = page.node.newXObject('FieldLooks', appearanceRef);
  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(
      scaleX,
      0,
      0,
      scaleY,
      rect.left - left * scaleX,
      rect.bottom - bottom * scaleY,
    ),
    drawObject(key),
    popGraphicsState(),
  );
  return true;
}

/** Leaves a field showing nothing, keeping the state a checkbox or radio button is in. */
function blankLooks(context: PDFContext, widget: PDFDict, appearance: PDFStream): void {
  const box = numbersIn(context, appearance.dict.get(name('BBox')));
  const empty = context.register(context.formXObject([], { BBox: [...box] }));
  const state = context.lookup(widget.get(name('AS')));
  const normal = context.lookup(context.lookup(widget.get(name('AP')), PDFDict).get(name('N')));
  const stateful = normal instanceof PDFDict && state instanceof PDFName;
  widget.set(
    name('AP'),
    context.obj({ N: stateful ? context.obj({ [state.decodeText()]: empty }) : empty }),
  );
  const looks = context.lookup(widget.get(name('MK')));
  if (looks instanceof PDFDict) {
    looks.delete(name('BG'));
    looks.delete(name('BC'));
  }
}

/**
 * Viewers always paint form fields last, in whatever order the file lists them, so nothing can sit
 * on top of a solid one. So what the field shows moves down into the page, where other things can
 * go over it.
 */
function moveFieldLooksIntoPage(page: PDFPage, widget: PDFDict, appearance: PDFStream): boolean {
  if (!drawLooksIntoPage(page, widget, appearance)) return false;
  blankLooks(page.doc.context, widget, appearance);
  return true;
}

/** The value a field holds, which a widget can inherit from its parent field. */
export function hasValue(context: PDFContext, widget: PDFDict): boolean {
  let current: PDFDict | undefined = widget;
  for (let depth = 0; current && depth < MAX_FIELD_DEPTH; depth += 1) {
    const kind = context.lookup(current.get(name('FT')));
    const value = context.lookup(current.get(name('V')));
    // Buttons hold a state rather than something typed, and their looks come from that state.
    if (kind === name('Btn')) return false;
    if (value instanceof PDFString || value instanceof PDFHexString) {
      return value.decodeText() !== '';
    }
    // A multiple choice list holds an array, and a long value can be held as a stream.
    if (value instanceof PDFArray) return value.size() > 0;
    if (value instanceof PDFRawStream) return true;
    const parent: PDFObject | undefined = context.lookup(current.get(name('Parent')));
    current = parent instanceof PDFDict ? parent : undefined;
  }
  return false;
}

/**
 * With its value now part of the page, leaving the field in place would mean changing it later
 * left the old text showing underneath. So it stops being a field, as long as nothing else
 * depends on it. Resolves to whether it did.
 */
function retireField(doc: PDFDocument, widget: PDFDict): boolean {
  try {
    const form = doc.getForm();
    const field = form
      .getFields()
      .find((candidate) => candidate.acroField.getWidgets().some((other) => other.dict === widget));
    if (!field || field.acroField.getWidgets().length !== 1) return false;
    form.removeField(field);
    return true;
  } catch (error) {
    // A malformed form shouldn't stop the save. The field stays, and is already see-through.
    console.warn('A form field could not be removed.', error);
    return false;
  }
}

/** Field settings can be held by the widget or inherited from any field above it. */
function inherited(context: PDFContext, widget: PDFDict, key: string): PDFObject | undefined {
  let current: PDFDict | undefined = widget;
  for (let depth = 0; current && depth < MAX_FIELD_DEPTH; depth += 1) {
    const value: PDFObject | undefined = context.lookup(current.get(name(key)));
    if (value) return value;
    const parent: PDFObject | undefined = context.lookup(current.get(name('Parent')));
    current = parent instanceof PDFDict ? parent : undefined;
  }
  return undefined;
}

function isPushButton(context: PDFContext, widget: PDFDict): boolean {
  const flags = inherited(context, widget, 'Ff');
  return (
    inherited(context, widget, 'FT') === name('Btn') &&
    flags instanceof PDFNumber &&
    (flags.asNumber() & PUSH_BUTTON) !== 0
  );
}

function hasBackground(context: PDFContext, widget: PDFDict): boolean {
  const looks = context.lookup(widget.get(name('MK')));
  return looks instanceof PDFDict && numbersIn(context, looks.get(name('BG'))).length > 0;
}

export interface ClearedFields {
  /** Filled-in fields that are now simply part of the page. */
  readonly retired: number;
  /** Fields left in place that could still hide what's beneath them, which the person must hear. */
  readonly onTop: number;
}

export interface ClearedForWhiteout extends ClearedFields {
  /** Existing annotations that are now simply part of the page. */
  readonly annotations: number;
}

/** Whether a ticked box or chosen radio button is showing that state. */
const isSwitchedOn = (context: PDFContext, widget: PDFDict) => {
  const state = context.lookup(widget.get(name('AS')));
  return state instanceof PDFName && state !== name('Off');
};

/**
 * A whiteout has to hide everything beneath it, but viewers paint annotations and fields over the
 * page, even see-through ones. So whatever they'd paint there moves down into the page first.
 */
export function clearForWhiteout(page: PDFPage, areas: readonly UserBounds[]): ClearedForWhiteout {
  const { doc } = page;
  const { context } = doc;
  const found = new Set(areas.flatMap((area) => annotationsOver(page, area)));
  let retired = 0;
  let onTop = 0;
  let annotations = 0;
  for (const annotation of found) {
    const widget = isWidget(context, annotation);
    const look = currentLook(context, annotation);
    if (widget && isPushButton(context, annotation)) {
      onTop += 1;
    } else if (!look || !drawLooksIntoPage(page, annotation, look)) {
      // Nothing to move, so it's only a problem if a viewer would draw something by itself.
      if (!widget || hasBackground(context, annotation) || hasValue(context, annotation)) {
        onTop += 1;
      }
    } else if (widget) {
      const holdsAnswer = hasValue(context, annotation) || isSwitchedOn(context, annotation);
      blankLooks(context, annotation, look);
      if (holdsAnswer && retireField(doc, annotation)) retired += 1;
    } else {
      removeAnnotation(page, annotation);
      annotations += 1;
    }
  }
  return { retired, onTop, annotations };
}

/** How many solid fields would cover annotations, which can't go in the page beneath them. */
export function countSolidFieldsOver(page: PDFPage, areas: readonly UserBounds[]): number {
  const { context } = page.doc;
  const widgets = new Set(
    areas.flatMap((area) =>
      annotationsOver(page, area).filter((annotation) => isWidget(context, annotation)),
    ),
  );
  return [...widgets].filter((widget) => {
    const appearance = appearanceOf(context, widget);
    return appearance ? paintsSolid(context, widget, appearance) : hasBackground(context, widget);
  }).length;
}

/** Makes solid form fields safe to draw over, where that can be done. */
export function clearFieldsUnder(page: PDFPage, areas: readonly UserBounds[]): ClearedFields {
  const { doc } = page;
  const { context } = doc;
  const widgets = new Set(
    areas.flatMap((area) =>
      annotationsOver(page, area).filter((annotation) => isWidget(context, annotation)),
    ),
  );
  let retired = 0;
  let onTop = 0;
  for (const widget of widgets) {
    const appearance = appearanceOf(context, widget);
    if (!appearance) {
      // No single drawing to move, such as a checkbox's states, or one a viewer draws itself.
      if (hasBackground(context, widget)) onTop += 1;
    } else if (paintsSolid(context, widget, appearance)) {
      // A form's own button is left working, rather than turned into a picture of a button.
      if (isPushButton(context, widget)) {
        onTop += 1;
      } else {
        const holdsValue = hasValue(context, widget);
        const moved = moveFieldLooksIntoPage(page, widget, appearance);
        if (!moved) onTop += 1;
        else if (holdsValue && retireField(doc, widget)) retired += 1;
      }
    }
  }
  return { retired, onTop };
}
