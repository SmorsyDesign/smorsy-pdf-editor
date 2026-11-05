import { expect, test } from '@playwright/test';
import {
  expectOpenDocument,
  expectPageDrawn,
  gotoApp,
  mockState,
  openFixture,
  queueOpen,
} from './helpers';

test('the start screen invites you to open a file', async ({ page }) => {
  await gotoApp(page);
  await expect(page.getByRole('heading', { name: 'Open a PDF' })).toBeVisible();
  await expect(page.getByText('Your files stay on this computer')).toBeVisible();
});

test('shows shortcuts for the platform', async ({ page }) => {
  await gotoApp(page);
  await expect(page.getByText(/^(⌘O|Ctrl\+O)$/)).toBeVisible();
});

test('cancelling the open dialog stays on the start screen', async ({ page }) => {
  await gotoApp(page);
  await page.getByRole('button', { name: 'Choose a file' }).click();
  await expect(page.getByRole('heading', { name: 'Open a PDF' })).toBeVisible();
});

test('opens a PDF and draws it', async ({ page }) => {
  await openFixture(page, 'test-pdfs/01-plain-text.pdf', 'Lease.pdf');
  await expectOpenDocument(page, 3);
  await expectPageDrawn(page);
  await expect(page.getByText('Lease.pdf')).toBeVisible();
  expect(await mockState(page, (mock) => mock.windowTitle)).toBe('Lease.pdf - Smorsy PDF Editor');
  expect(await mockState(page, (mock) => mock.documentOpen)).toBe(true);
});

for (const [name, pages] of [
  ['03-subset-embedded.pdf', 1],
  ['05-non-latin.pdf', 1],
  ['06-rotated-pages.pdf', 4],
  ['07-mixed-sizes.pdf', 6],
  ['08-fillable-form.pdf', 1],
  ['11-annotations-links.pdf', 2],
  ['16-irs-form-w9.pdf', 6],
] as const) {
  test(`draws ${name}`, async ({ page }) => {
    await openFixture(page, `test-pdfs/${name}`);
    await expectOpenDocument(page, pages);
    await expectPageDrawn(page);
  });
}

test('draws an image-only scanned page', async ({ page }) => {
  await openFixture(page, 'test-pdfs/09-scanned-image-only.pdf');
  await expectOpenDocument(page, 1);
  await expectPageDrawn(page);
});

test('a rotated page is displayed sideways', async ({ page }) => {
  await openFixture(page, 'test-pdfs/06-rotated-pages.pdf');
  await expectOpenDocument(page, 4);
  await expect
    .poll(async () => {
      const box = await page.locator('[data-page="2"]').boundingBox();
      return box ? box.width > box.height : false;
    })
    .toBe(true);
});

test('thumbnails list every page and move you to one', async ({ page }) => {
  await openFixture(page, 'test-pdfs/01-plain-text.pdf');
  await expectOpenDocument(page, 3);
  const thumbnails = page.getByRole('complementary', { name: 'Pages' }).getByRole('button');
  await expect(thumbnails).toHaveCount(3);
  await thumbnails.nth(2).click();
  await expect(page.getByTestId('page-indicator')).toHaveText('Page 3 of 3');
  await expect(thumbnails.nth(2)).toHaveAttribute('aria-current', 'page');
});

test('scrolling continuously updates the current page', async ({ page }) => {
  await openFixture(page, 'test-pdfs/01-plain-text.pdf');
  await expectOpenDocument(page, 3);
  await page.locator('main').evaluate((main) => {
    main.scrollTop = main.scrollHeight;
  });
  await expect(page.getByTestId('page-indicator')).toHaveText('Page 3 of 3');
  await expectPageDrawn(page, 3);
});

test('closing the document returns to the start screen', async ({ page }) => {
  await openFixture(page, 'test-pdfs/01-plain-text.pdf');
  await expectOpenDocument(page, 3);
  await page.keyboard.press('ControlOrMeta+w');
  await expect(page.getByRole('heading', { name: 'Open a PDF' })).toBeVisible();
  expect(await mockState(page, (mock) => mock.documentOpen)).toBe(false);
});

test('opening a second file replaces the first', async ({ page }) => {
  await openFixture(page, 'test-pdfs/01-plain-text.pdf', 'First.pdf');
  await expectOpenDocument(page, 3);
  await queueOpen(page, 'test-pdfs/06-rotated-pages.pdf', 'Second.pdf');
  await page.keyboard.press('ControlOrMeta+o');
  await expectOpenDocument(page, 4);
  await expect(page.getByText('Second.pdf')).toBeVisible();
  await expectPageDrawn(page);
});

