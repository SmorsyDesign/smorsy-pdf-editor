import { readFileSync } from 'node:fs';
import { PDFDocument, fill, rectangle, setFillingRgbColor } from '@cantoo/pdf-lib';
import { expect, test, type Page } from '@playwright/test';
import {
  lastWrite,
  pageElement,
  paintIn,
  rememberPage,
  reopenSaved,
  saveTo,
  waitForRedraw,
  whatChanged,
} from './editing-helpers';
import { expectOpenDocument, expectPageDrawn, gotoApp, openFixture } from './helpers';
import { queueImage } from './signing-helpers';

const PLAIN = 'test-pdfs/01-plain-text.pdf';

async function openBytes(page: Page, bytes: Uint8Array) {
  await gotoApp(page);
  await page.evaluate((data) => {
    if (!window.smorsyMock) throw new Error('The mock isn’t there.');
    window.smorsyMock.nextOpen = {
      path: '/Users/test/Made.pdf',
      name: 'Made.pdf',
      bytes: Uint8Array.from(data),
    };
  }, Array.from(bytes));
  await page.getByRole('button', { name: 'Choose a file' }).click();
  await expectOpenDocument(page, 1);
  await expectPageDrawn(page);
}
const ROTATED = 'test-pdfs/06-rotated-pages.pdf';

const bar = (page: Page) => page.getByRole('toolbar', { name: 'Annotation tools' });
const tool = (page: Page, name: string) => bar(page).getByRole('button', { name, exact: true });
const annotate = (page: Page) =>
  page.getByRole('button', { name: 'Annotate', exact: true }).click();

async function openForAnnotating(page: Page, fixture = PLAIN, pageCount = 3, pageNumber = 1) {
  await openFixture(page, fixture, 'Lease.pdf');
  await expectOpenDocument(page, pageCount);
  await expectPageDrawn(page);
  await annotate(page);
  await expect(bar(page)).toBeVisible();
  await waitForRedraw(page, pageNumber);
}

