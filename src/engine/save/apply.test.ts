import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, PDFName, StandardFonts, pushGraphicsState, scale } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { openDocument } from '../document';
import type { Cover, TextBox, TextStyle } from '../edits/model';
import { PdfEditor, type FontBytes } from './editor';

const original = (name: string) => new Uint8Array(readFileSync(join('test-pdfs', name)));

const MAC_TIMES = '/System/Library/Fonts/Supplemental/Times New Roman.ttf';

// Tests only need a font file that allows embedding, on any computer, so this stands in for it.
const fontBytes: FontBytes = {
  bundled: (file) => Promise.resolve(new Uint8Array(readFileSync(join('assets/fonts', file)))),
  system: () =>
    Promise.resolve(
      new Uint8Array(readFileSync(join('assets/fonts/liberation/LiberationSerif-Regular.ttf'))),
    ),
};

const STYLE: TextStyle = {
  font: 'sans',
  size: 14,
  color: { r: 0, g: 0, b: 0 },
  bold: false,
  italic: false,
  align: 'left',
};

function box(overrides: Partial<TextBox> = {}): TextBox {
  return {
    id: 'box',
    pageNumber: 1,
    rect: { x: 100, y: 200, width: 300, height: 40 },
    angle: 0,
    text: 'Added text',
    lines: ['Added text'],
    firstBaseline: 12,
    lineHeight: 17,
    style: STYLE,
    covers: [],
    original: null,
    ...overrides,
  };
}

async function textOf(bytes: Uint8Array, pageNumber = 1) {
  const doc = await openDocument(bytes);
  const { blocks } = await doc.pageText(pageNumber);
  await doc.close();
  return blocks;
}

async function saved(name: string, boxes: readonly TextBox[]) {
  const editor = new PdfEditor(original(name), fontBytes);
  return editor.save(boxes);
}

describe('saving text', () => {
  it('adds text where it was placed, readable after reopening', async () => {
    const blocks = await textOf(await saved('01-plain-text.pdf', [box()]));
    const added = blocks.find((block) => block.text === 'Added text');
    expect(added?.rect.x).toBeCloseTo(100, 0);
    expect((added?.rect.y ?? 0) + (added?.firstBaseline ?? 0)).toBeCloseTo(212, 0);
    expect(added?.size).toBeCloseTo(14, 0);
  });

  it('never changes the original bytes', async () => {
    const bytes = original('01-plain-text.pdf');
    const copy = bytes.slice();
    await new PdfEditor(bytes, fontBytes).save([box()]);
    expect(bytes).toEqual(copy);
  });

  it('applies edits to the original each time, so a second save starts clean', async () => {
    const editor = new PdfEditor(original('01-plain-text.pdf'), fontBytes);
    await editor.save([box({ text: 'First', lines: ['First'] })]);
    const blocks = await textOf(await editor.save([box({ text: 'Second', lines: ['Second'] })]));
    expect(blocks.some((block) => block.text === 'Second')).toBe(true);
    expect(blocks.some((block) => block.text === 'First')).toBe(false);
  });

  it('writes several lines one line-height apart', async () => {
    const lines = ['Line one', 'Line two'];
    const blocks = await textOf(
      await saved('01-plain-text.pdf', [box({ text: lines.join(' '), lines })]),
    );
    const block = blocks.find((item) => item.text.startsWith('Line one'));
    expect(block?.lines).toHaveLength(2);
    expect(block?.lineHeight).toBeCloseTo(17, 0);
  });

  it('aligns centre and right within the box', async () => {
    const center = box({
      id: 'c',
      text: 'Mid',
      lines: ['Mid'],
      style: { ...STYLE, align: 'center' },
    });
    const right = box({
      id: 'r',
      text: 'End',
      lines: ['End'],
      rect: { x: 100, y: 300, width: 300, height: 40 },
      style: { ...STYLE, align: 'right' },
    });
    const blocks = await textOf(await saved('01-plain-text.pdf', [center, right]));
    const mid = blocks.find((item) => item.text === 'Mid');
    const end = blocks.find((item) => item.text === 'End');
    expect((mid?.rect.x ?? 0) + (mid?.rect.width ?? 0) / 2).toBeCloseTo(250, 0);
    expect((end?.rect.x ?? 0) + (end?.rect.width ?? 0)).toBeCloseTo(400, 0);
  });

  it.each([
    [1, 0],
    [2, 90],
    [3, 180],
    [4, 270],
  ])('places text upright as displayed on page %i, rotated %i degrees', async (pageNumber) => {
    const edited = box({ pageNumber, rect: { x: 100, y: 200, width: 300, height: 40 } });
    const blocks = await textOf(await saved('06-rotated-pages.pdf', [edited]), pageNumber);
    const added = blocks.find((block) => block.text === 'Added text');
    expect(added?.angle).toBeCloseTo(0, 3);
    expect(added?.rect.x).toBeCloseTo(100, 0);
    expect((added?.rect.y ?? 0) + (added?.firstBaseline ?? 0)).toBeCloseTo(212, 0);
  });

  it('survives a page whose content leaves the drawing state changed', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);
    page.drawText('Existing', { x: 72, y: 700, font, size: 12 });
    // Scales everything after it and never restores, as some real PDFs do.
    page.pushOperators(pushGraphicsState(), scale(2, 2));
    const bytes = await doc.save();
    const blocks = await textOf(await new PdfEditor(bytes, fontBytes).save([box()]));
    const added = blocks.find((block) => block.text === 'Added text');
    expect(added?.rect.x).toBeCloseTo(100, 0);
    expect(added?.size).toBeCloseTo(14, 0);
  });
});

