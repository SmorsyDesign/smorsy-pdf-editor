import { describe, expect, it } from 'vitest';
import { copyFileName, extractFileName, unchangedCopy } from './copy';

describe('unchangedCopy', () => {
  it('returns byte-identical data, so an existing digital signature stays valid', () => {
    const original = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    expect(unchangedCopy(original)).toEqual(original);
  });

  it('returns separate memory, so nothing can change the original afterwards', () => {
    const original = new Uint8Array([1, 2, 3]);
    const copy = unchangedCopy(original);
    copy[0] = 9;
    expect(original[0]).toBe(1);
  });
});

describe('copyFileName', () => {
  it('adds -edited before the extension', () => {
    expect(copyFileName('Lease renewal 2027.pdf')).toBe('Lease renewal 2027-edited.pdf');
  });

  it('keeps non-English characters', () => {
    expect(copyFileName('Résumé финал.PDF')).toBe('Résumé финал-edited.PDF');
  });

  it('copes with a name that has no extension', () => {
    expect(copyFileName('scan')).toBe('scan-edited.pdf');
  });
});

describe('extractFileName', () => {
  it('names one page', () => {
    expect(extractFileName('Lease.pdf', new Set([3]))).toBe('Lease (page 3).pdf');
  });

  it('writes runs of pages with a dash, and the rest with commas', () => {
    expect(extractFileName('Lease.pdf', new Set([4, 2, 3, 7, 9, 10]))).toBe(
      'Lease (pages 2–4, 7, 9–10).pdf',
    );
  });

  it('copes with a name that has no extension', () => {
    expect(extractFileName('Lease', new Set([1, 2]))).toBe('Lease (pages 1–2).pdf');
  });
});
