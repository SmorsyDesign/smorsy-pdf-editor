import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, PDFDict, PDFName, PDFNumber } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import type { Annotation } from '../edits/annotations';
import type { FontBytes } from './choose-font';
import { PdfEditor } from './editor';

const fonts: FontBytes = {
  bundled: (file) => Promise.resolve(new Uint8Array(readFileSync(join('assets/fonts', file)))),
  system: () => Promise.resolve(null),
};

const white = { r: 1, g: 1, b: 1 };
// In display coordinates, so y is measured from the top of a 792 point page.
const whiteout: Annotation = {
  id: 'w',
  pageNumber: 1,
  color: white,
  kind: 'whiteout',
  width: 0,
  rect: { x: 60, y: 140, width: 300, height: 80 },
};

const under = { x: 72, y: 600, width: 200, height: 30 };
const elsewhere = { x: 72, y: 200, width: 200, height: 30 };

async function make(build: (doc: PDFDocument) => void): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  build(doc);
  return doc.save();
}

const whiteOut = (bytes: Uint8Array) =>
  new PdfEditor(bytes, fonts).saveWithReport([], [], { annotations: [whiteout] });

function addStamp(doc: PDFDocument, pageIndex = 0, withLook = true): void {
  const { context } = doc;
  const page = doc.getPage(pageIndex);
  const look = context.register(context.formXObject([], { BBox: [0, 0, 200, 30] }));
  const popup = context.register(context.obj({ Type: 'Annot', Subtype: 'Popup' }));
  const dict = context.obj({
    Type: 'Annot',
    Subtype: 'Stamp',
    Rect: [under.x, under.y, under.x + under.width, under.y + under.height],
    Popup: popup,
    ...(withLook ? { AP: { N: look } } : {}),
  });
  page.node.addAnnot(context.register(dict));
  page.node.addAnnot(popup);
}

const annotationCount = async (bytes: Uint8Array, pageIndex = 0) =>
  (await PDFDocument.load(bytes)).getPage(pageIndex).node.Annots()?.size() ?? 0;

const pageDrawing = async (bytes: Uint8Array) => {
  const page = (await PDFDocument.load(bytes)).getPage(0);
  const fields = page.node.Resources()?.lookup(PDFName.of('XObject'));
  return fields instanceof PDFDict ? fields.keys().map((key) => key.decodeText()) : [];
};

