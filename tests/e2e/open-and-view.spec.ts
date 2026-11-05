import { readdirSync } from 'node:fs';
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

const everyFixture = readdirSync('test-pdfs').filter(
  (name) => name.endsWith('.pdf') && name !== '10-password-protected.pdf',
);

for (const name of everyFixture) {
  test(`draws ${name}`, async ({ page }) => {
    await openFixture(page, `test-pdfs/${name}`);
    await expect(page.getByTestId('page-indicator')).toHaveText(/^Page 1 of \d+$/);
    await expectPageDrawn(page);
  });
}

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

test('fit to width returns from any zoom and follows the window', async ({ page }) => {
  await openFixture(page, 'test-pdfs/14-images-and-text.pdf');
  await expectOpenDocument(page, 1);
  await page.keyboard.press('ControlOrMeta+0');
  await page.keyboard.press('ControlOrMeta+=');
  await expect(page.getByTestId('zoom-value')).toHaveText('125%');
  await page.keyboard.press('ControlOrMeta+9');
  await expect(page.getByRole('button', { name: 'Fit to width' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('zoom-value')).toHaveText('100%');
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByTestId('zoom-value')).toHaveText('78%');
});

test('one damaged page explains itself, and the other pages still draw', async ({ page }) => {
  await openFixture(page, 'tests/fixtures/bad-page.pdf');
  await expectOpenDocument(page, 3);
  await expectPageDrawn(page, 1);
  await expect(page.getByText('Page 2 couldn’t be drawn')).toBeVisible();
  await page.locator('main').evaluate((main) => {
    main.scrollTop = main.scrollHeight;
  });
  await expectPageDrawn(page, 3);
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

  test('a zoomed-in page can be scrolled to its left edge', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.keyboard.press('ControlOrMeta+0');
    await page.keyboard.press('ControlOrMeta+=');
    await page.keyboard.press('ControlOrMeta+=');
    await page.keyboard.press('ControlOrMeta+=');
    await expect(page.getByTestId('zoom-value')).toHaveText('200%');
    const scroller = page.locator('main');
    await scroller.evaluate((main) => {
      main.scrollLeft = 0;
    });
    const pageBox = await page.locator('[data-page="1"]').boundingBox();
    const scrollerBox = await scroller.boundingBox();
    expect(pageBox?.x).toBeGreaterThanOrEqual(scrollerBox?.x ?? Infinity);
  });

  test('rapid zooming ends sharp, on the final size, with no error', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+0');
    for (let press = 0; press < 5; press += 1) {
      await page.keyboard.press('ControlOrMeta+=');
    }
    await expect(page.getByTestId('zoom-value')).toHaveText('400%');
    const canvas = page.locator('[data-page="1"] canvas');
    await expect
      .poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.width))
      .toBeGreaterThanOrEqual(3264);
    await expectPageDrawn(page);
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

  const drawnThumbnails = await page
    .locator('aside canvas')
    .evaluateAll((canvases: HTMLCanvasElement[]) => canvases.filter((c) => c.width > 0).length);
  expect(drawnThumbnails).toBeLessThan(20);

  await page.locator('main').evaluate((main) => {
    main.scrollTop = main.scrollHeight / 2;
  });
  await expect(page.getByTestId('page-indicator')).toHaveText('Page 61 of 120');
  await expectPageDrawn(page, 61);
  // Pages far out of view give their memory back.
  await expect
    .poll(() =>
      page.locator('[data-page="1"] canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width),
    )
    .toBe(0);
});

test('a long thumbnail list is one Tab stop, with arrow keys inside it', async ({ page }) => {
  await openFixture(page, 'test-pdfs/13-large-120-pages.pdf');
  await expectOpenDocument(page, 120);
  const thumbnails = page.getByRole('complementary', { name: 'Pages' });
  await thumbnails.getByRole('button', { name: 'Page 1', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(thumbnails.getByRole('button', { name: 'Page 2', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('page-indicator')).toHaveText('Page 2 of 120');
  await page.keyboard.press('Tab');
  await expect(page.locator('main')).toBeFocused();
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
