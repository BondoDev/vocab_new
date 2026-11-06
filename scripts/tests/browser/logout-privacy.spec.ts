import type { BrowserContext, Page, Route } from '@playwright/test';
import { test, expect } from './practice-fixtures';
import type { MockApi } from './fixtures';

// Logout privacy: account-scoped browser data (cached `app.userProfile.<id>`
// profiles and the `app.practiceListSession` snapshot) must be gone after
// every kind of sign-out and after an account switch, while anonymous
// preferences, the consent cookie, unrelated storage, and server-side
// progress stay untouched. Backend state is synthetic and per test.

test.describe.configure({ timeout: 120_000 });
test.use({ actionTimeout: 15_000 });

const timestamp = '2026-10-15T12:00:00Z';
const farFuture = 4102444800;
type MockUser = { id: string; email: string; nickname: string; provider: 'email' | 'google'; complete: boolean };
const alice: MockUser = { id: '00000000-0000-4000-8000-0000000000a1', email: 'alice@example.invalid', nickname: 'Alice', provider: 'email', complete: true };
const bob: MockUser = { id: '00000000-0000-4000-8000-0000000000b2', email: 'bob@example.invalid', nickname: 'Bob', provider: 'email', complete: true };
const gina: MockUser = { id: '00000000-0000-4000-8000-0000000000c3', email: 'gina@example.invalid', nickname: 'Gina', provider: 'google', complete: true };
const olga: MockUser = { id: '00000000-0000-4000-8000-0000000000d4', email: 'olga@example.invalid', nickname: '', provider: 'email', complete: false };
const users = [alice, bob, gina, olga];

const authUser = (user: MockUser) => ({
  id: user.id, email: user.email, email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: user.provider, providers: [user.provider] }, user_metadata: {},
});
const sessionFor = (user: MockUser, expiresAt = farFuture) => ({
  access_token: `at-${user.id}`, refresh_token: `rt-${user.id}`, expires_at: expiresAt, token_type: 'bearer', user: authUser(user),
});

// Reads that are allowed during these journeys; anything else non-GET is
// recorded in `writes` so tests can prove sign-out never touches server data.
const readOnlyRpcs = new Set(['/rest/v1/rpc/get_current_learning_date', '/rest/v1/rpc/read_vocabulary_growth_events']);

