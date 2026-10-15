import type { Page } from '@playwright/test';
import { test as isolatedTest, expect as isolatedExpect } from './fixtures';

export const test = isolatedTest.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      // Fisher-Yates retains corpus order with j === i. No application data or
      // answer logic is replaced; the first en/es prompts stay reproducible.
      Math.random = () => 0.999999999;
      // Correct answers auto-speak. Keep synthesis inside the browser and avoid
      // OS voices, audio hardware, and any platform speech-service dependency.
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        value: {
          speak: () => {}, cancel: () => {}, pause: () => {}, resume: () => {},
          getVoices: () => [], addEventListener: () => {}, removeEventListener: () => {},
          speaking: false, pending: false, paused: false,
        },
      });
    });
    // Fix calendar time while leaving animation, input, and Next timers real.
    await page.clock.setFixedTime(new Date('2026-10-15T12:00:00Z'));
    await use(page);
  },
});

// The first practice visit lazily loads the real vocabulary bundles.
export const expect = isolatedExpect.configure({ timeout: 15_000 });

export const languageRegion = (page: Page) => page.getByRole('region', { name: 'Choose Your Languages', exact: true });
export const exerciseRegion = (page: Page) => page.getByRole('region', { name: 'Choose Your Exercises', exact: true });

export async function openPracticeSetup(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start Practicing', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:4173/custom-practice');
}

export async function selectLanguages(page: Page) {
  const languages = languageRegion(page);
  await languages.getByRole('button', { name: 'Select your language', exact: true }).click();
  await languages.getByRole('button', { name: 'Spanish', exact: true }).click();
  await languages.getByRole('button', { name: 'Select practice language', exact: true }).click();
  await languages.getByRole('button', { name: 'English', exact: true }).click();
}

export async function selectTypingOnly(page: Page) {
  const exercises = exerciseRegion(page);
  for (const name of ['Half-written word completion', 'Broken word assembling', 'Connect words', 'Listening']) {
    await exercises.getByRole('button', { name: new RegExp(name) }).click();
  }
  await expect(exercises.getByRole('button', { pressed: true })).toHaveCount(1);
}
