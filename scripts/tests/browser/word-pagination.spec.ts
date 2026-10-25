import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { buildWordPath } from '../../../src/data/seo/wordPages/wordSlugs';
import type { TargetLanguageSlug } from '../../../src/data/seo/shared/slugs';

// Word-page grid pagination is client-side: numbered buttons swap the
// "Browse More …" grid in place using the level's word-browse shard, record
// the page in a #browse-page-N fragment, and never link to /browse/page/N.
// The preview build is client-only (no SSR), so these specs cover the
// browser behaviour; server-rendered output is covered by the offline SSR
// tests.

const rootDir = fileURLToPath(new URL('../../../', import.meta.url));
const PAGE_SIZE = 54;
const TARGETS: TargetLanguageSlug[] = ['english', 'german', 'spanish', 'french', 'italian', 'portuguese', 'russian'];

interface ShardWord { conceptId: string; wordLemma: string }
function readShard(target: TargetLanguageSlug, level: string): ShardWord[] {
  const file = path.join(rootDir, 'src', 'data', 'seo', 'wordPages', 'word-browse-shards', `${target}-${level}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8')).words;
}
function expectedHrefs(target: TargetLanguageSlug, words: ShardWord[], pageIndex: number): string[] {
  return words
    .slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE)
    .map((word) => buildWordPath('en', target, word.wordLemma, word.conceptId));
}

const englishA1 = readShard('english', 'a1');
const aboutPath = buildWordPath('en', 'english', englishA1[0].wordLemma, englishA1[0].conceptId);

function browseSection(page: Page) {
  return page.locator('section', { has: page.getByRole('heading', { level: 2, name: /^Browse More A1 / }) });
}
async function gridHrefs(page: Page): Promise<string[]> {
  return browseSection(page)
    .locator('a')
    .evaluateAll((links) => links.map((link) => decodeURIComponent(new URL((link as HTMLAnchorElement).href).pathname)));
}
async function openWordPage(page: Page, urlPath: string) {
  await page.goto(urlPath);
  await expect(browseSection(page).locator('a').first()).toBeVisible();
}

test('grid pagination uses buttons, keeps the word visible, and never navigates to /browse/page/N', async ({ page }) => {
  await openWordPage(page, aboutPath);
  const heading = page.getByRole('heading', { level: 1 });
  const headingText = await heading.textContent();
  const nav = browseSection(page).getByRole('navigation', { name: 'Word list pages' });

  await expect(page.locator('a[href*="/browse/page/"]')).toHaveCount(0);
  await expect(nav.getByRole('button', { name: 'Page 1', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await gridHrefs(page)).toEqual(expectedHrefs('english', englishA1, 0));

  const requests: string[] = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  await nav.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);

  await nav.getByRole('button', { name: 'Page 3', exact: true }).click();
  await expect(nav.getByRole('button', { name: 'Page 3', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await gridHrefs(page)).toEqual(expectedHrefs('english', englishA1, 2));
  expect(new URL(page.url()).pathname).toBe(aboutPath);
  expect(new URL(page.url()).hash).toBe('#browse-page-3');
  await expect(heading).toHaveText(headingText ?? '');
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore)).toBeLessThan(2);
  await expect(browseSection(page).getByRole('status')).toHaveText('Page 3 of 18');

  // The level shard is fetched once, and never the full vocabulary.
  const shardRequests = requests.filter((p) => /\/assets\/english-a1-[\w-]+\.js$/.test(p));
  expect(shardRequests).toHaveLength(1);
  expect(requests.filter((p) => /vocabulary/i.test(p))).toEqual([]);
  await nav.getByRole('button', { name: 'Page 4', exact: true }).click();
  await expect(nav.getByRole('button', { name: 'Page 4', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(requests.filter((p) => /\/assets\/english-a1-[\w-]+\.js$/.test(p))).toHaveLength(1);
});

test('Back and Forward step through grid pages via the URL fragment', async ({ page }) => {
  await openWordPage(page, aboutPath);
  const nav = browseSection(page).getByRole('navigation', { name: 'Word list pages' });
  await nav.getByRole('button', { name: 'Page 2', exact: true }).click();
  await expect(nav.getByRole('button', { name: 'Page 2', exact: true })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('button', { name: 'Page 3', exact: true }).click();
  await expect(nav.getByRole('button', { name: 'Page 3', exact: true })).toHaveAttribute('aria-current', 'page');

  await page.goBack();
  await expect(nav.getByRole('button', { name: 'Page 2', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await gridHrefs(page)).toEqual(expectedHrefs('english', englishA1, 1));
  await page.goBack();
  await expect(nav.getByRole('button', { name: 'Page 1', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(new URL(page.url()).hash).toBe('');
  expect(await gridHrefs(page)).toEqual(expectedHrefs('english', englishA1, 0));
  await page.goForward();
  await expect(nav.getByRole('button', { name: 'Page 2', exact: true })).toHaveAttribute('aria-current', 'page');

  // A shared fragment URL opens straight on that grid page.
  await openWordPage(page, `${aboutPath}#browse-page-5`);
  await expect(nav.getByRole('button', { name: 'Page 5', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await gridHrefs(page)).toEqual(expectedHrefs('english', englishA1, 4));
});

test('keyboard activation keeps focus on the chosen page button', async ({ page }) => {
  await openWordPage(page, aboutPath);
  const nav = browseSection(page).getByRole('navigation', { name: 'Word list pages' });
  await nav.getByRole('button', { name: 'Page 2', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(nav.getByRole('button', { name: 'Page 2', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('button', { name: 'Page 2', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(nav.getByRole('button', { name: 'Page 3', exact: true })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(nav.getByRole('button', { name: 'Page 3', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('a legacy /browse/page/N URL still opens its grid page and then paginates client-side', async ({ page }) => {
  await openWordPage(page, `${aboutPath}/browse/page/7`);
  const nav = browseSection(page).getByRole('navigation', { name: 'Word list pages' });
  await expect(nav.getByRole('button', { name: 'Page 7', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await gridHrefs(page)).toEqual(expectedHrefs('english', englishA1, 6));

  await nav.getByRole('button', { name: 'Page 8', exact: true }).click();
  await expect(nav.getByRole('button', { name: 'Page 8', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await gridHrefs(page)).toEqual(expectedHrefs('english', englishA1, 7));
  expect(new URL(page.url()).pathname).toBe(`${aboutPath}/browse/page/7`);
  expect(new URL(page.url()).hash).toBe('#browse-page-8');

  // Returning to the route's own page clears the fragment.
  await nav.getByRole('button', { name: 'Page 7', exact: true }).click();
  await expect(nav.getByRole('button', { name: 'Page 7', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(new URL(page.url()).hash).toBe('');
});

for (const target of TARGETS) {
  test(`${target} A1: the final grid page shows the remaining words`, async ({ page }) => {
    const words = readShard(target, 'a1');
    const lastIndex = Math.ceil(words.length / PAGE_SIZE) - 1;
    await openWordPage(page, buildWordPath('en', target, words[0].wordLemma, words[0].conceptId));
    const nav = browseSection(page).getByRole('navigation', { name: 'Word list pages' });
    await nav.getByRole('button', { name: `Page ${lastIndex + 1}`, exact: true }).click();
    await expect(nav.getByRole('button', { name: `Page ${lastIndex + 1}`, exact: true })).toHaveAttribute('aria-current', 'page');
    const hrefs = await gridHrefs(page);
    expect(hrefs).toEqual(expectedHrefs(target, words, lastIndex));
    expect(hrefs.length).toBe(words.length - lastIndex * PAGE_SIZE);
  });
}

test('search results paginate separately and clearing search restores the browse page', async ({ page }) => {
  await openWordPage(page, aboutPath);
  const section = browseSection(page);
  const nav = section.getByRole('navigation', { name: 'Word list pages' });
  await nav.getByRole('button', { name: 'Page 3', exact: true }).click();
  await expect(nav.getByRole('button', { name: 'Page 3', exact: true })).toHaveAttribute('aria-current', 'page');

  const search = section.getByPlaceholder('Search A1 words...');
  await search.fill('e');
  const matches = englishA1.filter((word) => word.wordLemma.toLowerCase().includes('e'));
  expect(matches.length).toBeGreaterThan(PAGE_SIZE);
  await expect(nav.getByRole('button', { name: 'Page 1', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await gridHrefs(page)).toEqual(expectedHrefs('english', matches, 0));
  await nav.getByRole('button', { name: 'Page 2', exact: true }).click();
  expect(await gridHrefs(page)).toEqual(expectedHrefs('english', matches, 1));
  expect(new URL(page.url()).hash).toBe('#browse-page-3');

  await search.fill('');
  await expect(nav.getByRole('button', { name: 'Page 3', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await gridHrefs(page)).toEqual(expectedHrefs('english', englishA1, 2));
});

test('a failed shard load keeps the current grid, explains the failure, and can be retried', async ({ page }) => {
  let failShard = true;
  await page.route(/\/assets\/english-a1-[\w-]+\.js$/, (route) => (failShard ? route.abort('failed') : route.continue()));
  await openWordPage(page, aboutPath);
  const nav = browseSection(page).getByRole('navigation', { name: 'Word list pages' });

  await nav.getByRole('button', { name: 'Page 2', exact: true }).click();
  await expect(browseSection(page).getByRole('status')).toHaveText('Couldn’t load these words. Please try again.');
  await expect(nav.getByRole('button', { name: 'Page 1', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await gridHrefs(page)).toEqual(expectedHrefs('english', englishA1, 0));

  failShard = false;
  await nav.getByRole('button', { name: 'Page 2', exact: true }).click();
  await expect(nav.getByRole('button', { name: 'Page 2', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await gridHrefs(page)).toEqual(expectedHrefs('english', englishA1, 1));
});