function installBackend(api: MockApi) {
  const state = { writes: [] as string[], logoutCalls: 0, onboarded: new Set<string>(), onboardingTimezones: [] as (string | null)[] };
  const byToken = (route: Route) => {
    const token = (route.request().headers().authorization ?? '').replace(/^Bearer /, '');
    return users.find((user) => token === `at-${user.id}`) ?? null;
  };
  api.handle = async (route, path) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const json = async (body: unknown, status = 200) => { await route.fulfill({ status, json: body }); return true; };
    if (path === '/auth/v1/token' && method === 'POST') {
      const grant = url.searchParams.get('grant_type');
      const body = request.postDataJSON();
      if (grant === 'password') {
        const user = users.find((candidate) => candidate.email === body.email);
        return user ? json(sessionFor(user)) : json({ msg: 'Invalid login credentials' }, 400);
      }
      if (grant === 'pkce') return body.auth_code === 'mock-google-code' && body.code_verifier ? json(sessionFor(gina)) : json({ msg: 'bad code' }, 400);
      // Every refresh is rejected: models an expired/revoked refresh token.
      if (grant === 'refresh_token') return json({ msg: 'Invalid Refresh Token: Refresh Token Not Found' }, 400);
    }
    if (path === '/auth/v1/logout' && method === 'POST') { state.logoutCalls += 1; await route.fulfill({ status: 204, body: '' }); return true; }
    if (path === '/auth/v1/user' && method === 'GET') { const user = byToken(route); return user ? json(authUser(user)) : json({ msg: 'invalid JWT' }, 401); }
    if (method === 'GET') {
      if (path === '/rest/v1/user_profiles') {
        const user = byToken(route);
        if (!user) return json([]);
        const complete = user.complete || state.onboarded.has(user.id);
        return json([{
          id: user.id, nickname: complete ? (user.nickname || 'Olga') : '', native_language: 'es', learning_language: 'en', current_level: 'A1',
          user_age: complete ? 25 : null, birth_month: complete ? 1 : null, birth_day: complete ? 1 : null, onboarding_completed: complete,
          daily_goal: 10, updated_at: timestamp, timezone: 'UTC', timezone_updated_at: timestamp,
        }]);
      }
      if (['/rest/v1/user_vocabulary_lists', '/rest/v1/user_vocabulary_list_words', '/rest/v1/user_word_progress', '/rest/v1/user_daily_stats'].includes(path)) return json([]);
    }
    if (method === 'POST' && path === '/rest/v1/rpc/get_current_learning_date') return json([{ stat_date: '2026-10-15' }]);
    if (method === 'POST' && path === '/rest/v1/rpc/read_vocabulary_growth_events') return json([]);
    if (method === 'POST' && path === '/rest/v1/rpc/complete_user_profile_onboarding') {
      const user = byToken(route)!;
      const body = request.postDataJSON();
      // Mirrors the 8-argument RPC (20261106120000): unknown argument names
      // fail like PostgREST's PGRST202; p_timezone is recorded, never stored.
      const allowed = ['p_nickname', 'p_native_language', 'p_learning_language', 'p_current_level', 'p_user_age', 'p_birth_month', 'p_birth_day', 'p_timezone'];
      if (Object.keys(body).some((key) => !allowed.includes(key))) {
        return json({ code: 'PGRST202', message: 'Could not find the function public.complete_user_profile_onboarding in the schema cache' }, 404);
      }
      state.onboardingTimezones.push(body.p_timezone ?? null);
      state.writes.push(`${method} ${path}`);
      state.onboarded.add(user.id);
      return json([{
        id: user.id, nickname: body.p_nickname, native_language: body.p_native_language, learning_language: body.p_learning_language,
        current_level: body.p_current_level, user_age: body.p_user_age, birth_month: body.p_birth_month, birth_day: body.p_birth_day,
        onboarding_completed: true, daily_goal: 10, updated_at: timestamp, timezone: 'UTC', timezone_updated_at: timestamp,
      }]);
    }
    if (method !== 'GET' && !readOnlyRpcs.has(path)) state.writes.push(`${method} ${path}`);
    return false;
  };
  return state;
}

const anonymousPrefs = {
  uiLanguage: 'en',
  'app.yourLanguage': 'es',
  'app.practiceLanguage': 'en',
  'app.selectedExercises': '["wordTyping"]',
  'fluentstellar.accountIntro.lastShownAt': '1760000000000',
  'otherApp.unrelated': 'must-survive',
};
const practiceListSnapshot = JSON.stringify({ listId: 'list-1', listName: 'Private list name', conceptIds: ['A1-00039'] });

// Returns the anonymous preferences as the app holds them after a load (the
// app normalizes stored values), so later checks compare like with like.
type Baseline = Record<string, string | null>;
async function seedAnonymousBrowserState(page: Page, context: BrowserContext): Promise<Baseline> {
  await context.addCookies([{ name: 'zaraz-consent', value: encodeURIComponent('{"pUVR":true}'), url: 'http://127.0.0.1:4173' }]);
  await page.goto('/');
  await page.evaluate((prefs) => {
    for (const [key, value] of Object.entries(prefs)) localStorage.setItem(key, value);
    // A profile cache left behind by a sign-out from before the fix.
    localStorage.setItem('app.userProfile.legacy-previous-user', JSON.stringify({ nickname: 'Legacy' }));
  }, anonymousPrefs);
  await page.reload();
  await expect(page.locator('.header-desktop-actions').getByRole('button', { name: 'Log In', exact: true })).toBeVisible();
  const storage = await storageSnapshot(page);
  const baseline = Object.fromEntries(Object.keys(anonymousPrefs).map((key) => [key, storage[key] ?? null]));
  expect(baseline['otherApp.unrelated']).toBe('must-survive');
  expect(baseline.uiLanguage).toBe('en');
  // The pre-fix leftover is swept on the first anonymous load.
  expect(Object.keys(storage).filter((key) => key.startsWith('app.userProfile.'))).toEqual([]);
  return baseline;
}

