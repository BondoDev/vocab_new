import type { Page } from '@playwright/test';
import { test, expect } from './practice-fixtures';
import type { MockApi } from './fixtures';
import { ageOn, inferBirthYear, isValidBirthDate, birthYearMatchesBirthday } from '../../../src/app/utils/accountAge';

// Automatic age in the browser: existing accounts without a birth year are
// never prompted and keep showing their stored age until they voluntarily
// save age/birthday in Settings, which initializes automatic age; confirmed
// accounts show the server-calculated current_age. The mock backend mirrors
// the server rules of
// supabase/migrations/20261105160000_add_inferred_birth_year_and_current_age.sql
// using the same calendar module; "today" is the practice fixture's fixed
// browser date (2026-10-15, UTC profile time zone).

test.describe.configure({ timeout: 120_000 });
test.use({ actionTimeout: 15_000 });

const TODAY = { year: 2026, month: 10, day: 15 };
const timestamp = '2026-01-01T00:00:00Z';
const user = { id: '00000000-0000-4000-8000-0000000000e5', email: 'erin@example.invalid', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {} };

interface ProfileState {
  user_age: number;
  birth_month: number;
  birth_day: number;
  birth_year: number | null;
  age_confirmed_at: string | null;
}

function installBackend(api: MockApi, initial: ProfileState, options: { legacyDatabase?: boolean } = {}) {
  const state = { profile: { ...initial }, demographicsCalls: [] as Record<string, number>[] };
  const currentAge = () => (state.profile.birth_year === null
    ? null
    : ageOn(state.profile.birth_year, state.profile.birth_month, state.profile.birth_day, TODAY));
  api.handle = async (route, path) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const json = async (body: unknown, status = 200) => { await route.fulfill({ status, json: body }); return true; };
    if (path === '/auth/v1/token' && method === 'POST') {
      return json({ access_token: 'at-erin', refresh_token: 'rt-erin', expires_at: 4102444800, token_type: 'bearer', user });
    }
    if (path === '/auth/v1/user' && method === 'GET') return json(user);
    if (method === 'GET' && path === '/rest/v1/user_profiles') {
      const select = url.searchParams.get('select') ?? '';
      if (options.legacyDatabase && select.includes('current_age')) {
        return json({ code: '42703', message: 'column user_profiles.current_age does not exist' }, 400);
      }
      const row: Record<string, unknown> = {
        id: user.id, nickname: 'Erin', native_language: 'es', learning_language: 'en', current_level: 'A1',
        user_age: state.profile.user_age, birth_month: state.profile.birth_month, birth_day: state.profile.birth_day,
        onboarding_completed: true, daily_goal: 10, updated_at: timestamp, timezone: 'UTC', timezone_updated_at: timestamp,
      };
      if (select.includes('current_age')) {
        Object.assign(row, { birth_year: state.profile.birth_year, age_confirmed_at: state.profile.age_confirmed_at, current_age: currentAge() });
      }
      return json([row]);
    }
    if (method === 'GET' && ['/rest/v1/user_vocabulary_lists', '/rest/v1/user_vocabulary_list_words', '/rest/v1/user_word_progress', '/rest/v1/user_daily_stats'].includes(path)) return json([]);
    if (method === 'POST' && path === '/rest/v1/rpc/get_current_learning_date') return json([{ stat_date: '2026-10-15' }]);
    if (method === 'POST' && path === '/rest/v1/rpc/read_vocabulary_growth_events') return json([]);
    if (method === 'POST' && path === '/rest/v1/rpc/update_user_profile_demographics') {
      const body = request.postDataJSON();
      state.demographicsCalls.push(body);
      const baseline = currentAge() ?? state.profile.user_age;
      const age = body.p_user_age;
      if (age > 100 || (age < 16 && age < baseline) || !isValidBirthDate(body.p_birth_month, body.p_birth_day)) {
        return json({ code: '22023', message: 'rejected' }, 400);
      }
      const birthYear = inferBirthYear(age, body.p_birth_month, body.p_birth_day, TODAY);
      if (!birthYearMatchesBirthday(birthYear, body.p_birth_month, body.p_birth_day)) return json({ code: '22023', message: 'rejected' }, 400);
      const now = '2026-10-15T12:00:00Z';
      state.profile = { user_age: age, birth_month: body.p_birth_month, birth_day: body.p_birth_day, birth_year: options.legacyDatabase ? null : birthYear, age_confirmed_at: options.legacyDatabase ? null : now };
      const response: Record<string, unknown> = { user_age: age, birth_month: body.p_birth_month, birth_day: body.p_birth_day, updated_at: now };
      if (!options.legacyDatabase) Object.assign(response, { birth_year: birthYear, age_confirmed_at: now, current_age: age });
      return json([response]);
    }
    return false;
  };
  return state;
}

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Log In', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Welcome back' });
  await dialog.getByLabel('Email', { exact: true }).fill(user.email);
  await dialog.getByLabel('Password', { exact: true }).fill('Browser-only-password1');
  await dialog.getByRole('button', { name: 'Log In', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

const settingsAge = (page: Page) => page.locator('#settings-age-input');
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save', exact: true }).first();

async function openSettings(page: Page) {
  await page.goto('/profile?section=settings');
  await expect(page.getByRole('heading', { name: 'Profile details', exact: true })).toBeVisible();
}

test('existing user: never prompted, stored age shown; a voluntary Settings save initializes automatic age', async ({ page, mockApi }) => {
  // Stored 20 long ago; no birth year yet.
  const backend = installBackend(mockApi, { user_age: 20, birth_month: 3, birth_day: 10, birth_year: null, age_confirmed_at: null });
  await signIn(page);
  await openSettings(page);
  await expect(settingsAge(page)).toHaveValue('20');
  // No popup or any other dialog is shown to ask for the age.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Profile details', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(backend.demographicsCalls).toHaveLength(0);

  // The user updates their age voluntarily.
  await settingsAge(page).fill('22');
  await saveButton(page).click();
  await expect(page.getByText('Profile details updated.')).toBeVisible();
  expect(backend.demographicsCalls).toEqual([{ p_user_age: 22, p_birth_month: 3, p_birth_day: 10 }]);
  expect(backend.profile.birth_year).toBe(2004);

  // From now on the displayed age is the server's current_age.
  await page.reload();
  await expect(settingsAge(page)).toHaveValue('22');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('confirmed user: Settings shows the calculated age and edits re-infer the birth year', async ({ page, mockApi }) => {
  // Declared 20 in early 2024 with a 03-10 birthday: two birthdays passed.
  const backend = installBackend(mockApi, { user_age: 20, birth_month: 3, birth_day: 10, birth_year: 2004, age_confirmed_at: '2024-01-01T00:00:00Z' });
  await signIn(page);
  await openSettings(page);
  await expect(settingsAge(page)).toHaveValue('22');

  // Birthday change only: the current age is sent with the new date.
  const monthTrigger = page.locator('.settings-profile-details__month-trigger');
  const dayTrigger = page.locator('.settings-profile-details__day-trigger');
  await monthTrigger.click();
  await page.getByRole('option', { name: 'December', exact: true }).click();
  await saveButton(page).click();
  await expect(page.getByText('Profile details updated.')).toBeVisible();
  expect(backend.demographicsCalls.at(-1)).toEqual({ p_user_age: 22, p_birth_month: 12, p_birth_day: 10 });
  expect(backend.profile.birth_year).toBe(2003);
  await expect(settingsAge(page)).toHaveValue('22');

  // Impossible dates are not offered: day 31 disappears for April.
  await dayTrigger.click();
  await page.getByRole('option', { name: '31', exact: true }).click();
  await monthTrigger.click();
  await page.getByRole('option', { name: 'April', exact: true }).click();
  await expect(dayTrigger).toContainText('Day');
  await dayTrigger.click();
  await expect(page.getByRole('option', { name: '30', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: '31', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // February 29 must match the birth year the age implies.
  await monthTrigger.click();
  await page.getByRole('option', { name: 'February', exact: true }).click();
  await dayTrigger.click();
  await page.getByRole('option', { name: '29', exact: true }).click();
  // Age 22 on 2026-10-15 implies 2004, a leap year: consistent.
  await expect(page.getByRole('alert').filter({ hasText: 'February 29' })).toHaveCount(0);
  // Age 21 implies 2005, which has no February 29.
  await settingsAge(page).fill('21');
  await expect(page.getByRole('alert').filter({ hasText: "February 29 doesn't match this age" })).toBeVisible();
  await expect(saveButton(page)).toBeDisabled();
  await settingsAge(page).fill('18');
  await expect(page.getByRole('alert').filter({ hasText: 'February 29' })).toHaveCount(0);
  await saveButton(page).click();
  await expect(page.getByText('Profile details updated.')).toBeVisible();
  expect(backend.demographicsCalls.at(-1)).toEqual({ p_user_age: 18, p_birth_month: 2, p_birth_day: 29 });
  expect(backend.profile.birth_year).toBe(2008);
});

test('16+ rule in Settings: a legacy under-16 account may raise its age but never lower it', async ({ page, mockApi }) => {
  const backend = installBackend(mockApi, { user_age: 14, birth_month: 5, birth_day: 5, birth_year: null, age_confirmed_at: null });
  await signIn(page);
  await openSettings(page);
  await expect(settingsAge(page)).toHaveValue('14');
  await settingsAge(page).fill('13');
  await expect(page.getByRole('alert').filter({ hasText: 'Age must be between 16 and 100.' })).toBeVisible();
  await expect(saveButton(page)).toBeDisabled();
  await settingsAge(page).fill('15');
  await expect(saveButton(page)).toBeEnabled();
  await saveButton(page).click();
  await expect(page.getByText('Profile details updated.')).toBeVisible();
  expect(backend.demographicsCalls).toEqual([{ p_user_age: 15, p_birth_month: 5, p_birth_day: 5 }]);
});

test('database without the migration: legacy read, Settings still saves', async ({ page, mockApi }) => {
  const backend = installBackend(mockApi, { user_age: 25, birth_month: 6, birth_day: 1, birth_year: null, age_confirmed_at: null }, { legacyDatabase: true });
  await signIn(page);
  await openSettings(page);
  await expect(settingsAge(page)).toHaveValue('25');
  expect(mockApi.requests.filter((request) => request.startsWith('GET /rest/v1/user_profiles')).length).toBeGreaterThanOrEqual(2);
  await settingsAge(page).fill('26');
  await saveButton(page).click();
  await expect(page.getByText('Profile details updated.')).toBeVisible();
  expect(backend.demographicsCalls).toHaveLength(1);
});
