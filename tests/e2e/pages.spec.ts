import { readFileSync } from 'node:fs';
import { PDFDocument } from '@cantoo/pdf-lib';
import { expect, test, type Page } from '@playwright/test';
import { openDocument } from '../../src/engine/document';
import { annotate, bar, dragOnPage, tool } from './annotating-helpers';
import {
  lastWrite,
  pageElement,
  paintIn,
  queueSavePath,
  rememberPage,
  reopenSaved,
  saveTo,
  waitForRedraw,
  whatChanged,
} from './editing-helpers';
import { ORIGINAL_PATH, expectOpenDocument, expectPageDrawn, openFixture } from './helpers';

const PLAIN = 'test-pdfs/01-plain-text.pdf';

const pagesMode = (page: Page) => page.getByRole('button', { name: 'Pages', exact: true });
const tools = (page: Page) => page.getByRole('toolbar', { name: 'Page tools' });
const pageTool = (page: Page, name: string) => tools(page).getByRole('button', { name });
const grid = (page: Page) => page.getByRole('list', { name: 'Pages in this document' });
const tile = (page: Page, position: number) =>
  grid(page).getByRole('button', { name: new RegExp(`^Page ${String(position)}(,|$)`) });
const status = (page: Page) => page.getByTestId('page-indicator');

async function openPages(page: Page, fixture = PLAIN, count = 3) {
  await openFixture(page, fixture, 'Lease.pdf');
  await expectOpenDocument(page, count);
  await expectPageDrawn(page);
  await pagesMode(page).click();
  await expect(grid(page)).toBeVisible();
}

const backToPages = async (page: Page, count = 3) => {
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(status(page)).toHaveText(new RegExp(`^Page \\d+ of ${String(count)}$`));
};

async function savedFirstLines(page: Page): Promise<readonly string[]> {
  const doc = await openDocument(Uint8Array.from((await lastWrite(page))?.bytes ?? []));
  const lines: string[] = [];
  for (let number = 1; number <= doc.pageCount; number += 1) {
    lines.push((await doc.pageText(number)).blocks[0]?.text ?? '');
  }
  await doc.close();
  return lines;
}

test.describe('Pages mode', () => {
  test('shows every page, and how many', async ({ page }) => {
    await openPages(page);
    await expect(grid(page).getByRole('button')).toHaveCount(3);
    await expect(status(page)).toHaveText('3 pages');
  });

  test('picks pages by click, Shift and the platform’s modifier', async ({ page }) => {
    await openPages(page);
    await tile(page, 1).click();
    await expect(status(page)).toHaveText('1 of 3 pages selected');
    await tile(page, 3).click({ modifiers: ['Shift'] });
    await expect(status(page)).toHaveText('3 of 3 pages selected');
    await tile(page, 2).click({ modifiers: ['ControlOrMeta'] });
    await expect(tile(page, 2)).toHaveAttribute('aria-pressed', 'false');
    await expect(status(page)).toHaveText('2 of 3 pages selected');
  });

  test('can’t delete every page', async ({ page }) => {
    await openPages(page);
    await grid(page).focus();
    await tile(page, 1).focus();
    await page.keyboard.press('ControlOrMeta+a');
    await expect(pageTool(page, 'Delete')).toHaveAttribute('aria-disabled', 'true');
  });

  test('isn’t available on a PDF protected against changes', async ({ page }) => {
    await openFixture(page, 'test-pdfs/20-owner-restricted.pdf', 'Protected.pdf');
    await expect(pagesMode(page)).toBeDisabled();
  });

  test('warns first on a signed PDF', async ({ page }) => {
    await openFixture(page, 'test-pdfs/19-digitally-signed.pdf', 'Signed.pdf');
    await pagesMode(page).click();
    await expect(
      page.getByRole('alertdialog', { name: 'Editing will break the signature' }),
    ).toBeVisible();
  });
});

