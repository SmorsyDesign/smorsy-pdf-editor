import { PDFDocument } from '@cantoo/pdf-lib';
import { expect, test, type Page } from '@playwright/test';
import { openDocument } from '../../src/engine/document';
import {
  addComment,
  annotate,
  bar,
  clickOnPage,
  dragOnPage,
  drawRectangle,
  filters,
  open,
  panel,
  rows,
  scopeButton,
  tabButton,
  tagInput,
  tool,
} from './annotating-helpers';
import {
  lastWrite,
  openBytes,
  pageElement,
  paintIn,
  rememberPage,
  reopenSaved,
  saveTo,
  waitForRedraw,
} from './editing-helpers';

const ROTATED = 'test-pdfs/06-rotated-pages.pdf';
const savedBytes = async (page: Page) => Uint8Array.from((await lastWrite(page))?.bytes ?? []);

test.describe('moving something saved, on a turned page', () => {
  for (const [pageNumber, angle] of [
    [2, 90],
    [3, 180],
    [4, 270],
  ] as const) {
    test(`at ${String(angle)}°: leaves the old spot and saves in the new one`, async ({ page }) => {
      await open(page, ROTATED, 4);
      await pageElement(page, pageNumber).scrollIntoViewIfNeeded();
      await waitForRedraw(page, pageNumber);
      await bar(page).getByRole('button', { name: 'Colour: pink' }).click();
      await tool(page, 'Rectangle').click();
      // Low enough to be clear of the tools, which float over the top of the view.
      await dragOnPage(page, [100, 200], [220, 280], pageNumber);
      await page.keyboard.press('Escape');
      await saveTo(page);
      await reopenSaved(page, 4);
      await annotate(page);
      await pageElement(page, pageNumber).scrollIntoViewIfNeeded();
      await waitForRedraw(page, pageNumber);
      const old = { x: 95, y: 195, width: 130, height: 90 };
      expect((await paintIn(page, pageNumber, old)).red).toBeGreaterThan(50);

      const shape = pageElement(page, pageNumber).locator('[data-kind="rect"]');
      await shape.click({ position: { x: 5, y: 5 } });
      const box = await shape.boundingBox();
      if (!box) throw new Error('Not on screen.');
      await page.mouse.move(box.x + 40, box.y + 40);
      await page.mouse.down();
      await page.mouse.move(box.x + 40, box.y + 240, { steps: 5 });
      await page.mouse.up();
      await waitForRedraw(page, pageNumber);
      expect((await paintIn(page, pageNumber, old)).red).toBe(0);

      await saveTo(page);
      await reopenSaved(page, 4);
      await annotate(page);
      await pageElement(page, pageNumber).scrollIntoViewIfNeeded();
      await waitForRedraw(page, pageNumber);
      expect((await paintIn(page, pageNumber, old)).red).toBe(0);
      const moved = { ...old, y: old.y + 200 };
      expect((await paintIn(page, pageNumber, moved)).red).toBeGreaterThan(50);
    });
  }
});