describe('covering the original text', () => {
  const cover: Cover = {
    rect: { x: 72, y: 62, width: 200, height: 20 },
    angle: 0,
    color: { r: 1, g: 1, b: 1 },
  };

  it('draws the patch under the new text, in the same save', async () => {
    const bytes = await saved('01-plain-text.pdf', [box({ covers: [cover] })]);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);
    expect((await textOf(bytes)).some((block) => block.text === 'Added text')).toBe(true);
  });

  it('deleting keeps the patch and adds no text', async () => {
    const before = (await textOf(original('01-plain-text.pdf'))).length;
    const bytes = await saved('01-plain-text.pdf', [box({ text: '', lines: [], covers: [cover] })]);
    // The patch hides the old text but doesn't remove it, which the interface says.
    expect((await textOf(bytes)).length).toBe(before);
  });
});

describe('choosing a font', () => {
  it('uses a standard font when the original is one', async () => {
    const editor = new PdfEditor(original('02-standard-fonts.pdf'), fontBytes);
    const outcome = await editor.resolveFont(
      box({
        style: { ...STYLE, font: 'original' },
        original: {
          name: 'Helvetica',
          serif: false,
          monospace: false,
          type3: false,
          bold: false,
          italic: false,
        },
      }),
    );
    expect(outcome).toMatchObject({ used: 'standard', match: 'exact' });
  });

  const garamondLike = {
    name: 'LiberationSerif-8659',
    serif: true,
    monospace: false,
    type3: false,
    bold: false,
    italic: false,
    knownCharacters: 'rent',
  };

  it('reuses the embedded font when it has every character', async () => {
    const editor = new PdfEditor(original('03-subset-embedded.pdf'), fontBytes);
    const outcome = await editor.resolveFont(
      box({
        text: 'rent',
        lines: ['rent'],
        style: { ...STYLE, font: 'original' },
        original: garamondLike,
      }),
    );
    expect(outcome).toMatchObject({ used: 'embedded', match: 'exact' });
  });

  it('falls back, naming the missing characters, when the embedded font lacks some', async () => {
    const editor = new PdfEditor(original('03-subset-embedded.pdf'), fontBytes);
    const outcome = await editor.resolveFont(
      box({
        text: 'Z',
        lines: ['Z'],
        style: { ...STYLE, font: 'original' },
        original: garamondLike,
      }),
    );
    expect(outcome.used).toBe('bundled');
    expect(outcome.missing).toEqual(['Z']);
  });

  it('draws with the embedded font so saved text keeps it', async () => {
    const bytes = await saved('03-subset-embedded.pdf', [
      box({
        text: 'rent',
        lines: ['rent'],
        style: { ...STYLE, font: 'original' },
        original: garamondLike,
      }),
    ]);
    const added = (await textOf(bytes)).find((block) => block.text === 'rent');
    expect(added?.font.name).toContain('LiberationSerif');
    expect(added?.rect.x).toBeCloseTo(100, 0);
  });

  it('uses the computer’s copy of Times New Roman when its licence flag allows', async () => {
    const times = { ...garamondLike, name: 'TimesNewRomanPSMT' };
    const edited = box({ style: { ...STYLE, font: 'original' }, original: times });
    const editor = new PdfEditor(original('01-plain-text.pdf'), fontBytes);
    expect(await editor.resolveFont(edited)).toMatchObject({ used: 'system', match: 'exact' });
    const blocks = await textOf(await editor.save([edited]));
    expect(blocks.some((block) => block.text === 'Added text')).toBe(true);
  });

  it.runIf(existsSync(MAC_TIMES))('embeds the real Times New Roman on this Mac', async () => {
    const times = { ...garamondLike, name: 'TimesNewRomanPSMT' };
    const edited = box({ style: { ...STYLE, font: 'original' }, original: times });
    const realTimes: FontBytes = {
      ...fontBytes,
      system: () => Promise.resolve(new Uint8Array(readFileSync(MAC_TIMES))),
    };
    const editor = new PdfEditor(original('01-plain-text.pdf'), realTimes);
    const added = (await textOf(await editor.save([edited]))).find(
      (block) => block.text === 'Added text',
    );
    expect(added?.font.name).toContain('TimesNewRoman');
  });

  it('skips a system font whose licence flag forbids embedding', async () => {
    const forbidding: FontBytes = {
      ...fontBytes,
      system: () => {
        const bytes = new Uint8Array(12 + 16 + 10);
        const view = new DataView(bytes.buffer);
        view.setUint16(4, 1);
        bytes.set(new TextEncoder().encode('OS/2'), 12);
        view.setUint32(12 + 8, 28);
        view.setUint16(28 + 8, 2);
        return Promise.resolve(bytes);
      },
    };
    const times = { ...garamondLike, name: 'TimesNewRomanPSMT' };
    const edited = box({ style: { ...STYLE, font: 'original' }, original: times });
    const outcome = await new PdfEditor(original('01-plain-text.pdf'), forbidding).resolveFont(
      edited,
    );
    expect(outcome).toMatchObject({ used: 'bundled', family: 'serif' });
  });

  it('falls back to Liberation Serif when Times New Roman isn’t available', async () => {
    const noSystem: FontBytes = { ...fontBytes, system: () => Promise.resolve(null) };
    const times = { ...garamondLike, name: 'TimesNewRomanPSMT' };
    const edited = box({ style: { ...STYLE, font: 'original' }, original: times });
    const outcome = await new PdfEditor(original('01-plain-text.pdf'), noSystem).resolveFont(
      edited,
    );
    expect(outcome).toMatchObject({ used: 'bundled', match: 'same-widths', family: 'serif' });
  });

  it('says a bundled font is only close when widths aren’t designed to match', async () => {
    const editor = new PdfEditor(original('01-plain-text.pdf'), fontBytes);
    const outcome = await editor.resolveFont(
      box({
        style: { ...STYLE, font: 'original' },
        original: { ...garamondLike, name: 'Garamond' },
      }),
    );
    expect(outcome).toMatchObject({ used: 'bundled', match: 'closest', family: 'serif' });
  });

  it('honours a font the person chose, including bold and italic', async () => {
    const bytes = await saved('01-plain-text.pdf', [
      box({ style: { ...STYLE, font: 'mono', bold: true, italic: true } }),
    ]);
    const added = (await textOf(bytes)).find((block) => block.text === 'Added text');
    expect(added?.font.name).toContain('LiberationMono');
  });
});

