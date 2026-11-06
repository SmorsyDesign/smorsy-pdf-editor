import { expect, type Page } from '@playwright/test';
import { pageElement, reopenSaved, saveTo } from './editing-helpers';
import { expectOpenDocument, expectPageDrawn, openFixture } from './helpers';

export const PLAIN = 'test-pdfs/01-plain-text.pdf';

export const dialog = (page: Page) => page.getByRole('dialog', { name: /^Create / });
export const placed = (page: Page) => page.getByTestId('placed-signature');
export const signLayer = (page: Page, pageNumber = 1) =>
  page.locator(`[data-page="${pageNumber}"]`).getByTestId('sign-layer');
export const slip = (page: Page, index = 0) =>
  page.getByRole('button', { name: /^Place (signature|initials) / }).nth(index);

export async function openForSigning(page: Page, fixture = PLAIN, pageCount = 3) {
  await openFixture(page, fixture, 'Lease.pdf');
  await expectOpenDocument(page, pageCount);
  await expectPageDrawn(page);
  await page.getByRole('button', { name: 'Sign', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Signatures' })).toBeVisible();
}

export async function createTyped(page: Page, name = 'Mara Okafor') {
  await page.getByRole('button', { name: 'Create signature' }).click();
  await dialog(page).getByRole('button', { name: 'Type', exact: true }).click();
  await dialog(page).getByRole('textbox', { name: 'Your name' }).fill(name);
  await dialog(page).getByRole('button', { name: 'Use signature' }).click();
  await expect(dialog(page)).toHaveCount(0);
}

/** Creates a signature, then clicks where it goes. */
export async function placeTyped(page: Page, x = 300, y = 500, pageNumber = 1) {
  await createTyped(page);
  await signLayer(page, pageNumber).click({ position: { x, y } });
  await expect(placed(page).first()).toBeVisible();
}

interface ImageOptions {
  readonly paper?: string;
  readonly ink?: string;
  readonly name?: string;
  readonly solid?: boolean;
  readonly type?: string;
  /** Text to hide in the file's metadata. */
  readonly marker?: string;
}

/** Queues an image for the mock's image dialog: thin strokes of ink on paper, unless told otherwise. */
export function queueImage(
  page: Page,
  {
    paper = '#ffffff',
    ink = '#101010',
    name = 'signature-scan.png',
    solid = false,
    type = 'image/png',
    marker = '',
  }: ImageOptions = {},
) {
  return page.evaluate(
    async (options) => {
      const canvas = new OffscreenCanvas(400, 200);
      const context = canvas.getContext('2d');
      if (!context || !window.smorsyMock) throw new Error('Not ready.');
      if (options.paper !== 'transparent') {
        context.fillStyle = options.paper;
        context.fillRect(0, 0, 400, 200);
      }
      // Thin strokes, because a signature is mostly the paper showing through.
      if (options.ink !== 'transparent') {
        context.strokeStyle = options.ink;
        context.lineWidth = 4;
        context.beginPath();
        context.moveTo(60, 140);
        context.lineTo(160, 50);
        context.lineTo(220, 150);
        context.lineTo(340, 60);
        context.stroke();
      }
      if (options.solid) {
        context.fillStyle = options.ink;
        context.fillRect(60, 50, 280, 100);
      }
      const blob = await canvas.convertToBlob({ type: options.type });
      let bytes = new Uint8Array(await blob.arrayBuffer());
      if (options.marker) {
        // An ancillary chunk with a wrong checksum is ignored by decoders, like any metadata.
        const text = new TextEncoder().encode(`tEXt${options.marker}`);
        const chunk = new Uint8Array(text.length + 8);
        new DataView(chunk.buffer).setUint32(0, text.length - 4);
        chunk.set(text, 4);
        const headerEnd = 33;
        const joined = new Uint8Array(bytes.length + chunk.length);
        joined.set(bytes.subarray(0, headerEnd));
        joined.set(chunk, headerEnd);
        joined.set(bytes.subarray(headerEnd), headerEnd + chunk.length);
        bytes = joined;
      }
      window.smorsyMock.nextImage = { name: options.name, bytes };
    },
    { paper, ink, name, solid, type, marker },
  );
}

export async function upload(page: Page, options?: Parameters<typeof queueImage>[1]) {
  await page.getByRole('button', { name: 'Create signature' }).click();
  await dialog(page).getByRole('button', { name: 'Upload', exact: true }).click();
  await queueImage(page, options);
  await dialog(page).getByRole('button', { name: 'Choose an image' }).click();
  await expect(dialog(page).getByRole('img')).toBeVisible();
}

export async function drawStroke(page: Page) {
  const pad = dialog(page).getByTestId('signature-pad');
  const box = await pad.boundingBox();
  if (!box) throw new Error('The pad isn’t on screen.');
  await page.mouse.move(box.x + 60, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 40, { steps: 6 });
  await page.mouse.move(box.x + 300, box.y + 110, { steps: 6 });
  await page.mouse.up();
}

/**
 * Paints each signature onto the page as the screen shows it, saves, reopens, and compares the two
 * pixel by pixel. Only this catches a signature saved upside down, turned the wrong way or moved,
 * because all of those still leave ink somewhere near the right place.
 */
export async function expectSavedToMatchScreen(page: Page, pageNumber: number, pageCount: number) {
  await compareWithScreen(page, pageNumber, pageCount, true);
}

/** The same, for when the test has already saved and only needs the comparison's second half. */
export async function expectSavedToMatchScreenAfterSave(
  page: Page,
  pageNumber: number,
  pageCount: number,
) {
  await compareWithScreen(page, pageNumber, pageCount, false);
}

async function compareWithScreen(
  page: Page,
  pageNumber: number,
  pageCount: number,
  closePanel: boolean,
) {
  // Closed first, so the page is the same size on screen before and after reopening.
  if (closePanel) await page.getByRole('button', { name: 'Close signatures' }).click();
  await expect(page.getByRole('complementary', { name: 'Signatures' })).toHaveCount(0);
  await pageElement(page, pageNumber).scrollIntoViewIfNeeded();
  await waitForRedraw(page, pageNumber);
  const inkPixels = await page.evaluate((number) => {
    const sheet = document.querySelector<HTMLElement>(`[data-page="${number}"]`);
    const source = sheet?.querySelector('canvas');
    if (!sheet || !source) throw new Error('The page isn’t on screen.');
    const ratio = source.width / source.getBoundingClientRect().width;
    const copy = document.createElement('canvas');
    copy.width = source.width;
    copy.height = source.height;
    const context = copy.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('No drawing context.');
    context.drawImage(source, 0, 0);
    const before = context.getImageData(0, 0, copy.width, copy.height).data;
    for (const placed of sheet.querySelectorAll<HTMLElement>('[data-testid="placed-signature"]')) {
      const image = placed.querySelector('img');
      if (!image) continue;
      const { left, top, width, height, transform } = placed.style;
      const w = Number.parseFloat(width);
      const h = Number.parseFloat(height);
      const degrees = Number.parseFloat(/rotate\((.+)deg\)/.exec(transform)?.[1] ?? '0');
      context.save();
      context.scale(ratio, ratio);
      context.translate(Number.parseFloat(left) + w / 2, Number.parseFloat(top) + h / 2);
      context.rotate((degrees * Math.PI) / 180);
      context.drawImage(image, -w / 2, -h / 2, w, h);
      context.restore();
    }
    const expected = context.getImageData(0, 0, copy.width, copy.height);
    (window as unknown as { expectedPage: ImageData }).expectedPage = expected;
    let changed = 0;
    for (let at = 0; at < before.length; at += 4) {
      if (
        Math.abs((before[at] ?? 0) - (expected.data[at] ?? 0)) +
          Math.abs((before[at + 1] ?? 0) - (expected.data[at + 1] ?? 0)) +
          Math.abs((before[at + 2] ?? 0) - (expected.data[at + 2] ?? 0)) >
        96
      ) {
        changed += 1;
      }
    }
    return changed;
  }, pageNumber);
  // Otherwise a signature that never appeared would match the empty page perfectly.
  expect(inkPixels).toBeGreaterThan(100);

  if (closePanel) await saveTo(page);
  await reopenSaved(page, pageCount);
  await pageElement(page, pageNumber).scrollIntoViewIfNeeded();
  await waitForRedraw(page, pageNumber);
  const differing = await page.evaluate((number) => {
    const source = document.querySelector<HTMLCanvasElement>(`[data-page="${number}"] canvas`);
    const expected = (window as unknown as { expectedPage: ImageData }).expectedPage;
    if (!source) throw new Error('The page isn’t on screen.');
    if (source.width !== expected.width || source.height !== expected.height) {
      throw new Error(
        `The page changed size: ${source.width}x${source.height} against ${expected.width}x${expected.height}.`,
      );
    }
    const copy = document.createElement('canvas');
    copy.width = source.width;
    copy.height = source.height;
    const context = copy.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('No drawing context.');
    context.drawImage(source, 0, 0);
    const { data } = context.getImageData(0, 0, copy.width, copy.height);
    const width = copy.width;
    const close = (at: number, other: number) =>
      Math.abs((data[at] ?? 0) - (expected.data[other] ?? 0)) +
        Math.abs((data[at + 1] ?? 0) - (expected.data[other + 1] ?? 0)) +
        Math.abs((data[at + 2] ?? 0) - (expected.data[other + 2] ?? 0)) <=
      96;
    let count = 0;
    for (let at = 0; at < data.length; at += 4) {
      if (close(at, at)) continue;
      // Edges smooth slightly differently, so a match one or two pixels away still counts.
      let found = false;
      for (let dy = -2; dy <= 2 && !found; dy += 1) {
        for (let dx = -2; dx <= 2 && !found; dx += 1) {
          const other = at + (dy * width + dx) * 4;
          if (other >= 0 && other < data.length) found = close(at, other);
        }
      }
      if (!found) count += 1;
    }
    return count;
  }, pageNumber);
  expect(differing).toBeLessThan(Math.max(50, inkPixels * 0.05));
}

async function waitForRedraw(page: Page, pageNumber: number) {
  // A zoom change redraws after a short pause, so being drawn right now could be the old size.
  await page.waitForTimeout(300);
  await expect(pageElement(page, pageNumber).locator('canvas').first()).toHaveAttribute(
    'data-drawn',
    'true',
  );
}
