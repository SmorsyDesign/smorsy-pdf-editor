import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from '@cantoo/pdf-lib';
import { OPS, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { afterAll, describe, expect, it } from 'vitest';
import { testPng } from '../helpers/test-png';
import { openDocument } from '../../src/engine/document';
import { unchangedCopy } from '../../src/engine/copy';
import type { TextBox } from '../../src/engine/edits/model';
import { PdfEditor } from '../../src/engine/save/editor';

const FOLDER = 'test-pdfs';
const PASSWORDS: Readonly<Record<string, string>> = {
  '10-password-protected.pdf': 'smorsy-test',
  '20-owner-restricted.pdf': '',
};
const files = readdirSync(FOLDER).filter((name) => name.toLowerCase().endsWith('.pdf'));
const temp = mkdtempSync(join(tmpdir(), 'smorsy-roundtrip-'));

afterAll(() => {
  rmSync(temp, { recursive: true, force: true });
});

interface Inspection {
  readonly pages: number;
  readonly annotations: number;
  readonly links: number;
  readonly outlineItems: number;
}

async function inspect(bytes: Uint8Array, password?: string): Promise<Inspection> {
  const task = getDocument({
    data: bytes.slice(),
    ...(password !== undefined ? { password } : {}),
  });
  const document = await task.promise;
  let annotations = 0;
  let links = 0;
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const found = (await page.getAnnotations()) as { subtype?: string }[];
    // A signature over a form field is saved as a stamp, which is checked separately.
    annotations += found.filter((annotation) => annotation.subtype !== 'Stamp').length;
    links += found.filter((annotation) => annotation.subtype === 'Link').length;
    page.cleanup();
  }
  // Typed as always an array, but it's null for a document with no bookmarks.
  const outline = (await document.getOutline()) as unknown[] | null;
  const result = {
    pages: document.numPages,
    annotations,
    links,
    outlineItems: outline?.length ?? 0,
  };
  await task.destroy();
  return result;
}

/** Whether page 1 shows a picture or stamp beyond those the original already had. */
async function signaturesOnFirstPage(bytes: Uint8Array): Promise<number> {
  const task = getDocument({ data: bytes.slice() });
  const page = await (await task.promise).getPage(1);
  const { fnArray } = await page.getOperatorList();
  const found = (await page.getAnnotations()) as { subtype?: string }[];
  const pictures = fnArray.filter((op) => op === OPS.paintImageXObject).length;
  const stamps = found.filter((annotation) => annotation.subtype === 'Stamp').length;
  await task.destroy();
  return pictures + stamps;
}

/** qpdf exits 0 for clean files, 3 for warnings it can repair, and 2 for real errors. */
function qpdfStatus(path: string, password?: string): number | null {
  const args = ['--check', ...(password !== undefined ? [`--password=${password}`] : []), path];
  return spawnSync('qpdf', args, { stdio: 'ignore' }).status;
}

const EDIT_TEXT = 'Round trip edit';

const editedBox: TextBox = {
  id: 'round-trip',
  pageNumber: 1,
  rect: { x: 40, y: 40, width: 200, height: 16 },
  angle: 0,
  text: EDIT_TEXT,
  lines: [EDIT_TEXT],
  firstBaseline: 12,
  lineHeight: 14,
  style: {
    font: 'sans',
    size: 11,
    color: { r: 0.8, g: 0, b: 0 },
    bold: false,
    italic: false,
    align: 'left',
  },
  covers: [
    { rect: { x: 40, y: 60, width: 80, height: 10 }, angle: 0, color: { r: 1, g: 1, b: 1 } },
  ],
  original: null,
};

const fonts = {
  bundled: (file: string) =>
    Promise.resolve(new Uint8Array(readFileSync(join('assets/fonts', file)))),
  system: () => Promise.resolve(null),
};

describe('qpdf is available', () => {
  it('reports a version', () => {
    expect(execFileSync('qpdf', ['--version']).toString()).toContain('qpdf');
  });
});

describe('the set is big enough', () => {
  it('has at least 15 files, as the spec requires', () => {
    expect(files.length).toBeGreaterThanOrEqual(15);
  });
});

