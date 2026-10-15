import { test, expect } from './practice-fixtures';
import { installMockBackend, seedMockSession } from './mock-backend';

test.describe.configure({ timeout: 120_000 });
test.use({ actionTimeout: 15_000 });

test('mocked My Lists CRUD, membership, search/sort, and detail-only practice with return', async ({ page, mockApi }) => {
  const backend = installMockBackend(mockApi);
  await seedMockSession(page);
  await page.goto('/profile?section=myLists');
  const section = page.getByRole('region', { name: 'My Lists section', exact: true });
  await expect(section.getByRole('heading', { name: 'My Lists', exact: true })).toBeVisible();
  await expect(section.getByRole('button', { name: 'Practice List', exact: true })).toHaveCount(0);
  await section.getByRole('button', { name: 'Create List', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Create List', exact: true });
  await create.getByRole('textbox', { name: 'List name', exact: true }).fill('Study');
  await create.getByRole('button', { name: 'Create List', exact: true }).click();
  await expect(create).toHaveCount(0);
  const search = section.getByRole('searchbox', { name: 'Search lists', exact: true });
  await search.fill('Study');
  await expect(section.getByRole('article')).toHaveCount(1);
  await search.fill('');
  await section.getByRole('button', { name: 'Sort', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Name A–Z', exact: true }).click();
  await expect(section.getByRole('article').getByRole('heading')).toHaveText(['Alpha', 'Study', 'Zulu']);
  await section.getByRole('button', { name: 'Sort', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Name Z–A', exact: true }).click();
  await expect(section.getByRole('article').getByRole('heading')).toHaveText(['Zulu', 'Study', 'Alpha']);
  await section.getByRole('button', { name: 'Study', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  const rename = page.getByRole('dialog', { name: 'Rename List', exact: true });
  await rename.getByRole('textbox', { name: 'List name', exact: true }).fill('Study Words');
  await rename.getByRole('button', { name: 'Save', exact: true }).click();
  const card = section.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Study Words', exact: true }) });
  await card.getByRole('button', { name: 'View List', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Study Words', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Practice List', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add Words', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Add Words', exact: true });
  // Lemmas can repeat across concepts; include translation and CEFR to choose
  // the intended A1 memberships rather than whichever homograph renders first.
  // These members are not the default session's first words, so the practice
  // assertion below also detects a lost membership restriction.
  for (const [word, meaning] of [['apple', 'manzana'], ['banana', 'plátano']]) {
    await picker.getByRole('searchbox', { name: 'Search words', exact: true }).fill(word);
    await picker.getByRole('checkbox', { name: `${word} ${meaning} A1 Not studied`, exact: true }).check();
  }
  await picker.getByRole('button', { name: 'Add 2 Words', exact: true }).click();
  await expect(picker).toHaveCount(0);
  expect(backend.memberships.map((row) => row.word_id).sort()).toEqual(['A1-00039', 'A1-00063']);
  const wordsSearch = page.getByRole('searchbox', { name: 'Search words', exact: true });
  await wordsSearch.fill('banana');
  await expect(page.getByRole('cell', { name: 'banana', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'apple', exact: true })).toHaveCount(0);
  await wordsSearch.fill('');
  await page.getByRole('button', { name: 'Back to My Lists', exact: true }).click();
  await expect(card).toContainText('2 words');
  await expect(section.getByRole('button', { name: 'Practice List', exact: true })).toHaveCount(0);
  await card.getByRole('button', { name: 'View List', exact: true }).click();
  await page.getByRole('button', { name: 'Practice List', exact: true }).click();
  const setup = page.getByRole('dialog', { name: 'Practice "Study Words"', exact: true });
  await setup.getByRole('button', { name: 'List order', exact: true }).click();
  await expect(setup.getByRole('button', { name: 'List order', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(setup.getByRole('button', { name: 'All 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  for (const name of ['Half-written word completion', 'Broken word assembling', 'Connect words', 'Listening']) await setup.getByRole('checkbox', { name, exact: true }).uncheck();
  await expect(setup.getByRole('checkbox', { name: 'Word typing', exact: true })).toBeDisabled();
  await setup.getByRole('button', { name: 'Start Practice', exact: true }).click();
  await expect(page.getByRole('textbox')).toBeVisible();
  await expect(page.getByRole('heading', { name: /^(manzana|plátano)$/ })).toBeVisible();
  await expect(page).toHaveURL(/practice.*source=vocabulary-list/);
  await page.getByRole('button', { name: 'Back to filters', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Study Words', exact: true })).toBeVisible();
  for (const word of ['apple', 'banana']) {
    await page.getByRole('button', { name: `More actions - ${word}`, exact: true }).click();
    await page.getByRole('menuitem', { name: 'Remove from list', exact: true }).click();
    await expect(page.getByRole('cell', { name: word, exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole('heading', { name: 'No words in this list yet.', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Practice List', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to My Lists', exact: true }).click();
  await section.getByRole('button', { name: 'Study Words', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await page.getByRole('alertdialog', { name: 'Delete list?', exact: true }).getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(section.getByRole('heading', { name: 'Study Words', exact: true })).toHaveCount(0);
  expect(backend.memberships).toHaveLength(0);
  expect(backend.lists.map((list) => list.name).sort()).toEqual(['Alpha', 'Zulu']);
  expect(mockApi.requests.filter((request) => request === 'POST /rest/v1/rpc/add_words_to_vocabulary_list')).toHaveLength(1);
  expect(mockApi.requests.filter((request) => request === 'POST /rest/v1/rpc/remove_word_from_vocabulary_list')).toHaveLength(2);
});
