import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, PDFName, PDFRawStream } from '@cantoo/pdf-lib';
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
