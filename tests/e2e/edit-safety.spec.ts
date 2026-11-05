import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import {
  HEADING,
  block,
  editor,
  field,
  lastWrite,
  openForEditing,
  openSignedForEditing,
  queueSavePath,
  replaceHeading,
  saveTo,
  savedBlocks,
  savedText,
} from './editing-helpers';
import { expectOpenDocument, mockState, openFixture, queueOpen } from './helpers';

const unsavedDialog = (page: Page) =>
  page.getByRole('alertdialog', { name: 'Save your changes to Lease.pdf?' });

async function addText(page: Page, text: string, y = 600) {
  await page
    .getByTestId('edit-layer')
    .first()
    .click({ position: { x: 96, y } });
  await field(page).fill(text);
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(editor(page)).toHaveCount(0);
}

test.describe('quitting', () => {
  test('asks about unsaved changes first', async ({ page }) => {
    await openForEditing(page);
    await replaceHeading(page, 'Unsaved');
    await page.keyboard.press('ControlOrMeta+q');
    await expect(unsavedDialog(page)).toBeVisible();
    expect(await mockState(page, (mock) => mock.windowClosed)).toBe(false);
    await unsavedDialog(page).getByRole('button', { name: 'Cancel' }).click();
    expect(await mockState(page, (mock) => mock.windowClosed)).toBe(false);
  });

  test('Save writes the file, and then quits', async ({ page }) => {
    await openForEditing(page);
    await replaceHeading(page, 'Kept');
    await page.keyboard.press('ControlOrMeta+q');
    await queueSavePath(page, '/Users/test/Kept.pdf');
    await unsavedDialog(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => mockState(page, (mock) => mock.windowClosed)).toBe(true);
    expect(await savedText(page)).toContain('Kept');
  });

  test('a clean document quits straight away', async ({ page }) => {
    await openForEditing(page);
    await page.keyboard.press('ControlOrMeta+q');
    await expect.poll(() => mockState(page, (mock) => mock.windowClosed)).toBe(true);
  });
});

test.describe('saving from the unsaved changes prompt', () => {
  test('Open, then Save, goes on to open the next file', async ({ page }) => {
    await openForEditing(page);
    await replaceHeading(page, 'Saved first');
    await queueOpen(page, 'test-pdfs/06-rotated-pages.pdf', 'Other.pdf');
    await page.keyboard.press('ControlOrMeta+o');
    await queueSavePath(page, '/Users/test/Saved.pdf');
    await unsavedDialog(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expectOpenDocument(page, 4);
    expect(await savedText(page)).toContain('Saved first');
  });

  test('cancelling the save window stays on the document', async ({ page }) => {
    await openForEditing(page);
    await replaceHeading(page, 'Still here');
    await page.keyboard.press('ControlOrMeta+w');
    await unsavedDialog(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Still here')).toBeVisible();
    await expect(page.getByText('1 unsaved change')).toBeVisible();
  });
});

test.describe('the unsaved count', () => {
  test('an edit made during a save still counts as unsaved', async ({ page }) => {
    await openForEditing(page);
    await replaceHeading(page, 'In the file');
    await page.evaluate(() => {
      const mock = window.smorsyMock;
      if (!mock) throw new Error('The mock platform is not running.');
      mock.beforeWrite = () =>
        new Promise((resolve) => {
          (window as unknown as { finishWrite: () => void }).finishWrite = resolve;
        });
    });
    await queueSavePath(page, '/Users/test/During.pdf');
    await page.keyboard.press('ControlOrMeta+s');
    await page.waitForFunction(() => 'finishWrite' in window);

    await addText(page, 'After the save began');
    await page.evaluate(() => {
      (window as unknown as { finishWrite: () => void }).finishWrite();
    });
    await expect(page.getByText('Copy saved')).toBeVisible();
    await expect(page.getByText('1 unsaved change')).toBeVisible();
    const text = await savedText(page);
    expect(text).toContain('In the file');
    expect(text).not.toContain('After the save began');
  });

  test('undoing past a save counts as a change, and redoing clears it', async ({ page }) => {
    await openForEditing(page);
    await replaceHeading(page, 'Saved state');
    await saveTo(page);
    await expect(page.getByText('unsaved change')).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('1 unsaved change')).toBeVisible();
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(page.getByText('unsaved change')).toHaveCount(0);
  });
});

test.describe('undo with text still open', () => {
  test('finishes the text first, and redo brings it back', async ({ page }) => {
    await openForEditing(page);
    await replaceHeading(page, 'First edit');
    await block(page, 'This agreement renews').click();
    await field(page).fill('Second edit');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(editor(page)).toHaveCount(0);
    await expect(page.getByText('Second edit')).toHaveCount(0);
    await expect(page.getByText('First edit')).toBeVisible();
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(page.getByText('Second edit')).toBeVisible();
  });

  test('no notice appears for an edit that was already undone', async ({ page }) => {
    await openForEditing(page);
    await replaceHeading(page, 'Gone again');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByText('Gone again')).toHaveCount(0);
    await page.waitForTimeout(400);
    await expect(page.getByText('covered, not removed')).toHaveCount(0);
  });
});

