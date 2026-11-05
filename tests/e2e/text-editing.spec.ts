import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openDocument } from '../../src/engine/document';
import {
  HEADING,
  PLAIN,
  block,
  editor,
  field,
  lastWrite,
  openForEditing,
  queueSavePath,
  replaceHeading,
  saveTo,
  savedText,
} from './editing-helpers';
import { expectOpenDocument, mockState, openFixture, ORIGINAL_PATH, queueOpen } from './helpers';

test.describe('modes', () => {
  test('starts in Select, and Edit text outlines each block', async ({ page }) => {
    await openFixture(page, PLAIN);
    await expectOpenDocument(page, 3);
    await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('edit-layer')).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit text', exact: true }).click();
    const heading = block(page, HEADING);
    await expect(heading).toBeVisible();
    await heading.hover();
    await expect(heading).toHaveCSS('outline-style', 'solid');
  });
});

test.describe('editing existing text', () => {
  test('opens pre-filled, matching size and position', async ({ page }) => {
    await openForEditing(page);
    await block(page, HEADING).click();
    await expect(field(page)).toHaveValue(HEADING);
    const fontSize = await field(page).evaluate((element) =>
      parseFloat(getComputedStyle(element).fontSize),
    );
    // Size 18 at 100% zoom, where one point is 4/3 of a pixel.
    expect(fontSize).toBeCloseTo(24, 0);
  });

  test('replaced text is what the saved file contains', async ({ page }) => {
    await openForEditing(page);
    await replaceHeading(page, 'New heading');
    await expect(page.getByText('New heading')).toBeVisible();
    await saveTo(page);
    expect(await savedText(page)).toContain('New heading');
  });

  test('saving an edit writes a new file, not the original', async ({ page }) => {
    await openForEditing(page);
    await replaceHeading(page, 'New heading');
    await saveTo(page);
    const write = await lastWrite(page);
    expect(write?.path).not.toBe(ORIGINAL_PATH);
    expect(Buffer.from(write?.bytes ?? []).equals(readFileSync(PLAIN))).toBe(false);
    expect(await savedText(page)).toContain('New heading');
  });

  test('Esc cancels, and leaving text unchanged records nothing', async ({ page }) => {
    await openForEditing(page);
    await block(page, HEADING).click();
    await field(page).fill('Abandoned');
    await page.keyboard.press('Escape');
    await expect(editor(page)).toHaveCount(0);
    await block(page, HEADING).click();
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await expect(page.getByText('3 pages')).toBeVisible();
  });

  test('clicking outside the text finishes the edit', async ({ page }) => {
    await openForEditing(page);
    await block(page, HEADING).click();
    await field(page).fill('Finished by clicking away');
    await page
      .getByTestId('edit-layer')
      .first()
      .click({ position: { x: 20, y: 700 } });
    await expect(editor(page)).toHaveCount(0);
    await expect(page.getByText('Finished by clicking away')).toBeVisible();
  });

  test('saving while still typing includes what was typed', async ({ page }) => {
    await openForEditing(page);
    await block(page, HEADING).click();
    await field(page).fill('Typed then saved');
    await saveTo(page);
    expect(await savedText(page)).toContain('Typed then saved');
  });

  test('longer text wraps within its block', async ({ page }) => {
    await openForEditing(page);
    await block(page, 'This agreement renews').click();
    await field(page).fill('Word '.repeat(60).trim());
    await page.keyboard.press('ControlOrMeta+Enter');
    await saveTo(page);
    const doc = await openDocument(Uint8Array.from((await lastWrite(page))?.bytes ?? []));
    const { blocks } = await doc.pageText(1);
    const wrapped = blocks.find((item) => item.text.includes('Word Word'));
    expect(wrapped?.lines.length).toBeGreaterThan(1);
    await doc.close();
  });

  test('deleting removes the text from view and adds nothing new', async ({ page }) => {
    await openForEditing(page);
    await block(page, HEADING).click();
    await page.getByRole('button', { name: 'Delete this text' }).click();
    await expect(editor(page)).toHaveCount(0);
    await expect(page.getByTestId('edit-layer').first().locator('..')).toBeVisible();
    await expect(page.locator('.edit-cover')).toHaveCount(1);
    await expect(block(page, HEADING)).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(block(page, HEADING)).toBeVisible();
  });

  test('the Delete key deletes a focused block', async ({ page }) => {
    await openForEditing(page);
    await block(page, HEADING).focus();
    await page.keyboard.press('Delete');
    await expect(block(page, HEADING)).toHaveCount(0);
  });

  test('samples the background and text colour from the page', async ({ page }) => {
    await openForEditing(page, 'test-pdfs/15-coloured-backgrounds.pdf', 1);
    await block(page, 'White text on a flat dark band').click();
    const color = await field(page).evaluate((element) => getComputedStyle(element).color);
    expect(color).toBe('rgb(255, 255, 255)');
    await field(page).fill('Changed on the band');
    await page.keyboard.press('ControlOrMeta+Enter');
    const cover = page.locator('.edit-cover').first();
    const background = await cover.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(background).not.toBe('rgb(255, 255, 255)');
  });

  test('warns when a patch may show on a gradient', async ({ page }) => {
    await openForEditing(page, 'test-pdfs/15-coloured-backgrounds.pdf', 1);
    await block(page, 'Text over a gradient').click();
    // Before the edit is made, while there's still time to change course.
    await expect(page.getByText('the patch over the old text may be visible')).toBeVisible();
  });
});

