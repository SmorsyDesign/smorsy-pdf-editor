import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, PDFName, degrees } from '@cantoo/pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { openDocument } from '../document';
import type { Annotation } from '../edits/annotations';
import { PdfEditor } from './editor';
import type { FontBytes } from './choose-font';

const fontBytes: FontBytes = {
  bundled: (file) => Promise.resolve(new Uint8Array(readFileSync(join('assets/fonts', file)))),
  system: () => Promise.resolve(null),
};

const original = (name: string) => new Uint8Array(readFileSync(join('test-pdfs', name)));
const color = { r: 1, g: 0.9, b: 0.5 };
const common = { id: 'a', pageNumber: 1, color };

interface SavedAnnotation {
  readonly subtype: string;
  readonly rect: readonly number[];
  readonly contentsObj?: { readonly str: string };
  readonly quadPoints?: unknown;
}

async function reopened(bytes: Uint8Array, pageNumber = 1) {
  const task = getDocument({ data: bytes.slice() });
  const page = await (await task.promise).getPage(pageNumber);
  const annotations = (await page.getAnnotations()) as SavedAnnotation[];
  const viewport = page.getViewport({ scale: 1 });
  await task.destroy();
  return { annotations, viewport };
}

const saved = (name: string, annotations: readonly Annotation[]) =>
  new PdfEditor(original(name), fontBytes).save([], [], { annotations });

