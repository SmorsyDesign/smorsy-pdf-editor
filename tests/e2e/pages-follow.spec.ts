import { PDFDocument } from '@cantoo/pdf-lib';
import { expect, test, type Page } from '@playwright/test';
import { bar, dragOnPage, tool } from './annotating-helpers';
import {
  lastWrite,
  openBytes,
  pageElement,
  paintIn,
  rememberPage,
  reopenSaved,
  saveTo,
  waitForRedraw,
  whatChanged,
} from './editing-helpers';
import { expectOpenDocument, expectPageDrawn, openFixture } from './helpers';
import { expectSavedToMatchScreen, placeTyped } from './signing-helpers';

const PLAIN = 'test-pdfs/01-plain-text.pdf';
const pagesMode = (page: Page) => page.getByRole('button', { name: 'Pages', exact: true });
const pageTool = (page: Page, name: string) =>
  page.getByRole('toolbar', { name: 'Page tools' }).getByRole('button', { name });
const grid = (page: Page) => page.getByRole('list', { name: 'Pages in this document' });
const tile = (page: Page, position: number) =>
  grid(page).getByRole('button', { name: new RegExp(`^Page ${String(position)}(,|$)`) });
const mode = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click();

/** Page 3 to the front, turned right: the same steps each time, so the result can be compared. */
async function bringThirdForwardTurned(page: Page) {
  await pagesMode(page).click();
  await tile(page, 3).click();
  await pageTool(page, 'Move earlier').click();
  await pageTool(page, 'Move earlier').click();
  await pageTool(page, 'Rotate right').click();
  await mode(page, 'Select');
  await waitForRedraw(page, 1);
}

async function open(page: Page, fixture = PLAIN, count = 3) {
  await openFixture(page, fixture, 'Lease.pdf');
  await expectOpenDocument(page, count);
  await expectPageDrawn(page);
}

const savedBytes = async (page: Page) => Uint8Array.from((await lastWrite(page))?.bytes ?? []);

test.describe('what’s on a page goes with it when it moves and turns', () => {
  test('text added before, saved where it shows', async ({ page }) => {
    await open(page);
    await bringThirdForwardTurned(page);
    await rememberPage(page, 1);
    for (let step = 0; step < 3; step += 1) {
      await page.getByRole('button', { name: 'Undo' }).click();
    }
    await mode(page, 'Edit text');
    await pageElement(page, 3).scrollIntoViewIfNeeded();
    await pageElement(page, 3)
      .getByTestId('edit-layer')
      .click({ position: { x: 150, y: 500 } });
    await page.getByRole('textbox', { name: 'Text', exact: true }).fill('Moved words');
    await page.keyboard.press('ControlOrMeta+Enter');
    await bringThirdForwardTurned(page);
    const words = pageElement(page, 1).getByText('Moved words');
    await expect(words).toBeVisible();
    const box = await words.boundingBox();
    const sheet = await pageElement(page, 1).boundingBox();
    if (!box || !sheet) throw new Error('Not on screen.');
    await saveTo(page);
    await reopenSaved(page, 3);
    const changed = await whatChanged(page, 1);
    expect(changed.pixels).toBeGreaterThan(30);
    // Turned with the page, it reads down the page rather than across.
    expect(changed.height).toBeGreaterThan(changed.width);
    expect(changed.x).toBeGreaterThanOrEqual(box.x - sheet.x - 8);
    expect(changed.x + changed.width).toBeLessThanOrEqual(box.x - sheet.x + box.width + 8);
    expect(changed.y).toBeGreaterThanOrEqual(box.y - sheet.y - 8);
    expect(changed.y + changed.height).toBeLessThanOrEqual(box.y - sheet.y + box.height + 8);
  });

  test('a signature, saved exactly as the screen shows it', async ({ page }) => {
    await open(page);
    await mode(page, 'Sign');
    await pageElement(page, 3).scrollIntoViewIfNeeded();
    await placeTyped(page, 200, 300, 3);
    await bringThirdForwardTurned(page);
    await mode(page, 'Sign');
    await expectSavedToMatchScreen(page, 1, 3);
  });

  test('on a page that already had its own turn', async ({ page }) => {
    await open(page, 'test-pdfs/06-rotated-pages.pdf', 4);
    await pagesMode(page).click();
    await tile(page, 2).click();
    await pageTool(page, 'Rotate right').click();
    await mode(page, 'Annotate');
    await pageElement(page, 2).scrollIntoViewIfNeeded();
    await waitForRedraw(page, 2);
    await rememberPage(page, 2);
    await bar(page).getByRole('button', { name: 'Colour: pink' }).click();
    await tool(page, 'Rectangle').click();
    await dragOnPage(page, [100, 200], [260, 300], 2);
    await page.keyboard.press('Escape');
    await saveTo(page);
    const saved = await PDFDocument.load(await savedBytes(page));
    expect(saved.getPage(1).getRotation().angle).toBe(180);
    await reopenSaved(page, 4);
    await mode(page, 'Annotate');
    const changed = await whatChanged(page, 2);
    expect(changed.x).toBeCloseTo(100, -1);
    expect(changed.y).toBeCloseTo(200, -1);
    expect(changed.width).toBeCloseTo(160, -1);
    expect(changed.height).toBeCloseTo(100, -1);
  });

  test('turned, drawn on, and turned again', async ({ page }) => {
    await open(page);
    await pagesMode(page).click();
    await tile(page, 1).click();
    await pageTool(page, 'Rotate right').click();
    await pageTool(page, 'Rotate right').click();
    await mode(page, 'Annotate');
    await waitForRedraw(page, 1);
    await rememberPage(page, 1);
    await page.getByRole('button', { name: 'Undo' }).click();
    await bar(page).getByRole('button', { name: 'Colour: pink' }).click();
    await tool(page, 'Rectangle').click();
    await dragOnPage(page, [100, 200], [260, 300]);
    await page.keyboard.press('Escape');
    await pagesMode(page).click();
    await tile(page, 1).click();
    await pageTool(page, 'Rotate right').click();
    await mode(page, 'Annotate');
    const hit = await pageElement(page, 1).locator('[data-kind="rect"]').boundingBox();
    const sheet = await pageElement(page, 1).boundingBox();
    if (!hit || !sheet) throw new Error('Not on screen.');
    await saveTo(page);
    await reopenSaved(page, 3);
    await mode(page, 'Annotate');
    const changed = await whatChanged(page, 1);
    expect(changed.x).toBeCloseTo(hit.x - sheet.x, -1);
    expect(changed.y).toBeCloseTo(hit.y - sheet.y, -1);
  });
});