// Stands in for a profile cache written by an earlier in-account save
// (Settings, daily goal, timezone init); login itself does not write one.
const seedProfileCache = (page: Page, user: MockUser) => page.evaluate(({ id, nickname }) =>
  localStorage.setItem(`app.userProfile.${id}`, JSON.stringify({ nickname, age: 25, birthMonth: '01', birthDay: '01' })), user);

const storageSnapshot = (page: Page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])));
const profileCacheKeys = async (page: Page) => Object.keys(await storageSnapshot(page)).filter((key) => key.startsWith('app.userProfile.')).sort();

async function expectSignedOutStorageClean(page: Page, context: BrowserContext, baseline: Baseline) {
  await expect.poll(() => profileCacheKeys(page)).toEqual([]);
  const storage = await storageSnapshot(page);
  expect(storage['supabase.auth.session']).toBeUndefined();
  expect(storage['supabase.auth.pkce.verifier']).toBeUndefined();
  expect(storage['app.practiceListSession']).toBeUndefined();
  for (const [key, value] of Object.entries(baseline)) expect(storage[key] ?? null, key).toBe(value);
  const consent = (await context.cookies()).find((cookie) => cookie.name === 'zaraz-consent');
  expect(consent?.value).toBe(encodeURIComponent('{"pUVR":true}'));
}

