import { expect, type Locator, type Page } from '@playwright/test';
import { openDocument } from '../../src/engine/document';
import { expectOpenDocument, expectPageDrawn, openFixture } from './helpers';

export const PLAIN = 'test-pdfs/01-plain-text.pdf';
export const HEADING = 'Plain text, page 1';

export async function openForEditing(page: Page, fixture = PLAIN, pageCount = 3) {
  await openFixture(page, fixture, 'Lease.pdf');
  await expectOpenDocument(page, pageCount);
  await expectPageDrawn(page);
  await page.getByRole('button', { name: 'Edit text', exact: true }).click();
  await expect(page.getByTestId('edit-layer').first()).toBeVisible();
}

/** The IRS forms carry a usage-rights signature, so they open in View mode like any signed PDF. */
export async function openSignedForEditing(page: Page, fixture: string, pageCount: number) {
  await openFixture(page, fixture, 'Lease.pdf');
  await expectOpenDocument(page, pageCount);
  await expectPageDrawn(page);
  await page.getByRole('button', { name: 'Edit anyway' }).click();
  await page
    .getByRole('alertdialog', { name: 'Editing will break the signature' })
    .getByRole('button', { name: 'Edit anyway' })
    .click();
  await expect(page.getByTestId('edit-layer').first()).toBeVisible();
}

export const block = (page: Page, text: string) =>
  page.getByRole('button', { name: `Edit text: ${text}` }).first();

export const editor = (page: Page) => page.getByTestId('text-editor');
export const field = (page: Page) =>
  editor(page).getByRole('textbox', { name: 'Text', exact: true });

export async function replaceHeading(page: Page, text: string) {
  await block(page, HEADING).click();
  await field(page).fill(text);
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(editor(page)).toHaveCount(0);
}

export const queueSavePath = (page: Page, path: string) =>
  page.evaluate((chosen) => {
    if (window.smorsyMock) window.smorsyMock.nextSavePath = chosen;
  }, path);

export const lastWrite = (page: Page) =>
  page.evaluate(() => {
    const write = window.smorsyMock?.lastWrite;
    return write ? { path: write.path, bytes: Array.from(write.bytes) } : null;
  });

/**
 * Reopens what was saved, as a person would, and reads the text that's really in the file. It's
 * one string because covered text is still there, and sits on the same line as its replacement.
 */
export async function savedText(page: Page, pageNumber = 1): Promise<string> {
  const write = await lastWrite(page);
  if (!write) throw new Error('Nothing was saved.');
  const doc = await openDocument(Uint8Array.from(write.bytes));
  const { blocks } = await doc.pageText(pageNumber);
  await doc.close();
  return blocks.map((item) => item.text).join('\n');
}

export async function saveTo(page: Page, path = '/Users/test/Lease-edited.pdf') {
  await queueSavePath(page, path);
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByText('Copy saved')).toBeVisible();
}

export async function savedBlocks(page: Page, pageNumber = 1) {
  const write = await lastWrite(page);
  if (!write) throw new Error('Nothing was saved.');
  const doc = await openDocument(Uint8Array.from(write.bytes));
  const { blocks } = await doc.pageText(pageNumber);
  await doc.close();
  return blocks;
}

/** Opens the saved file in the app, so its pages are drawn by the real renderer. */
export async function reopenSaved(page: Page, pageCount: number) {
  await page.evaluate(() => {
    const mock = window.smorsyMock;
    if (!mock?.lastWrite) throw new Error('Nothing was saved.');
    mock.nextOpen = {
      path: '/Users/test/Reopened.pdf',
      name: 'Reopened.pdf',
      bytes: mock.lastWrite.bytes,
    };
  });
  await page.keyboard.press('ControlOrMeta+o');
  await expect(page.locator('.file-name')).toHaveText('Reopened.pdf');
  await expectOpenDocument(page, pageCount);
}

export const pageElement = (page: Page, pageNumber: number) =>
  page.locator(`[data-page="${pageNumber}"]`);

export async function showPage(page: Page, pageNumber: number) {
  await pageElement(page, pageNumber).scrollIntoViewIfNeeded();
  await expectPageDrawn(page, pageNumber);
}

export interface Region {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Where something sits on its page, in the page's own displayed pixels. */
export async function regionOnPage(item: Locator, pageBox: Locator): Promise<Region> {
  const box = await item.boundingBox();
  const parent = await pageBox.boundingBox();
  if (!box || !parent) throw new Error('Not on screen.');
  return { x: box.x - parent.x, y: box.y - parent.y, width: box.width, height: box.height };
}

/** Counts what's really been painted in part of a page, by reading the drawn pixels. */
export function paintIn(page: Page, pageNumber: number, region: Region) {
  return page.evaluate(
    ({ number, area }) => {
      const canvas = document.querySelector<HTMLCanvasElement>(`[data-page="${number}"] canvas`);
      if (!canvas) throw new Error('The page has no canvas.');
      const ratio = canvas.width / canvas.getBoundingClientRect().width;
      const copy = document.createElement('canvas');
      copy.width = canvas.width;
      copy.height = canvas.height;
      const context = copy.getContext('2d');
      if (!context) throw new Error('No drawing context.');
      context.drawImage(canvas, 0, 0);
      const { data } = context.getImageData(
        Math.round(area.x * ratio),
        Math.round(area.y * ratio),
        Math.max(1, Math.round(area.width * ratio)),
        Math.max(1, Math.round(area.height * ratio)),
      );
      const colours = new Map<string, number>();
      let dark = 0;
      let light = 0;
      let red = 0;
      for (let at = 0; at < data.length; at += 4) {
        const r = data[at] ?? 0;
        const g = data[at + 1] ?? 0;
        const b = data[at + 2] ?? 0;
        if (r + g + b < 384) dark += 1;
        if (r + g + b > 660) light += 1;
        if (r > 180 && g < 90 && b < 90) red += 1;
        const key = `${r},${g},${b}`;
        colours.set(key, (colours.get(key) ?? 0) + 1);
      }
      const common = [...colours.entries()].sort((one, two) => two[1] - one[1])[0]?.[0] ?? '';
      return { dark, light, red, common };
    },
    { number: pageNumber, area: region },
  );
}
