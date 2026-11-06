import { expect, test, type Page } from '@playwright/test';
import { openDocument } from '../../src/engine/document';
import { field, lastWrite, pageElement, regionOnPage, saveTo, savedText } from './editing-helpers';
import { expectOpenDocument, openFixture, queueOpen } from './helpers';
import {
  createTyped,
  expectSavedToMatchScreen,
  openForSigning,
  placeTyped,
  placed,
  signLayer,
  slip,
} from './signing-helpers';

test.describe('Sign mode', () => {
  test('opens a panel, and closing it returns to Select', async ({ page }) => {
    await openForSigning(page);
    await expect(page.getByText('Drag one onto the page')).toBeVisible();
    await expect(page.getByText('It isn’t a certified digital signature')).toBeVisible();
    await page.getByRole('button', { name: 'Close signatures' }).click();
    await expect(page.getByRole('complementary', { name: 'Signatures' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('warns first on a signed PDF, and goes on to Sign', async ({ page }) => {
    await openFixture(page, 'test-pdfs/19-digitally-signed.pdf', 'Signed.pdf');
    await page.getByRole('button', { name: 'Sign', exact: true }).click();
    const warning = page.getByRole('alertdialog', { name: 'Editing will break the signature' });
    await expect(page.getByRole('complementary', { name: 'Signatures' })).toHaveCount(0);
    await warning.getByRole('button', { name: 'Edit anyway' }).click();
    await expect(page.getByRole('complementary', { name: 'Signatures' })).toBeVisible();
  });

  test('isn’t available on a PDF protected against changes', async ({ page }) => {
    await openFixture(page, 'test-pdfs/20-owner-restricted.pdf', 'Protected.pdf');
    await expect(page.getByRole('button', { name: 'Sign', exact: true })).toBeDisabled();
  });
});

test.describe('placing', () => {
  test('clicking the page places it there, and it reaches the saved file', async ({ page }) => {
    await openForSigning(page);
    await placeTyped(page);
    const region = await regionOnPage(placed(page), pageElement(page, 1));
    expect(region.x + region.width / 2).toBeCloseTo(300, -1);
    expect(region.y + region.height / 2).toBeCloseTo(500, -1);
    await expectSavedToMatchScreen(page, 1, 3);
  });

  test('a new signature is ready to place, and Esc cancels it', async ({ page }) => {
    await openForSigning(page);
    await createTyped(page);
    await expect(slip(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Click where it goes on the page').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(slip(page)).toHaveAttribute('aria-pressed', 'false');
    await signLayer(page).click({ position: { x: 300, y: 500 } });
    await expect(placed(page)).toHaveCount(0);
  });

  test('placing once doesn’t leave every later click placing more', async ({ page }) => {
    await openForSigning(page);
    await placeTyped(page);
    await signLayer(page).click({ position: { x: 300, y: 650 } });
    await expect(placed(page)).toHaveCount(1);
    await expect(page.getByRole('toolbar', { name: 'Signature actions' })).toHaveCount(0);
  });

  test('can be reused across pages, as separate edits', async ({ page }) => {
    await openForSigning(page);
    await placeTyped(page);
    await slip(page).click();
    await pageElement(page, 2).scrollIntoViewIfNeeded();
    await signLayer(page, 2).click({ position: { x: 300, y: 300 } });
    await expect(placed(page)).toHaveCount(2);
    await expect(page.getByText('2 unsaved changes')).toBeVisible();
    await expectSavedToMatchScreen(page, 2, 3);
  });

  test('dragging from the panel places it where it’s dropped', async ({ page }) => {
    await openForSigning(page);
    await createTyped(page);
    await page.keyboard.press('Escape');
    const start = await slip(page).boundingBox();
    const sheet = await pageElement(page, 1).boundingBox();
    if (!start || !sheet) throw new Error('Not on screen.');
    await page.mouse.move(start.x + 40, start.y + 20);
    await page.mouse.down();
    await page.mouse.move(sheet.x + 300, sheet.y + 400, { steps: 8 });
    await page.mouse.up();
    const region = await regionOnPage(placed(page), pageElement(page, 1));
    expect(region.x + region.width / 2).toBeCloseTo(300, -1);
    expect(region.y + region.height / 2).toBeCloseTo(400, -1);
  });

  test('dropping off the page places nothing', async ({ page }) => {
    await openForSigning(page);
    await createTyped(page);
    await page.keyboard.press('Escape');
    const start = await slip(page).boundingBox();
    if (!start) throw new Error('Not on screen.');
    await page.mouse.move(start.x + 40, start.y + 20);
    await page.mouse.down();
    await page.mouse.move(start.x + 60, start.y + 200, { steps: 4 });
    await page.mouse.up();
    await expect(placed(page)).toHaveCount(0);
  });

  test('stays in place when moving to other modes, without being editable', async ({ page }) => {
    await openForSigning(page);
    await placeTyped(page);
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await expect(placed(page)).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Signature actions' })).toHaveCount(0);
    await expect(placed(page).getByRole('button')).toHaveCount(0);
  });
});

test.describe('adjusting', () => {
  test.beforeEach(async ({ page }) => {
    await openForSigning(page);
    await placeTyped(page);
  });

  const box = async (page: Page) => {
    const value = await placed(page).boundingBox();
    if (!value) throw new Error('Not on screen.');
    return value;
  };

  test('dragging moves it, as one undo', async ({ page }) => {
    const before = await box(page);
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 60, before.y + before.height / 2 + 40, {
      steps: 5,
    });
    await page.mouse.up();
    const after = await box(page);
    expect(after.x - before.x).toBeCloseTo(60, 0);
    expect(after.y - before.y).toBeCloseTo(40, 0);
    await expect(page.getByText('2 unsaved changes')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    expect((await box(page)).x).toBeCloseTo(before.x, 0);
  });

  test('a corner resizes it, keeping its shape', async ({ page }) => {
    const before = await box(page);
    const grip = await page.getByRole('button', { name: 'Resize from bottom right' }).boundingBox();
    if (!grip) throw new Error('Not on screen.');
    await page.mouse.move(grip.x + 12, grip.y + 12);
    await page.mouse.down();
    await page.mouse.move(grip.x + 62, grip.y + 12 + (50 * before.height) / before.width, {
      steps: 5,
    });
    await page.mouse.up();
    const after = await box(page);
    expect(after.width).toBeGreaterThan(before.width + 30);
    expect(after.width / after.height).toBeCloseTo(before.width / before.height, 1);
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);
  });

  test('the top handle turns it', async ({ page }) => {
    const before = await box(page);
    const grip = await page.getByRole('button', { name: 'Rotate signature' }).boundingBox();
    if (!grip) throw new Error('Not on screen.');
    await page.mouse.move(grip.x + 12, grip.y + 12);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 100, before.y + before.height / 2, {
      steps: 6,
    });
    await page.mouse.up();
    await expect(page.getByTestId('signature-angle')).toHaveText('90°');
  });

  test('the toolbar turns, duplicates and deletes', async ({ page }) => {
    const toolbar = page.getByRole('toolbar', { name: 'Signature actions' });
    await toolbar.getByRole('button', { name: 'Rotate 90 degrees' }).click();
    await expect(page.getByTestId('signature-angle')).toHaveText('90°');
    await toolbar.getByRole('button', { name: 'Duplicate' }).click();
    await expect(placed(page)).toHaveCount(2);
    await toolbar.getByRole('button', { name: 'Delete' }).click();
    await expect(placed(page)).toHaveCount(1);
  });

  test('can’t be dragged off the page, because the file would cut it off', async ({ page }) => {
    const before = await box(page);
    const sheet = await pageElement(page, 1).boundingBox();
    if (!sheet) throw new Error('Not on screen.');
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(sheet.x - 60, before.y, { steps: 6 });
    await page.mouse.up();
    expect((await box(page)).x).toBeGreaterThanOrEqual(sheet.x - 1);
  });

  test('larger and smaller buttons work without dragging', async ({ page }) => {
    const before = await box(page);
    await page.getByRole('button', { name: 'Make larger' }).click();
    const larger = await box(page);
    expect(larger.width).toBeGreaterThan(before.width);
    await page.getByRole('button', { name: 'Make smaller' }).click();
    await page.getByRole('button', { name: 'Make smaller' }).click();
    expect((await box(page)).width).toBeLessThan(before.width);
  });

  test('the Move button moves it with a single click, and Esc cancels', async ({ page }) => {
    const move = page.getByRole('button', { name: /^Move:/ });
    await move.click();
    await expect(move).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    const before = await box(page);
    await signLayer(page).click({ position: { x: 100, y: 100 } });
    expect((await box(page)).x).toBeCloseTo(before.x, 0);

    await placed(page).click();
    await move.click();
    await signLayer(page).click({ position: { x: 300, y: 200 } });
    const region = await regionOnPage(placed(page), pageElement(page, 1));
    expect(region.x + region.width / 2).toBeCloseTo(300, -1);
    expect(region.y + region.height / 2).toBeCloseTo(200, -1);
  });

  test('a duplicate sits just off the original, turned the same way', async ({ page }) => {
    await page.getByRole('button', { name: 'Rotate 90 degrees' }).click();
    const before = await box(page);
    await page.getByRole('button', { name: 'Duplicate' }).click();
    await expect(page.getByTestId('signature-angle')).toHaveText('90°');
    const after = await placed(page).nth(1).boundingBox();
    expect(after?.x).toBeGreaterThan(before.x);
    expect(after?.y).toBeGreaterThan(before.y);
  });

  test('removing it from the list leaves what’s placed', async ({ page }) => {
    await page.getByRole('button', { name: /^Remove signature 1/ }).click();
    await expect(slip(page)).toHaveCount(0);
    await expect(placed(page)).toHaveCount(1);
  });
});

test.describe('the date stamp', () => {
  const expected = () =>
    new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  test('is off unless asked for', async ({ page }) => {
    await openForSigning(page);
    await placeTyped(page);
    await expect(page.getByText(expected())).toHaveCount(0);
  });

  test('goes beside the signature, reaches the file, and undoes with it', async ({ page }) => {
    await openForSigning(page);
    await page.getByRole('checkbox', { name: 'Add today’s date beside it' }).check();
    await placeTyped(page);
    await expect(page.getByText(expected())).toBeVisible();
    await expect(page.getByText('1 unsaved change')).toBeVisible();
    await saveTo(page);
    expect(await savedText(page)).toContain(expected());

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(placed(page)).toHaveCount(0);
    await expect(page.getByText(expected())).toHaveCount(0);
  });

  test('isn’t hidden behind the signature’s toolbar', async ({ page }) => {
    await openForSigning(page);
    await page.getByRole('checkbox', { name: 'Add today’s date beside it' }).check();
    await placeTyped(page);
    const stamp = await page.getByText(expected()).boundingBox();
    const bar = await page.getByRole('toolbar', { name: 'Signature actions' }).boundingBox();
    if (!stamp || !bar) throw new Error('Not on screen.');
    const overlaps =
      stamp.x < bar.x + bar.width &&
      bar.x < stamp.x + stamp.width &&
      stamp.y < bar.y + bar.height &&
      bar.y < stamp.y + stamp.height;
    expect(overlaps).toBe(false);
  });

  test('goes when its signature is deleted, and comes back with one undo', async ({ page }) => {
    await openForSigning(page);
    await page.getByRole('checkbox', { name: 'Add today’s date beside it' }).check();
    await placeTyped(page);
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(expected())).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(placed(page)).toHaveCount(1);
    await expect(page.getByText(expected())).toBeVisible();
  });

  test('stays if it’s been reworded, because then it’s the person’s own text', async ({ page }) => {
    await openForSigning(page);
    await page.getByRole('checkbox', { name: 'Add today’s date beside it' }).check();
    await placeTyped(page);
    await page.getByRole('button', { name: 'Edit text', exact: true }).click();
    await page.getByRole('button', { name: `Edit text: ${expected()}` }).click();
    await field(page).fill('Signed in Vancouver');
    await page.keyboard.press('ControlOrMeta+Enter');
    await page.getByRole('button', { name: 'Sign', exact: true }).click();
    await placed(page).focus();
    await page.keyboard.press('Delete');
    await expect(placed(page)).toHaveCount(0);
    await expect(page.getByText('Signed in Vancouver')).toBeVisible();
  });

  test('still shows when it lands on a solid form field', async ({ page }) => {
    await openForSigning(page, 'test-pdfs/21-form-filled-field.pdf', 1);
    await page.getByRole('checkbox', { name: 'Add today’s date beside it' }).check();
    await createTyped(page);
    const sheet = await pageElement(page, 1).boundingBox();
    const scale = (sheet?.width ?? 612) / 612;
    await signLayer(page).click({ position: { x: 120 * scale, y: 220 * scale } });
    await saveTo(page);
    const task = await lastWrite(page);
    const doc = await openDocument(Uint8Array.from(task?.bytes ?? []));
    const { blocks } = await doc.pageText(1);
    await doc.close();
    expect(blocks.map((block) => block.text).join(' ')).toContain(expected());
  });

  test('can be edited like any other text', async ({ page }) => {
    await openForSigning(page);
    await page.getByRole('checkbox', { name: 'Add today’s date beside it' }).check();
    await placeTyped(page);
    await page.getByRole('button', { name: 'Edit text', exact: true }).click();
    await page.getByRole('button', { name: `Edit text: ${expected()}` }).click();
    await field(page).fill('1 January 2030');
    await page.keyboard.press('ControlOrMeta+Enter');
    await saveTo(page);
    expect(await savedText(page)).toContain('1 January 2030');
  });
});

test.describe('privacy', () => {
  test('nothing is stored, and the next PDF starts with an empty list', async ({ page }) => {
    await openForSigning(page);
    await placeTyped(page);
    await saveTo(page);
    const stored = await page.evaluate(() => ({
      local: Object.keys(localStorage).filter((key) => key !== 'smorsy.coveredNoticeSeen'),
      session: Object.keys(sessionStorage),
    }));
    expect(stored).toEqual({ local: [], session: [] });

    await queueOpen(page, 'test-pdfs/06-rotated-pages.pdf', 'Other.pdf');
    await page.keyboard.press('ControlOrMeta+o');
    await expectOpenDocument(page, 4);
    await page.getByRole('button', { name: 'Sign', exact: true }).click();
    await expect(slip(page)).toHaveCount(0);
    await expect(placed(page)).toHaveCount(0);
  });

  test('signing fetches nothing from outside the app', async ({ page }) => {
    const outside: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith('http://127.0.0.1:5173') && !/^(data|blob):/.test(url)) outside.push(url);
    });
    await openForSigning(page);
    await placeTyped(page);
    await saveTo(page);
    expect(outside).toEqual([]);
  });
});
