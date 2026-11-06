import { expect, test, type Page } from '@playwright/test';
import { lastWrite, saveTo } from './editing-helpers';
import {
  dialog,
  drawStroke,
  expectSavedToMatchScreen,
  openForSigning,
  queueImage,
  signLayer,
  slip,
  upload,
} from './signing-helpers';

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
    await expectSavedToMatchScreen(page, 1, 3);
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
    await upload(page, { ink: '#e03030' });
    await dialog(page).getByRole('button', { name: 'Use signature' }).click();
    // On the dark band, above its white heading, so paper left behind would show up clearly.
    await signLayer(page).click({ position: { x: 250, y: 40 } });
    await expectSavedToMatchScreen(page, 1, 1);
  });

  test('keeping the white covers the page, as the option says', async ({ page }) => {
    await upload(page);
    await dialog(page).getByRole('checkbox', { name: 'Remove white background' }).uncheck();
    await dialog(page).getByRole('button', { name: 'Use signature' }).click();
    await signLayer(page).click({ position: { x: 250, y: 40 } });
    await expectSavedToMatchScreen(page, 1, 1);
  });

  test('keeps a signature that’s already cut out, rather than erasing it', async ({ page }) => {
    await upload(page, { paper: 'transparent', ink: '#101010' });
    await expect(dialog(page).getByRole('alert')).toHaveCount(0);
    await dialog(page).getByRole('button', { name: 'Use signature' }).click();
    await signLayer(page).click({ position: { x: 250, y: 300 } });
    await expectSavedToMatchScreen(page, 1, 1);
  });

  test('reads a JPEG, as phone photos usually are', async ({ page }) => {
    await upload(page, { type: 'image/jpeg' });
    await dialog(page).getByRole('button', { name: 'Use signature' }).click();
    await expect(slip(page)).toBeVisible();
  });

  test('refuses an image too large to decode safely, from its header alone', async ({ page }) => {
    await chooseFile(page);
    await page.evaluate(() => {
      const header = new Uint8Array(24);
      header.set([137, 80, 78, 71, 13, 10, 26, 10]);
      const view = new DataView(header.buffer);
      view.setUint32(16, 20000);
      view.setUint32(20, 20000);
      if (window.smorsyMock) window.smorsyMock.nextImage = { name: 'bomb.png', bytes: header };
    });
    await dialog(page).getByRole('button', { name: 'Choose an image' }).click();
    await expect(dialog(page).getByRole('alert')).toContainText('under 100 megapixels');
  });

  test('a rejected file leaves nothing ready to use', async ({ page }) => {
    await upload(page);
    await page.evaluate(() => {
      if (window.smorsyMock) {
        window.smorsyMock.nextImage = { name: 'huge.png', bytes: new Uint8Array(26 * 1024 * 1024) };
      }
    });
    await dialog(page).getByRole('button', { name: 'Choose another image' }).click();
    await expect(dialog(page).getByRole('alert')).toContainText('under 25 MB');
    await expect(dialog(page).getByRole('button', { name: 'Use signature' })).toBeDisabled();
  });

  test('a fully clear image can’t become an invisible signature', async ({ page }) => {
    await chooseFile(page);
    await queueImage(page, { paper: 'transparent', ink: 'transparent' });
    await dialog(page).getByRole('checkbox', { name: 'Remove white background' }).uncheck();
    await dialog(page).getByRole('button', { name: 'Choose an image' }).click();
    await expect(dialog(page).getByRole('alert')).toContainText('No ink was found');
    await expect(dialog(page).getByRole('button', { name: 'Use signature' })).toBeDisabled();
  });

  test('metadata in the file doesn’t reach the saved PDF', async ({ page }) => {
    await chooseFile(page);
    await queueImage(page, { marker: 'SECRET-GPS-MARKER' });
    await dialog(page).getByRole('button', { name: 'Choose an image' }).click();
    await dialog(page).getByRole('button', { name: 'Use signature' }).click();
    await signLayer(page).click({ position: { x: 250, y: 300 } });
    await saveTo(page);
    const write = await lastWrite(page);
    expect(Buffer.from(write?.bytes ?? []).includes('SECRET-GPS-MARKER')).toBe(false);
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