describe('saving annotations', () => {
  const kinds: readonly (readonly [Annotation, string])[] = [
    [
      {
        ...common,
        kind: 'highlight',
        rects: [{ x: 100, y: 200, width: 150, height: 14 }],
        text: 'late fee',
      },
      'Highlight',
    ],
    [
      {
        ...common,
        kind: 'underline',
        rects: [{ x: 100, y: 200, width: 150, height: 14 }],
        text: 'x',
      },
      'Underline',
    ],
    [
      {
        ...common,
        kind: 'strikeout',
        rects: [{ x: 100, y: 200, width: 150, height: 14 }],
        text: 'x',
      },
      'StrikeOut',
    ],
    [
      {
        ...common,
        kind: 'pen',
        points: [
          { x: 100, y: 200 },
          { x: 250, y: 214 },
        ],
        width: 2,
      },
      'Ink',
    ],
    [
      { ...common, kind: 'rect', rect: { x: 100, y: 200, width: 150, height: 14 }, width: 2 },
      'Square',
    ],
    [
      { ...common, kind: 'ellipse', rect: { x: 100, y: 200, width: 150, height: 14 }, width: 2 },
      'Circle',
    ],
    [
      { ...common, kind: 'arrow', from: { x: 100, y: 200 }, to: { x: 250, y: 214 }, width: 2 },
      'Line',
    ],
    [{ ...common, kind: 'comment', at: { x: 100, y: 200 }, text: 'Check this' }, 'Text'],
  ];

  for (const [annotation, subtype] of kinds) {
    it(`writes a real ${subtype} annotation that other apps can change`, async () => {
      const bytes = await saved('01-plain-text.pdf', [annotation]);
      const { annotations } = await reopened(bytes);
      expect(annotations.map((item) => item.subtype)).toEqual([subtype]);
    });

    it(`gives ${subtype} an appearance, so viewers draw it the same way`, async () => {
      const bytes = await saved('01-plain-text.pdf', [annotation]);
      const task = getDocument({ data: bytes.slice() });
      const page = await (await task.promise).getPage(1);
      const annotations = (await page.getAnnotations()) as { hasAppearance?: boolean }[];
      await task.destroy();
      expect(annotations[0]?.hasAppearance).toBe(true);
    });
  }

  it('keeps a note’s words, in any language', async () => {
    const bytes = await saved('01-plain-text.pdf', [
      { ...common, kind: 'comment', at: { x: 100, y: 200 }, text: 'Проверить 日本' },
    ]);
    const { annotations } = await reopened(bytes);
    expect(annotations[0]?.contentsObj?.str).toBe('Проверить 日本');
  });

  it('never changes the original bytes', async () => {
    const bytes = original('01-plain-text.pdf');
    const before = bytes.slice();
    await new PdfEditor(bytes, fontBytes).save([], [], {
      annotations: [{ ...common, kind: 'comment', at: { x: 1, y: 1 }, text: 'x' }],
    });
    expect(bytes).toEqual(before);
  });

  it('adds to what’s already there, without disturbing it', async () => {
    const before = await reopened(original('11-annotations-links.pdf'));
    const bytes = await saved('11-annotations-links.pdf', [
      { ...common, kind: 'comment', at: { x: 1, y: 1 }, text: 'x' },
    ]);
    const after = await reopened(bytes);
    expect(after.annotations).toHaveLength(before.annotations.length + 1);
  });

  describe('lands where the screen shows it, on every page rotation', () => {
    for (const rotation of [0, 90, 180, 270]) {
      for (const unit of [1, 2]) {
        it(`rotated ${rotation}, unit ${unit}`, async () => {
          const doc = await PDFDocument.create();
          const page = doc.addPage([612, 792]);
          page.setRotation(degrees(rotation));
          if (unit !== 1) page.node.set(PDFName.of('UserUnit'), doc.context.obj(unit));
          const box = { x: 100, y: 120, width: 80, height: 40 };
          const bytes = await new PdfEditor(await doc.save(), fontBytes).save([], [], {
            annotations: [{ ...common, kind: 'rect', rect: box, width: 2 }],
          });
          const { annotations, viewport } = await reopened(bytes);
          const rect = annotations[0]?.rect ?? [];
          const [x1, y1] = viewport.convertToViewportPoint(rect[0] ?? 0, rect[1] ?? 0) as number[];
          const [x2, y2] = viewport.convertToViewportPoint(rect[2] ?? 0, rect[3] ?? 0) as number[];
          // The saved box allows two points all round for the thickness of its lines.
          expect(Math.min(x1 ?? 0, x2 ?? 0)).toBeCloseTo(box.x - 2 * unit, 3);
          expect(Math.min(y1 ?? 0, y2 ?? 0)).toBeCloseTo(box.y - 2 * unit, 3);
          expect(Math.max(x1 ?? 0, x2 ?? 0)).toBeCloseTo(box.x + box.width + 2 * unit, 3);
          expect(Math.max(y1 ?? 0, y2 ?? 0)).toBeCloseTo(box.y + box.height + 2 * unit, 3);
        });
      }
    }
  });
});

describe('whiteout', () => {
  const box = { x: 100, y: 200, width: 150, height: 40 };

  it('goes in the page rather than being an annotation someone could lift off', async () => {
    const bytes = await saved('01-plain-text.pdf', [
      { ...common, color: { r: 1, g: 1, b: 1 }, kind: 'whiteout', rect: box, width: 0 },
    ]);
    const { annotations } = await reopened(bytes);
    expect(annotations).toHaveLength(0);
  });

  it('leaves the words in the file, which is why the app says it only covers them', async () => {
    const bytes = await saved('01-plain-text.pdf', [
      {
        ...common,
        kind: 'whiteout',
        rect: { x: 0, y: 0, width: 612, height: 792 },
        width: 0,
      },
    ]);
    const doc = await openDocument(bytes);
    const { blocks } = await doc.pageText(1);
    await doc.close();
    expect(blocks.map((block) => block.text).join(' ')).toContain('Plain text');
  });
});

