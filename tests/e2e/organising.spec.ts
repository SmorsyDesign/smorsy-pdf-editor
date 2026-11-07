import { readFileSync } from 'node:fs';
import { PDFDocument, fill, rectangle, setFillingRgbColor } from '@cantoo/pdf-lib';
import { expect, test, type Page } from '@playwright/test';
import { openDocument } from '../../src/engine/document';
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
import {
  PLAIN,
  addComment,
  annotate,
  bar,
  clickOnPage,
  count,
  dragOnPage,
  drawRectangle,
  filters,
  markFirstLine,
  open,
  panel,
  rows,
  scopeButton,
  tabButton,
  tagInput,
  tool,
} from './annotating-helpers';
import { openFixture } from './helpers';
import { queueImage } from './signing-helpers';

test.describe('tabs', () => {
  test('sort what’s on the page by purpose', async ({ page }) => {
    await open(page);
    await markFirstLine(page);
    await addComment(page, 'A comment');
    await drawRectangle(page);
    await expect(count(page)).toHaveText('3 annotations');
    await expect(rows(page)).toHaveCount(3);

    await tabButton(page, 'Comments').click();
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText('A comment');
    await expect(count(page)).toHaveText('1 of 3');

    await tabButton(page, 'Markup').click();
    await expect(rows(page)).toContainText('Underline');

    await tabButton(page, 'Drawings').click();
    await expect(rows(page)).toContainText('Rectangle');

    await tabButton(page, 'All').click();
    await expect(rows(page)).toHaveCount(3);
  });

  test('say so when a tab has nothing in it', async ({ page }) => {
    await open(page);
    await tabButton(page, 'Comments').click();
    await expect(panel(page)).toContainText('No comments on this page.');
  });

  test('count an image and a whiteout as drawings', async ({ page }) => {
    await open(page);
    await queueImage(page);
    await tool(page, 'Image').click();
    await expect(page.getByTestId('placed-signature')).toBeVisible();
    await page.keyboard.press('Escape');
    await tool(page, 'Whiteout box').click();
    await dragOnPage(page, [150, 500], [300, 560]);
    await page.keyboard.press('Escape');
    await tabButton(page, 'Drawings').click();
    await expect(rows(page)).toHaveCount(2);
  });

  test('show a comment’s words rather than the word “Comment”', async ({ page }) => {
    await open(page);
    await addComment(page, 'Ask about the fee');
    await expect(rows(page).locator('.row-words')).toHaveText('Ask about the fee');
    await expect(rows(page).locator('.row-title')).toHaveCount(0);
  });

  test('make way for something picked on the page that they’re hiding', async ({ page }) => {
    await open(page);
    await drawRectangle(page);
    await tabButton(page, 'Comments').click();
    await expect(rows(page)).toHaveCount(0);
    await page.locator('[data-kind="rect"]').click({ position: { x: 5, y: 5 } });
    await expect(rows(page)).toHaveCount(1);
    await expect(tagInput(page)).toBeVisible();
  });
});

test.describe('all pages', () => {
  const twoPages = async (page: Page) => {
    await open(page);
    await drawRectangle(page, 1);
    await pageElement(page, 3).scrollIntoViewIfNeeded();
    await drawRectangle(page, 3);
    await expect(page.getByTestId('page-indicator')).toHaveText('Page 3 of 3');
  };

  test('list everything in the document, by page', async ({ page }) => {
    await twoPages(page);
    await expect(count(page)).toHaveText('1 annotation');
    await scopeButton(page, 'All pages').click();
    await expect(count(page)).toHaveText('2 annotations');
    await expect(panel(page).locator('.rows-heading')).toHaveText(['Page 1', 'Page 3']);
  });

  test('take you to the one you pick', async ({ page }) => {
    await twoPages(page);
    await scopeButton(page, 'All pages').click();
    await rows(page).first().locator('.row-text').click();
    await expect(page.getByTestId('page-indicator')).toHaveText('Page 1 of 3');
    await expect(pageElement(page, 1).locator('[data-kind="rect"]')).toBeFocused();
    await expect(rows(page).first()).toHaveClass(/is-selected/);
  });

  test('say so when there’s nothing yet', async ({ page }) => {
    await open(page);
    await scopeButton(page, 'All pages').click();
    await expect(panel(page)).toContainText('Nothing yet.');
  });
});

