import {
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFString,
  type PDFContext,
  type PDFDocument,
  type PDFObject,
  type PDFPage,
} from '@cantoo/pdf-lib';
import { eraseAnnotation } from './annotation-erasing';
import {
  appearanceOf,
  blankLooks,
  currentLook,
  drawLooksIntoPage,
  hasBackground,
  moveFieldLooksIntoPage,
  paintsSolid,
} from './field-looks';
import { annotationsOver, isWidget, name, type UserBounds } from './page-annotations';

const MAX_FIELD_DEPTH = 16;

const PUSH_BUTTON = 65536;

/** A field's settings can sit on the widget or on any field above it. */
function* fieldAndParents(context: PDFContext, widget: PDFDict): Generator<PDFDict> {
  let current: PDFDict | undefined = widget;
  for (let depth = 0; current && depth < MAX_FIELD_DEPTH; depth += 1) {
    yield current;
    const parent: PDFObject | undefined = context.lookup(current.get(name('Parent')));
    current = parent instanceof PDFDict ? parent : undefined;
  }
}

/** Whether a field holds a value, which a widget can inherit from its parent field. */
export function hasValue(context: PDFContext, widget: PDFDict): boolean {
  for (const level of fieldAndParents(context, widget)) {
    const kind = context.lookup(level.get(name('FT')));
    const value = context.lookup(level.get(name('V')));
    // Buttons hold a state rather than something typed, and their looks come from that state.
    if (kind === name('Btn')) return false;
    if (value instanceof PDFString || value instanceof PDFHexString) {
      return value.decodeText() !== '';
    }
    // A multiple choice list holds an array, and a long value can be held as a stream.
    if (value instanceof PDFArray) return value.size() > 0;
    if (value instanceof PDFRawStream) return true;
  }
  return false;
}

/**
 * With its value now part of the page, leaving the field in place would mean changing it later
 * left the old text showing underneath. So it stops being a field, as long as nothing else
 * depends on it. Says whether it did.
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

function inherited(context: PDFContext, widget: PDFDict, key: string): PDFObject | undefined {
  for (const level of fieldAndParents(context, widget)) {
    const value: PDFObject | undefined = context.lookup(level.get(name(key)));
    if (value) return value;
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

interface ClearedFields {
  /** Filled-in fields that are now simply part of the page. */
  readonly retired: number;
  /** Fields left in place that could still hide what's beneath them, which the person must hear. */
  readonly onTop: number;
}

interface ClearedForWhiteout extends ClearedFields {
  /** Existing annotations that are now simply part of the page. */
  readonly annotations: number;
}

/** Whether a ticked box or chosen radio button is showing that state. */
const isSwitchedOn = (context: PDFContext, widget: PDFDict) => {
  const state = context.lookup(widget.get(name('AS')));
  return state instanceof PDFName && state !== name('Off');
};

function widgetsOver(page: PDFPage, areas: readonly UserBounds[]): ReadonlySet<PDFDict> {
  const { context } = page.doc;
  return new Set(
    areas.flatMap((area) =>
      annotationsOver(page, area).filter((annotation) => isWidget(context, annotation)),
    ),
  );
}

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
      // Its look has just gone into the page, which is what keeps that from being erased with it.
      eraseAnnotation(page, annotation);
      annotations += 1;
    }
  }
  return { retired, onTop, annotations };
}

/** How many solid fields would cover annotations, which can't go in the page beneath them. */
export function countSolidFieldsOver(page: PDFPage, areas: readonly UserBounds[]): number {
  const { context } = page.doc;
  return [...widgetsOver(page, areas)].filter((widget) => {
    const appearance = appearanceOf(context, widget);
    return appearance ? paintsSolid(context, widget, appearance) : hasBackground(context, widget);
  }).length;
}

/** Makes solid form fields safe to draw over, where that can be done. */
export function clearFieldsUnder(page: PDFPage, areas: readonly UserBounds[]): ClearedFields {
  const { doc } = page;
  const { context } = doc;
  let retired = 0;
  let onTop = 0;
  for (const widget of widgetsOver(page, areas)) {
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