test.describe('adding text', () => {
  test('clicking an empty area places a box, and the text is saved', async ({ page }) => {
    await openForEditing(page);
    await page
      .getByTestId('edit-layer')
      .first()
      .click({ position: { x: 96, y: 600 } });
    await field(page).fill('A brand new note');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.getByText('A brand new note')).toBeVisible();
    await saveTo(page);
    expect(await savedText(page)).toContain('A brand new note');
  });

  test('an empty box leaves nothing behind', async ({ page }) => {
    await openForEditing(page);
    await page
      .getByTestId('edit-layer')
      .first()
      .click({ position: { x: 96, y: 600 } });
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(editor(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  test('arrow keys move and resize, so a mouse isn’t required', async ({ page }) => {
    await openForEditing(page);
    await page
      .getByTestId('edit-layer')
      .first()
      .click({ position: { x: 96, y: 600 } });
    await field(page).fill('Moved');
    const before = await editor(page).boundingBox();
    await page.getByRole('button', { name: /^Move text/ }).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    const moved = await editor(page).boundingBox();
    expect(moved?.x).toBeGreaterThan(before?.x ?? Infinity);
    expect(moved?.y).toBeGreaterThan(before?.y ?? Infinity);
    await page.getByRole('button', { name: /^Resize text box/ }).focus();
    await page.keyboard.press('ArrowRight');
    const resized = await editor(page).boundingBox();
    expect(resized?.width).toBeGreaterThan(moved?.width ?? Infinity);
  });

  test('dragging counts as part of one undo', async ({ page }) => {
    await openForEditing(page);
    await page
      .getByTestId('edit-layer')
      .first()
      .click({ position: { x: 96, y: 600 } });
    await field(page).fill('Dragged');
    const grip = page.getByRole('button', { name: /^Move text/ });
    const start = await grip.boundingBox();
    await grip.hover();
    await page.mouse.down();
    await page.mouse.move((start?.x ?? 0) + 60, (start?.y ?? 0) + 40, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.getByText('1 unsaved change')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('Dragged')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });
});

test.describe('undo and redo', () => {
  test('walk every edit, by button and by shortcut', async ({ page }) => {
    await openForEditing(page);
    await replaceHeading(page, 'First change');
    await block(page, 'This agreement renews').click();
    await field(page).fill('Second change');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.getByText('2 unsaved changes')).toBeVisible();

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('1 unsaved change')).toBeVisible();
    await expect(page.getByText('Second change')).toHaveCount(0);

    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByText('First change')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();

    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(page.getByText('First change')).toBeVisible();
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(page.getByText('Second change')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled();
  });

  test('editing an edit is one more undo step', async ({ page }) => {
    await openForEditing(page);
    await replaceHeading(page, 'Once');
    await page.getByRole('button', { name: 'Edit text: Once' }).click();
    await field(page).fill('Twice');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.getByText('Twice')).toBeVisible();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByText('Once')).toBeVisible();
  });

  test('undoing everything saves the exact original bytes', async ({ page }) => {
    await openForEditing(page);
    await replaceHeading(page, 'Temporary');
    await page.keyboard.press('ControlOrMeta+z');
    await saveTo(page);
    const write = await lastWrite(page);
    expect(Buffer.from(write?.bytes ?? []).equals(readFileSync(PLAIN))).toBe(true);
  });
});

test.describe('saving', () => {
  test('the first save asks for a file; ⌘S then updates that copy without asking', async ({
    page,
  }) => {
    await openForEditing(page);
    await replaceHeading(page, 'Version one');
    await saveTo(page, '/Users/test/Copy.pdf');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();

    await replaceHeading2(page, 'Version one', 'Version two');
    await page.evaluate(() => {
      if (window.smorsyMock) window.smorsyMock.lastWrite = null;
    });
    await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(async () => (await lastWrite(page))?.path).toBe('/Users/test/Copy.pdf');
    expect(await savedText(page)).toContain('Version two');
  });

  test('Save a Copy always asks', async ({ page }) => {
    await openForEditing(page);
    await replaceHeading(page, 'Changed');
    await saveTo(page, '/Users/test/First.pdf');
    await queueSavePath(page, '/Users/test/Second.pdf');
    await page.keyboard.press('ControlOrMeta+Shift+s');
    await expect.poll(async () => (await lastWrite(page))?.path).toBe('/Users/test/Second.pdf');
  });

  test('choosing the original still needs confirmation', async ({ page }) => {
    await openForEditing(page);
    await replaceHeading(page, 'Changed');
    await queueSavePath(page, ORIGINAL_PATH);
    await page.keyboard.press('ControlOrMeta+s');
    await expect(
      page.getByRole('alertdialog', { name: 'Replace your original file?' }),
    ).toBeVisible();
    expect(await lastWrite(page)).toBeNull();
  });

  test('saving clears the unsaved count', async ({ page }) => {
    await openForEditing(page);
    await replaceHeading(page, 'Changed');
    await expect(page.getByText('1 unsaved change')).toBeVisible();
    await saveTo(page);
    await expect(page.getByText('unsaved change')).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+w');
    await expect(page.getByRole('heading', { name: 'Open a PDF' })).toBeVisible();
  });
});

async function replaceHeading2(page: Page, from: string, to: string) {
  await page.getByRole('button', { name: `Edit text: ${from}` }).click();
  await field(page).fill(to);
  await page.keyboard.press('ControlOrMeta+Enter');
}

test.describe('unsaved changes', () => {
  const dialog = (page: Page) =>
    page.getByRole('alertdialog', { name: 'Save your changes to Lease.pdf?' });

  test.beforeEach(async ({ page }) => {
    await openForEditing(page);
    await replaceHeading(page, 'Unsaved');
  });

  test('closing asks first; Cancel keeps everything', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+w');
    await dialog(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Unsaved', { exact: true })).toBeVisible();
  });

  test('Don’t save closes without writing', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+w');
    await dialog(page).getByRole('button', { name: 'Don’t save' }).click();
    await expect(page.getByRole('heading', { name: 'Open a PDF' })).toBeVisible();
    expect(await lastWrite(page)).toBeNull();
  });

  test('Save writes, then closes', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+w');
    await queueSavePath(page, '/Users/test/Kept.pdf');
    await dialog(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Open a PDF' })).toBeVisible();
    expect(await savedText(page)).toContain('Unsaved');
  });

  test('opening another file asks first', async ({ page }) => {
    await queueOpen(page, 'test-pdfs/06-rotated-pages.pdf', 'Other.pdf');
    await page.keyboard.press('ControlOrMeta+o');
    await expect(dialog(page)).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Don’t save' }).click();
    await expectOpenDocument(page, 4);
  });

  test('closing the window asks first', async ({ page }) => {
    await expect(page.getByText('1 unsaved change')).toBeVisible();
    const allowed = await page.evaluate(() => window.smorsyMock?.closeGuard?.());
    expect(allowed).toBe(false);
    await dialog(page).getByRole('button', { name: 'Don’t save' }).click();
    expect(await mockState(page, (mock) => mock.windowClosed)).toBe(true);
  });

  test('closing while still typing asks first, and keeps the text', async ({ page }) => {
    await page.getByRole('button', { name: 'Edit text: Unsaved' }).click();
    await field(page).fill('Still typing');
    await page.keyboard.press('ControlOrMeta+w');
    await expect(dialog(page)).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Still typing')).toBeVisible();
  });

  test('a clean document closes without asking', async ({ page }) => {
    await expect(page.getByText('1 unsaved change')).toBeVisible();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(await page.evaluate(() => window.smorsyMock?.closeGuard?.())).toBe(true);
  });
});

