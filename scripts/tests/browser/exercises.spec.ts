import { test, expect, openPracticeSetup, selectLanguages, exerciseRegion } from './practice-fixtures';

test.describe.configure({ timeout: 90_000 });
const names = ['Word typing', 'Half-written word completion', 'Broken word assembling', 'Connect words', 'Listening'];

for (const name of names.slice(1)) {
  test(`${name}: incorrect/correct interaction, reset, Skip, Next and Finish`, async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-15T12:00:00Z') });
    await openPracticeSetup(page);
    await selectLanguages(page);
    for (const other of names.filter((item) => item !== name)) {
      await exerciseRegion(page).getByRole('button', { name: new RegExp(other) }).click();
    }
    await page.getByRole('button', { name: 'Start Practicing', exact: true }).click();
    const next = page.getByRole('button', { name: 'Next', exact: true });
    const skip = page.getByRole('button', { name: 'Skip', exact: true });
    if (name === 'Half-written word completion') {
      const input = page.getByRole('textbox');
      await expect(page.getByRole('heading', { name: 'sobre', exact: true })).toBeVisible();
      await expect(input).toHaveAttribute('maxlength', '3');
      await input.fill('zzz');
      await expect(next).toHaveCount(0);
      await expect(skip).toBeVisible();
      await input.fill('out');
      await expect(next).toBeVisible();
      await next.click();
      await expect(page.getByRole('heading', { name: 'encima de', exact: true })).toBeVisible();
      await expect(input).toHaveValue('');
      await expect(skip).toBeVisible();
      await skip.click();
      await expect(page.getByRole('heading', { name: 'acción', exact: true })).toBeVisible();
    } else if (name === 'Broken word assembling') {
      await expect(page.getByRole('heading', { name: 'sobre', exact: true })).toBeVisible();
      for (const chunk of ['t', 'ou', 'ab']) await page.getByRole('button', { name: chunk, exact: true }).click();
      await expect(page.getByText('Incorrect order - try again', { exact: true })).toBeVisible();
      await expect(next).toHaveCount(0);
      await expect(page.getByText('Incorrect order - try again', { exact: true })).toHaveCount(0);
      for (const chunk of ['ab', 'ou', 't']) await page.getByRole('button', { name: chunk, exact: true }).click();
      await expect(next).toBeVisible();
      await next.click();
      await expect(page.getByRole('heading', { name: 'encima de', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'ab', exact: true })).toBeEnabled();
      await expect(skip).toBeVisible();
      await skip.click();
      await expect(page.getByRole('heading', { name: 'acción', exact: true })).toBeVisible();
    } else {
      const listening = name === 'Listening';
      const audio = page.getByRole('button', { name: 'Play word audio', exact: true, disabled: false });
      await expect(page.getByRole('button', { name: 'sobre', exact: true })).toBeVisible();
      if (listening) await audio.nth(0).click();
      else await page.getByRole('button', { name: 'about', exact: true }).click();
      await page.getByRole('button', { name: 'encima de', exact: true }).click();
      await expect(page.getByRole('button', { name: 'encima de', exact: true })).toBeEnabled();
      await expect(next).toHaveCount(0);
      // The product clears a wrong pair after 600 ms; advance its clock rather
      // than sleeping or asserting transient presentation classes.
      await page.clock.fastForward(650);
      const pairs = [['about', 'sobre'], ['above', 'encima de'], ['action', 'acción'], ['activity', 'actividad']];
      for (const [index, [word, meaning]] of pairs.entries()) {
        // Exclude matched audio rows immediately, including during their flash;
        // the fixture keeps the remaining audio in corpus order.
        if (listening) await audio.nth(0).click();
        else await page.getByRole('button', { name: word, exact: true }).click();
        await page.getByRole('button', { name: meaning, exact: true }).click();
        await expect(page.getByRole('button', { name: meaning, exact: true, includeHidden: true })).toBeDisabled();
        if (listening) await expect(audio).toHaveCount(3 - index);
        if (index < 3) await expect(next).toHaveCount(0);
      }
      await expect(next).toBeVisible();
      await next.click();
      await expect(page.getByRole('button', { name: 'sobre', exact: true })).toHaveCount(0);
      await expect(skip).toBeVisible();
      if (listening) await expect(audio).toHaveCount(4);
      await skip.click();
      await expect(skip).toBeEnabled();
    }
    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    await page.getByRole('button', { name: 'Maybe later', exact: true }).click();
    await expect(page.getByRole('table')).toBeVisible();
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await expect(page).toHaveURL('http://127.0.0.1:4173/custom-practice');
  });
}