describe('text no font can draw', () => {
  const unsupported = () =>
    box({ text: '日本語', lines: ['日本語'], style: { ...STYLE, font: 'sans' } });

  it('is identified before saving', async () => {
    const editor = new PdfEditor(original('01-plain-text.pdf'), fontBytes);
    expect((await editor.resolveFont(unsupported())).uncovered).toEqual(['日', '本', '語']);
  });

  it('stops the save, rather than writing blanks into the file', async () => {
    await expect(saved('01-plain-text.pdf', [unsupported()])).rejects.toThrow(/unsupported-text/);
  });

  it('allows ordinary punctuation in a standard font', async () => {
    const editor = new PdfEditor(original('02-standard-fonts.pdf'), fontBytes);
    const outcome = await editor.resolveFont(
      box({
        text: 'It’s “fine” – really',
        lines: ['It’s “fine” – really'],
        style: { ...STYLE, font: 'original' },
        original: {
          name: 'Helvetica',
          serif: false,
          monospace: false,
          type3: false,
          bold: false,
          italic: false,
        },
      }),
    );
    expect(outcome).toMatchObject({ used: 'standard', missing: [] });
  });
});

describe('a misleading embedded font', () => {
  const editorFor = () => new PdfEditor(original('03-subset-embedded.pdf'), fontBytes);
  const original3 = {
    name: 'LiberationSerif-8659',
    serif: true,
    monospace: false,
    type3: false,
    bold: false,
    italic: false,
  };

  it('isn’t trusted for a character it doesn’t visibly draw on the page', async () => {
    const outcome = await editorFor().resolveFont(
      box({
        text: 'rent',
        lines: ['rent'],
        style: { ...STYLE, font: 'original' },
        original: { ...original3, knownCharacters: 'ren' },
      }),
    );
    expect(outcome.used).toBe('bundled');
    expect(outcome.missing).toEqual(['t']);
  });
});

