import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDict, PDFDocument, PDFName } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { embeddingAllowed, findEmbeddedFont, parseToUnicode } from './embedded';

describe('parseToUnicode', () => {
  it('reads single mappings', () => {
    const map = parseToUnicode(`1 begincodespacerange <0000><FFFF> endcodespacerange
2 beginbfchar
<0003> <0020>
<0024> <0041>
endbfchar`);
    expect(map.get('A')).toEqual({ code: 0x24, bytes: 2 });
    expect(map.get(' ')).toEqual({ code: 3, bytes: 2 });
  });

  it('reads ranges, including arrays', () => {
    const map = parseToUnicode(`1 begincodespacerange <00><FF> endcodespacerange
2 beginbfrange
<41> <43> <0061>
<50> <51> [<0078> <0079>]
endbfrange`);
    expect(map.get('b')).toEqual({ code: 0x42, bytes: 1 });
    expect(map.get('y')).toEqual({ code: 0x51, bytes: 1 });
  });
});

describe('parseToUnicode, against a misleading file', () => {
  it('won’t pick between two codes claiming the same character', () => {
    const map = parseToUnicode(`2 beginbfchar
<00FF> <0031>
<0014> <0031>
endbfchar`);
    expect(map.has('1')).toBe(false);
  });
});

describe('embeddingAllowed', () => {
  function fontWithFsType(fsType: number): Uint8Array {
    const bytes = new Uint8Array(12 + 16 + 10);
    const view = new DataView(bytes.buffer);
    view.setUint16(4, 1);
    bytes.set(new TextEncoder().encode('OS/2'), 12);
    view.setUint32(12 + 8, 28);
    view.setUint16(28 + 8, fsType);
    return bytes;
  }

  it.each([
    [0, true],
    [8, true],
    [2, false],
    [4, false],
    [8 | 0x200, false],
  ])('fsType %i allowed: %s', (fsType, allowed) => {
    expect(embeddingAllowed(fontWithFsType(fsType))).toBe(allowed);
  });

  it('refuses a file it cannot read', () => {
    expect(embeddingAllowed(new Uint8Array(4))).toBe(false);
  });
});

describe('findEmbeddedFont', () => {
  const load = (name: string) =>
    PDFDocument.load(new Uint8Array(readFileSync(join('test-pdfs', name))));

  it('finds a subset font by name and knows which characters it has', async () => {
    const doc = await load('03-subset-embedded.pdf');
    const page = doc.getPage(0);
    const font = findEmbeddedFont(page, doc.context, 'LiberationSerif-8659');
    expect(font).not.toBeNull();
    // These all appear in the page's text, so the subset includes them.
    expect(font?.encode('Monthly rent')).toEqual(expect.any(String));
    // No "Z" appears on that page.
    expect(font?.encode('ZZZ')).toBeNull();
    expect(font?.missing('rent Z')).toEqual(['Z']);
  });

  it('measures text from the widths in the file', async () => {
    const doc = await load('03-subset-embedded.pdf');
    const font = findEmbeddedFont(doc.getPage(0), doc.context, 'LiberationSerif-8659');
    expect(font?.widthOf('rent', 10)).toBeGreaterThan(5);
    expect(font?.widthOf('rent', 20)).toBeCloseTo((font?.widthOf('rent', 10) ?? 0) * 2, 5);
  });

  it('returns null for a font that is not on the page', async () => {
    const doc = await load('03-subset-embedded.pdf');
    expect(findEmbeddedFont(doc.getPage(0), doc.context, 'NotAFont')).toBeNull();
  });
});

describe('hostile ToUnicode maps', () => {
  it('skips a range too big to be real, instead of working through it', () => {
    const started = Date.now();
    const map = parseToUnicode('beginbfrange <00000000> <FFFFFFFF> <0000> endbfrange');
    expect(map.size).toBe(0);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('skips codes longer than a PDF allows', () => {
    const huge = 'F'.repeat(16);
    expect(
      parseToUnicode(`beginbfrange <${'0'.repeat(16)}> <${huge}> <0000> endbfrange`).size,
    ).toBe(0);
  });

  it('gives up on a map with more codes than Unicode has', () => {
    const range = '<0000> <FFFF> <0000>\n';
    expect(parseToUnicode(`beginbfrange ${range.repeat(20)} endbfrange`).size).toBe(0);
  });

  it('copes with sections that never close', () => {
    const started = Date.now();
    expect(parseToUnicode('beginbfchar '.repeat(200000)).size).toBe(0);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('fonts that share a name', () => {
  const NAME = 'LiberationSerif-8659';
  const load = async () => {
    const doc = await PDFDocument.load(
      new Uint8Array(readFileSync('test-pdfs/03-subset-embedded.pdf')),
    );
    const page = doc.getPage(0);
    return { doc, page, fonts: page.node.normalizedEntries().Font };
  };

  it('reuses a font the page has only one of', async () => {
    const { doc, page } = await load();
    expect(findEmbeddedFont(page, doc.context, NAME)).not.toBeNull();
  });

  const serifFont = (doc: PDFDocument, fonts: PDFDict) => {
    for (const [, value] of fonts.entries()) {
      const font = doc.context.lookup(value);
      if (font instanceof PDFDict && font.get(PDFName.of('BaseFont')) === PDFName.of(NAME)) {
        return { font, value };
      }
    }
    throw new Error('The fixture has no such font.');
  };

  it('accepts several names for the same font', async () => {
    const { doc, page, fonts } = await load();
    fonts.set(PDFName.of('Another'), serifFont(doc, fonts).value);
    expect(findEmbeddedFont(page, doc.context, NAME)).not.toBeNull();
  });

  it('refuses when a second font could be a decoy', async () => {
    const { doc, page, fonts } = await load();
    const decoy = doc.context.register(serifFont(doc, fonts).font.clone());
    fonts.set(PDFName.of('Decoy'), decoy);
    expect(findEmbeddedFont(page, doc.context, NAME)).toBeNull();
  });

  it('doesn’t confuse a different subset of the same typeface', async () => {
    const { doc, page } = await load();
    expect(findEmbeddedFont(page, doc.context, 'ABCDEF+LiberationSerif-8659')).toBeNull();
  });
});
