import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  StandardFonts,
  degrees,
  rgb,
} from '@cantoo/pdf-lib';
import { OPS, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { testPng } from '../../../tests/helpers/test-png';
import { displayToUser } from '../coordinates';
import type { PlacedSignature, SignatureImage } from '../edits/model';
import { PdfEditor } from './editor';
import type { FontBytes } from './choose-font';

const fontBytes: FontBytes = {
  bundled: (file) => Promise.resolve(new Uint8Array(readFileSync(join('assets/fonts', file)))),
  system: () => Promise.resolve(null),
};

const original = (name: string) => new Uint8Array(readFileSync(join('test-pdfs', name)));

const image: SignatureImage = {
  id: 'image',
  png: testPng(40, 20),
  width: 40,
  height: 20,
  ink: null,
};

function placed(overrides: Partial<PlacedSignature> = {}): PlacedSignature {
  return {
    id: 'signed',
    pageNumber: 1,
    rect: { x: 100, y: 200, width: 120, height: 60 },
    angle: 0,
    image,
    ...overrides,
  };
}

type Matrix = readonly [number, number, number, number, number, number];
const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

/** Reads back where each image really lands, from the drawing commands in the saved file. */
async function imagesOn(bytes: Uint8Array, pageNumber: number): Promise<readonly Matrix[]> {
  const task = getDocument({ data: bytes.slice() });
  const doc = await task.promise;
  const page = await doc.getPage(pageNumber);
  const { fnArray, argsArray } = await page.getOperatorList();
  const images: Matrix[] = [];
  const stack: Matrix[] = [];
  let current: Matrix = [1, 0, 0, 1, 0, 0];
  fnArray.forEach((op, index) => {
    if (op === OPS.save) stack.push(current);
    else if (op === OPS.restore) current = stack.pop() ?? current;
    else if (op === OPS.transform) current = multiply(current, argsArray[index] as Matrix);
    else if (op === OPS.paintImageXObject) images.push(current);
  });
  await task.destroy();
  return images;
}

const middleOf = (m: Matrix) => ({
  x: m[0] * 0.5 + m[2] * 0.5 + m[4],
  y: m[1] * 0.5 + m[3] * 0.5 + m[5],
});
const sizeOf = (m: Matrix) => ({ width: Math.hypot(m[0], m[1]), height: Math.hypot(m[2], m[3]) });

describe('saving a placed signature', () => {
  it('draws it where it was placed, at the size it was placed', async () => {
    const saved = await new PdfEditor(original('01-plain-text.pdf'), fontBytes).save(
      [],
      [placed()],
    );
    const [drawn] = await imagesOn(saved, 1);
    if (!drawn) throw new Error('The signature wasn’t drawn.');
    expect(sizeOf(drawn).width).toBeCloseTo(120);
    expect(sizeOf(drawn).height).toBeCloseTo(60);
    expect(middleOf(drawn).x).toBeCloseTo(160);
    expect(middleOf(drawn).y).toBeCloseTo(792 - 230);
  });

  it('never changes the original bytes', async () => {
    const bytes = original('01-plain-text.pdf');
    const before = bytes.slice();
    await new PdfEditor(bytes, fontBytes).save([], [placed()]);
    expect(bytes).toEqual(before);
  });

  it('lands correctly on every page rotation', async () => {
    const bytes = original('06-rotated-pages.pdf');
    const doc = await PDFDocument.load(bytes);
    for (const pageNumber of [1, 2, 3, 4]) {
      const saved = await new PdfEditor(bytes, fontBytes).save([], [placed({ pageNumber })]);
      const page = doc.getPage(pageNumber - 1);
      const { x, y, width, height } = page.getMediaBox();
      const rotation = page.getRotation().angle;
      const [drawn] = await imagesOn(saved, pageNumber);
      if (!drawn) throw new Error('The signature wasn’t drawn.');
      const expected = displayToUser({ x: 160, y: 230 }, { x, y, width, height, rotation });
      expect(middleOf(drawn).x).toBeCloseTo(expected.x);
      expect(middleOf(drawn).y).toBeCloseTo(expected.y);
    }
  });

  it('keeps a turned signature’s middle in place', async () => {
    const saved = await new PdfEditor(original('01-plain-text.pdf'), fontBytes).save(
      [],
      [placed({ angle: 30 })],
    );
    const [drawn] = await imagesOn(saved, 1);
    if (!drawn) throw new Error('The signature wasn’t drawn.');
    expect(middleOf(drawn).x).toBeCloseTo(160);
    expect(middleOf(drawn).y).toBeCloseTo(792 - 230);
  });

  describe('matches the screen, corner by corner', () => {
    const rect = { x: 100, y: 120, width: 120, height: 60 };

    /** Where each corner of a signature shows on screen, from its rectangle and turn. */
    function screenCorners(angle: number) {
      const radians = (angle * Math.PI) / 180;
      const middle = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      return [
        [-rect.width / 2, rect.height / 2],
        [rect.width / 2, rect.height / 2],
        [-rect.width / 2, -rect.height / 2],
        [rect.width / 2, -rect.height / 2],
      ].map(([x = 0, y = 0]) => [
        middle.x + x * Math.cos(radians) - y * Math.sin(radians),
        middle.y + x * Math.sin(radians) + y * Math.cos(radians),
      ]);
    }

    async function pageWith(rotation: number, unit: number, cropped: boolean) {
      const doc = await PDFDocument.create();
      const page = doc.addPage([612, 792]);
      page.setMediaBox(30, 40, 612, 792);
      if (cropped) page.setCropBox(50, 70, 500, 600);
      page.setRotation(degrees(rotation));
      if (unit !== 1) page.node.set(PDFName.of('UserUnit'), doc.context.obj(unit));
      return doc.save();
    }

    for (const rotation of [0, 90, 180, 270]) {
      for (const angle of [0, 30, 90, 200]) {
        for (const unit of [1, 2]) {
          for (const cropped of [false, true]) {
            const name = `page ${rotation}, signature ${angle}, unit ${unit}, crop ${cropped}`;
            it(name, async () => {
              const bytes = await pageWith(rotation, unit, cropped);
              const saved = await new PdfEditor(bytes, fontBytes).save(
                [],
                [placed({ rect, angle })],
              );
              const task = getDocument({ data: saved.slice() });
              const doc = await task.promise;
              const page = await doc.getPage(1);
              const viewport = page.getViewport({ scale: 1 });
              await task.destroy();
              const [drawn] = await imagesOn(saved, 1);
              if (!drawn) throw new Error('The signature wasn’t drawn.');
              // The image's unit square, in the order that screenCorners lists them.
              const unitCorners = [
                [0, 0],
                [1, 0],
                [0, 1],
                [1, 1],
              ];
              const expected = screenCorners(angle);
              unitCorners.forEach(([u = 0, v = 0], index) => {
                const x = drawn[0] * u + drawn[2] * v + drawn[4];
                const y = drawn[1] * u + drawn[3] * v + drawn[5];
                const [screenX, screenY] = viewport.convertToViewportPoint(x, y) as [
                  number,
                  number,
                ];
                expect(screenX).toBeCloseTo(expected[index]?.[0] ?? NaN, 3);
                expect(screenY).toBeCloseTo(expected[index]?.[1] ?? NaN, 3);
              });
            });
          }
        }
      }
    }
  });

  it('draws two on one page, each with its own picture, where each was placed', async () => {
    const other: SignatureImage = { ...image, id: 'other', png: testPng(60, 20), width: 60 };
    const saved = await new PdfEditor(original('01-plain-text.pdf'), fontBytes).save(
      [],
      [
        placed(),
        placed({
          id: 'second',
          image: other,
          rect: { x: 300, y: 500, width: 90, height: 30 },
        }),
      ],
    );
    const drawn = await imagesOn(saved, 1);
    expect(drawn).toHaveLength(2);
    expect(middleOf(drawn[0] as Matrix).x).toBeCloseTo(160);
    expect(middleOf(drawn[1] as Matrix).x).toBeCloseTo(345);
    expect(middleOf(drawn[1] as Matrix).y).toBeCloseTo(792 - 515);
    const doc = await PDFDocument.load(saved);
    const pictures = doc.context
      .enumerateIndirectObjects()
      .filter(
        ([, object]) =>
          object instanceof PDFRawStream &&
          object.dict.get(PDFName.of('Subtype')) === PDFName.of('Image') &&
          object.dict.has(PDFName.of('SMask')),
      );
    expect(pictures).toHaveLength(2);
  });

  it('stores one picture however many times it’s placed', async () => {
    const three = await new PdfEditor(original('01-plain-text.pdf'), fontBytes).save(
      [],
      [placed(), placed({ id: 'two', pageNumber: 2 }), placed({ id: 'three', pageNumber: 3 })],
    );
    expect(await imagesOn(three, 2)).toHaveLength(1);
    expect(await imagesOn(three, 3)).toHaveLength(1);
    const doc = await PDFDocument.load(three);
    const pictures = doc.context.enumerateIndirectObjects().filter(([, object]) => {
      const dict = object instanceof PDFRawStream ? object.dict : null;
      return (
        dict?.get(PDFName.of('Subtype')) === PDFName.of('Image') && dict.has(PDFName.of('SMask'))
      );
    });
    expect(pictures).toHaveLength(1);
  });

  it('draws on top of edited text, as the screen shows it', async () => {
    const text = {
      id: 'text',
      pageNumber: 1,
      rect: { x: 100, y: 200, width: 300, height: 17 },
      angle: 0,
      text: 'Under the signature',
      lines: ['Under the signature'],
      firstBaseline: 12,
      lineHeight: 17,
      style: {
        font: 'sans' as const,
        size: 14,
        color: { r: 0, g: 0, b: 0 },
        bold: false,
        italic: false,
        align: 'left' as const,
      },
      covers: [],
      original: null,
    };
    const saved = await new PdfEditor(original('01-plain-text.pdf'), fontBytes).save(
      [text],
      [placed()],
    );
    const task = getDocument({ data: saved.slice() });
    const doc = await task.promise;
    const { fnArray } = await (await doc.getPage(1)).getOperatorList();
    await task.destroy();
    expect(fnArray.lastIndexOf(OPS.paintImageXObject)).toBeGreaterThan(
      fnArray.lastIndexOf(OPS.showText),
    );
  });

  describe('over a form field', () => {
    const name = '21-form-filled-field.pdf';
    const onField = () => placed({ rect: { x: 100, y: 200, width: 200, height: 40 } });
    const annotationsOn = async (bytes: Uint8Array) => {
      const task = getDocument({ data: bytes.slice() });
      const doc = await task.promise;
      const annotations = (await (await doc.getPage(1)).getAnnotations()) as {
        subtype: string;
        fieldType?: string;
        rect: number[];
      }[];
      await task.destroy();
      return annotations;
    };

    it('stays part of the page, with no stamp that fields would paint over', async () => {
      const saved = await new PdfEditor(original(name), fontBytes).save([], [onField()]);
      const annotations = await annotationsOn(saved);
      expect(annotations.filter((item) => item.subtype === 'Stamp')).toHaveLength(0);
    });

    it('leaves the field in place and fillable', async () => {
      const saved = await new PdfEditor(original(name), fontBytes).save([], [onField()]);
      const doc = await PDFDocument.load(saved);
      const fields = doc.getForm().getFields();
      expect(fields.map((field) => field.getName())).toEqual(['signature-line']);
      doc.getForm().getTextField('signature-line').setText('Still works');
      expect(doc.getForm().getTextField('signature-line').getText()).toBe('Still works');
    });

    it('moves the field’s background out of the field, so it can’t cover anything', async () => {
      const saved = await new PdfEditor(original(name), fontBytes).save([], [onField()]);
      const doc = await PDFDocument.load(saved);
      const [widget] = doc.getForm().getTextField('signature-line').acroField.getWidgets();
      const looks = doc.context.lookup(widget?.dict.get(PDFName.of('MK')));
      expect(looks instanceof PDFDict && looks.has(PDFName.of('BG'))).toBe(false);
    });

    it('leaves a field alone when the signature is elsewhere', async () => {
      const elsewhere = placed({ rect: { x: 100, y: 500, width: 200, height: 40 } });
      const saved = await new PdfEditor(original(name), fontBytes).save([], [elsewhere]);
      const doc = await PDFDocument.load(saved);
      const [widget] = doc.getForm().getTextField('signature-line').acroField.getWidgets();
      const looks = doc.context.lookup(widget?.dict.get(PDFName.of('MK')));
      expect(looks instanceof PDFDict && looks.has(PDFName.of('BG'))).toBe(true);
    });

    it('leaves a see-through field as it is', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([612, 792]);
      doc.getForm().createTextField('clear').addToPage(page, {
        x: 100,
        y: 552,
        width: 200,
        height: 40,
        borderWidth: 0,
      });
      const saved = await new PdfEditor(await doc.save(), fontBytes).save([], [onField()]);
      const appearance = (await PDFDocument.load(saved))
        .getForm()
        .getTextField('clear')
        .acroField.getWidgets()[0]
        ?.getNormalAppearance();
      expect(appearance).toBeDefined();
      expect(await imagesOn(saved, 1)).toHaveLength(1);
    });
  });

  describe('over a filled-in form field', () => {
    const name = '22-form-filled-value.pdf';
    const onField = () => placed({ rect: { x: 100, y: 200, width: 200, height: 40 } });

    it('makes it part of the page, and says so', async () => {
      const report = await new PdfEditor(original(name), fontBytes).saveWithReport([], [onField()]);
      expect(report.fieldsRetired).toBe(1);
      const doc = await PDFDocument.load(report.bytes);
      expect(doc.getForm().getFields()).toHaveLength(0);
      expect(doc.getPage(0).node.Annots()?.size() ?? 0).toBe(0);
    });

    it('keeps the value showing', async () => {
      const saved = await new PdfEditor(original(name), fontBytes).save([], [onField()]);
      const task = getDocument({ data: saved.slice() });
      const page = await (await task.promise).getPage(1);
      const { fnArray } = await page.getOperatorList();
      await task.destroy();
      expect(fnArray).toContain(OPS.showText);
    });

    it('reports nothing when the signature is elsewhere', async () => {
      const report = await new PdfEditor(original(name), fontBytes).saveWithReport(
        [],
        [placed({ rect: { x: 100, y: 500, width: 200, height: 40 } })],
      );
      expect(report.fieldsRetired).toBe(0);
      expect((await PDFDocument.load(report.bytes)).getForm().getFields()).toHaveLength(1);
    });
  });

  describe('awkward form fields', () => {
    const onField = () => placed({ rect: { x: 100, y: 200, width: 200, height: 40 } });
    const widgetOf = (doc: PDFDocument, field: string) => {
      const [widget] = doc.getForm().getTextField(field).acroField.getWidgets();
      if (!widget) throw new Error('The field has no widget.');
      return widget;
    };
    const filledForm = async (change: (doc: PDFDocument) => void = () => undefined) => {
      const doc = await PDFDocument.load(original('22-form-filled-value.pdf'));
      change(doc);
      return doc.save();
    };

    it('a malformed form doesn’t stop the save', async () => {
      const bytes = await filledForm((doc) => {
        const form = doc.catalog.getAcroForm();
        const fields = form?.dict.lookup(PDFName.of('Fields'));
        if (fields instanceof PDFArray) fields.push(doc.context.obj(5));
      });
      const report = await new PdfEditor(bytes, fontBytes).saveWithReport([], [onField()]);
      expect(report.fieldsRetired).toBe(0);
      expect(await imagesOn(report.bytes, 1)).toHaveLength(1);
    });

    it('a solid field that doesn’t print still moves, so the signature shows', async () => {
      const bytes = await filledForm((doc) => {
        widgetOf(doc, 'name').dict.set(PDFName.of('F'), doc.context.obj(0));
      });
      const report = await new PdfEditor(bytes, fontBytes).saveWithReport([], [onField()]);
      expect(report.fieldsOnTop).toBe(0);
      expect(report.fieldsRetired).toBe(1);
    });

    it('a form’s own button stays working, and the person is told', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([612, 792]);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const button = doc.getForm().createButton('submit');
      button.addToPage('Submit', page, {
        x: 100,
        y: 552,
        width: 200,
        height: 40,
        font,
        backgroundColor: rgb(0.8, 0.8, 0.8),
      });
      const report = await new PdfEditor(await doc.save(), fontBytes).saveWithReport(
        [],
        [onField()],
      );
      expect(report.fieldsOnTop).toBe(1);
      expect((await PDFDocument.load(report.bytes)).getForm().getFields()).toHaveLength(1);
    });

    it('a field whose looks can’t be moved stays, and the person is told', async () => {
      const bytes = await filledForm((doc) => {
        const appearance = widgetOf(doc, 'name').getNormalAppearance();
        const stream = doc.context.lookup(appearance);
        if (stream instanceof PDFRawStream) {
          stream.dict.set(PDFName.of('BBox'), doc.context.obj([0, 0, 0, 0]));
        }
      });
      const report = await new PdfEditor(bytes, fontBytes).saveWithReport([], [onField()]);
      expect(report.fieldsRetired).toBe(0);
      expect(report.fieldsOnTop).toBe(1);
      expect((await PDFDocument.load(report.bytes)).getForm().getFields()).toHaveLength(1);
    });

    it('text that looks like a drawing command doesn’t count as solid', async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([612, 792]);
      const field = doc.getForm().createTextField('clear');
      field.addToPage(page, { x: 100, y: 552, width: 200, height: 40, borderWidth: 0 });
      const widget = widgetOf(doc, 'clear');
      const looks = doc.context.flateStream('BT (see (b) or f more) Tj ET', {
        BBox: [0, 0, 200, 40],
        Subtype: 'Form',
      });
      widget.dict.set(PDFName.of('AP'), doc.context.obj({ N: doc.context.register(looks) }));
      const report = await new PdfEditor(await doc.save(), fontBytes).saveWithReport(
        [],
        [onField()],
      );
      expect(report.fieldsRetired).toBe(0);
      const saved = await PDFDocument.load(report.bytes);
      expect(saved.getForm().getFields()).toHaveLength(1);
    });

    it('a choice list holding several values counts as filled in', async () => {
      const bytes = await filledForm((doc) => {
        const { dict } = widgetOf(doc, 'name');
        dict.set(PDFName.of('V'), doc.context.obj(['One', 'Two'].map(PDFHexString.fromText)));
      });
      const report = await new PdfEditor(bytes, fontBytes).saveWithReport([], [onField()]);
      expect(report.fieldsRetired).toBe(1);
    });
  });

  it('moves a solid field out of the way of text too, drawing the text after it', async () => {
    const stamp = {
      id: 'text',
      pageNumber: 1,
      rect: { x: 110, y: 210, width: 150, height: 17 },
      angle: 0,
      text: 'On the field',
      lines: ['On the field'],
      firstBaseline: 12,
      lineHeight: 17,
      style: {
        font: 'sans' as const,
        size: 14,
        color: { r: 0, g: 0, b: 0 },
        bold: false,
        italic: false,
        align: 'left' as const,
      },
      covers: [],
      original: null,
    };
    const saved = await new PdfEditor(original('21-form-filled-field.pdf'), fontBytes).save([
      stamp,
    ]);
    const doc = await PDFDocument.load(saved);
    const [widget] = doc.getForm().getTextField('signature-line').acroField.getWidgets();
    const looks = doc.context.lookup(widget?.dict.get(PDFName.of('MK')));
    expect(looks instanceof PDFDict && looks.has(PDFName.of('BG'))).toBe(false);
    const task = getDocument({ data: saved.slice() });
    const { fnArray } = await (await (await task.promise).getPage(1)).getOperatorList();
    await task.destroy();
    // The original label, then the field's fill, then the new text on top of it.
    expect(fnArray.lastIndexOf(OPS.showText)).toBeGreaterThan(fnArray.indexOf(OPS.rectangle));
  });

  it('becomes a stamp over other annotations, whose order viewers respect', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const note = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Square',
      Rect: [100, 552, 300, 592],
      F: 4,
    });
    page.node.addAnnot(doc.context.register(note));
    const saved = await new PdfEditor(await doc.save(), fontBytes).save(
      [],
      [placed({ rect: { x: 100, y: 200, width: 200, height: 40 } })],
    );
    const task = getDocument({ data: saved.slice() });
    const reopened = await task.promise;
    const annotations = (await (await reopened.getPage(1)).getAnnotations()) as {
      subtype: string;
      rect: number[];
    }[];
    await task.destroy();
    expect(annotations.at(-1)?.subtype).toBe('Stamp');
    expect(annotations.at(-1)?.rect[0]).toBeCloseTo(100);
    expect(annotations.at(-1)?.rect[3]).toBeCloseTo(792 - 200);
  });

  it('isn’t treated as under a link, which paints nothing', async () => {
    const name = '11-annotations-links.pdf';
    const doc = await PDFDocument.load(original(name));
    const links = doc.getPage(0).node.Annots();
    expect(links?.size()).toBeGreaterThan(0);
    const saved = await new PdfEditor(original(name), fontBytes).save(
      [],
      [placed({ rect: { x: 0, y: 700, width: 60, height: 30 } })],
    );
    expect(await imagesOn(saved, 1)).toHaveLength(1);
  });

  it('keeps forms and page count', async () => {
    const name = '08-fillable-form.pdf';
    const before = await PDFDocument.load(original(name));
    const after = await PDFDocument.load(
      await new PdfEditor(original(name), fontBytes).save([], [placed()]),
    );
    expect(after.getPageCount()).toBe(before.getPageCount());
    expect(after.getForm().getFields().length).toBe(before.getForm().getFields().length);
  });

  it('fails plainly on an image that isn’t a PNG', async () => {
    const bad = placed({ image: { ...image, png: new Uint8Array([1, 2, 3]) } });
    await expect(
      new PdfEditor(original('01-plain-text.pdf'), fontBytes).save([], [bad]),
    ).rejects.toThrow();
  });
});
