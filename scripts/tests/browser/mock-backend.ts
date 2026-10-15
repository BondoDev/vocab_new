import type { Page } from '@playwright/test';
import type { MockApi } from './fixtures';

const userId = '00000000-0000-4000-8000-000000000099';
export const fakeUser = { id: userId, email: 'browser@example.invalid', email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: {} };
const timestamp = '2026-10-15T12:00:00Z';
const listRow = (id: string, name: string) => ({ id, name, target_language: 'en', created_at: timestamp, updated_at: timestamp });

// All state is per-test memory. This deliberately models only the requests these
// journeys need; unknown endpoints return false and fail the shared network guard.
export function installMockBackend(api: MockApi, completeProfile = true) {
  const state = {
    lists: [listRow('00000000-0000-4000-8000-000000000001', 'Alpha'), listRow('00000000-0000-4000-8000-000000000002', 'Zulu')],
    memberships: [] as { list_id: string; word_id: string; created_at: string }[],
    recoveryError: true,
  };
  api.handle = async (route, path) => {
    const request = route.request();
    const method = request.method();
    const json = async (body: unknown, status = 200) => { await route.fulfill({ status, json: body }); return true; };
    if (path === '/auth/v1/token' && method === 'POST') return json({ code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
    if (path === '/auth/v1/signup' && method === 'POST') return json({ code: 'over_email_send_rate_limit', msg: 'Email rate limit exceeded' }, 429);
    if (path === '/auth/v1/recover' && method === 'POST') return json({});
    if (path === '/auth/v1/user' && method === 'GET') return json(fakeUser);
    if (path === '/auth/v1/user' && method === 'PUT') {
      if (state.recoveryError) { state.recoveryError = false; return json({ msg: 'Mock password update rejected' }, 422); }
      return json(fakeUser);
    }
    if (method === 'GET') {
      if (path === '/rest/v1/user_profiles') return json([{
        id: userId, nickname: completeProfile ? 'Browser' : '', native_language: 'es', learning_language: 'en',
        current_level: 'A1', user_age: completeProfile ? 25 : null, birth_month: completeProfile ? 1 : null, birth_day: completeProfile ? 1 : null,
        onboarding_completed: completeProfile, daily_goal: 10, updated_at: timestamp, timezone: 'UTC', timezone_updated_at: timestamp,
      }]);
      if (path === '/rest/v1/user_vocabulary_lists') return json(state.lists);
      if (path === '/rest/v1/user_vocabulary_list_words') {
        const query = new URL(request.url()).searchParams;
        const listFilter = query.get('list_id');
        const wordFilter = query.get('word_id');
        return json(state.memberships.filter((row) => (!listFilter || listFilter.includes(row.list_id)) && (!wordFilter || wordFilter === `eq.${row.word_id}`)));
      }
      if (['/rest/v1/user_word_progress', '/rest/v1/user_daily_stats'].includes(path)) return json([]);
    }
    if (method === 'POST') {
      const body = request.postDataJSON();
      if (path === '/rest/v1/rpc/get_current_learning_date') return json([{ stat_date: '2026-10-15' }]);
      if (path === '/rest/v1/rpc/read_vocabulary_growth_events') return json([]);
      if (path === '/rest/v1/rpc/create_user_vocabulary_list') {
        const row = listRow('00000000-0000-4000-8000-000000000003', body.p_name);
        state.lists.push(row); return json([row]);
      }
      if (path === '/rest/v1/rpc/rename_user_vocabulary_list') {
        const row = state.lists.find((item) => item.id === body.p_list_id)!;
        row.name = body.p_name; return json([row]);
      }
      if (path === '/rest/v1/rpc/delete_user_vocabulary_list') {
        state.lists = state.lists.filter((item) => item.id !== body.p_list_id);
        state.memberships = state.memberships.filter((item) => item.list_id !== body.p_list_id); return json(null);
      }
      if (path === '/rest/v1/rpc/add_words_to_vocabulary_list') {
        for (const word of body.p_word_ids) state.memberships.push({ list_id: body.p_list_id, word_id: word, created_at: timestamp });
        return json(body.p_word_ids.map((word: string) => ({ word_id: word, already_added: false })));
      }
      if (path === '/rest/v1/rpc/remove_word_from_vocabulary_list') {
        state.memberships = state.memberships.filter((item) => item.list_id !== body.p_list_id || item.word_id !== body.p_word_id); return json(null);
      }
    }
    return false;
  };
  return state;
}

export async function seedMockSession(page: Page) {
  await page.addInitScript((user) => {
    localStorage.setItem('supabase.auth.session', JSON.stringify({ access_token: 'browser-only-access-token', refresh_token: 'browser-only-refresh-token', expires_at: 4102444800, user }));
    localStorage.setItem('app.yourLanguage', 'es');
    localStorage.setItem('app.practiceLanguage', 'en');
  }, fakeUser);
}