test.describe('how a saved comment looks', () => {
  for (const [pageNumber, angle] of [
    [1, 0],
    [2, 90],
    [3, 180],
    [4, 270],
  ] as const) {
    test(`at ${String(angle)}°: a bubble with its square corner at the spot`, async ({ page }) => {
      await open(page, ROTATED, 4);
      await pageElement(page, pageNumber).scrollIntoViewIfNeeded();
      await waitForRedraw(page, pageNumber);
      await rememberPage(page, pageNumber);
      await tool(page, 'Comment').click();
      await clickOnPage(page, [300, 300], pageNumber);
      await page.keyboard.type('Check this');
      await clickOnPage(page, [40, 40], pageNumber);
      const sheet = await pageElement(page, pageNumber).boundingBox();
      const size = (24 * (sheet?.width ?? 612)) / (angle % 180 === 0 ? 612 : 792);
      await saveTo(page);
      await reopenSaved(page, 4);
      await annotate(page);
      await pageElement(page, pageNumber).scrollIntoViewIfNeeded();
      await waitForRedraw(page, pageNumber);
      const corner = async (x: number, y: number) =>
        paintIn(page, pageNumber, { x, y, width: 3, height: 3 });
      // Pale paper shows as not light, whichever colour the comment is.
      const painted = async (x: number, y: number) => (await corner(x, y)).light;
      const top = 300 - size;
      expect(await painted(300.5, 300 - 3.5)).toBeLessThan(9);
      expect(await painted(300 + size - 4, top + 1)).toBeGreaterThan(0);
      expect(await painted(300 + 1, top + 1)).toBeGreaterThan(0);
    });
  }

  test('its pin stays on the page however close to the edge it’s put', async ({ page }) => {
    await open(page);
    const sheet = await pageElement(page, 1).boundingBox();
    if (!sheet) throw new Error('Not on screen.');
    await tool(page, 'Comment').click();
    await clickOnPage(page, [sheet.width - 2, 3]);
    await page.keyboard.type('Top corner');
    await clickOnPage(page, [40, 700]);
    await saveTo(page);
    await reopenSaved(page, 3);
    await annotate(page);
    const pin = await pageElement(page, 1).locator('[data-kind="comment"]').boundingBox();
    const now = await pageElement(page, 1).boundingBox();
    if (!pin || !now) throw new Error('Not on screen.');
    expect(pin.x + pin.width).toBeLessThanOrEqual(now.x + now.width + 1);
    expect(pin.y).toBeGreaterThanOrEqual(now.y - 1);
    await expect(rows(page).locator('.row-note')).toHaveCount(0);
  });
});

test.describe('undoing a change to something saved', () => {
  test('saves an exact copy, with it still in its place', async ({ page }) => {
    await open(page);
    await drawRectangle(page);
    await saveTo(page);
    await reopenSaved(page, 3);
    await annotate(page);
    await waitForRedraw(page, 1);
    const first = await savedBytes(page);
    await panel(page).getByRole('button', { name: 'Delete rectangle' }).click();
    await page.getByRole('button', { name: 'Undo' }).click();
    await saveTo(page);
    expect(Buffer.compare(first, await savedBytes(page))).toBe(0);
  });
});

test.describe('something saved, from all pages', () => {
  test('can be gone to and deleted from another page', async ({ page }) => {
    await open(page);
    await pageElement(page, 3).scrollIntoViewIfNeeded();
    await drawRectangle(page, 3);
    await saveTo(page);
    await reopenSaved(page, 3);
    await annotate(page);
    await expect(page.getByTestId('page-indicator')).toHaveText('Page 1 of 3');
    await expect(rows(page)).toHaveCount(0);
    await scopeButton(page, 'All pages').click();
    await rows(page).locator('.row-text').click();
    await expect(page.getByTestId('page-indicator')).toHaveText('Page 3 of 3');
    await expect(pageElement(page, 3).locator('[data-kind="rect"]')).toBeFocused();
    await panel(page).getByRole('button', { name: 'Delete rectangle' }).click();
    await saveTo(page);
    await reopenSaved(page, 3);
    await annotate(page);
    await scopeButton(page, 'All pages').click();
    await expect(panel(page)).toContainText('Nothing yet.');
  });
});

test.describe('clearing a saved comment', () => {
  test('and saving from inside the box takes its words out of the file', async ({ page }) => {
    await open(page);
    await addComment(page, 'Private words');
    await saveTo(page);
    await reopenSaved(page, 3);
    await annotate(page);
    await page.locator('[data-kind="comment"]').click();
    await page.getByRole('textbox', { name: 'Comment', exact: true }).fill('');
    await saveTo(page);
    const doc = await openDocument(await savedBytes(page));
    const notes = await doc.existingNotes(1);
    await doc.close();
    expect(notes).toEqual([]);
    expect(Buffer.from(await savedBytes(page)).includes('Private words')).toBe(false);
  });
});

