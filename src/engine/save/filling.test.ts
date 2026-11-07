import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFStream,
  PDFString,
} from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { openDocument } from '../document';
import { PLAIN_PROBLEM, UNSUPPORTED_TEXT } from '../errors';
import type { FontBytes } from './choose-font';
import { PdfEditor } from './editor';
import type { FieldAnswers } from './field-filling';

const fonts: FontBytes = {
  bundled: (file) => Promise.resolve(new Uint8Array(readFileSync(join('assets/fonts', file)))),
  system: () => Promise.resolve(null),
};

async function blankForm(build: (doc: PDFDocument) => void): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  build(doc);
  return doc.save();
}

const fill = (bytes: Uint8Array, answers: FieldAnswers, lock = false) =>
  new PdfEditor(bytes, fonts).save([], [], { answers, lock });

const box = { x: 72, y: 600, width: 200, height: 40 };

describe('text answers', () => {
  const notes = () =>
    blankForm((doc) => {
      const field = doc.getForm().createTextField('notes');
      field.enableMultiline();
      field.addToPage(doc.getPage(0), box);
    });

  it('can have line breaks, which no font needs to draw', async () => {
    const saved = await PDFDocument.load(
      await fill(await notes(), [['notes', 'one\ntwo\r\nthree']]),
    );
    expect(saved.getForm().getTextField('notes').getText()).toContain('two');
  });

  it('still stops for a letter no font has', async () => {
    await expect(fill(await notes(), [['notes', '日本']])).rejects.toThrow(UNSUPPORTED_TEXT);
  });

  it('says which field couldn’t take an answer that’s too long', async () => {
    const limited = await blankForm((doc) => {
      const field = doc.getForm().createTextField('student.first_name');
      field.setMaxLength(3);
      field.addToPage(doc.getPage(0), box);
    });
    const failure = fill(limited, [['student.first_name', 'Too long']]);
    await expect(failure).rejects.toThrow(PLAIN_PROBLEM);
    await expect(failure).rejects.toThrow('Student first name');
  });

  it('says so when a field has gone from the file', async () => {
    await expect(fill(await notes(), [['elsewhere', 'x']])).rejects.toThrow(PLAIN_PROBLEM);
  });
});

describe('choices with a stored value that differs from what’s shown', () => {
  const STATES = [
    ['CA', 'California'],
    ['AK', 'Alaska'],
  ];

  const withStates = (make: 'dropdown' | 'list') =>
    blankForm((doc) => {
      const form = doc.getForm();
      const field =
        make === 'dropdown' ? form.createDropdown('state') : form.createOptionList('state');
      field.addToPage(doc.getPage(0), box);
      field.acroField.dict.set(
        PDFName.of('Opt'),
        doc.context.obj(STATES.map((pair) => pair.map((text) => PDFHexString.fromText(text)))),
      );
    });

  const stored = async (bytes: Uint8Array) => {
    const doc = await PDFDocument.load(bytes);
    const value = doc.getForm().getField('state').acroField.dict.lookup(PDFName.of('V'));
    return value instanceof PDFHexString || value instanceof PDFString ? value.decodeText() : null;
  };

  for (const make of ['dropdown', 'list'] as const) {
    it(`a ${make} holds the stored value, and reads back as what’s shown`, async () => {
      const saved = await fill(await withStates(make), [['state', 'Alaska']]);
      expect(await stored(saved)).toBe('AK');
      const doc = await openDocument(saved);
      const [field] = await doc.formFields();
      await doc.close();
      expect(field?.value).toBe('Alaska');
    });
  }

  it('shows the words rather than the stored value when locked', async () => {
    const saved = await fill(await withStates('dropdown'), [['state', 'Alaska']], true);
    const doc = await openDocument(saved);
    const { blocks } = await doc.pageText(1);
    await doc.close();
    const text = blocks.map((block) => block.text).join(' ');
    expect(text).toContain('Alaska');
    expect(text).not.toContain('AK');
  });

  it('stops for a choice no font can draw', async () => {
    const japanese = await blankForm((doc) => {
      const field = doc.getForm().createDropdown('place');
      field.addToPage(doc.getPage(0), box);
      field.acroField.dict.set(PDFName.of('Opt'), doc.context.obj([PDFHexString.fromText('東京')]));
    });
    await expect(fill(japanese, [['place', '東京']])).rejects.toThrow(UNSUPPORTED_TEXT);
  });
});

