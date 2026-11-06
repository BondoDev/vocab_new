import { test, expect } from './fixtures';
import { installMockBackend, seedMockSession } from './mock-backend';

test.describe.configure({ timeout: 60_000 });

// The shared Toast mounts its live region only after hydration (see
// src/app/components/Toast.tsx). This guards the client-side half: pages
// reached by in-app navigation still get exactly one working toast, and the
// previous page's region is removed rather than left behind.
test('add-to-list toast works after client-side navigation between list pages', async ({ page, mockApi }) => {
  const backend = installMockBackend(mockApi);
  await seedMockSession(page);
  const toast = page.locator('body > div[role="status"]');

  await page.goto('/en/learning-resources');
  await page.locator('a[href="/en/100-essential-english-nouns"]').first().click();
  await expect(page).toHaveURL(/\/en\/100-essential-english-nouns$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(toast).toHaveCount(1);
  await expect(toast).toHaveText('');

  const addToList = async () => {
    await page.getByRole('button', { name: /^Add .+ to My List$/ }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('option', { name: /Alpha/ }).click();
    await expect(toast).toHaveText('Added to "Alpha"');
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  };

  await addToList();
  // useAutoDismissMessage's default 3 s duration.
  await expect(toast).toHaveText('', { timeout: 6_000 });
  expect(backend.memberships).toHaveLength(1);

  // Another page that owns a Toast, then back: each mount replaces the region.
  await page.locator('a[href="/en/english-vocabulary-list"]').first().click();
  await expect(page).toHaveURL(/\/en\/english-vocabulary-list$/);
  await expect(toast).toHaveCount(1);
  await page.goBack();
  await expect(page).toHaveURL(/\/en\/100-essential-english-nouns$/);
  await expect(toast).toHaveCount(1);

  // The word added above is already in Alpha, so this toggle removes it.
  await page.getByRole('button', { name: /^Add .+ to My List$/ }).first().click();
  await page.getByRole('dialog').getByRole('option', { name: /Alpha/ }).click();
  await expect(toast).toHaveText('Removed from "Alpha"');
  expect(backend.memberships).toHaveLength(0);
});
