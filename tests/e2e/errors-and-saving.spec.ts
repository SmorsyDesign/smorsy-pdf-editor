import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import {
  expectOpenDocument,
  gotoApp,
  mockState,
  openFixture,
  ORIGINAL_PATH,
  queueOpen,
} from './helpers';

const FIXTURE = 'test-pdfs/01-plain-text.pdf';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

const queueSavePath = (page: Page, path: string) =>
  page.evaluate((chosen) => {
    if (window.smorsyMock) window.smorsyMock.nextSavePath = chosen;
  }, path);

const queueWriteFailure = (page: Page, kind: 'no-space' | 'read-only') =>
  page.evaluate((failure) => {
    if (window.smorsyMock) window.smorsyMock.nextWriteFailure = failure;
  }, kind);

const lastWrite = (page: Page) =>
  page.evaluate(() => {
    const write = window.smorsyMock?.lastWrite;
    return write ? { path: write.path, bytes: Array.from(write.bytes) } : null;
  });

test.describe('files that can’t open say why', () => {
  for (const [file, heading, text] of [
    ['tests/fixtures/not-a-pdf.pdf', 'Bad.pdf can’t be opened', 'it isn’t a PDF'],
    ['tests/fixtures/empty.pdf', 'Bad.pdf can’t be opened', 'The file is empty'],
    ['tests/fixtures/truncated.pdf', 'Bad.pdf can’t be opened', 'damaged or incomplete'],
    ['test-pdfs/10-password-protected.pdf', 'Bad.pdf can’t be opened', 'protected with a password'],
  ] as const) {
    test(file, async ({ page }) => {
      await openFixture(page, file, 'Bad.pdf');
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await expect(page.getByText(text)).toBeVisible();
      await expect(page.getByText('This file hasn’t left your computer')).toBeVisible();
      expect(await mockState(page, (mock) => mock.documentOpen)).toBe(false);
    });
  }

  test('a file the computer can’t read', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => {
      if (window.smorsyMock) window.smorsyMock.nextOpen = 'read-failure';
    });
    await page.getByRole('button', { name: 'Choose a file' }).click();
    await expect(page.getByText('could not be read from your computer')).toBeVisible();
  });

  test('you can recover by choosing another file', async ({ page }) => {
    await openFixture(page, 'tests/fixtures/not-a-pdf.pdf', 'Bad.pdf');
    await queueOpen(page, FIXTURE, 'Good.pdf');
    await page.getByRole('button', { name: 'Choose another file' }).click();
    await expectOpenDocument(page, 3);
    await expect(page.getByText('Good.pdf')).toBeVisible();
  });
});

