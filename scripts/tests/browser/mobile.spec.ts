import type { Page } from '@playwright/test';
import { test, expect, selectLanguages, selectTypingOnly } from './practice-fixtures';

async function expectNoOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

for (const width of [375, 390]) {
  test.describe(`mobile ${width}px`, () => {
    test.use({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1,
      userAgent: 'Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' });
    test('homepage, menu, pickers, filter dialogs, practice keyboard and exit fit the viewport', async ({ page }) => {
      test.setTimeout(120_000);
      await page.clock.install({ time: new Date('2026-10-15T12:00:00Z') });
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: 'Learn Vocabulary Your Way' })).toBeVisible();
      await expectNoOverflow(page);
      const menu = page.getByRole('button', { name: 'Open navigation menu', exact: true });
      await menu.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Close navigation menu', exact: true })).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('link', { name: 'Custom Practice', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Close navigation menu', exact: true }).tap();
      await expect(menu).toHaveAttribute('aria-expanded', 'false');
      await page.getByRole('button', { name: 'Start Practicing', exact: true }).tap();
      await selectLanguages(page);
      await expectNoOverflow(page);
      await page.getByRole('button', { name: 'Customize Filters', exact: true }).tap();
      await page.getByRole('button', { name: 'Tap to filter practice topics', exact: true }).tap();
      const topics = page.getByRole('dialog', { name: 'Topics to Practice', exact: true });
      await expect(topics).toBeVisible();
      const astronomy = topics.getByRole('button', { name: 'Astronomy', exact: true });
      await astronomy.scrollIntoViewIfNeeded();
      await expect(astronomy).toBeInViewport();
      await expectNoOverflow(page);
      await topics.getByRole('button', { name: 'Close', exact: true }).tap();
      await expect(topics).toHaveCount(0);
      await page.getByRole('button', { name: 'Tap to filter grammar types', exact: true }).tap();
      const types = page.getByRole('dialog', { name: 'Word Types', exact: true });
      await expect(types).toBeVisible();
      await types.getByRole('button', { name: 'Noun', exact: true }).tap();
      await types.getByRole('button', { name: 'Clear', exact: true }).tap();
      await types.getByRole('button', { name: 'Apply', exact: true }).tap();
      await page.getByRole('button', { name: 'Apply Filters', exact: true }).tap();
      await selectTypingOnly(page);
      await expectNoOverflow(page);
      await page.getByRole('button', { name: 'Start Practicing', exact: true }).tap();
      await expect(page.getByRole('heading', { name: 'sobre', exact: true })).toBeVisible();
      await expectNoOverflow(page);
      const input = page.getByRole('textbox');
      await input.tap();
      await expect(input).toHaveAttribute('readonly', '');
      const keyboard = page.getByRole('group', { name: 'Mobile keyboard', exact: true });
      await expect(keyboard).toBeVisible();
      for (const key of ['a', 'b', 'o', 'u', 't']) await keyboard.getByRole('button', { name: key, exact: true }).tap();
      await expect(input).toHaveValue('about');
      const next = page.getByRole('button', { name: 'Next', exact: true });
      await next.scrollIntoViewIfNeeded();
      await expect(next).toBeInViewport();
      await expectNoOverflow(page);
      await next.tap();
      await expect(page.getByRole('heading', { name: 'encima de', exact: true })).toBeVisible();
      await expect(input).toHaveValue('');
      await page.getByRole('button', { name: 'Back to filters', exact: true }).tap();
      await expect(page).toHaveURL('http://127.0.0.1:4173/custom-practice');
    });
  });
}