test.describe('fonts', () => {
  test('a standard font is reused, with no substitution notice', async ({ page }) => {
    await openForEditing(page);
    await replaceHeading(page, 'Same font');
    await expect(page.getByText('can’t show this text')).toHaveCount(0);
    await saveTo(page);
    const doc = await openDocument(Uint8Array.from((await lastWrite(page))?.bytes ?? []));
    const { blocks } = await doc.pageText(1);
    expect(blocks.find((item) => item.text.includes('Same font'))?.font.name).toContain(
      'Helvetica',
    );
    await doc.close();
  });

  test('explains the swap when the file’s font lacks a character, and can undo it', async ({
    page,
  }) => {
    await openForEditing(page, 'test-pdfs/03-subset-embedded.pdf', 1);
    await block(page, 'This agreement renews').click();
    await field(page).fill('QXZ');
    await page.keyboard.press('ControlOrMeta+Enter');
    const notice = page.getByText('can’t show this text');
    await expect(notice).toBeVisible();
    await expect(page.getByText(/it’s missing/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Keep Liberation/ })).toBeVisible();
    await expect(page.getByText('1 font replaced')).toBeVisible();
    await page.getByRole('button', { name: 'Undo edit' }).click();
    await expect(notice).toHaveCount(0);
    await expect(block(page, 'This agreement renews')).toBeVisible();
  });

  test('says the old text is covered the first time only', async ({ page }) => {
    await openForEditing(page);
    await replaceHeading(page, 'Covered once');
    await expect(page.getByText('covered, not removed')).toBeVisible();
    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(page.getByText('covered, not removed')).toHaveCount(0);
    await block(page, 'This agreement renews').click();
    await field(page).fill('Covered twice');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.getByText('Covered twice')).toBeVisible();
    await expect(page.getByText('covered, not removed')).toHaveCount(0);
  });

  test('Times New Roman isn’t offered on a computer without it', async ({ page }) => {
    await openForEditing(page);
    await block(page, HEADING).click();
    await expect(page.getByRole('combobox', { name: 'Font' })).not.toContainText('Times New Roman');
  });
});