test('a bad file leaves the open document where it was', async ({ page }) => {
  await openFixture(page, FIXTURE, 'Good.pdf');
  await expectOpenDocument(page, 3);
  await queueOpen(page, 'tests/fixtures/not-a-pdf.pdf', 'Bad.pdf');
  await page.keyboard.press('ControlOrMeta+o');
  const dialog = page.getByRole('alertdialog', { name: 'Bad.pdf can’t be opened' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep current file' }).click();
  await expect(page.getByText('Good.pdf')).toBeVisible();
  await expectOpenDocument(page, 3);
});

test.describe('saving', () => {
  test.beforeEach(async ({ page }) => {
    await openFixture(page, FIXTURE, 'Lease.pdf');
    await expectOpenDocument(page, 3);
  });

  test('an unedited copy is byte-identical to the original', async ({ page }) => {
    await queueSavePath(page, '/Users/test/Documents/Lease-edited.pdf');
    await page.getByRole('button', { name: 'Save a copy' }).click();
    await expect(page.getByText('Copy saved')).toBeVisible();
    const write = await lastWrite(page);
    expect(write?.path).toBe('/Users/test/Documents/Lease-edited.pdf');
    expect(sha256(Uint8Array.from(write?.bytes ?? []))).toBe(sha256(readFileSync(FIXTURE)));
  });

  test('cancelling the save dialog writes nothing', async ({ page }) => {
    await page.getByRole('button', { name: 'Save a copy' }).click();
    await expect(page.getByText('Your original file stays unchanged')).toBeVisible();
    expect(await lastWrite(page)).toBeNull();
  });

  test('file names with spaces and non-English characters are kept exactly', async ({ page }) => {
    const path = '/Users/test/Документи/Résumé final (2).pdf';
    await queueSavePath(page, path);
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.getByText('Copy saved')).toBeVisible();
    expect((await lastWrite(page))?.path).toBe(path);
  });

  test('saving over the original needs explicit confirmation', async ({ page }) => {
    await queueSavePath(page, ORIGINAL_PATH);
    await page.getByRole('button', { name: 'Save a copy' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Replace your original file?' });
    await expect(dialog).toBeVisible();
    expect(await lastWrite(page)).toBeNull();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    expect(await lastWrite(page)).toBeNull();

    await queueSavePath(page, ORIGINAL_PATH);
    await page.getByRole('button', { name: 'Save a copy' }).click();
    await dialog.getByRole('button', { name: 'Replace original' }).click();
    await expect(page.getByText('Original file updated')).toBeVisible();
    expect((await lastWrite(page))?.path).toBe(ORIGINAL_PATH);
  });

  test('the menu can’t change which file an open confirmation is about', async ({ page }) => {
    await queueSavePath(page, ORIGINAL_PATH);
    await page.getByRole('button', { name: 'Save a copy' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Replace your original file?' });
    await expect(dialog).toContainText('Lease.pdf');

    // Native menus stay live behind a dialog, which these shortcuts stand in for.
    await queueOpen(page, 'test-pdfs/06-rotated-pages.pdf', 'Other.pdf');
    await page.keyboard.press('ControlOrMeta+o');
    await page.keyboard.press('ControlOrMeta+w');
    await expect(dialog).toContainText('Lease.pdf');

    await dialog.getByRole('button', { name: 'Replace original' }).click();
    await expect(page.getByText('Original file updated')).toBeVisible();
    const write = await lastWrite(page);
    expect(sha256(Uint8Array.from(write?.bytes ?? []))).toBe(sha256(readFileSync(FIXTURE)));
    await expectOpenDocument(page, 3);
  });

  test('the confirmation starts on Cancel, and Esc cancels', async ({ page }) => {
    await queueSavePath(page, ORIGINAL_PATH);
    await page.getByRole('button', { name: 'Save a copy' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(await lastWrite(page)).toBeNull();
  });

  test('Tab stays inside an open dialog', async ({ page }) => {
    await queueSavePath(page, ORIGINAL_PATH);
    await page.getByRole('button', { name: 'Save a copy' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Replace original' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  });

  test('a failed save explains itself and offers another location', async ({ page }) => {
    await queueSavePath(page, '/Volumes/BACKUP/Lease-edited.pdf');
    await queueWriteFailure(page, 'no-space');
    await page.getByRole('button', { name: 'Save a copy' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Your copy wasn’t saved' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('The disk is full')).toBeVisible();
    await expect(dialog.getByText('Your original file is unchanged')).toBeVisible();

    await queueSavePath(page, '/Users/test/Lease-edited.pdf');
    await dialog.getByRole('button', { name: 'Save somewhere else' }).click();
    await expect(page.getByText('Copy saved')).toBeVisible();
    expect((await lastWrite(page))?.path).toBe('/Users/test/Lease-edited.pdf');
  });

  test('a read-only location gets its own explanation', async ({ page }) => {
    await queueSavePath(page, '/Volumes/CD/Lease-edited.pdf');
    await queueWriteFailure(page, 'read-only');
    await page.getByRole('button', { name: 'Save a copy' }).click();
    await expect(page.getByText('You don’t have permission to save there')).toBeVisible();
  });
});