test.describe('zoom', () => {
  test.beforeEach(async ({ page }) => {
    await openFixture(page, 'test-pdfs/01-plain-text.pdf');
    await expectOpenDocument(page, 3);
  });

  test('buttons step through levels and keep whole pixels', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+0');
    await expect(page.getByTestId('zoom-value')).toHaveText('100%');
    await expect(page.locator('[data-page="1"]')).toHaveCSS('width', '816px');
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(page.getByTestId('zoom-value')).toHaveText('125%');
    await expect(page.locator('[data-page="1"]')).toHaveCSS('width', '1020px');
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await expect(page.getByTestId('zoom-value')).toHaveText('75%');
    await expect(page.locator('[data-page="1"]')).toHaveCSS('width', '612px');
  });

  test('shortcuts work', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+0');
    await page.keyboard.press('ControlOrMeta+=');
    await expect(page.getByTestId('zoom-value')).toHaveText('125%');
    await page.keyboard.press('ControlOrMeta+-');
    await expect(page.getByTestId('zoom-value')).toHaveText('100%');
  });

  test('fit to width follows the window', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.keyboard.press('ControlOrMeta+9');
    const zoomValue = page.getByRole('button', { name: 'Fit to width' });
    await expect(zoomValue).toHaveAttribute('aria-pressed', 'true');
    const box = await page.locator('[data-page="1"]').boundingBox();
    expect(box?.width).toBeLessThanOrEqual(1024 - 148 - 48);
  });

  test('redraws sharply after zooming', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+0');
    await expectPageDrawn(page);
    const canvas = page.locator('[data-page="1"] canvas');
    const before = await canvas.evaluate((element: HTMLCanvasElement) => element.width);
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect
      .poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.width))
      .toBeGreaterThan(before);
  });
});

test('a 100+ page document shows page 1 in under 2 seconds, without drawing every page', async ({
  page,
}) => {
  await gotoApp(page);
  await queueOpen(page, 'test-pdfs/13-large-120-pages.pdf');
  const started = Date.now();
  await page.getByRole('button', { name: 'Choose a file' }).click();
  await expectPageDrawn(page);
  expect(Date.now() - started).toBeLessThan(2000);

  await expectOpenDocument(page, 120);
  const drawn = await page
    .locator('main canvas')
    .evaluateAll((canvases: HTMLCanvasElement[]) => canvases.filter((c) => c.width > 0).length);
  expect(drawn).toBeLessThan(10);

  await page.locator('main').evaluate((main) => {
    main.scrollTop = main.scrollHeight / 2;
  });
  await expect(page.getByTestId('page-indicator')).toHaveText(/Page 6\d of 120/);
});

test('light and dark follow the system, and pages stay white', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openFixture(page, 'test-pdfs/01-plain-text.pdf');
  await expectOpenDocument(page, 3);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(26, 33, 39)');
  await expect(page.locator('[data-page="1"]')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(244, 246, 247)');
});

test('nothing is fetched from outside the app, for any kind of file', async ({ page }) => {
  const outside: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith('http://127.0.0.1:5173') && !/^(data|blob):/.test(url)) outside.push(url);
  });
  for (const name of [
    '02-standard-fonts.pdf',
    '05-non-latin.pdf',
    '09-scanned-image-only.pdf',
    '11-annotations-links.pdf',
    '16-irs-form-w9.pdf',
    '18-irs-publication-15t.pdf',
  ]) {
    await openFixture(page, `test-pdfs/${name}`);
    await expectPageDrawn(page);
  }
  expect(outside).toEqual([]);
});

test('the window stays usable at the 1024 pixel minimum', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await openFixture(page, 'test-pdfs/01-plain-text.pdf');
  await expectOpenDocument(page, 3);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  await expect(page.getByRole('button', { name: 'Save a copy' })).toBeVisible();
});

test('every control is reachable by keyboard', async ({ page }) => {
  await openFixture(page, 'test-pdfs/01-plain-text.pdf');
  await expectOpenDocument(page, 3);
  const seen = new Set<string>();
  for (let press = 0; press < 12; press += 1) {
    await page.keyboard.press('Tab');
    seen.add(
      await page.evaluate(() => {
        const element = document.activeElement;
        return element?.getAttribute('aria-label') ?? element?.textContent ?? '';
      }),
    );
  }
  for (const label of ['Save a copy', 'Page 1', 'Zoom in', 'Zoom out', 'Fit to width']) {
    expect(seen).toContain(label);
  }
});
