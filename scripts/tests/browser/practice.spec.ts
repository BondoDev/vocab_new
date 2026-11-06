import { test, expect, openPracticeSetup, selectLanguages, selectTypingOnly, languageRegion, exerciseRegion } from './practice-fixtures';

test.describe.configure({ timeout: 90_000 });

test('language changes, duplicate guard, reversal, and navigation retain selections', async ({ page }) => {
  await openPracticeSetup(page);
  await expect(page.getByRole('button', { name: 'Start Practicing', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'More detailed filters', exact: true })).toBeDisabled();
  await selectLanguages(page);
  const languages = languageRegion(page);
  await languages.getByRole('button', { name: 'Spanish', exact: true }).click();
  await expect(languages.getByRole('button', { name: /English.*Already selected/i })).toBeDisabled();
  await languages.getByRole('button', { name: 'German', exact: true }).click();
  await languages.getByRole('button', { name: 'English', exact: true }).click();
  await languages.getByRole('button', { name: 'French', exact: true }).click();
  await expect(languages.getByRole('button', { name: 'German', exact: true })).toBeVisible();
  await expect(languages.getByRole('button', { name: 'French', exact: true })).toBeVisible();
  await languages.getByRole('button', { name: 'Reverse languages', exact: true }).click();
  await expect.poll(() => page.evaluate(() => [localStorage.getItem('app.yourLanguage'), localStorage.getItem('app.practiceLanguage')])).toEqual(['fr', 'de']);
  await page.getByRole('button', { name: 'More detailed filters', exact: true }).click();
  await expect(page).toHaveURL(/\/languages\/filters/);
  await page.getByRole('button', { name: 'Back to Custom Practice', exact: true }).click();
  await expect(languages.getByRole('button', { name: 'French', exact: true })).toBeVisible();
  await expect(languages.getByRole('button', { name: 'German', exact: true })).toBeVisible();
  await page.reload();
  await expect(languages.getByRole('button', { name: 'French', exact: true })).toBeVisible();
  await expect(languages.getByRole('button', { name: 'German', exact: true })).toBeVisible();
});

