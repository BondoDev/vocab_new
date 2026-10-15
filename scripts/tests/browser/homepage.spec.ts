import { test, expect } from './fixtures';

test('anonymous visitor opens Free Practice from the homepage', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Learn Vocabulary Your Way' })).toBeVisible();
  // The anonymous Free Practice flow is currently labelled "Start Practicing".
  await page.getByRole('button', { name: 'Start Practicing', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:4173/custom-practice');
  await expect(page.getByRole('heading', { level: 1, name: 'Customize Your Practice' })).toBeVisible();

  const languages = page.getByRole('region', { name: 'Choose Your Languages', exact: true });
  await expect(languages).toBeVisible();
  await expect(languages.getByRole('button', { name: 'Select your language', exact: true })).toBeVisible();
  await expect(languages.getByRole('button', { name: 'Select practice language', exact: true })).toBeVisible();
  const exercises = page.getByRole('region', { name: 'Choose Your Exercises', exact: true });
  await expect(exercises).toBeVisible();
  await expect(exercises.getByRole('button', { pressed: true }).first()).toBeVisible();
});