test.describe('tags', () => {
  const select = (page: Page, kind: string) =>
    page.locator(`[data-kind="${kind}"]`).click({ position: { x: 5, y: 5 } });

  const tag = async (page: Page, name: string) => {
    await tagInput(page).fill(name);
    await page.keyboard.press('Enter');
  };

  test('can be added and reused, and filter the list', async ({ page }) => {
    await open(page);
    await drawRectangle(page);
    await tool(page, 'Ellipse').click();
    await dragOnPage(page, [150, 550], [350, 640]);
    await page.keyboard.press('Escape');

    await select(page, 'rect');
    await tag(page, 'Chapter 1');
    await expect(filters(page).getByRole('button', { name: 'Chapter 1' })).toBeVisible();

    await select(page, 'ellipse');
    await panel(page).locator('.tag-offers').getByRole('button', { name: 'Chapter 1' }).click();
    await tag(page, 'Chapter 2');

    await clickOnPage(page, [40, 700]);
    await expect(rows(page)).toHaveCount(2);
    await filters(page).getByRole('button', { name: 'Chapter 2' }).click();
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText('Ellipse');
    await expect(count(page)).toHaveText('1 of 2');

    await filters(page).getByRole('button', { name: 'Chapter 2' }).click();
    await expect(rows(page)).toHaveCount(2);
  });

  test('switch rather than combine when picking another', async ({ page }) => {
    await open(page);
    await drawRectangle(page);
    await select(page, 'rect');
    await tag(page, 'One');
    await tag(page, 'Two');
    await clickOnPage(page, [40, 700]);
    const one = filters(page).getByRole('button', { name: 'One' });
    const two = filters(page).getByRole('button', { name: 'Two' });
    await one.click();
    await two.click();
    await expect(one).toHaveAttribute('aria-pressed', 'false');
    await expect(two).toHaveAttribute('aria-pressed', 'true');
  });

  test('treat different capitals as the same tag', async ({ page }) => {
    await open(page);
    await drawRectangle(page);
    await select(page, 'rect');
    await tag(page, 'Chapter 1');
    await tag(page, 'CHAPTER 1');
    await expect(panel(page).locator('.tag-editing .tag')).toHaveCount(1);
  });

  test('can be removed, and undone', async ({ page }) => {
    await open(page);
    await drawRectangle(page);
    await select(page, 'rect');
    await tag(page, 'Chapter 1');
    await panel(page).getByRole('button', { name: 'Remove tag Chapter 1' }).click();
    await expect(filters(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(filters(page).getByRole('button', { name: 'Chapter 1' })).toBeVisible();
  });

  test('say so when nothing here has the one chosen', async ({ page }) => {
    await open(page);
    await drawRectangle(page);
    await select(page, 'rect');
    await tag(page, 'Chapter 1');
    await clickOnPage(page, [40, 700]);
    await filters(page).getByRole('button', { name: 'Chapter 1' }).click();
    await pageElement(page, 3).scrollIntoViewIfNeeded();
    await expect(panel(page)).toContainText('Nothing tagged “Chapter 1” on this page.');
  });

  test('come back with the file', async ({ page }) => {
    await open(page);
    await drawRectangle(page);
    await select(page, 'rect');
    await tag(page, 'Chapter 1');
    await saveTo(page);
    await reopenSaved(page, 3);
    await annotate(page);
    await expect(filters(page).getByRole('button', { name: 'Chapter 1' })).toBeVisible();
    await expect(rows(page).locator('.tag')).toHaveText('Chapter 1');
  });

  test('aren’t offered for a whiteout, which becomes part of the page', async ({ page }) => {
    await open(page);
    await tool(page, 'Whiteout box').click();
    await dragOnPage(page, [150, 500], [300, 560]);
    await page.keyboard.press('Escape');
    await select(page, 'whiteout');
    await expect(tagInput(page)).toHaveCount(0);
  });

  test('count as a change, so closing asks first', async ({ page }) => {
    await open(page);
    await drawRectangle(page);
    await saveTo(page);
    await select(page, 'rect');
    await tag(page, 'Chapter 1');
    await expect(page.getByText('1 unsaved change')).toBeVisible();
  });
});

test.describe('annotations saved earlier', () => {
  const REGION = { x: 145, y: 395, width: 210, height: 130 };

  const savedAndReopened = async (page: Page) => {
    await open(page);
    await rememberPage(page, 1);
    await bar(page).getByRole('button', { name: 'Colour: pink' }).click();
    await drawRectangle(page);
    await saveTo(page);
    await reopenSaved(page, 3);
    await annotate(page);
    await waitForRedraw(page, 1);
    await expect(rows(page)).toHaveCount(1);
    expect((await paintIn(page, 1, REGION)).red).toBeGreaterThan(50);
  };

  const pick = (page: Page) =>
    page.locator('[data-kind="rect"]').click({ position: { x: 5, y: 5 } });

  test('are listed, with no tool in the way and nothing to save', async ({ page }) => {
    await savedAndReopened(page);
    await expect(tool(page, 'Highlight')).toHaveAttribute('aria-pressed', 'false');
    await expect(rows(page)).toContainText('Rectangle');
    await expect(page.getByText('unsaved change')).toHaveCount(0);
  });

  test('save as an exact copy when nothing’s changed', async ({ page }) => {
    await savedAndReopened(page);
    const first = Uint8Array.from((await lastWrite(page))?.bytes ?? []);
    await saveTo(page);
    const second = Uint8Array.from((await lastWrite(page))?.bytes ?? []);
    expect(Buffer.compare(first, second)).toBe(0);
  });

  test('leave their old spot when moved, on screen and when saved', async ({ page }) => {
    await savedAndReopened(page);
    await pick(page);
    const box = await page.locator('[data-kind="rect"]').boundingBox();
    if (!box) throw new Error('Not on screen.');
    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(box.x + 50, box.y + 250, { steps: 5 });
    await page.mouse.up();
    await waitForRedraw(page, 1);
    // Whether the file's drawing has really gone, since the moved one is drawn over the page.
    expect((await paintIn(page, 1, REGION)).red).toBe(0);
    await saveTo(page);
    await reopenSaved(page, 3);
    await annotate(page);
    await waitForRedraw(page, 1);
    expect((await paintIn(page, 1, REGION)).red).toBe(0);
    expect((await paintIn(page, 1, { ...REGION, y: REGION.y + 200 })).red).toBeGreaterThan(50);
    await expect(rows(page)).toHaveCount(1);
  });

  test('go at once when deleted, and come back with undo', async ({ page }) => {
    await savedAndReopened(page);
    await panel(page).getByRole('button', { name: 'Delete rectangle' }).click();
    await waitForRedraw(page, 1);
    expect((await paintIn(page, 1, REGION)).red).toBe(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await waitForRedraw(page, 1);
    expect((await paintIn(page, 1, REGION)).red).toBeGreaterThan(50);
  });

  test('stay gone once deleted and saved', async ({ page }) => {
    await savedAndReopened(page);
    await panel(page).getByRole('button', { name: 'Delete rectangle' }).click();
    await saveTo(page);
    await reopenSaved(page, 3);
    await annotate(page);
    await waitForRedraw(page, 1);
    await expect(rows(page)).toHaveCount(0);
    expect((await paintIn(page, 1, REGION)).red).toBe(0);
  });

  test('can be recoloured', async ({ page }) => {
    await savedAndReopened(page);
    await pick(page);
    await bar(page).getByRole('button', { name: 'Colour: blue' }).click();
    await saveTo(page);
    await reopenSaved(page, 3);
    await annotate(page);
    const [red = 0, , blue = 0] = (await whatChanged(page, 1)).average;
    expect(blue).toBeGreaterThan(red + 60);
  });

  test('keep their place through several rounds of saving', async ({ page }) => {
    await savedAndReopened(page);
    for (const name of ['One', 'Two']) {
      await pick(page);
      await tagInput(page).fill(name);
      await page.keyboard.press('Enter');
      await saveTo(page);
      await reopenSaved(page, 3);
      await annotate(page);
      await waitForRedraw(page, 1);
    }
    await expect(rows(page)).toHaveCount(1);
    const changed = await whatChanged(page, 1);
    expect(changed.x).toBeCloseTo(150, -1);
    expect(changed.y).toBeCloseTo(400, -1);
  });

  test('comments can be reworded, without a second pin', async ({ page }) => {
    await open(page);
    await addComment(page, 'First words');
    await saveTo(page);
    await reopenSaved(page, 3);
    await annotate(page);
    await page.locator('[data-kind="comment"]').click();
    await page.getByRole('textbox', { name: 'Comment', exact: true }).fill('Second words');
    await clickOnPage(page, [40, 700]);
    await expect(rows(page).locator('.row-words')).toHaveText('Second words');
    await saveTo(page);
    const doc = await openDocument(Uint8Array.from((await lastWrite(page))?.bytes ?? []));
    const notes = await doc.existingNotes(1);
    await doc.close();
    expect(notes.map((note) => note.text)).toEqual(['Second words']);
  });

  test('a deleted comment can’t be read outside Annotate mode either', async ({ page }) => {
    await open(page);
    await addComment(page, 'Gone soon');
    await tool(page, 'Comment').click();
    await clickOnPage(page, [200, 500]);
    await page.keyboard.type('Stays');
    await clickOnPage(page, [40, 700]);
    await saveTo(page);
    await reopenSaved(page, 3);
    await annotate(page);
    await panel(page).getByRole('button', { name: 'Delete comment' }).first().click();
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    // The other is there to show the list has loaded, as none at all would pass too soon.
    await expect(page.getByRole('button', { name: 'Read comment' })).toHaveCount(1);
    await page.getByRole('button', { name: 'Read comment' }).click();
    await expect(page.getByRole('note')).toContainText('Stays');
  });

  test('a new comment can be read in Select mode, before it’s saved', async ({ page }) => {
    await open(page);
    await addComment(page, 'Fresh words');
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await page.getByRole('button', { name: 'Read comment' }).click();
    await expect(page.getByRole('note')).toContainText('Fresh words');
  });
});

test.describe('annotations from another app', () => {
  const stamped = async () => {
    const doc = await PDFDocument.create();
    const paper = doc.addPage([612, 792]);
    paper.drawText('Stays on the page', { x: 72, y: 700, size: 18 });
    const { context } = doc;
    const look = context.formXObject(
      [setFillingRgbColor(0, 0, 0), rectangle(0, 0, 120, 40), fill()],
      { BBox: [0, 0, 120, 40] },
    );
    paper.node.addAnnot(
      context.register(
        context.obj({
          Type: 'Annot',
          Subtype: 'Stamp',
          Rect: [100, 500, 220, 540],
          AP: { N: context.register(look) },
        }),
      ),
    );
    return doc.save();
  };

  const openStamp = async (page: Page) => {
    await openBytes(page, await stamped());
    await annotate(page);
    await waitForRedraw(page, 1);
    const sheet = await pageElement(page, 1).boundingBox();
    const scale = (sheet?.width ?? 612) / 612;
    return { x: 100 * scale, y: 252 * scale, width: 120 * scale, height: 40 * scale };
  };

  test('are listed, and say what can be done with them', async ({ page }) => {
    await openStamp(page);
    await expect(rows(page)).toContainText('Stamp');
    await rows(page).locator('.row-text').click();
    await expect(rows(page)).toContainText('Made in another app.');
  });

  test('can’t be moved or recoloured', async ({ page }) => {
    await openStamp(page);
    await rows(page).locator('.row-text').click();
    await expect(page.getByRole('button', { name: /^Move:/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Make larger' })).toHaveCount(0);
    await bar(page).getByRole('button', { name: 'Colour: blue' }).click();
    await expect(page.getByText('unsaved change')).toHaveCount(0);
  });

  test('can be tagged without changing how they look', async ({ page }) => {
    const region = await openStamp(page);
    const before = await paintIn(page, 1, region);
    await rows(page).locator('.row-text').click();
    await tagInput(page).fill('Chapter 1');
    await page.keyboard.press('Enter');
    await saveTo(page);
    await reopenSaved(page, 1);
    await annotate(page);
    await waitForRedraw(page, 1);
    await expect(rows(page).locator('.tag')).toHaveText('Chapter 1');
    expect((await paintIn(page, 1, region)).dark).toBe(before.dark);
  });

  test('go when deleted, on screen and when saved', async ({ page }) => {
    const region = await openStamp(page);
    expect((await paintIn(page, 1, region)).dark).toBeGreaterThan(100);
    await panel(page).getByRole('button', { name: 'Delete stamp' }).click();
    await waitForRedraw(page, 1);
    expect((await paintIn(page, 1, region)).dark).toBe(0);
    await saveTo(page);
    await reopenSaved(page, 1);
    await annotate(page);
    await waitForRedraw(page, 1);
    await expect(rows(page)).toHaveCount(0);
    expect((await paintIn(page, 1, region)).dark).toBe(0);
  });

  test('comments can be reworded', async ({ page }) => {
    await open(page, 'test-pdfs/11-annotations-links.pdf', 2);
    await tabButton(page, 'Comments').click();
    await rows(page).locator('.row-text').click();
    await expect(rows(page)).toContainText('You can change its words and tags');
    await page.locator('[data-kind="comment"]').click();
    await page.getByRole('textbox', { name: 'Comment', exact: true }).fill('Reworded');
    await clickOnPage(page, [40, 700]);
    await saveTo(page);
    const doc = await openDocument(Uint8Array.from((await lastWrite(page))?.bytes ?? []));
    const notes = await doc.existingNotes(1);
    await doc.close();
    expect(notes.map((note) => note.text)).toContain('Reworded');
  });
});

test.describe('a protected PDF', () => {
  test('still shows, with nothing to edit', async ({ page }) => {
    await openFixture(page, 'test-pdfs/20-owner-restricted.pdf', 'Protected.pdf');
    await expect(page.getByText('This PDF is protected against changes')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});

test.describe('the test version in an ordinary browser', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
  });

  test('says what it is, and opens a real file with the picker', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Test version: saving doesn’t write a file.')).toBeVisible();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Choose a file' }).click();
    await (
      await chooser
    ).setFiles({
      name: 'Picked.pdf',
      mimeType: 'application/pdf',
      buffer: readFileSync(PLAIN),
    });
    await expect(page.locator('.file-name')).toHaveText('Picked.pdf');
  });
});
