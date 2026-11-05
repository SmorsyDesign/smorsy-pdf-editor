import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDocument } from './document';
import { hasDigitalSignature } from './extract';

const open = (name: string) => openDocument(new Uint8Array(readFileSync(join('test-pdfs', name))));

describe('finding text on a page', () => {
  it('groups a paragraph into one block and a heading into another', async () => {
    const doc = await open('01-plain-text.pdf');
    const { blocks, scanned } = await doc.pageText(1);
    expect(scanned).toBe(false);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.text).toBe('Plain text, page 1');
    expect(blocks[1]?.lines).toHaveLength(4);
    expect(blocks[1]?.text).toContain('Maple Court Apartments and the tenant');
    await doc.close();
  });

  it('positions text as displayed, with the box around the words', async () => {
    const doc = await open('01-plain-text.pdf');
    const heading = (await doc.pageText(1)).blocks[0];
    // Drawn at x=72, baseline y=730 on a 792-high page, at size 18.
    expect(heading?.rect.x).toBeCloseTo(72, 0);
    expect(heading?.firstBaseline).toBeGreaterThan(10);
    expect((heading?.rect.y ?? 0) + (heading?.firstBaseline ?? 0)).toBeCloseTo(792 - 730, 0);
    expect(heading?.size).toBeCloseTo(18, 0);
    expect(heading?.rect.width).toBeGreaterThan(100);
    expect(heading?.angle).toBeCloseTo(0, 5);
    await doc.close();
  });

  it('keeps table cells and columns separate', async () => {
    const doc = await open('16-irs-form-w9.pdf');
    const { blocks } = await doc.pageText(1);
    expect(blocks.length).toBeGreaterThan(15);
    const form = blocks.find((block) => block.text.startsWith('Request for Taxpayer'));
    expect(form).toBeDefined();
    expect(form?.text).not.toContain('Give form to the');
    await doc.close();
  });

  it('reports the font of each block', async () => {
    const doc = await open('02-standard-fonts.pdf');
    const { blocks } = await doc.pageText(1);
    const names = blocks.map((block) => block.font.name);
    expect(names).toContain('Helvetica');
    expect(names).toContain('Courier-Bold');
    const times = blocks.find((block) => block.font.name.startsWith('Times-Roman'));
    expect(times?.font.serif).toBe(true);
    await doc.close();
  });

  it('positions text correctly on a rotated page', async () => {
    const doc = await open('06-rotated-pages.pdf');
    const page = await doc.pageSize(2);
    expect(page).toEqual({ width: 792, height: 612 });
    const [block] = (await doc.pageText(2)).blocks;
    expect(block?.text).toContain('/Rotate 90');
    // Drawn at user (72, 700), which shows at display (700, 72) and reads downwards.
    // The top of sideways text lies to the right of its baseline.
    expect((block?.rect.x ?? 0) - (block?.firstBaseline ?? 0)).toBeCloseTo(700, 0);
    expect(block?.angle).toBeCloseTo(90, 5);
    await doc.close();
  });

  it('detects an image-only page as a scan', async () => {
    const doc = await open('09-scanned-image-only.pdf');
    const result = await doc.pageText(1);
    expect(result.scanned).toBe(true);
    expect(result.blocks).toEqual([]);
    await doc.close();
  });

  it('does not treat a blank-looking page with text as a scan', async () => {
    const doc = await open('14-images-and-text.pdf');
    const result = await doc.pageText(1);
    expect(result.scanned).toBe(false);
    expect(result.blocks.length).toBeGreaterThan(0);
    await doc.close();
  });

  it('marks text that can’t be shaped correctly as read-only', async () => {
    const doc = await open('05-non-latin.pdf');
    const { blocks } = await doc.pageText(1);
    expect(blocks.every((block) => block.readOnly === null)).toBe(true);
    await doc.close();
  });
});

describe('hasDigitalSignature', () => {
  const bytesOf = (text: string) => new TextEncoder().encode(text);

  it('finds a signature in the file', () => {
    expect(hasDigitalSignature(bytesOf('%PDF-1.7 << /Type /Sig /ByteRange [0 10 20 30] >>'))).toBe(
      true,
    );
  });

  it('ignores a file without one', () => {
    expect(hasDigitalSignature(bytesOf('%PDF-1.7 << /Type /Page >>'))).toBe(false);
    expect(
      hasDigitalSignature(new Uint8Array(readFileSync(join('test-pdfs', '08-fillable-form.pdf')))),
    ).toBe(false);
  });
});