test.describe('notes about an edit', () => {
  test('deleting explains that the old text is only covered', async ({ page }) => {
    await openForEditing(page);
    await block(page, HEADING).focus();
    await page.keyboard.press('Delete');
    await expect(page.getByText('covered, not removed')).toBeVisible();
  });

  test('warns before an edit flattens mixed styles', async ({ page }) => {
    await openSignedForEditing(page, 'test-pdfs/16-irs-form-w9.pdf', 6);
    await block(page, 'See Specific Instructions on page 3.').click();
    await expect(page.getByText('This text mixes styles')).toBeVisible();
  });

  test('says once per font when a same-widths font stands in', async ({ page }) => {
    await openSignedForEditing(page, 'test-pdfs/16-irs-form-w9.pdf', 6);
    await block(page, 'Print or type.').click();
    await page.getByRole('button', { name: 'Bold' }).click();
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.getByText('the same letter widths')).toBeVisible();
    await page.getByRole('button', { name: 'Got it' }).click();
    await page.getByRole('button', { name: 'Undo' }).click();
    await block(page, 'Print or type.').click();
    await page.getByRole('button', { name: 'Bold' }).click();
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.locator('.edit-box').first()).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page.getByText('the same letter widths')).toHaveCount(0);
  });
});

test.describe('characters no font can draw', () => {
  const JAPANESE = '日本語';

  test('are flagged straight away, and stop the save with a plain explanation', async ({
    page,
  }) => {
    await openForEditing(page);
    await addText(page, JAPANESE);
    await expect(
      page.getByRole('heading', { name: 'These characters can’t be saved' }),
    ).toBeVisible();

    await queueSavePath(page, '/Users/test/Blank.pdf');
    await page.getByRole('button', { name: 'Save a copy' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Your copy wasn’t saved' });
    await expect(dialog.getByText('日 本 語')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Save somewhere else' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Keep editing' }).click();
    expect(await lastWrite(page)).toBeNull();
  });

  test('can be changed from the card', async ({ page }) => {
    await openForEditing(page);
    await addText(page, JAPANESE);
    await page.locator('.font-card').getByRole('button', { name: 'Edit text' }).click();
    await field(page).fill('Latin instead');
    await page.keyboard.press('ControlOrMeta+Enter');
    await saveTo(page);
    expect(await savedText(page)).toContain('Latin instead');
  });
});

test.describe('when things fail', () => {
  test('a font that won’t load keeps the typed text, and says so', async ({ page }) => {
    await page.route('**/LiberationMono-Regular.ttf', (route) => route.abort());
    await openForEditing(page);
    await page
      .getByTestId('edit-layer')
      .first()
      .click({ position: { x: 96, y: 600 } });
    await field(page).fill('Precious words');
    await page.getByRole('combobox', { name: 'Font' }).selectOption('mono');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.getByRole('alert')).toContainText('Your text is still here');
    await expect(field(page)).toHaveValue('Precious words');
  });

  test('a font check that fails is shown, not hidden', async ({ page }) => {
    let requests = 0;
    await page.route('**/LiberationMono-Regular.ttf', (route) => {
      requests += 1;
      return requests === 1 ? route.continue() : route.abort();
    });
    await openForEditing(page);
    await page
      .getByTestId('edit-layer')
      .first()
      .click({ position: { x: 96, y: 600 } });
    await field(page).fill('Checked');
    await page.getByRole('combobox', { name: 'Font' }).selectOption('mono');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.getByRole('alert')).toContainText('couldn’t check the font');
  });

  test('a save worker that won’t start gives an error instead of hanging', async ({ page }) => {
    await page.route('**/save-worker*', (route) => route.abort());
    await openForEditing(page);
    await replaceHeading(page, 'Nowhere to go');
    await queueSavePath(page, '/Users/test/Dead.pdf');
    await page.getByRole('button', { name: 'Save a copy' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Your copy wasn’t saved' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep editing' }).click();

    // The second try can't wait on the worker either.
    await queueSavePath(page, '/Users/test/Dead.pdf');
    await page.getByRole('button', { name: 'Save a copy' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Your copy wasn’t saved' })).toBeVisible();
    expect(await lastWrite(page)).toBeNull();
  });

  test('a font missing at save time stops the save, and writes nothing', async ({ page }) => {
    await openForEditing(page);
    await addText(page, 'Needs its font');
    await page.route('**/fonts/**', (route) => route.abort());
    await queueSavePath(page, '/Users/test/NoFont.pdf');
    await page.getByRole('button', { name: 'Save a copy' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Your copy wasn’t saved' })).toBeVisible();
    expect(await lastWrite(page)).toBeNull();
  });
});

test.describe('keyboard', () => {
  test('the Add Text shortcut starts typing on the current page', async ({ page }) => {
    await openForEditing(page);
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await page.keyboard.press('ControlOrMeta+Shift+t');
    await expect(field(page)).toBeFocused();
    await page.keyboard.type('From the keyboard');
    await page.keyboard.press('ControlOrMeta+Enter');
    await saveTo(page);
    expect((await savedBlocks(page)).map((item) => item.text)).toContain('From the keyboard');
  });

  for (const [name, finish] of [
    ['Escape', 'Escape'],
    ['finishing', 'ControlOrMeta+Enter'],
  ] as const) {
    test(`${name} returns focus to the pages`, async ({ page }) => {
      await openForEditing(page);
      await block(page, HEADING).click();
      await field(page).fill('Changed');
      await page.keyboard.press(finish);
      await expect(editor(page)).toHaveCount(0);
      await expect(page.locator('main.canvas')).toBeFocused();
    });
  }

  test('Delete returns focus to the pages', async ({ page }) => {
    await openForEditing(page);
    await block(page, HEADING).focus();
    await page.keyboard.press('Delete');
    await expect(page.locator('main.canvas')).toBeFocused();
  });

  test('the size can be typed one digit at a time', async ({ page }) => {
    await openForEditing(page);
    await page
      .getByTestId('edit-layer')
      .first()
      .click({ position: { x: 96, y: 600 } });
    const size = page.getByRole('spinbutton', { name: 'Size in points' });
    await size.fill('');
    await size.pressSequentially('18');
    await expect(size).toHaveValue('18');
    await expect(field(page)).toHaveCSS('line-height', /./);
    await size.fill('2');
    await size.blur();
    await expect(size).toHaveValue('18');
  });
});

test.describe('a PDF protected against changes', () => {
  const PROTECTED = 'test-pdfs/20-owner-restricted.pdf';

  test('opens to read, with editing turned off and explained', async ({ page }) => {
    await openFixture(page, PROTECTED, 'Protected.pdf');
    await expect(page.getByText('This PDF is protected against changes')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit text', exact: true })).toBeDisabled();
    await page.keyboard.press('ControlOrMeta+Shift+t');
    await expect(editor(page)).toHaveCount(0);
  });

  test('can still be saved as an exact copy', async ({ page }) => {
    await openFixture(page, PROTECTED, 'Protected.pdf');
    await expect(page.getByText('This PDF is protected against changes')).toBeVisible();
    await queueSavePath(page, '/Users/test/Copy.pdf');
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.getByText('Copy saved')).toBeVisible();
    const write = await lastWrite(page);
    expect(Buffer.from(write?.bytes ?? []).equals(readFileSync(PROTECTED))).toBe(true);
  });
});