test.describe('reordering', () => {
  test('by the Move buttons, and saved in that order', async ({ page }) => {
    await openPages(page);
    await tile(page, 3).click();
    await pageTool(page, 'Move earlier').click();
    await pageTool(page, 'Move earlier').click();
    await expect(tile(page, 1)).toHaveAttribute('aria-pressed', 'true');
    await saveTo(page);
    expect(await savedFirstLines(page)).toEqual([
      'Plain text, page 3',
      'Plain text, page 1',
      'Plain text, page 2',
    ]);
  });

  test('several at once by dragging, which stay chosen', async ({ page }) => {
    await openPages(page);
    await tile(page, 2).click();
    await tile(page, 3).click({ modifiers: ['Shift'] });
    const from = await tile(page, 3).boundingBox();
    const to = await tile(page, 1).boundingBox();
    if (!from || !to) throw new Error('Not on screen.');
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + 10, to.y + to.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect(status(page)).toHaveText('2 of 3 pages selected');
    await saveTo(page);
    expect((await savedFirstLines(page)).slice(0, 2)).toEqual([
      'Plain text, page 2',
      'Plain text, page 3',
    ]);
  });

  test('the current page is one that exists after deleting the last', async ({ page }) => {
    await openFixture(page, PLAIN, 'Lease.pdf');
    await expectOpenDocument(page, 3);
    await pageElement(page, 3).scrollIntoViewIfNeeded();
    await expect(status(page)).toHaveText('Page 3 of 3');
    await pagesMode(page).click();
    await tile(page, 3).click();
    await pageTool(page, 'Delete').click();
    await backToPages(page, 2);
    await expect(status(page)).not.toHaveText('Page 3 of 2');
  });

  test('by dragging', async ({ page }) => {
    await openPages(page);
    const from = await tile(page, 3).boundingBox();
    const to = await tile(page, 1).boundingBox();
    if (!from || !to) throw new Error('Not on screen.');
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + 10, to.y + to.height / 2, { steps: 10 });
    await page.mouse.up();
    await saveTo(page);
    expect((await savedFirstLines(page))[0]).toBe('Plain text, page 3');
  });

  test('by the keyboard, with Alt and an arrow', async ({ page }) => {
    await openPages(page);
    await tile(page, 1).focus();
    await page.keyboard.press(' ');
    await page.keyboard.press('Alt+ArrowRight');
    await expect(tile(page, 2)).toBeFocused();
    await saveTo(page);
    expect((await savedFirstLines(page)).slice(0, 2)).toEqual([
      'Plain text, page 2',
      'Plain text, page 1',
    ]);
  });

  test('is one undo, and undoing it saves the original exactly', async ({ page }) => {
    await openPages(page);
    await tile(page, 3).click();
    await pageTool(page, 'Move earlier').click();
    await expect(page.getByText('1 unsaved change')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await saveTo(page);
    const saved = Uint8Array.from((await lastWrite(page))?.bytes ?? []);
    expect(Buffer.compare(saved, readFileSync(PLAIN))).toBe(0);
  });

  test('the pages follow in the other modes, and search finds the moved one', async ({ page }) => {
    await openPages(page);
    await tile(page, 3).click();
    await pageTool(page, 'Move earlier').click();
    await pageTool(page, 'Move earlier').click();
    await backToPages(page);
    await page.keyboard.press('ControlOrMeta+f');
    // Page 2 is last now, so finding it means search reads the pages as they are.
    await page.getByRole('searchbox').fill('page 2');
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText('Page 3 of 3');
  });
});

test.describe('rotating', () => {
  test('turns the page on screen and in the saved file', async ({ page }) => {
    await openPages(page);
    await tile(page, 2).click();
    await pageTool(page, 'Rotate right').click();
    await backToPages(page);
    const box = await pageElement(page, 2).boundingBox();
    expect(box?.width).toBeGreaterThan(box?.height ?? 0);
    await saveTo(page);
    const saved = await PDFDocument.load(Uint8Array.from((await lastWrite(page))?.bytes ?? []));
    expect(saved.getPage(1).getRotation().angle).toBe(90);
    expect(saved.getPage(0).getRotation().angle).toBe(0);
  });

  test('left and right cancel out', async ({ page }) => {
    await openPages(page);
    await tile(page, 2).click();
    await pageTool(page, 'Rotate right').click();
    await pageTool(page, 'Rotate left').click();
    await saveTo(page);
    const saved = await PDFDocument.load(Uint8Array.from((await lastWrite(page))?.bytes ?? []));
    expect(saved.getPage(1).getRotation().angle).toBe(0);
  });
});

