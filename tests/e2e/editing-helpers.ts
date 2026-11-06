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

export async function waitForRedraw(page: Page, pageNumber: number) {
  // A zoom change redraws after a short pause, so being drawn right now could be the old size.
  await page.waitForTimeout(300);
  await expect(pageElement(page, pageNumber).locator('canvas').first()).toHaveAttribute(
    'data-drawn',
    'true',
  );
}

/** Remembers how a page looks now, to compare with once it's been saved and reopened. */
export async function rememberPage(page: Page, pageNumber: number) {
  await showPage(page, pageNumber);
  await waitForRedraw(page, pageNumber);
  await page.evaluate((number) => {
    const source = document.querySelector<HTMLCanvasElement>(`[data-page="${number}"] canvas`);
    if (!source) throw new Error('The page isn’t on screen.');
    const copy = document.createElement('canvas');
    copy.width = source.width;
    copy.height = source.height;
    const context = copy.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('No drawing context.');
    context.drawImage(source, 0, 0);
    (window as unknown as { rememberedPage: ImageData }).rememberedPage = context.getImageData(
      0,
      0,
      copy.width,
      copy.height,
    );
  }, pageNumber);
}

/** The box around everything that's different from the remembered page, in displayed pixels. */
export async function whatChanged(page: Page, pageNumber: number) {
  await showPage(page, pageNumber);
  await waitForRedraw(page, pageNumber);
  return page.evaluate((number) => {
    const source = document.querySelector<HTMLCanvasElement>(`[data-page="${number}"] canvas`);
    const before = (window as unknown as { rememberedPage: ImageData }).rememberedPage;
    if (!source) throw new Error('The page isn’t on screen.');
    if (source.width !== before.width || source.height !== before.height) {
      throw new Error('The page is a different size, so it can’t be compared.');
    }
    const ratio = source.width / source.getBoundingClientRect().width;
    const copy = document.createElement('canvas');
    copy.width = source.width;
    copy.height = source.height;
    const context = copy.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('No drawing context.');
    context.drawImage(source, 0, 0);
    const { data } = context.getImageData(0, 0, copy.width, copy.height);
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    let pixels = 0;
    let red = 0;
    let green = 0;
    let blue = 0;
    for (let y = 0; y < copy.height; y += 1) {
      for (let x = 0; x < copy.width; x += 1) {
        const at = (y * copy.width + x) * 4;
        const difference =
          Math.abs((data[at] ?? 0) - (before.data[at] ?? 0)) +
          Math.abs((data[at + 1] ?? 0) - (before.data[at + 1] ?? 0)) +
          Math.abs((data[at + 2] ?? 0) - (before.data[at + 2] ?? 0));
        if (difference <= 48) continue;
        pixels += 1;
        red += data[at] ?? 0;
        green += data[at + 1] ?? 0;
        blue += data[at + 2] ?? 0;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
    return {
      pixels,
      x: left / ratio,
      y: top / ratio,
      width: (right - left) / ratio,
      height: (bottom - top) / ratio,
      average: pixels ? [red / pixels, green / pixels, blue / pixels] : [0, 0, 0],
    };
  }, pageNumber);
}
