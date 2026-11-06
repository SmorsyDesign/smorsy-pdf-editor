import { readFileSync } from 'node:fs';
import { PDFDocument } from '@cantoo/pdf-lib';
import { expect, test, type Page } from '@playwright/test';
import { openDocument } from '../../src/engine/document';
import { lastWrite, queueSavePath, saveTo } from './editing-helpers';
import { expectOpenDocument, expectPageDrawn, openFixture } from './helpers';

const FORM = 'test-pdfs/08-fillable-form.pdf';

const panel = (page: Page) => page.getByRole('complementary', { name: 'Form progress' });
const name = (page: Page) => page.getByRole('textbox', { name: 'Student name' });

async function openForm(page: Page, fixture = FORM) {
  await openFixture(page, fixture, 'Form.pdf');
  await expectOpenDocument(page, 1);
  await expectPageDrawn(page);
  await expect(panel(page)).toBeVisible();
}

const savedForm = async (page: Page) => {
  const write = await lastWrite(page);
  return (await PDFDocument.load(Uint8Array.from(write?.bytes ?? []))).getForm();
};

test.describe('the form panel', () => {
  test('appears for a PDF with a form, not for one without', async ({ page }) => {
    await openForm(page);
    await expect(panel(page)).toContainText('0 of 4 fields filled');
    await openFixture(page, 'test-pdfs/01-plain-text.pdf', 'Plain.pdf');
    await expectOpenDocument(page, 3);
    await expect(panel(page)).toHaveCount(0);
  });

  test('counts answers as they’re given', async ({ page }) => {
    await openForm(page);
    await name(page).fill('Theo');
    await expect(panel(page)).toContainText('1 of 4 fields filled');
    await name(page).fill('');
    await expect(panel(page)).toContainText('0 of 4 fields filled');
  });

  test('counts a radio group as one question', async ({ page }) => {
    await openForm(page);
    await page.getByRole('radio').first().check();
    await expect(panel(page)).toContainText('1 of 4 fields filled');
  });

  test('jumps to a field that’s still needed', async ({ page }) => {
    await openForm(page);
    await panel(page).getByRole('button', { name: 'Student grade' }).click();
    await expect(page.getByRole('combobox', { name: 'Student grade' })).toBeFocused();
  });

  test('drops a field from the list once it’s answered', async ({ page }) => {
    await openForm(page);
    await name(page).fill('Theo');
    await expect(panel(page).getByRole('button', { name: 'Student name' })).toHaveCount(0);
  });

  test('stays out of other modes', async ({ page }) => {
    await openForm(page);
    await page.getByRole('button', { name: 'Edit text', exact: true }).click();
    await expect(panel(page)).toHaveCount(0);
  });
});

test.describe('answers', () => {
  test('every kind reaches the saved file', async ({ page }) => {
    await openForm(page);
    await name(page).fill('Theo Okafor');
    await page.getByRole('combobox', { name: 'Student grade' }).selectOption('3');
    await page.getByRole('radio').nth(1).check();
    await page.getByRole('checkbox', { name: 'Permission' }).check();
    await saveTo(page);
    const form = await savedForm(page);
    expect(form.getTextField('student.name').getText()).toBe('Theo Okafor');
    expect(form.getDropdown('student.grade').getSelected()).toEqual(['3']);
    expect(form.getRadioGroup('health.allergies').getSelected()).toBe('yes');
    expect(form.getCheckBox('permission').isChecked()).toBe(true);
  });

  test('show when the saved file is opened again', async ({ page }) => {
    await openForm(page);
    await name(page).fill('Theo Okafor');
    await saveTo(page);
    const doc = await openDocument(Uint8Array.from((await lastWrite(page))?.bytes ?? []));
    const fields = await doc.formFields();
    await doc.close();
    expect(fields.find((field) => field.name === 'student.name')?.value).toBe('Theo Okafor');
  });

  test('a run of typing is one undo', async ({ page }) => {
    await openForm(page);
    await name(page).click();
    await page.keyboard.type('Theo');
    await expect(page.getByText('1 unsaved change')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(name(page)).toHaveValue('');
  });

  test('a second visit to a field is its own undo', async ({ page }) => {
    await openForm(page);
    await name(page).fill('Theo');
    await page.getByRole('combobox', { name: 'Student grade' }).focus();
    await name(page).click();
    await page.keyboard.type(' Okafor');
    await expect(page.getByText('2 unsaved changes')).toBeVisible();
  });

  test('Tab moves on to the next field', async ({ page }) => {
    await openForm(page);
    await name(page).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('combobox', { name: 'Student grade' })).toBeFocused();
  });

  test('leaving unsaved answers asks first', async ({ page }) => {
    await openForm(page);
    await name(page).fill('Theo');
    await page.keyboard.press('ControlOrMeta+w');
    await expect(
      page.getByRole('alertdialog', { name: 'Save your changes to Form.pdf?' }),
    ).toBeVisible();
  });

  test('characters no font has stop the save, rather than leaving a blank', async ({ page }) => {
    await openForm(page);
    await name(page).fill('日本語');
    await queueSavePath(page, '/Users/test/Blank.pdf');
    await page.keyboard.press('ControlOrMeta+s');
    const dialog = page.getByRole('alertdialog', { name: 'Your copy wasn’t saved' });
    await expect(dialog).toContainText('日 本 語');
    expect(await lastWrite(page)).toBeNull();
  });

  test('stay visible in other modes, but can’t be changed there', async ({ page }) => {
    await openForm(page);
    await name(page).fill('Theo');
    await page.getByRole('button', { name: 'Annotate', exact: true }).click();
    await expect(name(page)).toHaveValue('Theo');
    await expect(name(page)).toBeDisabled();
  });

  test('an unchanged form saves as an exact copy', async ({ page }) => {
    await openForm(page);
    await saveTo(page);
    const saved = Uint8Array.from((await lastWrite(page))?.bytes ?? []);
    expect(Buffer.compare(saved, readFileSync(FORM))).toBe(0);
  });
});