test.describe('the keyboard in the grid', () => {
  test('Home, End and Backspace do what they say', async ({ page }) => {
    await openPages(page);
    await tile(page, 1).focus();
    await page.keyboard.press('End');
    await expect(tile(page, 3)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(tile(page, 1)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press(' ');
    await page.keyboard.press('Backspace');
    await expect(grid(page).getByRole('button')).toHaveCount(2);
  });

  test('Shift with an arrow picks from the page the keyboard is on', async ({ page }) => {
    await openPages(page);
    await tile(page, 1).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowLeft');
    await expect(tile(page, 2)).toHaveAttribute('aria-pressed', 'true');
    await expect(tile(page, 3)).toHaveAttribute('aria-pressed', 'true');
    await expect(tile(page, 1)).toHaveAttribute('aria-pressed', 'false');
  });

  test('an unavailable tool says why, rather than doing nothing', async ({ page }) => {
    await openPages(page);
    await tile(page, 1).click();
    // Forced, as the test tool won't click something marked unavailable, though a person can.
    await pageTool(page, 'Move earlier').click({ force: true });
    await expect(
      page.getByRole('status').filter({ hasText: 'can’t move any earlier' }),
    ).toBeAttached();
  });
});

test.describe('deleting', () => {
  test('removes the pages, and undo brings them back', async ({ page }) => {
    await openPages(page);
    await tile(page, 2).click();
    await pageTool(page, 'Delete').click();
    await expect(grid(page).getByRole('button')).toHaveCount(2);
    await expect(page.getByRole('status').filter({ hasText: 'Deleted 1 page' })).toBeAttached();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(grid(page).getByRole('button')).toHaveCount(3);
  });

  test('saves without them', async ({ page }) => {
    await openPages(page);
    await tile(page, 2).click();
    await page.keyboard.press('Delete');
    await saveTo(page);
    expect(await savedFirstLines(page)).toEqual(['Plain text, page 1', 'Plain text, page 3']);
  });
});

test.describe('extracting', () => {
  test('saves just the chosen pages as a new file, leaving the document as it was', async ({
    page,
  }) => {
    await openPages(page);
    await tile(page, 2).click();
    await tile(page, 3).click({ modifiers: ['Shift'] });
    await queueSavePath(page, '/Users/test/Lease (pages 2–3).pdf');
    await pageTool(page, 'Extract').click();
    await expect(page.getByText('Pages saved as a new file')).toBeVisible();
    expect(await savedFirstLines(page)).toEqual(['Plain text, page 2', 'Plain text, page 3']);
    await expect(grid(page).getByRole('button')).toHaveCount(3);
    await expect(page.getByText('unsaved change')).toHaveCount(0);
  });

  test('suggests a name that says which pages', async ({ page }) => {
    await openPages(page);
    await tile(page, 2).click();
    await pageTool(page, 'Extract').click();
    await expect
      .poll(() => page.evaluate(() => window.smorsyMock?.lastSuggestedName ?? null))
      .toBe('Lease (page 2).pdf');
  });

  test('won’t write over the file being worked on', async ({ page }) => {
    await openPages(page);
    await tile(page, 2).click();
    await queueSavePath(page, ORIGINAL_PATH);
    await pageTool(page, 'Extract').click();
    await expect(page.getByRole('alertdialog')).toContainText('That’s the file you’re working on');
  });
});

test.describe('edits on pages that move or turn', () => {
  test('a drawing goes with its page when the page moves', async ({ page }) => {
    await openFixture(page, PLAIN, 'Lease.pdf');
    await expectOpenDocument(page, 3);
    await expectPageDrawn(page);
    await annotate(page);
    await pageElement(page, 3).scrollIntoViewIfNeeded();
    await bar(page).getByRole('button', { name: 'Colour: pink' }).click();
    await tool(page, 'Rectangle').click();
    await dragOnPage(page, [150, 400], [350, 520], 3);
    await page.keyboard.press('Escape');
    await pagesMode(page).click();
    await tile(page, 3).click();
    await pageTool(page, 'Move earlier').click();
    await pageTool(page, 'Move earlier').click();
    await backToPages(page);
    await expect(pageElement(page, 1).locator('[data-kind="rect"]')).toHaveCount(1);
    await expect(pageElement(page, 3).locator('[data-kind="rect"]')).toHaveCount(0);
    await saveTo(page);
    await reopenSaved(page, 3);
    await waitForRedraw(page, 1);
    const region = { x: 145, y: 395, width: 210, height: 130 };
    expect((await paintIn(page, 1, region)).red).toBeGreaterThan(50);
  });

  test('a drawing turns with its page, on screen and in the file', async ({ page }) => {
    await openPages(page);
    await tile(page, 1).click();
    await pageTool(page, 'Rotate right').click();
    await backToPages(page);
    // In Annotate mode, as at the end, since its panel changes the page's size on screen.
    await annotate(page);
    await rememberPage(page, 1);
    await page.getByRole('button', { name: 'Undo' }).click();
    await bar(page).getByRole('button', { name: 'Colour: pink' }).click();
    await tool(page, 'Rectangle').click();
    await dragOnPage(page, [150, 400], [350, 520]);
    await page.keyboard.press('Escape');
    await pagesMode(page).click();
    await tile(page, 1).click();
    await pageTool(page, 'Rotate right').click();
    await backToPages(page);
    await annotate(page);
    await waitForRedraw(page, 1);
    const hit = await pageElement(page, 1).locator('[data-kind="rect"]').boundingBox();
    const sheet = await pageElement(page, 1).boundingBox();
    if (!hit || !sheet) throw new Error('Not on screen.');
    await saveTo(page);
    await reopenSaved(page, 3);
    await annotate(page);
    const changed = await whatChanged(page, 1);
    expect(changed.pixels).toBeGreaterThan(50);
    expect(changed.x).toBeCloseTo(hit.x - sheet.x, -1);
    expect(changed.y).toBeCloseTo(hit.y - sheet.y, -1);
    expect(changed.width).toBeCloseTo(hit.width, -1);
    expect(changed.height).toBeCloseTo(hit.height, -1);
  });

  test('a comment on a deleted page goes, and comes back with undo', async ({ page }) => {
    await openFixture(page, PLAIN, 'Lease.pdf');
    await expectOpenDocument(page, 3);
    await expectPageDrawn(page);
    await annotate(page);
    await pageElement(page, 2).scrollIntoViewIfNeeded();
    await tool(page, 'Comment').click();
    const sheet = await pageElement(page, 2).boundingBox();
    await page.mouse.click((sheet?.x ?? 0) + 300, (sheet?.y ?? 0) + 300);
    await page.keyboard.type('On page two');
    await page.mouse.click((sheet?.x ?? 0) + 40, (sheet?.y ?? 0) + 700);
    await pagesMode(page).click();
    await tile(page, 2).click();
    await pageTool(page, 'Delete').click();
    await saveTo(page);
    const doc = await openDocument(Uint8Array.from((await lastWrite(page))?.bytes ?? []));
    const notes = [...(await doc.existingNotes(1)), ...(await doc.existingNotes(2))];
    await doc.close();
    expect(notes).toEqual([]);
    await page.getByRole('button', { name: 'Undo' }).click();
    await backToPages(page);
    await annotate(page);
    await expect(page.locator('[data-kind="comment"]')).toHaveCount(1);
  });

  test('a form on a moved page fills where it now is', async ({ page }) => {
    await openFixture(page, 'test-pdfs/16-irs-form-w9.pdf', 'W9.pdf');
    await expectOpenDocument(page, 6);
    await page.getByRole('button', { name: 'Edit anyway' }).click();
    await page
      .getByRole('alertdialog', { name: 'Editing will break the signature' })
      .getByRole('button', { name: 'Edit anyway' })
      .click();
    await pagesMode(page).click();
    await tile(page, 1).click();
    await pageTool(page, 'Move later').click();
    await backToPages(page, 6);
    const field = pageElement(page, 2).locator('input.form-field[type="text"]').first();
    await field.fill('Theo Okafor');
    await expect(pageElement(page, 1).locator('input.form-field')).toHaveCount(0);
    await saveTo(page);
    const doc = await openDocument(Uint8Array.from((await lastWrite(page))?.bytes ?? []));
    const fields = await doc.formFields();
    await doc.close();
    expect(fields.find((one) => one.value === 'Theo Okafor')?.pageNumber).toBe(2);
  });

  test('answers on a deleted page go, and the rest stay', async ({ page }) => {
    await openFixture(page, 'test-pdfs/16-irs-form-w9.pdf', 'W9.pdf');
    await expectOpenDocument(page, 6);
    await page.getByRole('button', { name: 'Edit anyway' }).click();
    await page
      .getByRole('alertdialog', { name: 'Editing will break the signature' })
      .getByRole('button', { name: 'Edit anyway' })
      .click();
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await pageElement(page, 1).locator('input.form-field[type="text"]').first().fill('Kept answer');
    await pageElement(page, 2).scrollIntoViewIfNeeded();
    const second = pageElement(page, 2).locator('input.form-field[type="text"]').first();
    const hasSecond = (await second.count()) > 0;
    if (hasSecond) await second.fill('Deleted answer');
    await pagesMode(page).click();
    await tile(page, 2).click();
    await pageTool(page, 'Delete').click();
    await saveTo(page);
    const doc = await openDocument(Uint8Array.from((await lastWrite(page))?.bytes ?? []));
    const values = (await doc.formFields()).map((one) => one.value);
    await doc.close();
    expect(values).toContain('Kept answer');
    expect(values).not.toContain('Deleted answer');
  });
});
