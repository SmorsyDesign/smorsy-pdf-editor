import { expect, test, type Locator, type Page } from '@playwright/test';
import { pageElement, paintIn, reopenSaved, saveTo, waitForRedraw } from './editing-helpers';
import { expectOpenDocument, expectPageDrawn, openFixture } from './helpers';

const FORM = 'test-pdfs/08-fillable-form.pdf';

const panel = (page: Page) => page.getByRole('complementary', { name: 'Form progress' });
const noPanelMode = (page: Page) =>
  page.getByRole('button', { name: 'Edit text', exact: true }).click();

async function openForm(page: Page) {
  await openFixture(page, FORM, 'Form.pdf');
  await expectOpenDocument(page, 1);
  await expectPageDrawn(page);
  await expect(panel(page)).toBeVisible();
}

/** A field's place as a share of the page, which holds whatever size the page is drawn at. */
async function shareOfPage(page: Page, field: Locator) {
  const box = await field.boundingBox();
  const sheet = await pageElement(page, 1).boundingBox();
  if (!box || !sheet) throw new Error('Not on screen.');
  return {
    x: (box.x - sheet.x) / sheet.width,
    y: (box.y - sheet.y) / sheet.height,
    width: box.width / sheet.width,
    height: box.height / sheet.height,
  };
}

async function paintAt(page: Page, share: Awaited<ReturnType<typeof shareOfPage>>) {
  const sheet = await pageElement(page, 1).boundingBox();
  if (!sheet) throw new Error('Not on screen.');
  return paintIn(page, 1, {
    x: share.x * sheet.width,
    y: share.y * sheet.height,
    width: share.width * sheet.width,
    height: share.height * sheet.height,
  });
}

/** Fills in everything on the form, and says how much was painted in each field beforehand. */
async function fillAll(page: Page) {
  const fields = {
    text: page.getByRole('textbox', { name: 'Student name' }),
    dropdown: page.getByRole('combobox', { name: 'Student grade' }),
    radio: page.getByRole('radio').first(),
    checkbox: page.getByRole('checkbox', { name: 'Permission' }),
  };
  const places = {
    text: await shareOfPage(page, fields.text),
    dropdown: await shareOfPage(page, fields.dropdown),
    radio: await shareOfPage(page, fields.radio),
    checkbox: await shareOfPage(page, fields.checkbox),
  };
  await noPanelMode(page);
  await waitForRedraw(page, 1);
  const before = {
    text: (await paintAt(page, places.text)).dark,
    dropdown: (await paintAt(page, places.dropdown)).dark,
    radio: (await paintAt(page, places.radio)).dark,
    checkbox: (await paintAt(page, places.checkbox)).dark,
  };
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await fields.text.fill('Theo Okafor');
  await fields.dropdown.selectOption('3');
  await fields.radio.check();
  await fields.checkbox.check();
  return { places, before };
}

test.describe('answers reach the saved page', () => {
  test('drawn in their own fields', async ({ page }) => {
    await openForm(page);
    const { places, before } = await fillAll(page);
    await saveTo(page);
    await reopenSaved(page, 1);
    await noPanelMode(page);
    await waitForRedraw(page, 1);
    for (const kind of ['text', 'dropdown', 'radio', 'checkbox'] as const) {
      const after = (await paintAt(page, places[kind])).dark;
      expect(after, kind).toBeGreaterThan(before[kind]);
    }
  });

  test('drawn in the same places when locked', async ({ page }) => {
    await openForm(page);
    const { places, before } = await fillAll(page);
    await panel(page)
      .getByRole('checkbox', { name: /Lock answers/ })
      .check();
    await saveTo(page);
    await reopenSaved(page, 1);
    await expect(panel(page)).toHaveCount(0);
    await waitForRedraw(page, 1);
    for (const kind of ['text', 'dropdown', 'radio', 'checkbox'] as const) {
      const after = (await paintAt(page, places[kind])).dark;
      expect(after, kind).toBeGreaterThan(before[kind]);
    }
  });
});

test.describe('locking is a change like any other', () => {
  test('it can be undone, and closing first asks to save it', async ({ page }) => {
    await openForm(page);
    const lock = panel(page).getByRole('checkbox', { name: /Lock answers/ });
    await lock.check();
    await expect(page.getByText('1 unsaved change')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(lock).not.toBeChecked();
    await lock.check();
    await page.keyboard.press('ControlOrMeta+w');
    await expect(
      page.getByRole('alertdialog', { name: 'Save your changes to Form.pdf?' }),
    ).toBeVisible();
  });
});

test.describe('fixtures with a signature line', () => {
  test('an unanswered list doesn’t look answered', async ({ page }) => {
    await openForm(page);
    const dropdown = page.getByRole('combobox', { name: 'Student grade' });
    await expect(dropdown).toHaveValue('');
  });
});
