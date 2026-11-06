import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { lastWrite, pageElement, queueSavePath, saveTo, showPage } from './editing-helpers';
import { ORIGINAL_PATH, mockState } from './helpers';
import {
  PLAIN,
  createTyped,
  dialog,
  expectSavedToMatchScreen,
  openForSigning,
  placeTyped,
  placed,
  signLayer,
  slip,
} from './signing-helpers';

test.describe('keyboard', () => {
  test('Enter on a signature places it, and arrows and Delete then work', async ({ page }) => {
    await openForSigning(page);
    await createTyped(page);
    await page.keyboard.press('Escape');
    await slip(page).focus();
    await page.keyboard.press('Enter');
    await expect(placed(page)).toBeFocused();
    const before = await placed(page).boundingBox();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await expect
      .poll(async () => (await placed(page).boundingBox())?.x)
      .toBeGreaterThan(before?.x ?? Infinity);
    // A run of key presses is one undo, on top of placing it.
    await expect(page.getByText('2 unsaved changes')).toBeVisible();
    await page.keyboard.press('Delete');
    await expect(placed(page)).toHaveCount(0);
  });

  test('corners and the rotate handle work from the keyboard', async ({ page }) => {
    await openForSigning(page);
    await placeTyped(page);
    const before = await placed(page).boundingBox();
    await page.getByRole('button', { name: 'Resize from bottom right' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(async () => (await placed(page).boundingBox())?.width)
      .toBeGreaterThan(before?.width ?? Infinity);
    await page.getByRole('button', { name: 'Rotate signature' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('signature-angle')).toHaveText('5°');
  });

  test('Esc deselects', async ({ page }) => {
    await openForSigning(page);
    await placeTyped(page);
    await placed(page).focus();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('toolbar', { name: 'Signature actions' })).toHaveCount(0);
  });

  test('menu shortcuts wait while the create window is open', async ({ page }) => {
    await openForSigning(page);
    await page.getByRole('button', { name: 'Create signature' }).click();
    await queueSavePath(page, '/Users/test/Behind.pdf');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(dialog(page)).toBeVisible();
    await expect.poll(() => lastWrite(page)).toBeNull();
  });
});

test.describe('saving and the unsaved count', () => {
  test('undo and redo walk placements, and all undone saves the exact original', async ({
    page,
  }) => {
    await openForSigning(page);
    await placeTyped(page);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(placed(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(placed(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Undo' }).click();
    await saveTo(page);
    const write = await lastWrite(page);
    expect(Buffer.from(write?.bytes ?? []).equals(readFileSync(PLAIN))).toBe(true);
  });

  test('closing with a signature placed asks first', async ({ page }) => {
    await openForSigning(page);
    await placeTyped(page);
    await page.keyboard.press('ControlOrMeta+w');
    await expect(
      page.getByRole('alertdialog', { name: 'Save your changes to Lease.pdf?' }),
    ).toBeVisible();
    expect(await mockState(page, (mock) => mock.unsavedWork)).toBe(true);
  });

  test('a signature that was made but never placed isn’t an unsaved change', async ({ page }) => {
    await openForSigning(page);
    await createTyped(page);
    await page.keyboard.press('ControlOrMeta+w');
    await expect(page.getByRole('heading', { name: 'Open a PDF' })).toBeVisible();
  });

  test('saving over the original still asks first', async ({ page }) => {
    await openForSigning(page);
    await placeTyped(page);
    await queueSavePath(page, ORIGINAL_PATH);
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.getByRole('button', { name: 'Replace original' })).toBeVisible();
  });
});

test.describe('saving before placing', () => {
  const warning = (page: Page) =>
    page.getByRole('alertdialog', { name: 'Your signature isn’t on the page yet' });

  test('asks first, because the file wouldn’t include it', async ({ page }) => {
    await openForSigning(page);
    await createTyped(page);
    await page.getByRole('button', { name: 'Save a copy' }).click();
    await expect(warning(page)).toBeVisible();
    await warning(page).getByRole('button', { name: 'Go back' }).click();
    expect(await lastWrite(page)).toBeNull();
    await expect(slip(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test('can go ahead anyway', async ({ page }) => {
    await openForSigning(page);
    await createTyped(page);
    await queueSavePath(page, '/Users/test/Without.pdf');
    await page.keyboard.press('ControlOrMeta+s');
    await warning(page).getByRole('button', { name: 'Save without it' }).click();
    await expect(page.getByText('Copy saved')).toBeVisible();
    const write = await lastWrite(page);
    expect(Buffer.from(write?.bytes ?? []).equals(readFileSync(PLAIN))).toBe(true);
  });
});

test.describe('focus', () => {
  test('comes back when the create window is cancelled', async ({ page }) => {
    await openForSigning(page);
    const create = page.getByRole('button', { name: 'Create signature' });
    await create.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect(create).toBeFocused();
  });

  test('goes to the new signature after creating one', async ({ page }) => {
    await openForSigning(page);
    await createTyped(page);
    await expect(slip(page)).toBeFocused();
  });

  test('isn’t lost when the panel closes', async ({ page }) => {
    await openForSigning(page);
    await page.getByRole('button', { name: 'Close signatures' }).click();
    await expect(page.locator('main.canvas')).toBeFocused();
  });

  test('isn’t lost when a signature is deleted', async ({ page }) => {
    await openForSigning(page);
    await placeTyped(page);
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('main.canvas')).toBeFocused();
  });

  test('isn’t stolen from search by a selected signature coming back into view', async ({
    page,
  }) => {
    await openForSigning(page, 'test-pdfs/13-large-120-pages.pdf', 120);
    await placeTyped(page);
    await page.keyboard.press('ControlOrMeta+f');
    const search = page.getByRole('searchbox');
    await expect(search).toBeFocused();
    await pageElement(page, 40).scrollIntoViewIfNeeded();
    await expect(pageElement(page, 1).getByTestId('placed-signature')).toHaveCount(0);
    await pageElement(page, 1).scrollIntoViewIfNeeded();
    await expect(pageElement(page, 1).getByTestId('placed-signature')).toBeVisible();
    await expect(search).toBeFocused();
  });

  test('undo works with the date checkbox focused', async ({ page }) => {
    await openForSigning(page);
    await placeTyped(page);
    await page.getByRole('checkbox', { name: 'Add today’s date beside it' }).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(placed(page)).toHaveCount(0);
  });
});

test.describe('pointer details', () => {
  test('only the main button drags', async ({ page }) => {
    await openForSigning(page);
    await placeTyped(page);
    const before = await placed(page).boundingBox();
    if (!before) throw new Error('Not on screen.');
    await page.mouse.move(before.x + 20, before.y + 10);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(before.x + 100, before.y + 80, { steps: 4 });
    await page.mouse.up({ button: 'right' });
    expect((await placed(page).boundingBox())?.x).toBeCloseTo(before.x, 0);
  });

  test('a keyboard press right after a drag still works', async ({ page }) => {
    await openForSigning(page);
    await createTyped(page);
    await page.keyboard.press('Escape');
    const start = await slip(page).boundingBox();
    if (!start) throw new Error('Not on screen.');
    await page.mouse.move(start.x + 40, start.y + 20);
    await page.mouse.down();
    await page.mouse.move(start.x + 60, start.y + 200, { steps: 4 });
    await page.mouse.up();
    await slip(page).focus();
    await page.keyboard.press('Enter');
    await expect(placed(page)).toHaveCount(1);
  });

  test('the rotate handle can always be reached at the top of a page', async ({ page }) => {
    await openForSigning(page);
    await createTyped(page);
    await signLayer(page).click({ position: { x: 300, y: 5 } });
    const handle = page.getByRole('button', { name: 'Rotate signature' });
    const box = await handle.boundingBox();
    const hit = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.getAttribute('aria-label'),
      { x: (box?.x ?? 0) + 12, y: (box?.y ?? 0) + 12 },
    );
    expect(hit).toBe('Rotate signature');
  });

  test('the toolbar doesn’t cover the rotate handle at the right of a page', async ({ page }) => {
    await openForSigning(page);
    await createTyped(page);
    const sheet = await pageElement(page, 1).boundingBox();
    await signLayer(page).click({ position: { x: (sheet?.width ?? 800) - 90, y: 400 } });
    const handle = await page.getByRole('button', { name: 'Rotate signature' }).boundingBox();
    const hit = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.getAttribute('aria-label'),
      { x: (handle?.x ?? 0) + 12, y: (handle?.y ?? 0) + 12 },
    );
    expect(hit).toBe('Rotate signature');
  });

  test('the toolbar sits on whole pixels', async ({ page }) => {
    await openForSigning(page);
    await placeTyped(page);
    const { left, top } = await page
      .getByRole('toolbar', { name: 'Signature actions' })
      .evaluate((bar) => ({
        left: getComputedStyle(bar).left,
        top: getComputedStyle(bar).top,
      }));
    expect(Number.parseFloat(left) % 1).toBe(0);
    expect(Number.parseFloat(top) % 1).toBe(0);
  });
});

test.describe('when a style won’t load', () => {
  test('a stalled font says so, instead of waiting forever', async ({ page }) => {
    await page.route('**/*sacramento*', () => {
      // Never answers, which is what a stalled load looks like.
    });
    await openForSigning(page);
    await page.getByRole('button', { name: 'Create signature' }).click();
    await dialog(page).getByRole('button', { name: 'Type', exact: true }).click();
    await dialog(page).getByRole('textbox', { name: 'Your name' }).fill('Mara');
    await dialog(page).getByRole('radio', { name: 'Sacramento' }).check();
    await dialog(page).getByRole('button', { name: 'Use signature' }).click();
    await expect(dialog(page).getByRole('alert')).toContainText('didn’t load', { timeout: 12_000 });
  });

  test('cancelling while it waits means it never turns up', async ({ page }) => {
    await page.route('**/*sacramento*', () => {
      // Holds the signature in the making, until after it's cancelled.
    });
    await openForSigning(page);
    await page.getByRole('button', { name: 'Create signature' }).click();
    await dialog(page).getByRole('button', { name: 'Type', exact: true }).click();
    await dialog(page).getByRole('textbox', { name: 'Your name' }).fill('Mara');
    await dialog(page).getByRole('radio', { name: 'Sacramento' }).check();
    await dialog(page).getByRole('button', { name: 'Use signature' }).click();
    await dialog(page).getByRole('button', { name: 'Cancel' }).click();
    await page.waitForTimeout(200);
    await expect(slip(page)).toHaveCount(0);
  });

  test('two styles really do look different', async ({ page }) => {
    await openForSigning(page);
    const sizeOf = async (style: string) => {
      await page.getByRole('button', { name: 'Create signature' }).click();
      await dialog(page).getByRole('button', { name: 'Type', exact: true }).click();
      await dialog(page).getByRole('textbox', { name: 'Your name' }).fill('Mara Okafor');
      await dialog(page).getByRole('radio', { name: style }).check();
      await dialog(page).getByRole('button', { name: 'Use signature' }).click();
      await expect(dialog(page)).toHaveCount(0);
      await page.keyboard.press('Escape');
      const image = page
        .getByRole('button', { name: /^Place signature/ })
        .last()
        .locator('img');
      await expect
        .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
        .toBeGreaterThan(0);
      return image.evaluate((element: HTMLImageElement) => element.naturalWidth);
    };
    expect(await sizeOf('Caveat')).not.toBe(await sizeOf('Homemade Apple'));
  });
});

test.describe('what’s saved matches the screen, pixel for pixel', () => {
  const turn = async (page: Page, presses: number) => {
    await page.getByRole('button', { name: 'Rotate signature' }).focus();
    for (let press = 0; press < presses; press += 1) await page.keyboard.press('ArrowRight');
  };

  for (const pageNumber of [1, 2, 3, 4]) {
    for (const presses of [0, 6, 18]) {
      const degrees = presses * 5;
      test(`on page ${pageNumber}, turned ${degrees} degrees`, async ({ page }) => {
        await openForSigning(page, 'test-pdfs/06-rotated-pages.pdf', 4);
        await createTyped(page);
        await showPage(page, pageNumber);
        await signLayer(page, pageNumber).click({ position: { x: 200, y: 200 } });
        if (presses > 0) await turn(page, presses);
        await expectSavedToMatchScreen(page, pageNumber, 4);
      });
    }
  }

  test('after moving and resizing, on a rotated page', async ({ page }) => {
    await openForSigning(page, 'test-pdfs/06-rotated-pages.pdf', 4);
    await createTyped(page);
    await showPage(page, 2);
    await signLayer(page, 2).click({ position: { x: 200, y: 200 } });
    await turn(page, 6);
    const box = await placed(page).boundingBox();
    if (!box) throw new Error('Not on screen.');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 70, { steps: 5 });
    await page.mouse.up();
    const grip = await page.getByRole('button', { name: 'Resize from bottom right' }).boundingBox();
    if (!grip) throw new Error('Not on screen.');
    await page.mouse.move(grip.x + 12, grip.y + 12);
    await page.mouse.down();
    await page.mouse.move(grip.x + 50, grip.y + 40, { steps: 5 });
    await page.mouse.up();
    await expectSavedToMatchScreen(page, 2, 4);
  });

  test('over a form field, which would otherwise hide it', async ({ page }) => {
    await openForSigning(page, 'test-pdfs/21-form-filled-field.pdf', 1);
    await createTyped(page);
    const sheet = await pageElement(page, 1).boundingBox();
    const scale = (sheet?.width ?? 612) / 612;
    await signLayer(page).click({ position: { x: 200 * scale, y: 220 * scale } });
    await expectSavedToMatchScreen(page, 1, 1);
  });

  test('with one deleted, and signature and initials side by side', async ({ page }) => {
    await openForSigning(page);
    await placeTyped(page, 300, 400);
    await page.getByRole('button', { name: 'Duplicate' }).click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(placed(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Create initials' }).click();
    await dialog(page).getByRole('button', { name: 'Type', exact: true }).click();
    await dialog(page).getByRole('textbox', { name: 'Your name' }).fill('M.O.');
    await dialog(page).getByRole('button', { name: 'Use initials' }).click();
    await signLayer(page).click({ position: { x: 500, y: 600 } });
    await expect(placed(page)).toHaveCount(2);
    await expectSavedToMatchScreen(page, 1, 3);
  });

  test('moved to another page with the Move button', async ({ page }) => {
    await openForSigning(page);
    await placeTyped(page);
    await page.getByRole('button', { name: /^Move:/ }).click();
    await pageElement(page, 2).scrollIntoViewIfNeeded();
    await signLayer(page, 2).click({ position: { x: 300, y: 300 } });
    await expect(pageElement(page, 2).getByTestId('placed-signature')).toBeVisible();
    await expect(pageElement(page, 1).getByTestId('placed-signature')).toHaveCount(0);
    await expectSavedToMatchScreen(page, 2, 3);
  });
});
