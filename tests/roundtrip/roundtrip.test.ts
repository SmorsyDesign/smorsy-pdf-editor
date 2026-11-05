import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from '@cantoo/pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { afterAll, describe, expect, it } from 'vitest';
import { openDocument } from '../../src/engine/document';
import { unchangedCopy } from '../../src/engine/save';

const FOLDER = 'test-pdfs';
const PASSWORDS: Readonly<Record<string, string>> = { '10-password-protected.pdf': 'smorsy-test' };
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
  const task = getDocument({ data: bytes.slice(), ...(password ? { password } : {}) });
  const document = await task.promise;
  let annotations = 0;
  let links = 0;
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const found = (await page.getAnnotations()) as { subtype?: string }[];
    annotations += found.length;
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

/** qpdf exits 0 for clean files, 3 for warnings it can repair, and 2 for real errors. */
function qpdfStatus(path: string, password?: string): number | null {
  const args = ['--check', ...(password ? [`--password=${password}`] : []), path];
  return spawnSync('qpdf', args, { stdio: 'ignore' }).status;
}

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

  it('keeps pages, annotations, links and bookmarks through a re-save', async () => {
    const before = await inspect(original, password);
    const document = await PDFDocument.load(original, password ? { password } : {});
    const saved = await document.save();

    const path = join(temp, name);
    writeFileSync(path, saved);
    expect([0, 3]).toContain(qpdfStatus(path));

    expect(await inspect(saved)).toEqual(before);
  });
});