describe('unusual page boxes', () => {
  async function pageWith(setup: (doc: PDFDocument) => void) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage([612, 792]).drawText('Existing', { x: 72, y: 700, font, size: 12 });
    setup(doc);
    return doc.save();
  }

  it('places text correctly with a crop box starting away from zero', async () => {
    const bytes = await pageWith((doc) => {
      doc.getPage(0).setCropBox(50, 60, 400, 500);
    });
    const added = (await textOf(await new PdfEditor(bytes, fontBytes).save([box()]))).find(
      (block) => block.text === 'Added text',
    );
    expect(added?.rect.x).toBeCloseTo(100, 0);
    expect((added?.rect.y ?? 0) + (added?.firstBaseline ?? 0)).toBeCloseTo(212, 0);
  });

  it('places text correctly when the crop box overhangs the media box', async () => {
    const bytes = await pageWith((doc) => {
      doc.getPage(0).setCropBox(-100, -100, 800, 1000);
    });
    const added = (await textOf(await new PdfEditor(bytes, fontBytes).save([box()]))).find(
      (block) => block.text === 'Added text',
    );
    expect(added?.rect.x).toBeCloseTo(100, 0);
    expect((added?.rect.y ?? 0) + (added?.firstBaseline ?? 0)).toBeCloseTo(212, 0);
  });

  it('keeps size and position on a page with a larger unit', async () => {
    const bytes = await pageWith((doc) => {
      doc.getPage(0).node.set(PDFName.of('UserUnit'), doc.context.obj(2));
    });
    const added = (await textOf(await new PdfEditor(bytes, fontBytes).save([box()]))).find(
      (block) => block.text === 'Added text',
    );
    expect(added?.rect.x).toBeCloseTo(100, 0);
    expect(added?.size).toBeCloseTo(14, 0);
  });
});

describe('what else survives', () => {
  it('keeps form fields, links and bookmarks', async () => {
    for (const name of ['08-fillable-form.pdf', '11-annotations-links.pdf', '12-bookmarks.pdf']) {
      const before = await PDFDocument.load(original(name));
      const after = await PDFDocument.load(await saved(name, [box()]));
      expect(after.getPageCount()).toBe(before.getPageCount());
      expect(after.getForm().getFields().length).toBe(before.getForm().getFields().length);
    }
  });
});