describe.each(files)('%s', (name) => {
  const password = PASSWORDS[name];
  const original = new Uint8Array(readFileSync(join(FOLDER, name)));

  it('opens through the engine', async () => {
    if (password) {
      await expect(openDocument(original)).rejects.toMatchObject({ code: 'password-required' });
      return;
    }
    const document = await openDocument(original);
    expect(document.pageCount).toBeGreaterThan(0);
    await document.close();
  });

  it('is a valid PDF to begin with', () => {
    expect([0, 3]).toContain(qpdfStatus(join(FOLDER, name), password));
  });

  it('survives an unedited copy byte for byte', () => {
    expect(Buffer.compare(unchangedCopy(original), original)).toBe(0);
  });

  // Password-protected files can't be opened to edit until Phase 6 adds passwords.
  it.skipIf(password !== undefined)(
    'survives open, edit, save and reopen, keeping the edit and everything else',
    async () => {
      const before = await inspect(original);
      const saved = await new PdfEditor(original, fonts).save([editedBox]);

      const path = join(temp, `edited-${name}`);
      writeFileSync(path, saved);
      expect([0, 3]).toContain(qpdfStatus(path));
      expect(await inspect(saved)).toEqual(before);

      const reopened = await openDocument(saved);
      const { blocks } = await reopened.pageText(1);
      expect(blocks.map((block) => block.text).join(' ')).toContain(EDIT_TEXT);
      await reopened.close();
    },
  );

  it.skipIf(password !== undefined)('survives every kind of annotation', async () => {
    const common = { pageNumber: 1, color: { r: 0.8, g: 0.2, b: 0.2 } };
    const rect = { x: 72, y: 72, width: 120, height: 40 };
    const saved = await new PdfEditor(original, fonts).save([], [], {
      annotations: [
        { ...common, id: 'a', kind: 'highlight', rects: [rect], text: 'marked' },
        { ...common, id: 'b', kind: 'underline', rects: [rect], text: 'marked' },
        { ...common, id: 'c', kind: 'strikeout', rects: [rect], text: 'marked' },
        { ...common, id: 'd', kind: 'pen', points: [rect, { x: 200, y: 200 }], width: 2 },
        { ...common, id: 'e', kind: 'rect', rect, width: 2 },
        { ...common, id: 'f', kind: 'ellipse', rect, width: 2 },
        { ...common, id: 'g', kind: 'arrow', from: rect, to: { x: 200, y: 200 }, width: 2 },
        { ...common, id: 'h', kind: 'note', at: rect, text: 'Note' },
        { ...common, id: 'i', kind: 'whiteout', rect, width: 0 },
      ],
    });
    const path = join(temp, `annotated-${name}`);
    writeFileSync(path, saved);
    expect([0, 3]).toContain(qpdfStatus(path));
    const before = await inspect(original);
    const after = await inspect(saved);
    expect(after.pages).toBe(before.pages);
    expect(after.links).toBe(before.links);
    expect(after.outlineItems).toBe(before.outlineItems);
    // Eight of them are real annotations. Whiteout goes in the page itself.
    expect(after.annotations).toBe(before.annotations + 8);
  });

  it.skipIf(password !== undefined)('survives a placed signature', async () => {
    const saved = await new PdfEditor(original, fonts).save(
      [],
      [
        {
          id: 'signed',
          pageNumber: 1,
          rect: { x: 72, y: 72, width: 120, height: 60 },
          angle: 15,
          image: { id: 'image', png: testPng(40, 20), width: 40, height: 20, ink: null },
        },
      ],
    );
    const path = join(temp, `signed-${name}`);
    writeFileSync(path, saved);
    expect([0, 3]).toContain(qpdfStatus(path));
    expect(await inspect(saved)).toEqual(await inspect(original));
    // Over a form field it's a stamp, and otherwise a picture on the page. Either way it's there.
    expect(await signaturesOnFirstPage(saved)).toBeGreaterThan(
      await signaturesOnFirstPage(original),
    );
  });

  it.skipIf(password !== undefined)('survives replacing real text in its own font', async () => {
    const opened = await openDocument(original);
    const { blocks } = await opened.pageText(1);
    await opened.close();
    const block = blocks.find((candidate) => candidate.readOnly === null);
    if (!block) return;

    const replacement: TextBox = {
      ...editedBox,
      id: block.id,
      rect: block.rect,
      angle: block.angle,
      text: block.text,
      lines: block.lines.map((line) => line.text),
      firstBaseline: block.firstBaseline,
      lineHeight: block.lineHeight,
      style: { ...editedBox.style, font: 'original', size: block.size },
      covers: block.lines.map((line) => ({
        rect: line.rect,
        angle: block.angle,
        color: { r: 1, g: 1, b: 1 },
      })),
      original: block.font,
    };
    const saved = await new PdfEditor(original, fonts).save([replacement]);
    const path = join(temp, `replaced-${name}`);
    writeFileSync(path, saved);
    expect([0, 3]).toContain(qpdfStatus(path));
    expect(await inspect(saved)).toEqual(await inspect(original));
  });

  it('keeps pages, annotations, links and bookmarks through a re-save', async () => {
    const before = await inspect(original, password);
    const document = await PDFDocument.load(original, password !== undefined ? { password } : {});
    const saved = await document.save();

    const path = join(temp, name);
    writeFileSync(path, saved);
    expect([0, 3]).toContain(qpdfStatus(path));

    expect(await inspect(saved)).toEqual(before);
  });
});
