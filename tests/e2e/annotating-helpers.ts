import { expect, type Page } from '@playwright/test';
import { pageElement, waitForRedraw } from './editing-helpers';
import { expectOpenDocument, expectPageDrawn, openFixture } from './helpers';

export const PLAIN = 'test-pdfs/01-plain-text.pdf';

export const bar = (page: Page) => page.getByRole('toolbar', { name: 'Annotation tools' });
export const tool = (page: Page, name: string) =>
  bar(page).getByRole('button', { name, exact: true });
export const annotate = (page: Page) =>
  page.getByRole('button', { name: 'Annotate', exact: true }).click();
export const panel = (page: Page) => page.getByRole('complementary', { name: 'Annotations' });
export const count = (page: Page) => panel(page).locator('.panel-head [role="status"]');
export const tabButton = (page: Page, name: string) =>
  panel(page).getByRole('group', { name: 'Kind of annotation' }).getByRole('button', { name });
export const scopeButton = (page: Page, name: string) =>
  panel(page).getByRole('group', { name: 'Show annotations from' }).getByRole('button', { name });
export const filters = (page: Page) =>
  panel(page).getByRole('group', { name: 'Show only this tag' });
export const rows = (page: Page) => panel(page).locator('.row');
export const tagInput = (page: Page) => panel(page).getByRole('textbox', { name: 'Add a tag' });

export async function open(page: Page, fixture = PLAIN, pageCount = 3) {
  await openFixture(page, fixture, 'Lease.pdf');
  await expectOpenDocument(page, pageCount);
  await expectPageDrawn(page);
  await annotate(page);
  await expect(bar(page)).toBeVisible();
  await waitForRedraw(page, 1);
}

export async function dragOnPage(
  page: Page,
  from: readonly [number, number],
  to: readonly [number, number],
  pageNumber = 1,
) {
  await pageElement(page, pageNumber).scrollIntoViewIfNeeded();
  const sheet = await pageElement(page, pageNumber).boundingBox();
  if (!sheet) throw new Error('The page isn’t on screen.');
  await page.mouse.move(sheet.x + from[0], sheet.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(sheet.x + to[0], sheet.y + to[1], { steps: 6 });
  await page.mouse.up();
}

export async function clickOnPage(page: Page, at: readonly [number, number], pageNumber = 1) {
  const sheet = await pageElement(page, pageNumber).boundingBox();
  if (!sheet) throw new Error('The page isn’t on screen.');
  await page.mouse.click(sheet.x + at[0], sheet.y + at[1]);
}

export const drawRectangle = async (page: Page, pageNumber = 1) => {
  await tool(page, 'Rectangle').click();
  await dragOnPage(page, [150, 400], [350, 520], pageNumber);
  await page.keyboard.press('Escape');
};

export const addComment = async (page: Page, words: string) => {
  await tool(page, 'Comment').click();
  await clickOnPage(page, [420, 300]);
  await page.keyboard.type(words);
  await clickOnPage(page, [40, 700]);
};

export const markFirstLine = async (page: Page) => {
  await tool(page, 'Underline').click();
  const line = pageElement(page, 1)
    .getByRole('button', { name: /^Mark line:/ })
    .first();
  await line.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
};