test.describe('locking answers', () => {
  test('makes them part of the page, leaving nothing to fill', async ({ page }) => {
    await openForm(page);
    await name(page).fill('Theo Okafor');
    await panel(page)
      .getByRole('checkbox', { name: /Lock answers/ })
      .check();
    await saveTo(page);
    const form = await savedForm(page);
    expect(form.getFields()).toHaveLength(0);
    const doc = await openDocument(Uint8Array.from((await lastWrite(page))?.bytes ?? []));
    const { blocks } = await doc.pageText(1);
    await doc.close();
    expect(blocks.map((block) => block.text).join(' ')).toContain('Theo Okafor');
  });

  test('works even with nothing else changed', async ({ page }) => {
    await openForm(page);
    await panel(page)
      .getByRole('checkbox', { name: /Lock answers/ })
      .check();
    await saveTo(page);
    expect((await savedForm(page)).getFields()).toHaveLength(0);
  });
});

test.describe('forms that need care', () => {
  test('a signed form opens to read, and fills once that’s been accepted', async ({ page }) => {
    await openFixture(page, 'test-pdfs/16-irs-form-w9.pdf', 'W9.pdf');
    await expectOpenDocument(page, 6);
    await expect(panel(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit anyway' }).click();
    await page
      .getByRole('alertdialog', { name: 'Editing will break the signature' })
      .getByRole('button', { name: 'Edit anyway' })
      .click();
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await expect(panel(page)).toBeVisible();
    const field = page.locator('input.form-field[type="text"]').first();
    await field.fill('Theo Okafor');
    await saveTo(page);
    const doc = await openDocument(Uint8Array.from((await lastWrite(page))?.bytes ?? []));
    const fields = await doc.formFields();
    await doc.close();
    expect(fields.some((saved) => saved.value === 'Theo Okafor')).toBe(true);
  });

  test('a line break in a multi-line answer doesn’t stop the save', async ({ page }) => {
    await openFixture(page, 'test-pdfs/16-irs-form-w9.pdf', 'W9.pdf');
    await expectOpenDocument(page, 6);
    await page.getByRole('button', { name: 'Edit anyway' }).click();
    await page
      .getByRole('alertdialog', { name: 'Editing will break the signature' })
      .getByRole('button', { name: 'Edit anyway' })
      .click();
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    const field = page.locator('textarea.form-field').first();
    await field.fill('First line\nSecond line');
    await saveTo(page);
    await expect(page.getByText('Copy saved')).toBeVisible();
  });

  test('a protected PDF doesn’t offer filling', async ({ page }) => {
    await openFixture(page, 'test-pdfs/20-owner-restricted.pdf', 'Protected.pdf');
    await expect(page.getByText('This PDF is protected against changes')).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
  });
});
