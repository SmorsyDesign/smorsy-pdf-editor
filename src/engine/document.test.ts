import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EngineError } from './errors';
import { openDocument } from './document';

const fixture = (name: string) => new Uint8Array(readFileSync(join('test-pdfs', name)));
const invalid = (name: string) => new Uint8Array(readFileSync(join('tests/fixtures', name)));

const openError = async (bytes: Uint8Array): Promise<EngineError> => {
  try {
    await openDocument(bytes);
  } catch (error) {
    if (error instanceof EngineError) return error;
    throw error;
  }
  throw new Error('expected the file not to open');
};

describe('openDocument', () => {
  it('reports the page count', async () => {
    const doc = await openDocument(fixture('01-plain-text.pdf'));
    expect(doc.pageCount).toBe(3);
    await doc.close();
  });

  it('opens a 120-page document', async () => {
    const doc = await openDocument(fixture('13-large-120-pages.pdf'));
    expect(doc.pageCount).toBe(120);
    await doc.close();
  });

  it('leaves the caller’s bytes usable, because they are the original for saving', async () => {
    const bytes = fixture('01-plain-text.pdf');
    const before = bytes.slice();
    const doc = await openDocument(bytes);
    expect(bytes.byteLength).toBe(before.byteLength);
    expect(bytes).toEqual(before);
    await doc.close();
  });

  it('gives each page its displayed size, honouring rotation', async () => {
    const doc = await openDocument(fixture('06-rotated-pages.pdf'));
    expect(await doc.pageSize(1)).toEqual({ width: 612, height: 792 });
    expect(await doc.pageSize(2)).toEqual({ width: 792, height: 612 });
    await doc.close();
  });

  it('handles mixed page sizes', async () => {
    const doc = await openDocument(fixture('07-mixed-sizes.pdf'));
    expect(await doc.pageSize(5)).toEqual({ width: 226, height: 566 });
    await doc.close();
  });

  it('rejects a page number outside the document', async () => {
    const doc = await openDocument(fixture('01-plain-text.pdf'));
    await expect(doc.pageSize(4)).rejects.toMatchObject({ code: 'page-not-found' });
    await doc.close();
  });

  it('reports a broken page as unreadable while the other pages still work', async () => {
    const doc = await openDocument(invalid('bad-page.pdf'));
    expect(doc.pageCount).toBe(3);
    await expect(doc.pageSize(1)).resolves.toBeDefined();
    await expect(doc.pageSize(2)).rejects.toMatchObject({ code: 'page-unreadable' });
    await expect(doc.pageSize(3)).resolves.toBeDefined();
    await doc.close();
  });

  it('releasing a page is safe, even a broken one', async () => {
    const doc = await openDocument(invalid('bad-page.pdf'));
    doc.release(1);
    doc.release(2);
    await expect(doc.pageSize(1)).resolves.toBeDefined();
    await doc.close();
  });

  it('asks for a password rather than failing vaguely', async () => {
    expect((await openError(fixture('10-password-protected.pdf'))).code).toBe('password-required');
  });

  it('identifies a file that is not a PDF', async () => {
    expect((await openError(invalid('not-a-pdf.pdf'))).code).toBe('not-a-pdf');
  });

  it('identifies an empty file', async () => {
    expect((await openError(invalid('empty.pdf'))).code).toBe('empty-file');
  });

  it('identifies a truncated file as damaged', async () => {
    const error = await openError(invalid('truncated.pdf'));
    expect(error.code).toBe('damaged');
  });
});
