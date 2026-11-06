import { expect, type Page } from '@playwright/test';
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

/** Queues an image for the mock's image dialog: dark ink on paper, or whatever's given. */
export function queueImage(
  page: Page,
  { paper = '#ffffff', ink = '#101010', name = 'signature-scan.png', solid = false } = {},
) {
  return page.evaluate(
    async ({ paperColour, inkColour, fileName, solid: isSolid }) => {
      const canvas = new OffscreenCanvas(400, 200);
      const context = canvas.getContext('2d');
      if (!context || !window.smorsyMock) throw new Error('Not ready.');
      context.fillStyle = paperColour;
      context.fillRect(0, 0, 400, 200);
      // Thin strokes, because a signature is mostly the paper showing through.
      context.strokeStyle = inkColour;
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(60, 140);
      context.lineTo(160, 50);
      context.lineTo(220, 150);
      context.lineTo(340, 60);
      context.stroke();
      if (isSolid) {
        context.fillStyle = inkColour;
        context.fillRect(60, 50, 280, 100);
      }
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      window.smorsyMock.nextImage = {
        name: fileName,
        bytes: new Uint8Array(await blob.arrayBuffer()),
      };
    },
    { paperColour: paper, inkColour: ink, fileName: name, solid },
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