test.describe('the filters', () => {
  test('do what they’re asked, even with something selected', async ({ page }) => {
    await open(page);
    await drawRectangle(page);
    await page.locator('[data-kind="rect"]').click({ position: { x: 5, y: 5 } });
    await tabButton(page, 'Comments').click();
    // Waited on, because it could have snapped back straight after showing as pressed.
    await page.waitForTimeout(200);
    await expect(tabButton(page, 'Comments')).toHaveAttribute('aria-pressed', 'true');
    await expect(rows(page)).toHaveCount(0);
  });

  test('keep showing a tag spelled with other capitals', async ({ page }) => {
    await open(page);
    await drawRectangle(page);
    await page.locator('[data-kind="rect"]').click({ position: { x: 5, y: 5 } });
    await tagInput(page).fill('Urgent');
    await page.keyboard.press('Enter');
    await clickOnPage(page, [40, 700]);
    await filters(page).getByRole('button', { name: 'Urgent' }).click();
    await expect(rows(page)).toHaveCount(1);
  });
});

test.describe('keyboard focus in the tag editor', () => {
  const editing = async (page: Page) => {
    await open(page);
    await drawRectangle(page);
    await tool(page, 'Ellipse').click();
    await dragOnPage(page, [150, 550], [350, 640]);
    await page.keyboard.press('Escape');
    await page.locator('[data-kind="ellipse"]').click({ position: { x: 5, y: 5 } });
    await tagInput(page).fill('Chapter 1');
    await page.keyboard.press('Enter');
    await page.locator('[data-kind="rect"]').click({ position: { x: 5, y: 5 } });
  };

  test('stays there after picking a tag', async ({ page }) => {
    await editing(page);
    await panel(page).locator('.tag-offers').getByRole('button', { name: 'Chapter 1' }).click();
    await expect(tagInput(page)).toBeFocused();
  });

  test('stays there after removing a tag', async ({ page }) => {
    await editing(page);
    await panel(page).locator('.tag-offers').getByRole('button', { name: 'Chapter 1' }).click();
    await panel(page).getByRole('button', { name: 'Remove tag Chapter 1' }).click();
    await expect(tagInput(page)).toBeFocused();
  });
});

test.describe('choosing a colour while writing a new comment', () => {
  test('keeps the comment, in that colour', async ({ page }) => {
    await open(page);
    await tool(page, 'Comment').click();
    await clickOnPage(page, [300, 300]);
    await bar(page).getByRole('button', { name: 'Colour: blue' }).click();
    const field = page.getByRole('textbox', { name: 'Comment', exact: true });
    await expect(field).toBeFocused();
    await page.keyboard.type('Blue words');
    await expect(rows(page).locator('.row-words')).toHaveText('Blue words');
  });
});

test.describe('another app’s comment', () => {
  const withComment = async (words?: string) => {
    const doc = await PDFDocument.create();
    const paper = doc.addPage([612, 792]);
    paper.drawText('Stays on the page', { x: 72, y: 700, size: 18 });
    const { context } = doc;
    paper.node.addAnnot(
      context.register(
        context.obj({
          Type: 'Annot',
          Subtype: 'Text',
          Rect: [100, 500, 124, 524],
          ...(words ? { Contents: words } : {}),
        }),
      ),
    );
    return doc.save();
  };

  test('with no drawing of its own still gets a pin', async ({ page }) => {
    await openBytes(page, await withComment('Hello'));
    await annotate(page);
    await expect(page.locator('[data-kind="comment"] .comment-pin')).toHaveCount(1);
  });

  test('with no words has a row that says so, and survives being opened', async ({ page }) => {
    await openBytes(page, await withComment());
    await annotate(page);
    await expect(rows(page).locator('.row-words')).toHaveText('Comment with no words');
    await page.locator('[data-kind="comment"]').click();
    await clickOnPage(page, [40, 700]);
    await expect(rows(page)).toHaveCount(1);
    await expect(page.getByText('unsaved change')).toHaveCount(0);
  });
});

test.describe('annotations that can’t be offered', () => {
  test('are mentioned, rather than passed over in silence', async ({ page }) => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]).drawText('Stays on the page', { x: 72, y: 700, size: 18 });
    const { context } = doc;
    doc
      .getPage(0)
      .node.addAnnot(context.obj({ Type: 'Annot', Subtype: 'Stamp', Rect: [1, 1, 2, 2] }) as never);
    await openBytes(page, await doc.save());
    await annotate(page);
    await expect(panel(page)).toContainText('One more annotation in this file can’t be listed');
  });
});