test('filters and exercise guards configure a real filtered session and preserve setup on exit', async ({ page }) => {
  await openPracticeSetup(page);
  await selectLanguages(page);
  const exercises = exerciseRegion(page);
  await expect(exercises.getByRole('button', { pressed: true })).toHaveCount(5);
  for (const name of ['Word typing', 'Half-written word completion', 'Broken word assembling', 'Connect words', 'Listening']) {
    await expect(exercises.getByRole('button', { name: new RegExp(name) })).toBeVisible();
  }
  await selectTypingOnly(page);
  const typing = exercises.getByRole('button', { name: /Word typing/ });
  await expect(typing).toBeDisabled();
  await expect(typing).toHaveAttribute('aria-pressed', 'true');
  const listening = exercises.getByRole('button', { name: /Listening/ });
  await listening.click();
  await expect(typing).toBeEnabled();
  await typing.click();
  await expect(typing).toHaveAttribute('aria-pressed', 'false');
  await expect(listening).toBeDisabled();
  await typing.click();
  await listening.click();
  await expect(typing).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Start Practicing', exact: true })).toBeEnabled();

  await page.getByRole('button', { name: 'More detailed filters', exact: true }).click();
  await page.getByRole('button', { name: /^A1\b/ }).dblclick();
  await page.getByRole('button', { name: /^A2\b/ }).click();
  await page.getByRole('button', { name: /^A2\b/ }).click();
  // Topics are an inline chip group; the expander reveals the rest and
  // "All topics" clears the selection (no modal any more).
  const topics = page.getByRole('group', { name: 'Topics', exact: true });
  const expandTopics = page.getByRole('button', { name: /^Show all topics/ });
  await expandTopics.click();
  await expect(page.getByRole('button', { name: 'Show fewer topics', exact: true })).toHaveAttribute('aria-expanded', 'true');
  const food = topics.getByRole('button', { name: 'Food', exact: true });
  const allTopics = topics.getByRole('button', { name: 'All topics', exact: true });
  await food.click();
  await expect(food).toHaveAttribute('aria-pressed', 'true');
  await expect(allTopics).toHaveAttribute('aria-pressed', 'false');
  await allTopics.click();
  await expect(food).toHaveAttribute('aria-pressed', 'false');
  await expect(allTopics).toHaveAttribute('aria-pressed', 'true');
  await food.click();
  await expect(food).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('group', { name: 'Word Types', exact: true }).getByRole('button', { name: 'Noun', exact: true }).click();
  await page.getByRole('button', { name: 'Apply Filters', exact: true }).click();
  // The setup page shows every level as a tile, so check pressed state
  // rather than text that is always present.
  const summary = page.getByRole('region', { name: 'Vocabulary Filters', exact: true });
  await expect(summary.getByRole('button', { name: /^A1\b/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(summary.getByRole('button', { name: /^A2\b/ })).toHaveAttribute('aria-pressed', 'false');
  await expect(summary).toContainText('Food');
  await expect(summary).toContainText('Noun');
  await page.getByRole('button', { name: 'More detailed filters', exact: true }).click();
  await page.getByRole('button', { name: /^A2\b/ }).click();
  await page.getByRole('button', { name: 'Back to Custom Practice', exact: true }).click();
  await expect(summary.getByRole('button', { name: /^A2\b/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Start Practicing', exact: true }).click();
  await expect(page).toHaveURL(/\/es-en\/practice/);
  await expect(page.getByRole('heading', { name: 'manzana', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox')).toBeVisible();
  // In-session "Filters" opens the detailed filters page with the live
  // selection; backing out from there returns to the preserved setup.
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await expect(page).toHaveURL(/\/languages\/filters/);
  await expect(page.getByRole('group', { name: 'Topics', exact: true }).getByRole('button', { name: 'Food', exact: true }))
    .toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Back to Custom Practice', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:4173/custom-practice');
  await expect(summary).toContainText('Food');
  await expect(typing).toHaveAttribute('aria-pressed', 'true');
  await expect(languageRegion(page).getByRole('button', { name: 'Spanish', exact: true })).toBeVisible();
  await expect(languageRegion(page).getByRole('button', { name: 'English', exact: true })).toBeVisible();
});

test('typing feedback, click and Enter advancement, skip, reveal, finish, and return', async ({ page }) => {
  await openPracticeSetup(page);
  await selectLanguages(page);
  await selectTypingOnly(page);
  await page.getByRole('button', { name: 'Start Practicing', exact: true }).click();
  await expect(page).toHaveURL(/\/es-en\/practice/);
  const answer = page.getByRole('textbox');
  const prompt = page.getByRole('heading', { level: 2 });
  await expect(prompt).toHaveText('sobre');
  await expect(page.getByRole('banner')).toContainText('Spanish');
  await expect(page.getByRole('banner')).toContainText('English');
  await answer.fill('zzzzz');
  await expect(answer).toHaveValue('zzzzz');
  // Typing feedback is implicit: wrong input retains Skip; Enter cannot advance.
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toHaveCount(0);
  await answer.press('Enter');
  await expect(prompt).toHaveText('sobre');
  await expect(answer).toHaveValue('zzzzz');
  await answer.fill('about');
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show me word', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(prompt).toHaveText('encima de');
  await expect(answer).toHaveValue('');
  await answer.fill('zzzzz');
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(prompt).toHaveText('acción');
  await answer.fill('action');
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible();
  await answer.press('Enter');
  await expect(prompt).toHaveText('actividad');
  await expect(answer).toHaveValue('');
  await page.getByRole('button', { name: 'Show me word', exact: true }).click();
  await expect(answer).toHaveValue('activity');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(prompt).toHaveText('actor');
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await page.getByRole('button', { name: 'Maybe later', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  // Practiced words are listed inline on the results screen (no modal). A
  // word counts only once the learner wrote it: "activity" was only revealed
  // with Show me word, so it is excluded (see practicedWordCount).
  const practiced = page.getByRole('region', { name: 'Practiced words', exact: true });
  const practicedRow = (word: string) =>
    practiced.getByRole('listitem').filter({ has: page.getByRole('link', { name: word, exact: true }) });
  for (const word of ['about', 'above', 'action']) await expect(practicedRow(word)).toBeVisible();
  await expect(practicedRow('activity')).toHaveCount(0);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:4173/custom-practice');
  await expect(languageRegion(page).getByRole('button', { name: 'Spanish', exact: true })).toBeVisible();
});
