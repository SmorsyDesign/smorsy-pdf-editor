import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from '@cantoo/pdf-lib';
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
