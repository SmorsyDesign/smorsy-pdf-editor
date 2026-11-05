import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';

export const ORIGINAL_PATH = '/Users/test/Documents/original file.pdf';

/** Loads the app and waits for the mock platform, which starts just after the page loads. */
export async function gotoApp(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.smorsyMock));
}

/** Queues a file for the mock's open dialog. */
export async function queueOpen(page: Page, relativePath: string, name = 'Test file.pdf') {
  const base64 = readFileSync(join(process.cwd(), relativePath)).toString('base64');
  await page.evaluate(
    ({ encoded, path, fileName }) => {
      const raw = atob(encoded);
      const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
      if (!window.smorsyMock) throw new Error('The mock platform is not running.');
      window.smorsyMock.nextOpen = { path, name: fileName, bytes };
    },
    { encoded: base64, path: ORIGINAL_PATH, fileName: name },
  );
}

export async function openFixture(page: Page, relativePath: string, name?: string) {
  await gotoApp(page);
  await queueOpen(page, relativePath, name);
  await page.getByRole('button', { name: 'Choose a file' }).click();
}

export async function expectOpenDocument(page: Page, pageCount: number) {
  await expect(page.getByTestId('page-indicator')).toHaveText(`Page 1 of ${pageCount}`);
}

/** Resolves true once a page's canvas has dark pixels, meaning content was really drawn. */
export async function expectPageDrawn(page: Page, pageNumber = 1) {
  await expect
    .poll(
      () =>
        page.evaluate((number) => {
          const canvas = document.querySelector<HTMLCanvasElement>(
            `[data-page="${number}"] canvas`,
          );
          if (!canvas || canvas.width === 0) return 0;
          const context = canvas.getContext('2d');
          if (!context) return 0;
          const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
          let dark = 0;
          for (let index = 0; index < data.length; index += 4) {
            if ((data[index] ?? 255) < 128) dark += 1;
          }
          return dark;
        }, pageNumber),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(50);
}

export function mockState<T>(page: Page, read: (mock: NonNullable<Window['smorsyMock']>) => T) {
  return page.evaluate<T>(`(${read.toString()})(window.smorsyMock)`);
}