async function logInWithPassword(page: Page, user: MockUser) {
  await page.getByRole('button', { name: 'Log In', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Welcome back' });
  await dialog.getByLabel('Email', { exact: true }).fill(user.email);
  await dialog.getByLabel('Password', { exact: true }).fill('Browser-only-password1');
  await dialog.getByRole('button', { name: 'Log In', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

const accountButton = (page: Page, user: MockUser) => page.locator('.header-desktop-actions').getByRole('button', { name: user.nickname[0], exact: true });

async function signOutFromHeader(page: Page, user: MockUser) {
  await accountButton(page, user).click();
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect(page.locator('.header-desktop-actions').getByRole('button', { name: 'Log In', exact: true })).toBeVisible();
}

test('password logout clears cached profile and practice-list snapshot, keeps anonymous preferences and server data', async ({ page, context, mockApi }) => {
  const backend = installBackend(mockApi);
  const baseline = await seedAnonymousBrowserState(page, context);
  await logInWithPassword(page, alice);
  await expect(accountButton(page, alice)).toBeVisible();
  await seedProfileCache(page, alice);

  // A refresh of the same account keeps its practice-list snapshot.
  await page.evaluate((snapshot) => localStorage.setItem('app.practiceListSession', snapshot), practiceListSnapshot);
  await page.reload();
  await expect(accountButton(page, alice)).toBeVisible();
  await expect.poll(async () => (await storageSnapshot(page))['app.practiceListSession']).toBe(practiceListSnapshot);
  expect(await profileCacheKeys(page)).toEqual([`app.userProfile.${alice.id}`]);

  await signOutFromHeader(page, alice);
  await expectSignedOutStorageClean(page, context, baseline);
  expect(backend.logoutCalls).toBe(1);
  expect(backend.writes, 'sign-out must not send any server-side write').toEqual([]);

  // Still clean after a reload as an anonymous visitor.
  await page.reload();
  await expectSignedOutStorageClean(page, context, baseline);
});

test('profile sidebar sign-out and cross-tab (repeated) logout', async ({ page, context, mockApi }) => {
  const backend = installBackend(mockApi);
  const baseline = await seedAnonymousBrowserState(page, context);
  await logInWithPassword(page, alice);
  await expect(accountButton(page, alice)).toBeVisible();
  await seedProfileCache(page, alice);
  await page.evaluate((snapshot) => localStorage.setItem('app.practiceListSession', snapshot), practiceListSnapshot);

  const secondTab = await context.newPage();
  await secondTab.goto('/profile');
  await expect(accountButton(secondTab, alice)).toBeVisible();

  await page.goto('/profile');
  await page.getByRole('button', { name: 'Sign out', exact: true }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.locator('.header-desktop-actions').getByRole('button', { name: 'Log In', exact: true })).toBeVisible();
  await expectSignedOutStorageClean(page, context, baseline);

  // The other tab follows via the storage event and leaves the account page.
  await expect(secondTab.locator('.header-desktop-actions').getByRole('button', { name: 'Log In', exact: true })).toBeVisible();
  await expect(secondTab.getByText('Alice', { exact: true })).toHaveCount(0);
  await expectSignedOutStorageClean(secondTab, context, baseline);
  expect(backend.logoutCalls).toBe(1);
  expect(backend.writes).toEqual([]);
});

test('switching accounts never exposes the previous account (sequential and cross-tab)', async ({ page, context, mockApi }) => {
  installBackend(mockApi);
  await seedAnonymousBrowserState(page, context);
  await logInWithPassword(page, alice);
  await expect(accountButton(page, alice)).toBeVisible();
  await seedProfileCache(page, alice);
  await page.evaluate((snapshot) => localStorage.setItem('app.practiceListSession', snapshot), practiceListSnapshot);
  await signOutFromHeader(page, alice);
  expect(await profileCacheKeys(page)).toEqual([]);

  await logInWithPassword(page, bob);
  await expect(accountButton(page, bob)).toBeVisible();
  expect(await profileCacheKeys(page)).toEqual([]);
  await seedProfileCache(page, bob);
  await page.goto('/profile?section=settings');
  await expect(page.getByText('Bob', { exact: true }).locator('visible=true').first()).toBeVisible();
  await expect(page.getByText('Alice', { exact: true })).toHaveCount(0);
  expect((await storageSnapshot(page))['app.practiceListSession']).toBeUndefined();

  // Direct switch without a visible sign-out: another tab replaces the
  // stored session with Alice's. This tab must drop Bob's cache and show Alice.
  await page.evaluate((snapshot) => localStorage.setItem('app.practiceListSession', snapshot), practiceListSnapshot);
  const otherTab = await context.newPage();
  await otherTab.goto('/');
  await otherTab.evaluate((session) => localStorage.setItem('supabase.auth.session', JSON.stringify(session)), sessionFor(alice));
  await expect(accountButton(page, alice)).toBeVisible();
  await expect.poll(() => profileCacheKeys(page)).toEqual([]);
  await expect(page.getByText('Bob', { exact: true })).toHaveCount(0);
  expect((await storageSnapshot(page))['app.practiceListSession']).toBeUndefined();
});

test('Google sign-in and logout clear the session, verifier, and cached profile', async ({ page, context, mockApi }) => {
  const backend = installBackend(mockApi);
  const baseline = await seedAnonymousBrowserState(page, context);
  // signInWithGoogleOAuth resolves "/auth/v1/authorize" against the Supabase
  // URL as an absolute path, which drops the harness's /__mock-supabase
  // prefix (production URLs have no path). This page route stands in for
  // Google + GoTrue and returns to the app with a PKCE code.
  await page.route('http://127.0.0.1:4173/auth/v1/authorize?**', (route) => {
    mockApi.requests.push('GET /auth/v1/authorize');
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<script>location.replace("/?code=mock-google-code")</script>' });
  });
  await page.getByRole('button', { name: 'Log In', exact: true }).first().click();
  await page.getByRole('dialog', { name: 'Welcome back' }).getByRole('button', { name: 'Continue with Google', exact: true }).click();
  await expect(accountButton(page, gina)).toBeVisible();
  expect(new URL(page.url()).searchParams.get('code')).toBeNull();
  const signedIn = await storageSnapshot(page);
  expect(signedIn['supabase.auth.pkce.verifier']).toBeUndefined();
  await seedProfileCache(page, gina);

  await page.evaluate((snapshot) => localStorage.setItem('app.practiceListSession', snapshot), practiceListSnapshot);
  await signOutFromHeader(page, gina);
  await expectSignedOutStorageClean(page, context, baseline);
  expect(backend.logoutCalls).toBe(1);
  expect(backend.writes).toEqual([]);
});

test('an expired session whose refresh is rejected signs out and clears account data', async ({ page, context, mockApi }) => {
  const backend = installBackend(mockApi);
  const baseline = await seedAnonymousBrowserState(page, context);
  await page.evaluate(({ session, aliceId, snapshot }) => {
    localStorage.setItem('supabase.auth.session', JSON.stringify(session));
    localStorage.setItem(`app.userProfile.${aliceId}`, JSON.stringify({ nickname: 'Alice' }));
    localStorage.setItem('app.practiceListSession', snapshot);
  }, { session: sessionFor(alice, 1_700_000_000), aliceId: alice.id, snapshot: practiceListSnapshot });
  await page.reload();
  await expect(page.locator('.header-desktop-actions').getByRole('button', { name: 'Log In', exact: true })).toBeVisible();
  await expectSignedOutStorageClean(page, context, baseline);
  expect(mockApi.requests.some((request) => request.startsWith('POST /auth/v1/token?grant_type=refresh_token'))).toBe(true);
  expect(backend.writes).toEqual([]);
});

test('onboarding: completion caches only the new account; cancel registration clears it', async ({ page, context, mockApi }) => {
  const backend = installBackend(mockApi);
  const baseline = await seedAnonymousBrowserState(page, context);
  await logInWithPassword(page, olga);
  const onboarding = page.getByRole('dialog', { name: 'Finish your profile' });
  await expect(onboarding).toBeVisible();
  await onboarding.getByRole('button', { name: 'Cancel registration', exact: true }).click();
  await expect(onboarding).toHaveCount(0);
  await expect(page.locator('.header-desktop-actions').getByRole('button', { name: 'Log In', exact: true })).toBeVisible();
  await expectSignedOutStorageClean(page, context, baseline);

  await logInWithPassword(page, olga);
  await expect(onboarding).toBeVisible();
  await onboarding.getByLabel('Nickname').fill('Olga');
  const comboboxes = onboarding.getByRole('combobox');
  const pick = async (index: number, option: RegExp) => {
    await comboboxes.nth(index).click();
    await page.getByRole('option', { name: option }).first().click();
  };
  const count = await comboboxes.count();
  // Order in the dialog: languages, level, then birth month/day (last two).
  for (let index = 0; index < count; index += 1) {
    const text = (await comboboxes.nth(index).textContent()) ?? '';
    if (/Select level/.test(text)) await pick(index, /A1/);
  }
  await pick(count - 2, /January|^01$|^1$/);
  await pick(count - 1, /^0?1$/);
  for (let step = 0; step < 30; step += 1) {
    const age = await onboarding.getByRole('spinbutton').or(onboarding.getByRole('textbox', { name: /age/i })).first().inputValue().catch(() => '');
    if (Number(age) >= 25) break;
    await onboarding.getByRole('button', { name: 'Increase age', exact: true }).click();
  }
  await onboarding.getByRole('button', { name: 'Save and continue', exact: true }).click();
  await expect(onboarding).toHaveCount(0);
  await expect.poll(() => profileCacheKeys(page)).toEqual([`app.userProfile.${olga.id}`]);
  expect(JSON.parse((await storageSnapshot(page))[`app.userProfile.${olga.id}`]!).nickname).toBe('Olga');
  expect(backend.writes).toEqual(['POST /rest/v1/rpc/complete_user_profile_onboarding']);
  expect(backend.onboardingTimezones).toEqual([await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)]);

  await signOutFromHeader(page, { ...olga, nickname: 'Olga' });
  await expectSignedOutStorageClean(page, context, baseline);
});

test('signed-in learning modes still open after the change', async ({ page, context, mockApi }) => {
  installBackend(mockApi);
  const baseline = await seedAnonymousBrowserState(page, context);
  await logInWithPassword(page, alice);
  await expect(accountButton(page, alice)).toBeVisible();
  await page.goto('/profile?section=learning');
  await expect(page.getByRole('heading', { name: 'Study New Words' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Review Words' }).first()).toBeVisible();
  await page.goto('/learning/review');
  await expect(page.getByRole('heading', { name: 'Review Words' }).first()).toBeVisible();
  await signOutFromHeader(page, alice);
  await expectSignedOutStorageClean(page, context, baseline);
});
