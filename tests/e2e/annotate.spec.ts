import { expect, test, type Page } from '@playwright/test';
import { openDocument } from '../../src/engine/document';
import {
  lastWrite,
  pageElement,
  rememberPage,
  reopenSaved,
  saveTo,
  waitForRedraw,
  whatChanged,
} from './editing-helpers';
import { expectOpenDocument, expectPageDrawn, openFixture } from './helpers';
import { queueImage } from './signing-helpers';

const PLAIN = 'test-pdfs/01-plain-text.pdf';

const bar = (page: Page) => page.getByRole('toolbar', { name: 'Annotation tools' });
const tool = (page: Page, name: string) => bar(page).getByRole('button', { name, exact: true });
const annotations = (page: Page) => page.getByTestId('annotation');

async function openForAnnotating(page: Page, fixture = PLAIN, pageCount = 3) {
  await openFixture(page, fixture, 'Lease.pdf');
  await expectOpenDocument(page, pageCount);
  await expectPageDrawn(page);
  await page.getByRole('button', { name: 'Annotate', exact: true }).click();
  await expect(bar(page)).toBeVisible();
  // The side panel changes the page's size, and the canvas redraws to match.
  await waitForRedraw(page, 1);
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

const clickOnPage = async (page: Page, at: readonly [number, number], pageNumber = 1) => {
  const sheet = await pageElement(page, pageNumber).boundingBox();
  if (!sheet) throw new Error('The page isn’t on screen.');
  await page.mouse.click(sheet.x + at[0], sheet.y + at[1]);
};

test.describe('Annotate mode', () => {
  test('opens with the tools and an empty list', async ({ page }) => {
    await openForAnnotating(page);
    await expect(tool(page, 'Highlight')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('0 annotations')).toBeVisible();
    await expect(page.getByText('Whiteout only covers what’s beneath it')).toBeVisible();
  });

  test('warns first on a signed PDF', async ({ page }) => {
    await openFixture(page, 'test-pdfs/19-digitally-signed.pdf', 'Signed.pdf');
    await page.getByRole('button', { name: 'Annotate', exact: true }).click();
    await expect(
      page.getByRole('alertdialog', { name: 'Editing will break the signature' }),
    ).toBeVisible();
    await expect(bar(page)).toHaveCount(0);
  });

  test('isn’t available on a PDF protected against changes', async ({ page }) => {
    await openFixture(page, 'test-pdfs/20-owner-restricted.pdf', 'Protected.pdf');
    await expect(page.getByRole('button', { name: 'Annotate', exact: true })).toBeDisabled();
  });

  test('Esc puts the tool down', async ({ page }) => {
    await openForAnnotating(page);
    await page.keyboard.press('Escape');
    await expect(tool(page, 'Highlight')).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('marking text', () => {
  const markHeading = (page: Page) => dragOnPage(page, [110, 120], [300, 122]);

  test('highlighting names what it marked, and saves where it was', async ({ page }) => {
    await openForAnnotating(page);
    await rememberPage(page, 1);
    await markHeading(page);
    await expect(annotations(page)).toHaveCount(1);
    await expect(page.locator('.row-sub')).toContainText('agreement');
    const region = await pageElement(page, 1).locator('.annotation-highlight').boundingBox();
    const sheet = await pageElement(page, 1).boundingBox();
    await saveTo(page);
    await reopenSaved(page, 3);
    await page.getByRole('button', { name: 'Annotate', exact: true }).click();
    const changed = await whatChanged(page, 1);
    expect(changed.pixels).toBeGreaterThan(100);
    expect(changed.x).toBeCloseTo((region?.x ?? 0) - (sheet?.x ?? 0), -1);
    expect(changed.y).toBeCloseTo((region?.y ?? 0) - (sheet?.y ?? 0), -1);
    expect(changed.width).toBeCloseTo(region?.width ?? 0, -1);
  });

  test('the words stay readable under a highlight', async ({ page }) => {
    await openForAnnotating(page);
    await markHeading(page);
    await saveTo(page);
    const doc = await openDocument(Uint8Array.from((await lastWrite(page))?.bytes ?? []));
    const { blocks } = await doc.pageText(1);
    await doc.close();
    expect(blocks.map((block) => block.text).join(' ')).toContain('Plain text');
  });

  for (const [name, kind] of [
    ['Underline', 'underline'],
    ['Strikethrough', 'strikeout'],
  ] as const) {
    test(`${name} marks text with a line`, async ({ page }) => {
      await openForAnnotating(page);
      await tool(page, name).click();
      await rememberPage(page, 1);
      await markHeading(page);
      await expect(page.locator(`[data-kind="${kind}"]`)).toHaveCount(1);
      await saveTo(page);
      await reopenSaved(page, 3);
      await page.getByRole('button', { name: 'Annotate', exact: true }).click();
      expect((await whatChanged(page, 1)).pixels).toBeGreaterThan(50);
    });
  }

  test('a line can be marked with the keyboard', async ({ page }) => {
    await openForAnnotating(page);
    const line = page.getByRole('button', { name: /^Mark line: Plain text/ }).first();
    await line.focus();
    await page.keyboard.press('Enter');
    await expect(annotations(page)).toHaveCount(1);
    await expect(page.locator('.row-sub')).toContainText('Plain text');
  });

  test('marks can’t be dragged away from their text', async ({ page }) => {
    await openForAnnotating(page);
    await markHeading(page);
    await page.keyboard.press('Escape');
    const before = await annotations(page).boundingBox();
    if (!before) throw new Error('Not on screen.');
    await page.mouse.move(before.x + 20, before.y + 5);
    await page.mouse.down();
    await page.mouse.move(before.x + 120, before.y + 105, { steps: 4 });
    await page.mouse.up();
    expect((await annotations(page).boundingBox())?.x).toBeCloseTo(before.x, 0);
  });
});

test.describe('drawing', () => {
  for (const [name, kind] of [
    ['Pen', 'pen'],
    ['Rectangle', 'rect'],
    ['Ellipse', 'ellipse'],
    ['Arrow', 'arrow'],
  ] as const) {
    test(`${name} draws what was dragged, and saves it in the same place`, async ({ page }) => {
      await openForAnnotating(page);
      await rememberPage(page, 1);
      await tool(page, name).click();
      await dragOnPage(page, [150, 400], [350, 520]);
      const hit = page.locator(`[data-kind="${kind}"]`);
      await expect(hit).toHaveCount(1);
      await saveTo(page);
      await reopenSaved(page, 3);
      await page.getByRole('button', { name: 'Annotate', exact: true }).click();
      const changed = await whatChanged(page, 1);
      expect(changed.x).toBeCloseTo(150, -1);
      expect(changed.y).toBeCloseTo(400, -1);
      expect(changed.width).toBeCloseTo(200, -1);
      expect(changed.height).toBeCloseTo(120, -1);
    });
  }

  test('a click gives a shape of a sensible size, for anyone who can’t drag', async ({ page }) => {
    await openForAnnotating(page);
    await tool(page, 'Rectangle').click();
    await clickOnPage(page, [300, 400]);
    await expect(page.locator('[data-kind="rect"]')).toHaveCount(1);
  });

  test('the tool’s button places a shape from the keyboard, ready to move', async ({ page }) => {
    await openForAnnotating(page);
    await tool(page, 'Ellipse').focus();
    await page.keyboard.press('Enter');
    const shape = page.locator('[data-kind="ellipse"]');
    await expect(shape).toBeFocused();
    const before = await shape.boundingBox();
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await shape.boundingBox())?.x).toBeGreaterThan(before?.x ?? 0);
    await page.keyboard.press('Delete');
    await expect(shape).toHaveCount(0);
  });

  test('a colour reaches the saved file', async ({ page }) => {
    await openForAnnotating(page);
    await rememberPage(page, 1);
    await bar(page).getByRole('button', { name: 'Colour: pink' }).click();
    await tool(page, 'Rectangle').click();
    await dragOnPage(page, [150, 400], [350, 520]);
    await saveTo(page);
    await reopenSaved(page, 3);
    await page.getByRole('button', { name: 'Annotate', exact: true }).click();
    const [red = 0, green = 0, blue = 0] = (await whatChanged(page, 1)).average;
    expect(red).toBeGreaterThan(green + 60);
    expect(red).toBeGreaterThan(blue + 60);
  });

  test('choosing a colour changes what’s selected', async ({ page }) => {
    await openForAnnotating(page);
    await tool(page, 'Rectangle').click();
    await dragOnPage(page, [150, 400], [350, 520]);
    await page.keyboard.press('Escape');
    await page.locator('[data-kind="rect"]').click({ position: { x: 5, y: 5 } });
    const before = await pageElement(page, 1)
      .locator('.annotation-art rect')
      .getAttribute('stroke');
    await bar(page).getByRole('button', { name: 'Colour: blue' }).click();
    const after = await pageElement(page, 1).locator('.annotation-art rect').getAttribute('stroke');
    expect(after).not.toBe(before);
    await expect(page.getByText('2 unsaved changes')).toBeVisible();
  });

  test('on a rotated page it saves in the same place', async ({ page }) => {
    await openForAnnotating(page, 'test-pdfs/06-rotated-pages.pdf', 4);
    await rememberPage(page, 2);
    await tool(page, 'Rectangle').click();
    await dragOnPage(page, [150, 200], [350, 300], 2);
    await saveTo(page);
    await reopenSaved(page, 4);
    await page.getByRole('button', { name: 'Annotate', exact: true }).click();
    const changed = await whatChanged(page, 2);
    expect(changed.x).toBeCloseTo(150, -1);
    expect(changed.y).toBeCloseTo(200, -1);
    expect(changed.width).toBeCloseTo(200, -1);
    expect(changed.height).toBeCloseTo(100, -1);
  });
});

test.describe('changing what’s drawn', () => {
  test.beforeEach(async ({ page }) => {
    await openForAnnotating(page);
    await tool(page, 'Rectangle').click();
    await dragOnPage(page, [150, 400], [350, 520]);
    await page.keyboard.press('Escape');
    await page.locator('[data-kind="rect"]').click({ position: { x: 5, y: 5 } });
  });

  const shape = (page: Page) => page.locator('[data-kind="rect"]');
  const box = async (page: Page) => {
    const value = await shape(page).boundingBox();
    if (!value) throw new Error('Not on screen.');
    return value;
  };

  test('dragging moves it, as one undo', async ({ page }) => {
    const before = await box(page);
    await page.mouse.move(before.x + 50, before.y + 50);
    await page.mouse.down();
    await page.mouse.move(before.x + 110, before.y + 90, { steps: 5 });
    await page.mouse.up();
    expect((await box(page)).x - before.x).toBeCloseTo(60, 0);
    await page.getByRole('button', { name: 'Undo' }).click();
    expect((await box(page)).x).toBeCloseTo(before.x, 0);
  });

  test('larger and smaller buttons resize it', async ({ page }) => {
    const before = await box(page);
    await page.getByRole('button', { name: 'Make larger' }).click();
    expect((await box(page)).width).toBeGreaterThan(before.width);
    await page.getByRole('button', { name: 'Make smaller' }).click();
    await page.getByRole('button', { name: 'Make smaller' }).click();
    expect((await box(page)).width).toBeLessThan(before.width);
  });

  test('the Move button moves it with a single click', async ({ page }) => {
    await page.getByRole('button', { name: /^Move:/ }).click();
    await clickOnPage(page, [200, 200]);
    const sheet = await pageElement(page, 1).boundingBox();
    const after = await box(page);
    expect(after.x + after.width / 2 - (sheet?.x ?? 0)).toBeCloseTo(200, -1);
  });

  test('only the main button drags', async ({ page }) => {
    const before = await box(page);
    await page.mouse.move(before.x + 50, before.y + 50);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(before.x + 110, before.y + 90, { steps: 3 });
    await page.mouse.up({ button: 'right' });
    expect((await box(page)).x).toBeCloseTo(before.x, 0);
  });

  test('Esc during a drag puts it back', async ({ page }) => {
    const before = await box(page);
    await page.mouse.move(before.x + 50, before.y + 50);
    await page.mouse.down();
    await page.mouse.move(before.x + 110, before.y + 90, { steps: 3 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect((await box(page)).x).toBeCloseTo(before.x, 0);
  });

  test('it can’t be dragged off the page', async ({ page }) => {
    const before = await box(page);
    const sheet = await pageElement(page, 1).boundingBox();
    await page.mouse.move(before.x + 50, before.y + 50);
    await page.mouse.down();
    await page.mouse.move(0, before.y, { steps: 5 });
    await page.mouse.up();
    expect((await box(page)).x).toBeGreaterThanOrEqual((sheet?.x ?? 0) - 1);
  });

  test('deleting from the list removes it', async ({ page }) => {
    await page.getByRole('button', { name: 'Delete rectangle' }).click();
    await expect(shape(page)).toHaveCount(0);
    await expect(page.getByText('0 annotations')).toBeVisible();
  });

  test('undo and redo walk it', async ({ page }) => {
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(shape(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(shape(page)).toHaveCount(1);
  });

  test('closing with it unsaved asks first', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+w');
    await expect(
      page.getByRole('alertdialog', { name: 'Save your changes to Lease.pdf?' }),
    ).toBeVisible();
  });

  test('it stays visible in other modes, but can’t be changed there', async ({ page }) => {
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await expect(pageElement(page, 1).locator('.annotation-art rect')).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Annotation actions' })).toHaveCount(0);
  });
});

test.describe('sticky notes', () => {
  test('a click opens one to type in, and the words are saved', async ({ page }) => {
    await openForAnnotating(page);
    await tool(page, 'Sticky note').click();
    await clickOnPage(page, [400, 400]);
    const field = page.getByRole('textbox', { name: 'Note', exact: true });
    await expect(field).toBeFocused();
    await page.keyboard.type('Ask about the late fee');
    await clickOnPage(page, [100, 600]);
    await expect(page.locator('.row-sub')).toContainText('Ask about the late fee');
    await saveTo(page);
    const doc = await openDocument(Uint8Array.from((await lastWrite(page))?.bytes ?? []));
    const notes = await doc.existingNotes(1);
    await doc.close();
    expect(notes.map((note) => note.text)).toEqual(['Ask about the late fee']);
  });

  test('typing spaces doesn’t scroll the page', async ({ page }) => {
    await openForAnnotating(page);
    await tool(page, 'Sticky note').click();
    await clickOnPage(page, [400, 400]);
    const scroller = page.locator('main.canvas');
    const before = await scroller.evaluate((element) => element.scrollTop);
    await page.keyboard.type('one two three four');
    expect(await scroller.evaluate((element) => element.scrollTop)).toBe(before);
  });

  test('one left empty leaves nothing behind', async ({ page }) => {
    await openForAnnotating(page);
    await tool(page, 'Sticky note').click();
    await clickOnPage(page, [400, 400]);
    await clickOnPage(page, [100, 600]);
    await expect(page.locator('[data-kind="note"]')).toHaveCount(0);
    await expect(page.getByText('unsaved change')).toHaveCount(0);
  });

  test('typing it then saving straight away keeps the words', async ({ page }) => {
    await openForAnnotating(page);
    await tool(page, 'Sticky note').click();
    await clickOnPage(page, [400, 400]);
    await page.keyboard.type('Keep me');
    await saveTo(page);
    await reopenSaved(page, 3);
    await pageElement(page, 1).getByRole('button', { name: 'Read note' }).click();
    await expect(page.getByRole('note')).toContainText('Keep me');
  });

  test('all the typing in one visit is one undo', async ({ page }) => {
    await openForAnnotating(page);
    await tool(page, 'Sticky note').click();
    await clickOnPage(page, [400, 400]);
    await page.keyboard.type('Several words here');
    await clickOnPage(page, [100, 600]);
    await expect(page.getByText('1 unsaved change')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('[data-kind="note"]')).toHaveCount(0);
  });

  test('it can be opened again and reworded', async ({ page }) => {
    await openForAnnotating(page);
    await tool(page, 'Sticky note').click();
    await clickOnPage(page, [400, 400]);
    await page.keyboard.type('First');
    await clickOnPage(page, [100, 600]);
    await page.locator('[data-kind="note"]').click();
    const field = page.getByRole('textbox', { name: 'Note', exact: true });
    await field.fill('Second');
    await clickOnPage(page, [100, 600]);
    await expect(page.locator('.row-sub')).toContainText('Second');
  });
});

test.describe('notes already in a file', () => {
  test('can be read after saving and opening again', async ({ page }) => {
    await openForAnnotating(page);
    await tool(page, 'Sticky note').click();
    await clickOnPage(page, [400, 400]);
    await page.keyboard.type('Ask about the late fee');
    await clickOnPage(page, [100, 600]);
    await saveTo(page);
    await reopenSaved(page, 3);
    const pin = pageElement(page, 1).getByRole('button', { name: 'Read note' });
    await pin.click();
    await expect(page.getByRole('note')).toContainText('Ask about the late fee');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('note')).toHaveCount(0);
  });

  test('the card stays on the page near the bottom corner', async ({ page }) => {
    await openForAnnotating(page);
    await pageElement(page, 1).evaluate((element) => {
      element.scrollIntoView({ block: 'end' });
    });
    const sheet = await pageElement(page, 1).boundingBox();
    await tool(page, 'Sticky note').click();
    await clickOnPage(page, [(sheet?.width ?? 0) - 10, (sheet?.height ?? 0) - 10]);
    const card = await page.getByTestId('note-card').boundingBox();
    expect((card?.x ?? 0) + (card?.width ?? 0)).toBeLessThanOrEqual(
      (sheet?.x ?? 0) + (sheet?.width ?? 0) + 1,
    );
    expect((card?.y ?? 0) + (card?.height ?? 0)).toBeLessThanOrEqual(
      (sheet?.y ?? 0) + (sheet?.height ?? 0) + 1,
    );
  });
});

test.describe('whiteout', () => {
  test('hides what’s beneath it in the saved file, without removing it', async ({ page }) => {
    await openForAnnotating(page);
    await rememberPage(page, 1);
    await tool(page, 'Whiteout box').click();
    await dragOnPage(page, [100, 100], [500, 140]);
    await expect(page.locator('[data-kind="whiteout"]')).toHaveCount(1);
    await saveTo(page);
    const doc = await openDocument(Uint8Array.from((await lastWrite(page))?.bytes ?? []));
    const { blocks } = await doc.pageText(1);
    await doc.close();
    expect(blocks.map((block) => block.text).join(' ')).toContain('Plain text');
    await reopenSaved(page, 3);
    await page.getByRole('button', { name: 'Annotate', exact: true }).click();
    const changed = await whatChanged(page, 1);
    expect(changed.pixels).toBeGreaterThan(100);
    // Only dark text turned white, so what's different is all light now.
    expect(changed.average[0]).toBeGreaterThan(240);
  });

  test('text can be added on top of it', async ({ page }) => {
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
    await expect(page.getByText('On the whiteout')).toBeVisible();
    await saveTo(page);
    const doc = await openDocument(Uint8Array.from((await lastWrite(page))?.bytes ?? []));
    const { blocks } = await doc.pageText(1);
    await doc.close();
    expect(blocks.map((block) => block.text).join(' ')).toContain('On the whiteout');
  });
});

test.describe('images', () => {
  test('one goes on the page, ready to adjust, and is saved', async ({ page }) => {
    await openForAnnotating(page);
    await rememberPage(page, 1);
    await queueImage(page, { solid: true });
    await bar(page).getByRole('button', { name: 'Image', exact: true }).click();
    const image = page.getByTestId('placed-signature');
    await expect(image).toBeFocused();
    await expect(image).toHaveAttribute('aria-label', /^Placed image/);
    await expect(page.getByRole('button', { name: 'Delete image' })).toBeVisible();
    await expect(page.getByText('1 annotation', { exact: true })).toBeVisible();
    await saveTo(page);
    await reopenSaved(page, 3);
    await page.getByRole('button', { name: 'Annotate', exact: true }).click();
    expect((await whatChanged(page, 1)).pixels).toBeGreaterThan(500);
  });

  test('deleting from the list removes it', async ({ page }) => {
    await openForAnnotating(page);
    await queueImage(page);
    await bar(page).getByRole('button', { name: 'Image', exact: true }).click();
    await page.getByRole('button', { name: 'Delete image' }).click();
    await expect(page.getByTestId('placed-signature')).toHaveCount(0);
  });

  test('explains a file that isn’t an image', async ({ page }) => {
    await openForAnnotating(page);
    await page.evaluate(() => {
      if (window.smorsyMock) {
        window.smorsyMock.nextImage = { name: 'fake.png', bytes: new Uint8Array([1, 2, 3]) };
      }
    });
    await bar(page).getByRole('button', { name: 'Image', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('couldn’t be read as an image');
  });

  test('stays out of the way in Sign mode, and a signature in Annotate', async ({ page }) => {
    await openForAnnotating(page);
    await queueImage(page);
    await bar(page).getByRole('button', { name: 'Image', exact: true }).click();
    await page.getByRole('button', { name: 'Sign', exact: true }).click();
    await expect(page.getByRole('toolbar', { name: 'Signature actions' })).toHaveCount(0);
  });
});

test.describe('one thing selected at a time', () => {
  test('a click on the empty page lets go of an image', async ({ page }) => {
    await openForAnnotating(page);
    await queueImage(page);
    await bar(page).getByRole('button', { name: 'Image', exact: true }).click();
    await expect(page.getByRole('toolbar', { name: 'Image actions' })).toBeVisible();
    await page.keyboard.press('Escape');
    await clickOnPage(page, [100, 600]);
    await expect(page.getByRole('toolbar', { name: 'Image actions' })).toHaveCount(0);
  });
});

test.describe('what’s in the list', () => {
  test('follows the page in view', async ({ page }) => {
    await openForAnnotating(page);
    await tool(page, 'Rectangle').click();
    await dragOnPage(page, [150, 400], [350, 520]);
    await expect(page.getByText('1 annotation', { exact: true })).toBeVisible();
    await pageElement(page, 3).scrollIntoViewIfNeeded();
    await expect(page.getByText('0 annotations')).toBeVisible();
  });
});
