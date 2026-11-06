import type { Page } from '@playwright/test';
import { test, expect } from './practice-fixtures';
import { installMockBackend, seedMockSession } from './mock-backend';

// Direct load, refresh, in-app navigation, and signed-out access for the
// signed-in learning routes. The preview server is client-only (it answers
// every path with the SPA), so it cannot reproduce production's asset-first
// 410 for a route without a static shell; that is guarded by
// test:interactive-contracts (source) and test:prerendered-html-integrity
// (built dist/). This spec covers what the client does once HTML is served.

test.describe.configure({ timeout: 90_000 });

const learningRoutes = [
  { path: '/learning/new-words', title: 'Study New Words' },
  { path: '/learning/review', title: 'Review Words' },
] as const;

const viewports = [
  { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
  { name: 'mobile 390px', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
] as const;

const learningHeading = (page: Page, title: string) => page.getByRole('heading', { level: 1, name: title, exact: true });

for (const viewport of viewports) {
  test.describe(viewport.name, () => {
    test.use(viewport.use);

    for (const { path, title } of learningRoutes) {
      test(`signed in: ${path} opens directly and survives a refresh`, async ({ page, mockApi }) => {
        installMockBackend(mockApi);
        await seedMockSession(page);
        await page.goto(path);
        await expect(learningHeading(page, title)).toBeVisible();
        await page.reload();
        await expect(page).toHaveURL(`http://127.0.0.1:4173${path}`);
        await expect(learningHeading(page, title)).toBeVisible();
      });

      test(`signed out: ${path} redirects to Custom Practice without showing the learning page`, async ({ page }) => {
        await page.goto(path);
        await expect(page).toHaveURL('http://127.0.0.1:4173/custom-practice');
        await expect(page.getByRole('region', { name: 'Choose Your Languages', exact: true })).toBeVisible();
        await expect(learningHeading(page, title)).toHaveCount(0);
      });
    }

    test('signed in: in-app navigation from the Learning section, refresh, and Back', async ({ page, mockApi }) => {
      installMockBackend(mockApi);
      await seedMockSession(page);
      await page.goto('/profile?section=learning');
      await page.getByRole('button', { name: 'Start Review', exact: true }).click();
      await expect(page).toHaveURL('http://127.0.0.1:4173/learning/review');
      await expect(learningHeading(page, 'Review Words')).toBeVisible();
      await page.reload();
      await expect(learningHeading(page, 'Review Words')).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL('http://127.0.0.1:4173/profile?section=learning');
      await page.getByRole('button', { name: 'Start Learning', exact: true }).click();
      await expect(page).toHaveURL('http://127.0.0.1:4173/learning/new-words');
      await expect(learningHeading(page, 'Study New Words')).toBeVisible();
    });
  });
}