test.describe('extracting pages with edits on them', () => {
  test('carries the edits into the new file', async ({ page }) => {
    await open(page);
    await mode(page, 'Annotate');
    await pageElement(page, 2).scrollIntoViewIfNeeded();
    await bar(page).getByRole('button', { name: 'Colour: pink' }).click();
    await tool(page, 'Rectangle').click();
    await dragOnPage(page, [150, 400], [350, 520], 2);
    await page.keyboard.press('Escape');
    await pagesMode(page).click();
    await tile(page, 2).click();
    await tile(page, 3).click({ modifiers: ['Shift'] });
    await page.evaluate(() => {
      if (window.smorsyMock) window.smorsyMock.nextSavePath = '/Users/test/Some pages.pdf';
    });
    await pageTool(page, 'Extract').click();
    await expect(page.getByText('Pages saved as a new file')).toBeVisible();
    // Opened fresh, since this document still has unsaved changes of its own.
    await openBytes(page, await savedBytes(page), 2);
    await waitForRedraw(page, 1);
    expect(
      (await paintIn(page, 1, { x: 145, y: 395, width: 210, height: 130 })).red,
    ).toBeGreaterThan(50);
  });

  test('leaves out what was only on pages not chosen', async ({ page }) => {
    await open(page);
    await mode(page, 'Sign');
    await placeTyped(page, 200, 300, 1);
    await pagesMode(page).click();
    await tile(page, 2).click();
    await page.evaluate(() => {
      if (window.smorsyMock) window.smorsyMock.nextSavePath = '/Users/test/Page two.pdf';
    });
    await pageTool(page, 'Extract').click();
    await expect(page.getByText('Page saved as a new file')).toBeVisible();
    const doc = await PDFDocument.load(await savedBytes(page));
    const images = doc.context
      .enumerateIndirectObjects()
      .filter(([, object]) => object.toString().includes('/Subtype /Image'));
    expect(images).toEqual([]);
  });
});

test.describe('the selection after undo and redo', () => {
  test('starts again, so nothing acts on pages that have changed', async ({ page }) => {
    await open(page);
    await pagesMode(page).click();
    await tile(page, 1).click();
    await pageTool(page, 'Delete').click();
    await page.getByRole('button', { name: 'Undo' }).click();
    await tile(page, 3).click();
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(grid(page).getByRole('button')).toHaveCount(2);
    await expect(page.getByTestId('page-indicator')).toHaveText('2 pages');
    await expect(grid(page).locator('[tabindex="0"]')).toHaveCount(1);
  });
});