async function dragOnPage(
  page: Page,
  from: readonly [number, number],
  to: readonly [number, number],
  pageNumber = 1,
) {
  const sheet = await pageElement(page, pageNumber).boundingBox();
  if (!sheet) throw new Error('The page isn’t on screen.');
  await page.mouse.move(sheet.x + from[0], sheet.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(sheet.x + to[0], sheet.y + to[1], { steps: 6 });
  await page.mouse.up();
}

async function clickOnPage(page: Page, at: readonly [number, number], pageNumber = 1) {
  const sheet = await pageElement(page, pageNumber).boundingBox();
  if (!sheet) throw new Error('The page isn’t on screen.');
  await page.mouse.click(sheet.x + at[0], sheet.y + at[1]);
}

/** Highlight is already picked when Annotate opens, and clicking it again would put it down. */
async function pickTool(page: Page, name: string) {
  if ((await tool(page, name).getAttribute('aria-pressed')) !== 'true') {
    await tool(page, name).click();
  }
}

async function reopened(page: Page, pageCount: number) {
  await saveTo(page);
  await reopenSaved(page, pageCount);
  await annotate(page);
}

/** Where a page's first line of text is, relative to the page. */
async function firstLine(page: Page, pageNumber: number) {
  const line = pageElement(page, pageNumber)
    .getByRole('button', { name: /^Mark line:/ })
    .first();
  await line.focus();
  const box = await line.boundingBox();
  const sheet = await pageElement(page, pageNumber).boundingBox();
  if (!box || !sheet) throw new Error('The line isn’t on screen.');
  return {
    line,
    region: { x: box.x - sheet.x, y: box.y - sheet.y, width: box.width, height: box.height },
  };
}

const ROOM = 6;
function expectInside(
  changed: { x: number; y: number; width: number; height: number },
  region: { x: number; y: number; width: number; height: number },
) {
  expect(changed.x).toBeGreaterThanOrEqual(region.x - ROOM);
  expect(changed.y).toBeGreaterThanOrEqual(region.y - ROOM);
  expect(changed.x + changed.width).toBeLessThanOrEqual(region.x + region.width + ROOM);
  expect(changed.y + changed.height).toBeLessThanOrEqual(region.y + region.height + ROOM);
}

const ROTATIONS = [
  [1, 0],
  [2, 90],
  [3, 180],
  [4, 270],
] as const;

for (const [pageNumber, angle] of ROTATIONS) {
  test.describe(`on a page turned ${angle}°`, () => {
    for (const [name, kind] of [
      ['Highlight', 'highlight'],
      ['Underline', 'underline'],
      ['Strikethrough', 'strikeout'],
    ] as const) {
      test(`${name} lands on the line it marked`, async ({ page }) => {
        await openForAnnotating(page, ROTATED, 4);
        await pageElement(page, pageNumber).scrollIntoViewIfNeeded();
        await waitForRedraw(page, pageNumber);
        await rememberPage(page, pageNumber);
        await pickTool(page, name);
        const { line, region } = await firstLine(page, pageNumber);
        await page.keyboard.press('Enter');
        await expect(line).toBeAttached();
        await expect(pageElement(page, pageNumber).locator(`[data-kind="${kind}"]`)).toHaveCount(1);
        await reopened(page, 4);
        const changed = await whatChanged(page, pageNumber);
        expect(changed.pixels).toBeGreaterThan(10);
        expectInside(changed, region);
      });
    }

    for (const [name, kind] of [
      ['Pen', 'pen'],
      ['Ellipse', 'ellipse'],
      ['Arrow', 'arrow'],
    ] as const) {
      test(`${name} saves where it was drawn`, async ({ page }) => {
        await openForAnnotating(page, ROTATED, 4);
        await pageElement(page, pageNumber).scrollIntoViewIfNeeded();
        await waitForRedraw(page, pageNumber);
        await rememberPage(page, pageNumber);
        await tool(page, name).click();
        await dragOnPage(page, [150, 200], [350, 300], pageNumber);
        await expect(pageElement(page, pageNumber).locator(`[data-kind="${kind}"]`)).toHaveCount(1);
        await reopened(page, 4);
        const changed = await whatChanged(page, pageNumber);
        expect(changed.x).toBeCloseTo(150, -1);
        expect(changed.y).toBeCloseTo(200, -1);
        expect(changed.width).toBeCloseTo(200, -1);
        expect(changed.height).toBeCloseTo(100, -1);
      });
    }

    test('a note’s pin saves where it was clicked', async ({ page }) => {
      await openForAnnotating(page, ROTATED, 4);
      await pageElement(page, pageNumber).scrollIntoViewIfNeeded();
      await waitForRedraw(page, pageNumber);
      await rememberPage(page, pageNumber);
      await tool(page, 'Sticky note').click();
      await clickOnPage(page, [300, 300], pageNumber);
      await page.keyboard.type('Check this');
      await clickOnPage(page, [40, 40], pageNumber);
      await reopened(page, 4);
      const changed = await whatChanged(page, pageNumber);
      expect(changed.pixels).toBeGreaterThan(10);
      expectInside(changed, { x: 280, y: 280, width: 40, height: 40 });
    });

    test('whiteout hides what’s beneath it, and nothing else', async ({ page }) => {
      await openForAnnotating(page, ROTATED, 4);
      await pageElement(page, pageNumber).scrollIntoViewIfNeeded();
      await waitForRedraw(page, pageNumber);
      await rememberPage(page, pageNumber);
      const { region } = await firstLine(page, pageNumber);
      // Only half of the line, because a page with nothing left on it can't show it was drawn.
      const upright = region.width >= region.height;
      const covered = upright
        ? { ...region, width: region.width / 2 }
        : { ...region, height: region.height / 2 };
      const kept = upright
        ? { ...region, x: region.x + region.width / 2 + 4, width: region.width / 2 - 4 }
        : { ...region, y: region.y + region.height / 2 + 4, height: region.height / 2 - 4 };
      expect((await paintIn(page, pageNumber, covered)).dark).toBeGreaterThan(0);
      const keptBefore = (await paintIn(page, pageNumber, kept)).dark;
      expect(keptBefore).toBeGreaterThan(0);
      await tool(page, 'Whiteout box').click();
      await dragOnPage(
        page,
        [covered.x, covered.y - 2],
        [covered.x + covered.width, covered.y + covered.height + 2],
        pageNumber,
      );
      await reopened(page, 4);
      const changed = await whatChanged(page, pageNumber);
      expect(changed.pixels).toBeGreaterThan(10);
      expectInside(changed, covered);
      // Just inside, because the mouse lands on whole pixels, which can be coarser than the screen's.
      const inside = {
        x: covered.x + 2,
        y: covered.y + 2,
        width: covered.width - 4,
        height: covered.height - 4,
      };
      expect((await paintIn(page, pageNumber, inside)).dark).toBe(0);
      expect((await paintIn(page, pageNumber, kept)).dark).toBe(keptBefore);
    });
  });
}

test.describe('how marks look once saved', () => {
  test('an underline sits lower on the line than a strikethrough', async ({ page }) => {
    const heights: Record<string, number> = {};
    for (const name of ['Underline', 'Strikethrough']) {
      await openForAnnotating(page);
      await rememberPage(page, 1);
      await pickTool(page, name);
      const { region } = await firstLine(page, 1);
      await page.keyboard.press('Enter');
      await reopened(page, 3);
      const changed = await whatChanged(page, 1);
      heights[name] = (changed.y + changed.height / 2 - region.y) / region.height;
    }
    expect(heights['Underline']).toBeGreaterThan(0.75);
    expect(heights['Strikethrough']).toBeGreaterThan(0.3);
    expect(heights['Strikethrough']).toBeLessThan(0.7);
  });

  test('words stay as dark under a highlight, which isn’t a solid bar', async ({ page }) => {
    await openForAnnotating(page);
    const { line, region } = await firstLine(page, 1);
    const before = await paintIn(page, 1, region);
    await line.press('Enter');
    await reopened(page, 3);
    const after = await paintIn(page, 1, region);
    expect(after.dark).toBeGreaterThan(before.dark * 0.8);
  });

  test('text added on a whiteout shows on top of it', async ({ page }) => {
    await openForAnnotating(page);
    await tool(page, 'Whiteout box').click();
    await dragOnPage(page, [100, 300], [500, 400]);
    await page.getByRole('button', { name: 'Edit text', exact: true }).click();
    await page
      .getByTestId('edit-layer')
      .first()
      .click({ position: { x: 200, y: 340 } });
    await page.getByRole('textbox', { name: 'Text', exact: true }).fill('On the whiteout');
    await page.keyboard.press('ControlOrMeta+Enter');
    await reopened(page, 3);
    const paint = await paintIn(page, 1, { x: 100, y: 300, width: 400, height: 100 });
    expect(paint.dark).toBeGreaterThan(20);
  });

  test('an image saves where it was placed', async ({ page }) => {
    await openForAnnotating(page);
    await rememberPage(page, 1);
    await queueImage(page, { solid: true });
    await tool(page, 'Image').click();
    const image = await page.getByTestId('placed-signature').boundingBox();
    const sheet = await pageElement(page, 1).boundingBox();
    if (!image || !sheet) throw new Error('Not on screen.');
    await reopened(page, 3);
    const changed = await whatChanged(page, 1);
    expect(changed.pixels).toBeGreaterThan(500);
    expectInside(changed, {
      x: image.x - sheet.x,
      y: image.y - sheet.y,
      width: image.width,
      height: image.height,
    });
  });

  test('annotations show over an image on screen, as they do once saved', async ({ page }) => {
    await openForAnnotating(page);
    await queueImage(page, { solid: true });
    await tool(page, 'Image').click();
    await tool(page, 'Rectangle').click();
    await dragOnPage(page, [150, 400], [350, 520]);
    const artIsAfterImage = await pageElement(page, 1).evaluate((sheet) => {
      const art = sheet.querySelector('.annotation-art');
      const image = sheet.querySelector('[data-testid="placed-signature"]');
      if (!art || !image) throw new Error('Both should be on the page.');
      return Boolean(image.compareDocumentPosition(art) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(artIsAfterImage).toBe(true);
  });
});

test.describe('changes reach the saved file', () => {
  const draw = async (page: Page) => {
    await tool(page, 'Rectangle').click();
    await dragOnPage(page, [150, 400], [350, 520]);
    await page.keyboard.press('Escape');
    await page.locator('[data-kind="rect"]').click({ position: { x: 5, y: 5 } });
  };

  test('moved', async ({ page }) => {
    await openForAnnotating(page);
    await rememberPage(page, 1);
    await draw(page);
    const before = await page.locator('[data-kind="rect"]').boundingBox();
    if (!before) throw new Error('Not on screen.');
    await page.mouse.move(before.x + 50, before.y + 50);
    await page.mouse.down();
    await page.mouse.move(before.x + 110, before.y + 90, { steps: 5 });
    await page.mouse.up();
    await reopened(page, 3);
    const changed = await whatChanged(page, 1);
    expect(changed.x).toBeCloseTo(210, -1);
    expect(changed.y).toBeCloseTo(440, -1);
  });

  test('resized', async ({ page }) => {
    await openForAnnotating(page);
    await rememberPage(page, 1);
    await draw(page);
    await page.getByRole('button', { name: 'Make larger' }).click();
    await reopened(page, 3);
    expect((await whatChanged(page, 1)).width).toBeGreaterThan(210);
  });

  test('recoloured', async ({ page }) => {
    await openForAnnotating(page);
    await rememberPage(page, 1);
    await draw(page);
    await bar(page).getByRole('button', { name: 'Colour: blue' }).click();
    await reopened(page, 3);
    const [red = 0, , blue = 0] = (await whatChanged(page, 1)).average;
    expect(blue).toBeGreaterThan(red + 60);
  });

  test('deleted', async ({ page }) => {
    await openForAnnotating(page);
    await rememberPage(page, 1);
    await tool(page, 'Pen').click();
    await dragOnPage(page, [40, 600], [80, 640]);
    await tool(page, 'Pen').click();
    await draw(page);
    await page.getByRole('button', { name: 'Delete rectangle' }).click();
    await reopened(page, 3);
    // Only the pen's mark is left, so nothing has changed where the rectangle was.
    expectInside(await whatChanged(page, 1), { x: 40, y: 600, width: 40, height: 40 });
  });

  test('all undone saves an exact copy of the original', async ({ page }) => {
    await openForAnnotating(page);
    await draw(page);
    await page.getByRole('button', { name: 'Undo' }).click();
    await saveTo(page);
    const saved = Uint8Array.from((await lastWrite(page))?.bytes ?? []);
    expect(Buffer.compare(saved, readFileSync(PLAIN))).toBe(0);
  });
});

test.describe('whiteout over what viewers paint on top', () => {
  test('hides a filled-in field in the saved file, and says so', async ({ page }) => {
    await openFixture(page, 'test-pdfs/22-form-filled-value.pdf', 'Form.pdf');
    await expectOpenDocument(page, 1);
    await expectPageDrawn(page);
    const field = await page.locator('.form-field').first().boundingBox();
    await annotate(page);
    await waitForRedraw(page, 1);
    const sheet = await pageElement(page, 1).boundingBox();
    if (!field || !sheet) throw new Error('Not on screen.');
    const region = {
      x: field.x - sheet.x,
      y: field.y - sheet.y,
      width: field.width,
      height: field.height,
    };
    await tool(page, 'Whiteout box').click();
    await dragOnPage(
      page,
      [region.x - 4, region.y - 4],
      [region.x + region.width + 4, region.y + region.height + 4],
    );
    await saveTo(page);
    await expect(page.getByRole('alert')).toContainText('now part of the page');
    await reopenSaved(page, 1);
    await page.getByRole('button', { name: 'Edit text', exact: true }).click();
    await waitForRedraw(page, 1);
    const scale = ((await pageElement(page, 1).boundingBox())?.width ?? 1) / sheet.width;
    const paint = await paintIn(page, 1, {
      x: region.x * scale,
      y: region.y * scale,
      width: region.width * scale,
      height: region.height * scale,
    });
    expect(paint.dark).toBe(0);
  });

  test('hides an existing stamp in the saved file, and says so', async ({ page }) => {
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
    await openBytes(page, await doc.save());
    await annotate(page);
    await waitForRedraw(page, 1);
    const sheet = await pageElement(page, 1).boundingBox();
    const scale = (sheet?.width ?? 612) / 612;
    const region = { x: 90 * scale, y: 242 * scale, width: 140 * scale, height: 60 * scale };
    expect((await paintIn(page, 1, region)).dark).toBeGreaterThan(100);
    await tool(page, 'Whiteout box').click();
    await dragOnPage(
      page,
      [region.x, region.y],
      [region.x + region.width, region.y + region.height],
    );
    await saveTo(page);
    await expect(page.getByRole('alert')).toContainText('annotation under a whiteout');
    await reopenSaved(page, 1);
    await annotate(page);
    await waitForRedraw(page, 1);
    expect((await paintIn(page, 1, region)).dark).toBe(0);
  });
});

test.describe('a scanned page', () => {
  test('says there’s no text to mark, rather than doing nothing', async ({ page }) => {
    await openForAnnotating(page, 'test-pdfs/09-scanned-image-only.pdf', 1);
    await expect(page.getByText('This page is a scan with no text to mark')).toBeVisible();
    await tool(page, 'Rectangle').click();
    await expect(page.getByText('This page is a scan')).toHaveCount(0);
  });
});

test.describe('keyboard focus', () => {
  test('stays useful after deleting, so Tab still works from there', async ({ page }) => {
    await openForAnnotating(page);
    await tool(page, 'Rectangle').click();
    await dragOnPage(page, [150, 400], [350, 520]);
    await page.getByRole('button', { name: 'Delete rectangle' }).click();
    await expect(page.locator('main.canvas')).toBeFocused();
  });

  test('Esc in a note goes back to its pin', async ({ page }) => {
    await openForAnnotating(page);
    await tool(page, 'Sticky note').click();
    await clickOnPage(page, [300, 300]);
    await page.keyboard.type('Words');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-kind="note"]')).toBeFocused();
    await expect(page.getByTestId('note-card')).toHaveCount(0);
  });

  test('Esc in an empty note leaves nothing, and focus on the page', async ({ page }) => {
    await openForAnnotating(page);
    await tool(page, 'Sticky note').click();
    await clickOnPage(page, [300, 300]);
    await page.keyboard.press('Escape');
    await expect(page.locator('main.canvas')).toBeFocused();
    await expect(page.locator('[data-kind="note"]')).toHaveCount(0);
  });

  test('a list row takes you to its annotation', async ({ page }) => {
    await openForAnnotating(page);
    await tool(page, 'Rectangle').click();
    await dragOnPage(page, [150, 400], [350, 520]);
    await page.keyboard.press('Escape');
    await page.locator('.row-text').first().click();
    await expect(page.locator('[data-kind="rect"]')).toBeFocused();
  });

  test('a flat arrow is big enough to pick up', async ({ page }) => {
    await openForAnnotating(page);
    await tool(page, 'Arrow').focus();
    await page.keyboard.press('Enter');
    const box = await page.locator('[data-kind="arrow"]').boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(24);
  });

  test('dragging a note doesn’t also open it', async ({ page }) => {
    await openForAnnotating(page);
    await tool(page, 'Sticky note').click();
    await clickOnPage(page, [300, 300]);
    await page.keyboard.type('Words');
    await clickOnPage(page, [100, 600]);
    const pin = await page.locator('[data-kind="note"]').boundingBox();
    if (!pin) throw new Error('Not on screen.');
    await page.mouse.move(pin.x + 10, pin.y + 10);
    await page.mouse.down();
    await page.mouse.move(pin.x + 80, pin.y + 80, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByTestId('note-card')).toHaveCount(0);
  });
});