test.describe('scanned pages', () => {
  test('explain themselves and still accept new text', async ({ page }) => {
    await openForEditing(page, 'test-pdfs/09-scanned-image-only.pdf', 1);
    await expect(page.getByText('This page is a scan')).toBeVisible();
    await page.getByRole('button', { name: 'Add text' }).click();
    await field(page).fill('Added to a scan');
    await page.keyboard.press('ControlOrMeta+Enter');
    await saveTo(page);
    expect(await savedText(page)).toContain('Added to a scan');
  });
});

test.describe('digitally signed PDFs', () => {
  const SIGNED = 'test-pdfs/19-digitally-signed.pdf';

  test('open in View mode, and stay byte-identical if only viewed', async ({ page }) => {
    await openFixture(page, SIGNED, 'Signed.pdf');
    await expect(page.getByText('This PDF has a digital signature')).toBeVisible();
    await expect(page.getByText('Digitally signed')).toBeVisible();
    await queueSavePath(page, '/Users/test/Signed copy.pdf');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.getByText('Copy saved')).toBeVisible();
    const write = await lastWrite(page);
    expect(Buffer.from(write?.bytes ?? []).equals(readFileSync(SIGNED))).toBe(true);
  });

  test('warn before the first edit, and Keep viewing stays locked', async ({ page }) => {
    await openFixture(page, SIGNED, 'Signed.pdf');
    await page.getByRole('button', { name: 'Edit text', exact: true }).click();
    const warning = page.getByRole('alertdialog', { name: 'Editing will break the signature' });
    await expect(warning).toBeVisible();
    await expect(warning.getByRole('button', { name: 'Keep viewing' })).toBeFocused();
    await warning.getByRole('button', { name: 'Keep viewing' }).click();
    await expect(page.getByTestId('edit-layer')).toHaveCount(0);
    await expect(page.getByText('This PDF has a digital signature')).toBeVisible();
  });

  test('Edit anyway unlocks editing', async ({ page }) => {
    await openFixture(page, SIGNED, 'Signed.pdf');
    await page.getByRole('button', { name: 'Edit anyway' }).click();
    await page
      .getByRole('alertdialog', { name: 'Editing will break the signature' })
      .getByRole('button', { name: 'Edit anyway' })
      .click();
    await expect(page.getByTestId('edit-layer').first()).toBeVisible();
    await expect(page.getByText('This PDF has a digital signature')).toHaveCount(0);
  });
});