describe('filling forms', () => {
  const name = '08-fillable-form.pdf';
  const fill = (answers: readonly (readonly [string, string | boolean])[], lock = false) =>
    new PdfEditor(original(name), fontBytes).save([], [], { answers, lock });

  it('writes each kind of answer', async () => {
    const bytes = await fill([
      ['student.name', 'Theo Okafor'],
      ['student.grade', '3'],
      ['health.allergies', 'no'],
      ['permission', true],
    ]);
    const form = (await PDFDocument.load(bytes)).getForm();
    expect(form.getTextField('student.name').getText()).toBe('Theo Okafor');
    expect(form.getDropdown('student.grade').getSelected()).toEqual(['3']);
    expect(form.getRadioGroup('health.allergies').getSelected()).toBe('no');
    expect(form.getCheckBox('permission').isChecked()).toBe(true);
  });

  it('can be read back by the app, including what it shows', async () => {
    const bytes = await fill([['student.name', 'Theo Okafor']]);
    const doc = await openDocument(bytes);
    const fields = await doc.formFields();
    await doc.close();
    expect(fields.find((field) => field.name === 'student.name')?.value).toBe('Theo Okafor');
  });

  it('clears an answer as well as setting one', async () => {
    const filled = await fill([
      ['student.name', 'Theo'],
      ['permission', true],
    ]);
    const bytes = await new PdfEditor(filled, fontBytes).save([], [], {
      answers: [
        ['student.name', ''],
        ['permission', false],
      ],
    });
    const form = (await PDFDocument.load(bytes)).getForm();
    expect(form.getTextField('student.name').getText()).toBeUndefined();
    expect(form.getCheckBox('permission').isChecked()).toBe(false);
  });

  it('handles letters beyond basic Latin', async () => {
    const bytes = await fill([['student.name', 'Łukasz Żółć']]);
    const form = (await PDFDocument.load(bytes)).getForm();
    expect(form.getTextField('student.name').getText()).toBe('Łukasz Żółć');
  });

  it('stops the save for characters no font has, rather than leaving a blank', async () => {
    await expect(fill([['student.name', '日本語']])).rejects.toThrow(/unsupported-text/);
  });

  it('says plainly when a field can’t be found', async () => {
    await expect(fill([['no.such.field', 'x']])).rejects.toThrow(/couldn’t be found/);
  });

  it('leaves unanswered fields alone', async () => {
    const before = (await PDFDocument.load(original(name))).getForm().getFields().length;
    const bytes = await fill([['student.name', 'Theo']]);
    expect((await PDFDocument.load(bytes)).getForm().getFields()).toHaveLength(before);
  });

  describe('locking answers', () => {
    it('makes them part of the page, leaving no fields', async () => {
      const bytes = await fill([['student.name', 'Theo Okafor']], true);
      expect((await PDFDocument.load(bytes)).getForm().getFields()).toHaveLength(0);
      const doc = await openDocument(bytes);
      expect(await doc.formFields()).toEqual([]);
      const { blocks } = await doc.pageText(1);
      await doc.close();
      expect(blocks.map((block) => block.text).join(' ')).toContain('Theo Okafor');
    });

    it('leaves the original bytes fillable', async () => {
      const bytes = original(name);
      await new PdfEditor(bytes, fontBytes).save([], [], { lock: true });
      expect((await PDFDocument.load(bytes)).getForm().getFields().length).toBeGreaterThan(0);
    });
  });
});

describe('reading a form', () => {
  it('finds every field on the page, where the screen shows it', async () => {
    const doc = await openDocument(original('08-fillable-form.pdf'));
    const fields = await doc.formFields();
    await doc.close();
    expect(fields.map((field) => field.kind).sort()).toEqual(
      ['checkbox', 'dropdown', 'radio', 'radio', 'text'].sort(),
    );
    const name = fields.find((field) => field.name === 'student.name');
    expect(name?.rect.x).toBeCloseTo(71.5);
    expect(name?.rect.y).toBeCloseTo(792 - 684.5);
    expect(name?.rect.width).toBeCloseTo(301);
  });

  it('finds nothing in a PDF with no form', async () => {
    const doc = await openDocument(original('01-plain-text.pdf'));
    expect(await doc.formFields()).toEqual([]);
    await doc.close();
  });
});