describe('same-named boxes with different meanings', () => {
  const yesNo = () =>
    blankForm((doc) => {
      const field = doc.getForm().createCheckBox('agree');
      const page = doc.getPage(0);
      field.addToPage(page, { x: 72, y: 600, width: 20, height: 20 });
      field.addToPage(page, { x: 120, y: 600, width: 20, height: 20 });
      const second = field.acroField.getWidgets()[1];
      const normal = second?.getAppearances()?.normal;
      if (!second || !normal || !('lookup' in normal)) throw new Error('No states to rename.');
      const on = normal.get(PDFName.of('Yes'));
      normal.delete(PDFName.of('Yes'));
      if (on) normal.set(PDFName.of('No'), on);
    });

  it('read as one choice between them', async () => {
    const doc = await openDocument(await yesNo());
    const fields = await doc.formFields();
    await doc.close();
    expect(fields.map((field) => [field.kind, field.onValue])).toEqual([
      ['radio', 'Yes'],
      ['radio', 'No'],
    ]);
  });

  it('save the one that was picked, and only that one', async () => {
    const saved = await PDFDocument.load(await fill(await yesNo(), [['agree', 'No']]));
    const field = saved.getForm().getField('agree');
    expect(field.acroField.dict.lookup(PDFName.of('V'))).toBe(PDFName.of('No'));
    expect(field.acroField.getWidgets().map((widget) => widget.getAppearanceState())).toEqual([
      PDFName.of('Off'),
      PDFName.of('No'),
    ]);
  });
});

describe('a list with several choices picked', () => {
  it('keeps their places in number order', async () => {
    const options = Array.from({ length: 12 }, (_, index) => `Option ${index}`);
    const form = await blankForm((doc) => {
      const field = doc.getForm().createOptionList('many');
      field.addOptions(options);
      field.enableMultiselect();
      field.addToPage(doc.getPage(0), box);
    });
    const saved = await PDFDocument.load(await fill(form, [['many', ['Option 10', 'Option 2']]]));
    const places = saved.getForm().getField('many').acroField.dict.lookup(PDFName.of('I'));
    expect(places).toBeInstanceOf(PDFArray);
    expect(places?.toString()).toBe('[ 2 10 ]');
  });
});