describe('a whiteout over something viewers paint on top', () => {
  it('moves a filled, see-through field into the page and says so', async () => {
    const { bytes, fieldsRetired, fieldsOnTop } = await whiteOut(
      await make((doc) => {
        const field = doc.getForm().createTextField('ssn');
        field.setText('123-45-6789');
        field.addToPage(doc.getPage(0), { ...under, borderWidth: 0 });
      }),
    );
    expect(fieldsRetired).toBe(1);
    expect(fieldsOnTop).toBe(0);
    expect(await annotationCount(bytes)).toBe(0);
    expect((await pageDrawing(bytes)).some((key) => key.includes('FieldLooks'))).toBe(true);
  });

  it('moves a ticked box into the page', async () => {
    const { bytes, fieldsRetired } = await whiteOut(
      await make((doc) => {
        const field = doc.getForm().createCheckBox('agree');
        field.addToPage(doc.getPage(0), { x: 80, y: 600, width: 20, height: 20 });
        field.check();
      }),
    );
    expect(fieldsRetired).toBe(1);
    expect(await annotationCount(bytes)).toBe(0);
  });

  it('keeps a radio group working, but with the covered button showing nothing', async () => {
    const { bytes } = await whiteOut(
      await make((doc) => {
        const group = doc.getForm().createRadioGroup('pick');
        group.addOptionToPage('a', doc.getPage(0), { x: 80, y: 600, width: 20, height: 20 });
        group.addOptionToPage('b', doc.getPage(0), { x: 80, y: 200, width: 20, height: 20 });
        group.select('a');
      }),
    );
    const saved = await PDFDocument.load(bytes);
    const [covered, other] = saved.getForm().getRadioGroup('pick').acroField.getWidgets();
    expect(saved.getForm().getRadioGroup('pick').getSelected()).toBe('a');
    expect(covered?.getAppearanceState()).not.toBe(PDFName.of('Off'));
    expect(other?.getOnValue()).toBeDefined();
  });

  it('leaves an empty field fillable', async () => {
    const { bytes, fieldsRetired } = await whiteOut(
      await make((doc) => {
        doc.getForm().createTextField('later').addToPage(doc.getPage(0), under);
      }),
    );
    expect(fieldsRetired).toBe(0);
    expect((await PDFDocument.load(bytes)).getForm().getFields()).toHaveLength(1);
  });

  it('leaves a field elsewhere on the page alone', async () => {
    const { bytes, fieldsRetired } = await whiteOut(
      await make((doc) => {
        const field = doc.getForm().createTextField('kept');
        field.setText('Kept');
        field.addToPage(doc.getPage(0), elsewhere);
      }),
    );
    expect(fieldsRetired).toBe(0);
    expect((await PDFDocument.load(bytes)).getForm().getFields()).toHaveLength(1);
  });

  it('moves an existing annotation into the page, along with its pop-up, and says so', async () => {
    const { bytes, annotationsRetired } = await whiteOut(
      await make((doc) => {
        addStamp(doc);
      }),
    );
    expect(annotationsRetired).toBe(1);
    expect(await annotationCount(bytes)).toBe(0);
  });

  it('warns about an annotation a viewer draws for itself, which can’t be moved', async () => {
    const { bytes, fieldsOnTop, annotationsRetired } = await whiteOut(
      await make((doc) => {
        addStamp(doc, 0, false);
      }),
    );
    expect(annotationsRetired).toBe(0);
    expect(fieldsOnTop).toBe(1);
    expect(await annotationCount(bytes)).toBe(2);
  });
});

describe('a list of annotations that pages share', () => {
  const sharing = () =>
    make((doc) => {
      const { context } = doc;
      doc.addPage([612, 792]);
      const stamp = context.register(
        context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 1, 1] }),
      );
      const shared = context.register(context.obj([stamp]));
      doc.getPage(0).node.set(PDFName.of('Annots'), shared);
      doc.getPage(1).node.set(PDFName.of('Annots'), shared);
    });

  const note: Annotation = {
    id: 'n',
    pageNumber: 1,
    color: white,
    kind: 'note',
    at: { x: 100, y: 100 },
    text: 'Only on the first page',
  };

  it('keeps a new annotation on the page it was made on', async () => {
    const bytes = await new PdfEditor(await sharing(), fonts).save([], [], { annotations: [note] });
    expect(await annotationCount(bytes, 0)).toBe(2);
    expect(await annotationCount(bytes, 1)).toBe(1);
  });

  it('keeps links a page inherits from further up the file', async () => {
    const original = await make((doc) => {
      const { context } = doc;
      const link = context.register(
        context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 1, 1] }),
      );
      doc
        .getPage(0)
        .node.Parent()
        ?.set(PDFName.of('Annots'), context.obj([link]));
    });
    const bytes = await new PdfEditor(original, fonts).save([], [], { annotations: [note] });
    expect(await annotationCount(bytes, 0)).toBe(2);
  });
});

describe('whiteout flags', () => {
  it('doesn’t count a hidden annotation, which nothing paints', async () => {
    const { annotationsRetired, fieldsOnTop } = await whiteOut(
      await make((doc) => {
        addStamp(doc);
        const list = doc.getPage(0).node.Annots();
        for (let index = 0; list && index < list.size(); index += 1) {
          list.lookup(index, PDFDict).set(PDFName.of('F'), PDFNumber.of(2));
        }
      }),
    );
    expect(annotationsRetired + fieldsOnTop).toBe(0);
  });
});
