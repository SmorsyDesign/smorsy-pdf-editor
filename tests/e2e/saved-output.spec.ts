import { expect, test } from '@playwright/test';
import {
  block,
  editor,
  field,
  openForEditing,
  openSignedForEditing,
  pageElement,
  paintIn,
  regionOnPage,
  reopenSaved,
  saveTo,
  savedBlocks,
  showPage,
} from './editing-helpers';

// These open the saved file again and read the pixels the real renderer draws, because a saved
// file can read correctly as text while the patch sits somewhere else entirely.

const ROTATED = 'test-pdfs/06-rotated-pages.pdf';
const BANDS = 'test-pdfs/15-coloured-backgrounds.pdf';
const W9 = 'test-pdfs/16-irs-form-w9.pdf';

test.describe('patches land on the old text', () => {
  for (const [pageNumber, rotation] of [
    [1, 0],
    [2, 90],
    [3, 180],
    [4, 270],
  ] as const) {
    test(`on a page rotated ${rotation} degrees`, async ({ page }) => {
      await openForEditing(page, ROTATED, 4);
      await showPage(page, pageNumber);
      const target = pageElement(page, pageNumber)
        .getByRole('button', { name: `Edit text: This page has /Rotate ${rotation}` })
        .first();
      const region = await regionOnPage(target, pageElement(page, pageNumber));
      const before = await paintIn(page, pageNumber, region);
      expect(before.dark).toBeGreaterThan(50);

      await target.click();
      await field(page).fill('X');
      await page.keyboard.press('ControlOrMeta+Enter');
      await expect(editor(page)).toHaveCount(0);
      await saveTo(page);
      await reopenSaved(page, 4);
      await showPage(page, pageNumber);

      const after = await paintIn(page, pageNumber, region);
      expect(after.dark).toBeGreaterThan(0);
      expect(after.dark).toBeLessThan(before.dark * 0.4);
    });
  }

  test('on a sideways line in a real form', async ({ page }) => {
    await openSignedForEditing(page, W9, 6);
    const target = block(page, 'Print or type.');
    const region = await regionOnPage(target, pageElement(page, 1));
    const before = await paintIn(page, 1, region);
    await target.click();
    await field(page).fill('X');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(editor(page)).toHaveCount(0);
    await saveTo(page);
    await reopenSaved(page, 6);
    await showPage(page, 1);
    const after = await paintIn(page, 1, region);
    expect(after.dark).toBeLessThan(before.dark * 0.4);
  });

  test('matching a coloured band, with new text in the sampled colour', async ({ page }) => {
    await openForEditing(page, BANDS, 1);
    const target = block(page, 'White text on a flat dark band');
    const region = await regionOnPage(target, pageElement(page, 1));
    const before = await paintIn(page, 1, region);
    expect(before.light).toBeGreaterThan(50);

    await target.click();
    await field(page).fill('X');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(editor(page)).toHaveCount(0);
    await saveTo(page);
    await reopenSaved(page, 1);
    await showPage(page, 1);

    const after = await paintIn(page, 1, region);
    expect(after.common).toBe(before.common);
    expect(after.light).toBeGreaterThan(0);
    expect(after.light).toBeLessThan(before.light * 0.4);
  });
});

test.describe('what the person chose reaches the file', () => {
  test.beforeEach(async ({ page }) => {
    await openForEditing(page);
    await page
      .getByTestId('edit-layer')
      .first()
      .click({ position: { x: 96, y: 600 } });
  });

  test('font, size and bold', async ({ page }) => {
    await field(page).fill('Styled');
    await page.getByRole('combobox', { name: 'Font' }).selectOption('mono');
    await page.getByRole('spinbutton', { name: 'Size in points' }).fill('20');
    await page.getByRole('button', { name: 'Bold' }).click();
    await page.keyboard.press('ControlOrMeta+Enter');
    await saveTo(page);
    const styled = (await savedBlocks(page)).find((item) => item.text === 'Styled');
    expect(styled?.font.name).toContain('LiberationMono');
    expect(styled?.font.name).toContain('Bold');
    expect(styled?.size).toBeCloseTo(20, 0);
  });

  test('italic', async ({ page }) => {
    await field(page).fill('Slanted');
    await page.getByRole('button', { name: 'Italic' }).click();
    await page.keyboard.press('ControlOrMeta+Enter');
    await saveTo(page);
    const slanted = (await savedBlocks(page)).find((item) => item.text === 'Slanted');
    expect(slanted?.font.name).toContain('Italic');
  });

  test('colour', async ({ page }) => {
    await field(page).fill('Coloured');
    await page.getByRole('textbox', { name: 'Text colour' }).fill('#ff0000');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(editor(page)).toHaveCount(0);
    const region = await regionOnPage(page.locator('.edit-box').first(), pageElement(page, 1));
    await saveTo(page);
    await reopenSaved(page, 3);
    await showPage(page, 1);
    expect((await paintIn(page, 1, region)).red).toBeGreaterThan(20);
  });

  test('right alignment', async ({ page }) => {
    await field(page).fill('Right');
    await page.getByRole('button', { name: 'Align right' }).click();
    const open = await editor(page).boundingBox();
    const sheet = await pageElement(page, 1).boundingBox();
    await page.keyboard.press('ControlOrMeta+Enter');
    await saveTo(page);
    const right = (await savedBlocks(page)).find((item) => item.text === 'Right');
    const scale = (sheet?.width ?? 1) / 612;
    const boxRight = ((open?.x ?? 0) + (open?.width ?? 0) - (sheet?.x ?? 0)) / scale;
    expect((right?.rect.x ?? 0) + (right?.rect.width ?? 0)).toBeCloseTo(boxRight, -0.5);
  });

  test('a dragged position', async ({ page }) => {
    await field(page).fill('Dragged');
    const grip = page.getByRole('button', { name: /^Move text/ });
    const start = await grip.boundingBox();
    await grip.hover();
    await page.mouse.down();
    await page.mouse.move((start?.x ?? 0) + 72, (start?.y ?? 0) + 48, { steps: 4 });
    await page.mouse.up();
    const open = await editor(page).boundingBox();
    const sheet = await pageElement(page, 1).boundingBox();
    await page.keyboard.press('ControlOrMeta+Enter');
    await saveTo(page);
    const dragged = (await savedBlocks(page)).find((item) => item.text === 'Dragged');
    const scale = (sheet?.width ?? 1) / 612;
    expect(dragged?.rect.x).toBeCloseTo(((open?.x ?? 0) - (sheet?.x ?? 0)) / scale, -0.5);
    expect((dragged?.rect.y ?? 0) + (dragged?.firstBaseline ?? 0)).toBeCloseTo(
      ((open?.y ?? 0) - (sheet?.y ?? 0)) / scale + 12,
      -0.5,
    );
  });
});

test('edited text stays in place when going back to Select', async ({ page }) => {
  await openForEditing(page);
  const layer = page.getByTestId('edit-layer').first();
  for (const [text, y] of [
    ['First box', 500],
    ['Second box', 600],
  ] as const) {
    await layer.click({ position: { x: 96, y } });
    await field(page).fill(text);
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(editor(page)).toHaveCount(0);
  }
  const second = page.getByText('Second box');
  const inEdit = await second.boundingBox();
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const inSelect = await second.boundingBox();
  expect(inSelect?.y).toBeCloseTo(inEdit?.y ?? -1, 0);
  expect(inSelect?.x).toBeCloseTo(inEdit?.x ?? -1, 0);
});
