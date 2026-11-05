import { describe, expect, it } from 'vitest';
import { copyFileName, isSameFile, unchangedCopy } from './save';

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

describe('isSameFile', () => {
  it('compares paths exactly on macOS', () => {
    expect(isSameFile('/a/Lease.pdf', '/a/Lease.pdf', 'mac')).toBe(true);
    expect(isSameFile('/a/Lease.pdf', '/a/lease.pdf', 'mac')).toBe(false);
  });

  it('ignores case and slash direction on Windows', () => {
    expect(isSameFile('C:\\Docs\\Lease.pdf', 'c:/docs/LEASE.pdf', 'win')).toBe(true);
    expect(isSameFile('C:\\Docs\\Lease.pdf', 'C:\\Docs\\Other.pdf', 'win')).toBe(false);
  });
});
