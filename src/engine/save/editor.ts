import fontkit from '@cantoo/fontkit';
import {
  PDFDocument,
  PDFHexString,
  beginText,
  degrees,
  endText,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  rotateDegrees,
  setFillingRgbColor,
  setFontAndSize,
  showText,
  translate,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from '@cantoo/pdf-lib';
import { displayToUser, userAngle } from '../coordinates';
import type { Annotation, SavedSource } from '../edits/annotations';
import type { Color, PlacedSignature, TextBox } from '../edits/model';
import { UNSUPPORTED_TEXT, nameCharacter } from '../errors';
import { findEmbeddedFont, type EmbeddedFont } from '../fonts/embedded';
import { bundledFaceFile } from '../fonts/match';
import { placementInPdf } from '../signatures/placement';
import { readAnnotations, type ReadAnnotations } from './annotation-reading';
import {
  annotationBounds,
  removeSaved,
  updateForeign,
  writeAnnotation,
} from './annotation-writing';
import { fillFields, type FieldAnswers } from './field-filling';
import { clearFieldsUnder, clearForWhiteout, countSolidFieldsOver } from './form-fields';
import { lockAnswers } from './lock-answers';
import { giveOwnAnnotationList } from './page-annotations';
import { boundsOfWhiteout, drawWhiteout, pageBoxOf, textBoxBounds } from './page-geometry';
import { boundsOfPlacement, drawSignaturePicture } from './signature-drawing';
import { FontChooser, systemFontKey, type FontBytes, type FontOutcome } from './choose-font';

/** What else goes in a save, beyond text and signatures. */
export interface SaveExtras {
  /** New ones, and any already in the file that have changed. */
  readonly annotations?: readonly Annotation[];
  /** Ones already in the file that have been deleted. */
  readonly removedSaved?: readonly SavedSource[];
  readonly answers?: FieldAnswers;
  /** Makes answers part of the page. */
  readonly lock?: boolean;
}

export interface SaveReport {
  readonly bytes: Uint8Array;
  /** Filled-in form fields under an edit, which are now simply part of the page. */
  readonly fieldsRetired: number;
  /** Form fields left in place that could still hide an edit beneath them. */
  readonly fieldsOnTop: number;
  /** Existing annotations under a whiteout, which are now simply part of the page. */
  readonly annotationsRetired: number;
}

type DrawFont =
  | { readonly kind: 'pdf-font'; readonly font: PDFFont }
  | { readonly kind: 'embedded'; readonly font: EmbeddedFont };

function toRgb({ r, g, b }: Color) {
  return rgb(r, g, b);
}

/** Applies text edits to the original bytes. Every save starts again from those bytes. */
export class PdfEditor {
  private readonly original: Uint8Array;
  private readonly fonts: FontBytes;
  private readonly chooser: FontChooser;

  constructor(original: Uint8Array, fonts: FontBytes) {
    this.original = original;
    this.fonts = fonts;
    this.chooser = new FontChooser(() => this.load(), fonts);
  }

  private async load(): Promise<PDFDocument> {
    const doc = await PDFDocument.load(this.original.slice());
    doc.registerFontkit(fontkit);
    return doc;
  }

  /** Everything people have put on the pages already. */
  async existingAnnotations(): Promise<ReadAnnotations> {
    return readAnnotations(await this.load());
  }

  /** Which font an edit will use, and any characters that have no font. */
  resolveFont(box: TextBox): Promise<FontOutcome> {
    return this.chooser.resolve(box);
  }

  private async drawFont(
    doc: PDFDocument,
    page: PDFPage,
    box: TextBox,
    embedded: Map<string, Promise<PDFFont>>,
  ): Promise<DrawFont> {
    const outcome = await this.chooser.resolve(box);
    if (outcome.uncovered.length > 0) {
      throw new Error(UNSUPPORTED_TEXT + outcome.uncovered.map(nameCharacter).join(' '));
    }
    const once = (key: string, make: () => Promise<PDFFont>) => {
      let font = embedded.get(key);
      if (!font) {
        font = make();
        embedded.set(key, font);
      }
      return font;
    };

    if (outcome.used === 'embedded') {
      const font = findEmbeddedFont(page, doc.context, box.original?.name ?? '');
      if (font) return { kind: 'embedded', font };
    }
    if (outcome.used === 'standard') {
      const name = box.original?.name ?? 'Helvetica';
      return { kind: 'pdf-font', font: await once(name, () => doc.embedFont(name)) };
    }
    if (outcome.used === 'system') {
      const bytes = await this.chooser.systemFontBytes(box);
      if (bytes) {
        const font = await once(systemFontKey(box), () => doc.embedFont(bytes, { subset: true }));
        return { kind: 'pdf-font', font };
      }
    }
    const file = bundledFaceFile(outcome.family ?? 'sans', box.style.bold, box.style.italic);
    const font = await once(file, async () =>
      doc.embedFont(await this.fonts.bundled(file), { subset: true }),
    );
    return { kind: 'pdf-font', font };
  }

  private drawLines(page: PDFPage, box: TextBox, font: DrawFont): void {
    const pageBox = pageBoxOf(page);
    const unit = pageBox.unit ?? 1;
    const { size: displaySize, align, color } = box.style;
    const size = displaySize / unit;
    const radians = (box.angle * Math.PI) / 180;
    const along = { x: Math.cos(radians), y: Math.sin(radians) };
    const across = { x: -Math.sin(radians), y: Math.cos(radians) };
    const angle = userAngle(box.angle, pageBox.rotation);

    box.lines.forEach((line, index) => {
      if (line === '') return;
      const width =
        (font.kind === 'embedded'
          ? font.font.widthOf(line, size)
          : font.font.widthOfTextAtSize(line, size)) * unit;
      const indent =
        align === 'center'
          ? (box.rect.width - width) / 2
          : align === 'right'
            ? box.rect.width - width
            : 0;
      const down = box.firstBaseline + index * box.lineHeight;
      const origin = displayToUser(
        {
          x: box.rect.x + along.x * indent + across.x * down,
          y: box.rect.y + along.y * indent + across.y * down,
        },
        pageBox,
      );

      if (font.kind === 'pdf-font') {
        page.drawText(line, {
          x: origin.x,
          y: origin.y,
          size,
          font: font.font,
          color: toRgb(color),
          rotate: degrees(angle),
        });
        return;
      }
      const hex = font.font.encode(line);
      if (hex === null) throw new Error(`The file’s own font can’t draw this line: ${line}`);
      page.pushOperators(
        pushGraphicsState(),
        translate(origin.x, origin.y),
        rotateDegrees(angle),
        setFillingRgbColor(color.r, color.g, color.b),
        beginText(),
        setFontAndSize(font.font.resourceName, size),
        showText(PDFHexString.of(hex)),
        endText(),
        popGraphicsState(),
      );
    });
  }

  private drawCovers(page: PDFPage, box: TextBox): void {
    const pageBox = pageBoxOf(page);
    const unit = pageBox.unit ?? 1;
    for (const { rect, angle, color } of box.covers) {
      const radians = (angle * Math.PI) / 180;
      // PDF rectangles grow from their lower-left corner, which is the display's bottom left.
      const corner = displayToUser(
        {
          x: rect.x - Math.sin(radians) * rect.height,
          y: rect.y + Math.cos(radians) * rect.height,
        },
        pageBox,
      );
      page.drawRectangle({
        x: corner.x,
        y: corner.y,
        width: rect.width / unit,
        height: rect.height / unit,
        rotate: degrees(userAngle(angle, pageBox.rotation)),
        color: toRgb(color),
        borderWidth: 0,
      });
    }
  }

  private async drawSignatures(
    doc: PDFDocument,
    page: PDFPage,
    signatures: readonly PlacedSignature[],
    pictures: Map<string, Promise<PDFImage>>,
  ): Promise<void> {
    const pageBox = pageBoxOf(page);
    for (const { rect, angle, image } of signatures) {
      // One picture in the file, however many times it's placed.
      let picture = pictures.get(image.id);
      if (!picture) {
        picture = doc.embedPng(image.png);
        pictures.set(image.id, picture);
      }
      drawSignaturePicture(page, await picture, placementInPdf(rect, angle, pageBox));
    }
  }

  private fieldFont(doc: PDFDocument): Promise<PDFFont> {
    // Not a subset, because a form stays fillable afterwards with any letter.
    return this.fonts
      .bundled(bundledFaceFile('sans', false, false))
      .then((bytes) => doc.embedFont(bytes));
  }

  /** Also says what happened to form fields, so the person can be told. */
  async saveWithReport(
    boxes: readonly TextBox[],
    signatures: readonly PlacedSignature[],
    { annotations: changed = [], removedSaved = [], answers = [], lock = false }: SaveExtras = {},
  ): Promise<SaveReport> {
    // A note being retyped can be empty at the moment of saving, and it's no note until it has words.
    const annotations = changed.filter(
      (annotation) => annotation.kind !== 'comment' || annotation.text.trim() !== '',
    );
    const doc = await this.load();
    // Before anything else touches a page, because filling and locking change these lists too.
    for (const page of doc.getPages()) giveOwnAnnotationList(page);
    const embedded = new Map<string, Promise<PDFFont>>();
    const pictures = new Map<string, Promise<PDFImage>>();
    // First, so that a field's looks are up to date when anything else needs to move them.
    if (answers.length > 0 || lock) {
      const font = await this.fieldFont(doc);
      fillFields(doc, answers, font);
      if (lock) lockAnswers(doc, font);
    }
    // Before anything else looks at the pages, so what's being replaced can't be mistaken for
    // something a new whiteout has to deal with.
    for (const source of removedSaved) removeSaved(doc.getPage(source.pageNumber - 1), source);
    // All of them, because a saved comment emptied just now still has its old words to erase.
    for (const annotation of changed) {
      const { saved } = annotation;
      if (saved?.foreign) updateForeign(doc.getPage(saved.pageNumber - 1), annotation);
      else if (saved) removeSaved(doc.getPage(saved.pageNumber - 1), saved);
    }
    const pageNumbers = new Set(
      [...boxes, ...signatures, ...annotations].map((item) => item.pageNumber),
    );
    let fieldsRetired = 0;
    let fieldsOnTop = 0;
    let annotationsRetired = 0;
    for (const pageNumber of pageNumbers) {
      const page = doc.getPage(pageNumber - 1);
      const pageBox = pageBoxOf(page);
      const onPage = boxes.filter((box) => box.pageNumber === pageNumber);
      const signed = signatures.filter((signature) => signature.pageNumber === pageNumber);
      const marks = annotations.filter(
        (annotation) => annotation.pageNumber === pageNumber && !annotation.saved?.foreign,
      );
      const whiteouts = marks.filter((mark) => mark.kind === 'whiteout');
      const beneath = clearForWhiteout(
        page,
        whiteouts.map((mark) => boundsOfWhiteout(mark, pageBox)),
      );
      fieldsRetired += beneath.retired;
      fieldsOnTop += beneath.onTop;
      annotationsRetired += beneath.annotations;
      // First, because anything drawn before a field's looks moved to the page would be under them.
      const cleared = clearFieldsUnder(page, [
        ...onPage.filter((box) => box.lines.length > 0).map((box) => textBoxBounds(box, pageBox)),
        ...signed.map(({ rect, angle }) => boundsOfPlacement(placementInPdf(rect, angle, pageBox))),
      ]);
      fieldsRetired += cleared.retired;
      fieldsOnTop += cleared.onTop;
      // Under everything else, so new text can go on a space that's been cleared.
      for (const mark of whiteouts) drawWhiteout(page, mark, pageBox);
      // All covers go first, so a patch can never hide another box's new text.
      for (const box of onPage) this.drawCovers(page, box);
      for (const box of onPage) {
        if (box.lines.length > 0) {
          this.drawLines(page, box, await this.drawFont(doc, page, box, embedded));
        }
      }
      // Last, because the screen shows signatures on top of everything else on the page.
      await this.drawSignatures(doc, page, signed, pictures);
      for (const mark of marks) writeAnnotation(page, mark, pageBox);
      fieldsOnTop += countSolidFieldsOver(
        page,
        marks.flatMap((mark) => annotationBounds(mark, pageBox) ?? []),
      );
    }
    return {
      bytes: await doc.save({ updateFieldAppearances: false }),
      fieldsRetired,
      fieldsOnTop,
      annotationsRetired,
    };
  }

  async save(
    boxes: readonly TextBox[],
    signatures: readonly PlacedSignature[] = [],
    extras?: SaveExtras,
  ): Promise<Uint8Array> {
    return (await this.saveWithReport(boxes, signatures, extras)).bytes;
  }
}
