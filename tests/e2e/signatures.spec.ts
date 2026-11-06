import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import {
  field,
  lastWrite,
  pageElement,
  paintIn,
  queueSavePath,
  regionOnPage,
  reopenSaved,
  saveTo,
  savedText,
  showPage,
} from './editing-helpers';
import { ORIGINAL_PATH, expectOpenDocument, mockState, openFixture, queueOpen } from './helpers';
import {
  PLAIN,
  createTyped,
  dialog,
  drawStroke,
  openForSigning,
  placeTyped,
  queueImage,
  placed,
  signLayer,
  slip,
  upload,
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

test.describe('creating', () => {
  test.beforeEach(async ({ page }) => {
    await openForSigning(page);
    await page.getByRole('button', { name: 'Create signature' }).click();
  });

  test('can’t be used until there’s something to use', async ({ page }) => {
    await expect(dialog(page).getByRole('button', { name: 'Use signature' })).toBeDisabled();
  });

  test('says it’s only kept while the PDF is open', async ({ page }) => {
    await expect(dialog(page).getByText('never stored on this computer')).toBeVisible();
  });

  test('Cancel and Esc leave nothing behind', async ({ page }) => {
    await drawStroke(page);
    await dialog(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(slip(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Create signature' }).click();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect(slip(page)).toHaveCount(0);
  });

  test('drawing: strokes can be undone and cleared', async ({ page }) => {
    const use = dialog(page).getByRole('button', { name: 'Use signature' });
    await drawStroke(page);
    await expect(use).toBeEnabled();
    await dialog(page).getByRole('button', { name: 'Undo stroke' }).click();
    await expect(use).toBeDisabled();
    await drawStroke(page);
    await dialog(page).getByRole('button', { name: 'Clear' }).click();
    await expect(use).toBeDisabled();
    await drawStroke(page);
    await use.click();
    await expect(slip(page)).toBeVisible();
  });

  test('drawing: the ink really reaches the saved file', async ({ page }) => {
    await drawStroke(page);
    await dialog(page).getByRole('radio', { name: 'Black' }).check();
    await dialog(page).getByRole('button', { name: 'Use signature' }).click();
    await signLayer(page).click({ position: { x: 300, y: 500 } });
    const region = await regionOnPage(placed(page), pageElement(page, 1));
    await saveTo(page);
    await reopenSaved(page, 3);
    await showPage(page, 1);
    expect((await paintIn(page, 1, region)).dark).toBeGreaterThan(50);
  });

  test('moving between tabs keeps what was drawn', async ({ page }) => {
    await drawStroke(page);
    await dialog(page).getByRole('button', { name: 'Type', exact: true }).click();
    await dialog(page).getByRole('button', { name: 'Draw', exact: true }).click();
    await expect(dialog(page).getByRole('button', { name: 'Use signature' })).toBeEnabled();
  });

  test('typing: shows the name in each style', async ({ page }) => {
    await dialog(page).getByRole('button', { name: 'Type', exact: true }).click();
    await dialog(page).getByRole('textbox', { name: 'Your name' }).fill('Mara Okafor');
    await expect(dialog(page).getByText('Mara Okafor')).toHaveCount(4);
    await dialog(page).getByRole('radio', { name: 'Sacramento' }).check();
    await dialog(page).getByRole('button', { name: 'Use signature' }).click();
    await expect(slip(page)).toBeVisible();
  });

  test('typing: says so when the styles lack some letters', async ({ page }) => {
    await dialog(page).getByRole('button', { name: 'Type', exact: true }).click();
    const name = dialog(page).getByRole('textbox', { name: 'Your name' });
    await name.fill('José Müller');
    await expect(dialog(page).getByText('only have Western European letters')).toHaveCount(0);
    await name.fill('Данило');
    await expect(dialog(page).getByText('only have Western European letters')).toBeVisible();
  });

  test('a name of only spaces isn’t a signature', async ({ page }) => {
    await dialog(page).getByRole('button', { name: 'Type', exact: true }).click();
    await dialog(page).getByRole('textbox', { name: 'Your name' }).fill('   ');
    await expect(dialog(page).getByRole('button', { name: 'Use signature' })).toBeDisabled();
  });

  test('initials go in their own list', async ({ page }) => {
    await dialog(page).getByRole('button', { name: 'Type', exact: true }).click();
    await dialog(page).getByRole('textbox', { name: 'Your name' }).fill('M.O.');
    await dialog(page).getByRole('radio', { name: 'Initials' }).check();
    await dialog(page).getByRole('button', { name: 'Use initials' }).click();
    await expect(page.getByRole('button', { name: /^Place initials 1/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Place signature/ })).toHaveCount(0);
  });
});

test.describe('uploading', () => {
  test.beforeEach(async ({ page }) => {
    await openForSigning(page, 'test-pdfs/15-coloured-backgrounds.pdf', 1);
  });

  const chooseFile = async (page: Page) => {
    await page.getByRole('button', { name: 'Create signature' }).click();
    await dialog(page).getByRole('button', { name: 'Upload', exact: true }).click();
  };

  test('removes the white, so the page shows through once saved', async ({ page }) => {
    await upload(page);
    await dialog(page).getByRole('button', { name: 'Use signature' }).click();
    // On the dark band, above its white heading, so paper left behind would show up clearly.
    await signLayer(page).click({ position: { x: 250, y: 40 } });
    const region = await regionOnPage(placed(page), pageElement(page, 1));
    const before = await paintIn(page, 1, region);
    await saveTo(page);
    await reopenSaved(page, 1);
    await showPage(page, 1);
    const after = await paintIn(page, 1, region);
    expect(after.common).toBe(before.common);
    expect(after.light).toBeLessThan(50);
  });

  test('keeping the white covers the page, as the option says', async ({ page }) => {
    await upload(page);
    await dialog(page).getByRole('checkbox', { name: 'Remove white background' }).uncheck();
    await dialog(page).getByRole('button', { name: 'Use signature' }).click();
    await signLayer(page).click({ position: { x: 250, y: 110 } });
    const region = await regionOnPage(placed(page), pageElement(page, 1));
    await saveTo(page);
    await reopenSaved(page, 1);
    await showPage(page, 1);
    expect((await paintIn(page, 1, region)).common).toBe('255,255,255');
  });

  test('explains a file that isn’t an image', async ({ page }) => {
    await chooseFile(page);
    await page.evaluate(() => {
      if (window.smorsyMock) {
        window.smorsyMock.nextImage = { name: 'fake.png', bytes: new Uint8Array([1, 2, 3]) };
      }
    });
    await dialog(page).getByRole('button', { name: 'Choose an image' }).click();
    await expect(dialog(page).getByRole('alert')).toContainText('couldn’t be read as an image');
    await expect(dialog(page).getByRole('button', { name: 'Use signature' })).toBeDisabled();
  });

  test('explains a file that can’t be read from disk', async ({ page }) => {
    await chooseFile(page);
    await page.evaluate(() => {
      if (window.smorsyMock) window.smorsyMock.nextImage = 'read-failure';
    });
    await dialog(page).getByRole('button', { name: 'Choose an image' }).click();
    await expect(dialog(page).getByRole('alert')).toContainText('couldn’t be read');
  });

  test('refuses a very large file before trying to read it', async ({ page }) => {
    await chooseFile(page);
    await page.evaluate(() => {
      if (window.smorsyMock) {
        window.smorsyMock.nextImage = { name: 'huge.png', bytes: new Uint8Array(26 * 1024 * 1024) };
      }
    });
    await dialog(page).getByRole('button', { name: 'Choose an image' }).click();
    await expect(dialog(page).getByRole('alert')).toContainText('under 25 MB');
  });

  test('says when no ink was found', async ({ page }) => {
    await chooseFile(page);
    await queueImage(page, { ink: '#ffffff' });
    await dialog(page).getByRole('button', { name: 'Choose an image' }).click();
    await expect(dialog(page).getByRole('alert')).toContainText('No ink was found');
    await expect(dialog(page).getByRole('button', { name: 'Use signature' })).toBeDisabled();
  });

  test('warns when the background probably stayed', async ({ page }) => {
    await upload(page, { solid: true });
    await expect(dialog(page).getByText('The background may not have come out')).toBeVisible();
  });

  test('doesn’t warn about an ordinary signature', async ({ page }) => {
    await upload(page);
    await expect(dialog(page).getByText('The background may not have come out')).toHaveCount(0);
  });

  test('cancelling the file window changes nothing', async ({ page }) => {
    await chooseFile(page);
    await dialog(page).getByRole('button', { name: 'Choose an image' }).click();
    await expect(dialog(page).getByRole('alert')).toHaveCount(0);
    await expect(dialog(page).getByText('No image chosen')).toBeVisible();
  });
});

test.describe('placing', () => {
  test('clicking the page places it there, and it reaches the saved file', async ({ page }) => {
    await openForSigning(page);
    await placeTyped(page);
    const region = await regionOnPage(placed(page), pageElement(page, 1));
    expect(region.x + region.width / 2).toBeCloseTo(300, -1);
    expect(region.y + region.height / 2).toBeCloseTo(500, -1);
    await saveTo(page);
    await reopenSaved(page, 3);
    await showPage(page, 1);
    expect((await paintIn(page, 1, region)).dark).toBeGreaterThan(50);
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
    const region = await regionOnPage(placed(page).nth(1), pageElement(page, 2));
    await saveTo(page);
    await reopenSaved(page, 3);
    await showPage(page, 2);
    expect((await paintIn(page, 2, region)).dark).toBeGreaterThan(50);
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

  test('a turned signature saves turned', async ({ page }) => {
    const upright = await regionOnPage(placed(page), pageElement(page, 1));
    await page.getByRole('button', { name: 'Rotate 90 degrees' }).click();
    const turned = await regionOnPage(placed(page), pageElement(page, 1));
    expect(turned.height).toBeGreaterThan(upright.height);
    await saveTo(page);
    await reopenSaved(page, 3);
    await showPage(page, 1);
    // Above and below its upright shape, only a turned signature leaves ink.
    const above = { ...turned, height: (turned.height - upright.height) / 2 };
    const inside = await paintIn(page, 1, turned);
    expect(inside.dark).toBeGreaterThan(50);
    expect((await paintIn(page, 1, above)).dark).toBeGreaterThan(0);
  });

  test('removing it from the list leaves what’s placed', async ({ page }) => {
    await page.getByRole('button', { name: /^Remove signature 1/ }).click();
    await expect(slip(page)).toHaveCount(0);
    await expect(placed(page)).toHaveCount(1);
  });
});

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

test.describe('on rotated pages', () => {
  for (const pageNumber of [2, 3, 4]) {
    test(`page ${pageNumber}: it saves where it was placed`, async ({ page }) => {
      await openForSigning(page, 'test-pdfs/06-rotated-pages.pdf', 4);
      await createTyped(page);
      await showPage(page, pageNumber);
      await signLayer(page, pageNumber).click({ position: { x: 200, y: 200 } });
      const region = await regionOnPage(placed(page), pageElement(page, pageNumber));
      await saveTo(page);
      await reopenSaved(page, 4);
      await showPage(page, pageNumber);
      expect((await paintIn(page, pageNumber, region)).dark).toBeGreaterThan(50);
    });
  }
});
