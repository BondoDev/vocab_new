// Read-only Supabase access for the "Study New Words" queue (Phase 1): which
// concepts a user has already studied for one target language, and how many
// new words they've completed today. No inserts/updates happen here — this
// phase only prepares a queue, it never writes to user_word_progress or
// user_daily_stats.
import {
  ensureFreshSupabaseSession,
  getAuthHeaders,
  refreshSupabaseSession,
  supabaseRequest,
  type StoredSupabaseSession,
} from "./supabaseAuth";

interface UserWordProgressRow {
  word_id: string;
}

interface UserDailyStatsRow {
  new_words_completed: number | null;
}

function getAuthorizedHeaders(session: StoredSupabaseSession) {
  return {
    ...getAuthHeaders(),
    Authorization: `Bearer ${session.access_token}`,
  };
}

// Same refresh-then-retry-once shape as userProfile.ts's private
// supabaseProfileRequest — duplicated rather than imported because that
// helper isn't exported, and this module intentionally stays the only place
// that knows about user_word_progress / user_daily_stats.
async function supabaseProgressRequest<TResponse>(
  session: StoredSupabaseSession,
  path: string,
): Promise<TResponse> {
  const freshSession = await ensureFreshSupabaseSession(session);

  try {
    return await supabaseRequest<TResponse>(path, {
      method: "GET",
      headers: getAuthorizedHeaders(freshSession),
    });
  } catch (error) {
    if (!(error instanceof Error) || !/jwt expired/i.test(error.message)) {
      throw error;
    }

    const refreshedSession = await refreshSupabaseSession(freshSession);
    return supabaseRequest<TResponse>(path, {
      method: "GET",
      headers: getAuthorizedHeaders(refreshedSession),
    });
  }
}

// Progress isolation by target language: user_word_progress's unique
// constraint is (user_id, word_id, target_language), so a concept studied in
// one target language must not exclude it in another. Filtering on both
// user_id and target_language here (not just user_id) is what preserves that
// isolation — the caller never needs to post-filter by language.
export async function readStudiedConceptIds(
  session: StoredSupabaseSession,
  targetLanguage: string,
): Promise<Set<string>> {
  const userId = session.user?.id;
  if (!userId || !targetLanguage) {
    return new Set();
  }

  const rows = await supabaseProgressRequest<UserWordProgressRow[]>(
    session,
    `/rest/v1/user_word_progress?user_id=eq.${encodeURIComponent(userId)}&target_language=eq.${encodeURIComponent(
      targetLanguage,
    )}&select=word_id`,
  );

  return new Set(rows.map((row) => row.word_id).filter((id): id is string => typeof id === "string"));
}

// No daily-stat row yet is a normal state (first study session of the day,
// or ever) — treat it as 0 completed rather than an error, and never create
// the row here; this phase is read-only.
export async function readTodayNewWordsCompleted(
  session: StoredSupabaseSession,
  targetLanguage: string,
  statDateISO: string,
): Promise<number> {
  const userId = session.user?.id;
  if (!userId || !targetLanguage || !statDateISO) {
    return 0;
  }

  const rows = await supabaseProgressRequest<UserDailyStatsRow[]>(
    session,
    `/rest/v1/user_daily_stats?user_id=eq.${encodeURIComponent(userId)}&target_language=eq.${encodeURIComponent(
      targetLanguage,
    )}&stat_date=eq.${encodeURIComponent(statDateISO)}&select=new_words_completed`,
  );

  if (rows.length === 0) {
    return 0;
  }

  const value = rows[0].new_words_completed;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