test.describe('selecting and searching', () => {
  test('text can be selected in Select mode', async ({ page }) => {
    await openFixture(page, PLAIN);
    await expectOpenDocument(page, 3);
    const span = page.getByTestId('select-layer').first().getByText(HEADING);
    await expect(span).toHaveCount(1);
    await span.selectText();
    const selected = await page.evaluate(() => window.getSelection()?.toString());
    expect(selected).toContain(HEADING);
  });

  test('search finds matches across pages and steps through them', async ({ page }) => {
    await openFixture(page, PLAIN);
    await expectOpenDocument(page, 3);
    await page.keyboard.press('ControlOrMeta+f');
    const input = page.getByRole('searchbox', { name: 'Search this document' });
    await expect(input).toBeFocused();
    await input.fill('page');
    await expect(page.getByText('1 of 3', { exact: true })).toBeVisible();
    await expect(page.locator('.search-hit').first()).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByText('2 of 3', { exact: true })).toBeVisible();
    await expect(page.getByTestId('page-indicator')).toHaveText('Page 2 of 3');
    await page.getByRole('button', { name: 'Previous match' }).click();
    await expect(page.getByText('1 of 3', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(input).toHaveCount(0);
  });

  test('says when nothing matches', async ({ page }) => {
    await openFixture(page, PLAIN);
    await expectOpenDocument(page, 3);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search this document' }).fill('zzzzz');
    await expect(page.getByText('No matches')).toBeVisible();
  });
});

test('editing fetches nothing from outside the app', async ({ page }) => {
  const outside: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith('http://127.0.0.1:5173') && !/^(data|blob):/.test(url)) outside.push(url);
  });
  await openForEditing(page);
  await replaceHeading(page, 'Offline edit');
  await saveTo(page);
  expect(outside).toEqual([]);
});