describe('locking answers', () => {
  it('stops rather than losing an answer it can’t draw', async () => {
    const plain = await blankForm((doc) => {
      const field = doc.getForm().createTextField('name');
      field.setText('Answer');
      field.addToPage(doc.getPage(0), box);
    });
    const broken = await PDFDocument.load(plain);
    const widget = broken.getForm().getField('name').acroField.getWidgets()[0];
    const normal = widget?.dict.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'));
    if (!(normal instanceof PDFStream)) throw new Error('No drawing to break.');
    normal.dict.set(PDFName.of('BBox'), broken.context.obj([0, 0, 0, 0]));
    await expect(fill(await broken.save(), [], true)).rejects.toThrow(PLAIN_PROBLEM);
  });

  it('doesn’t stop for a field with no size, which nobody can see', async () => {
    const form = await blankForm((doc) => {
      const field = doc.getForm().createTextField('tracking');
      field.setText('Internal');
      field.addToPage(doc.getPage(0), { x: 0, y: 0, width: 0, height: 0 });
    });
    const saved = await PDFDocument.load(await fill(form, [], true));
    expect(saved.getForm().getFields()).toHaveLength(0);
  });

  it('draws the words for a choice already in the file with no drawing of its own', async () => {
    const plain = await blankForm((doc) => {
      const field = doc.getForm().createDropdown('state');
      field.addToPage(doc.getPage(0), box);
      field.acroField.dict.set(
        PDFName.of('Opt'),
        doc.context.obj([[PDFHexString.fromText('AK'), PDFHexString.fromText('Alaska')]]),
      );
      field.acroField.dict.set(PDFName.of('V'), PDFHexString.fromText('AK'));
    });
    const stripped = await PDFDocument.load(plain);
    stripped.getForm().getField('state').acroField.getWidgets()[0]?.dict.delete(PDFName.of('AP'));
    // Saved without the library drawing it again, which is the case this is about.
    const noDrawing = await stripped.save({ updateFieldAppearances: false });
    const doc = await openDocument(await fill(noDrawing, [], true));
    const { blocks } = await doc.pageText(1);
    await doc.close();
    expect(blocks.map((block) => block.text).join(' ')).toContain('Alaska');
  });

  it('keeps links a page inherits from further up the file', async () => {
    const form = await blankForm((doc) => {
      const { context } = doc;
      const field = doc.getForm().createTextField('name');
      field.setText('Answer');
      field.addToPage(doc.getPage(0), box);
      const page = doc.getPage(0).node;
      const link = context.register(
        context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 1, 1] }),
      );
      const own = page.Annots();
      page.Parent()?.set(PDFName.of('Annots'), context.obj([link, ...(own?.asArray() ?? [])]));
      page.delete(PDFName.of('Annots'));
    });
    const saved = await PDFDocument.load(await fill(form, [], true));
    const list = saved.getPage(0).node.Annots();
    expect(list?.size()).toBe(1);
  });

  const pageTextOf = async (bytes: Uint8Array) => {
    const doc = await openDocument(bytes);
    const { blocks } = await doc.pageText(1);
    await doc.close();
    return blocks.map((block) => block.text).join(' ');
  };

  it('leaves a hidden field out of the page', async () => {
    const form = await blankForm((doc) => {
      const fields = doc.getForm();
      const hidden = fields.createTextField('internal');
      hidden.setText('Secret reference');
      hidden.addToPage(doc.getPage(0), { ...box, hidden: true });
      const shown = fields.createTextField('name');
      shown.setText('Shown answer');
      shown.addToPage(doc.getPage(0), { ...box, y: 500 });
    });
    const text = await pageTextOf(await fill(form, [], true));
    expect(text).toContain('Shown answer');
    expect(text).not.toContain('Secret reference');
  });

  it('keeps an empty signature field, so the form can still be signed', async () => {
    const original = new Uint8Array(readFileSync('test-pdfs/16-irs-form-w9.pdf'));
    const before = await PDFDocument.load(original);
    const signatures = before
      .getForm()
      .getFields()
      .filter((field) => field.constructor.name === 'PDFSignature').length;
    const saved = await PDFDocument.load(await fill(original, [], true));
    expect(saved.getForm().getFields()).toHaveLength(signatures);
  });

  it('leaves no empty form behind once every field is gone', async () => {
    const form = await blankForm((doc) => {
      const field = doc.getForm().createTextField('name');
      field.setText('Answer');
      field.addToPage(doc.getPage(0), box);
    });
    const saved = await PDFDocument.load(await fill(form, [], true));
    expect(saved.catalog.has(PDFName.of('AcroForm'))).toBe(false);
  });

  it('leaves a form’s own button out rather than a picture of it', async () => {
    const form = await blankForm((doc) => {
      const button = doc.getForm().createButton('print');
      button.addToPage('Print this form', doc.getPage(0), box);
    });
    expect(await pageTextOf(await fill(form, [], true))).not.toContain('Print this form');
  });

  it('fits a look whose drawing is offset, the way a viewer would', async () => {
    const plain = await blankForm((doc) => {
      const field = doc.getForm().createTextField('name');
      field.setText('Offset answer');
      field.addToPage(doc.getPage(0), box);
    });
    const shifted = await PDFDocument.load(plain);
    const widget = shifted.getForm().getField('name').acroField.getWidgets()[0];
    const normal = widget?.dict.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'));
    if (!(normal instanceof PDFStream)) throw new Error('No drawing to offset.');
    normal.dict.set(PDFName.of('Matrix'), shifted.context.obj([1, 0, 0, 1, 300, 300]));
    const doc = await openDocument(await fill(await shifted.save(), [], true));
    const { blocks } = await doc.pageText(1);
    await doc.close();
    const line = blocks.find((block) => block.text.includes('Offset answer'));
    expect(line?.rect.x).toBeLessThan(box.x + box.width);
    expect(line?.rect.x).toBeGreaterThanOrEqual(box.x - 1);
  });
});
