// Supabase access for the "Study New Words" flow: Phase 1's read-only queue
// preparation (which concepts a user has already studied for one target
// language, and how many new words they've completed today) plus Phase 3's
// single atomic write — completeNewWordStudy, which persists one finished
// word via the complete_new_word_study RPC. See that function's own header
// comment for why this stays a single RPC call instead of two separate
// requests.
import {
  ensureFreshSupabaseSession,
  getAuthHeaders,
  refreshSupabaseSession,
  supabaseRequest,
  type StoredSupabaseSession,
} from "./supabaseAuth";
import type { WordState } from "../data/learning/wordReviewSchedule";
import { addDaysISO } from "../data/learning/dailyStreak";

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

// Thrown by completeNewWordStudy instead of letting a raw Supabase/
// PostgreSQL error reach the UI. `retryable` distinguishes "try the same
// request again" (network blip, transient DB error) from "the session
// itself is the problem" (expired/missing auth) — the caller decides what to
// do with that distinction; this phase's UI always offers Retry either way,
// since re-authentication is out of scope here.
export class NewWordStudyPersistenceError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "NewWordStudyPersistenceError";
    this.retryable = retryable;
  }
}

export interface CompleteNewWordStudyParams {
  session: StoredSupabaseSession;
  // Vocabulary concept id — becomes user_word_progress.word_id.
  conceptId: string;
  targetLanguage: string;
  // Local calendar date (YYYY-MM-DD) from getLocalCalendarDateISO(), the same
  // helper Phase 1's queue preparation uses — never a UTC-derived date. See
  // that helper's own header comment for the device-local-timezone
  // limitation this inherits.
  statDateISO: string;
}

// Mirrors the RPC's RETURNS TABLE(inserted, already_completed,
// new_words_completed_today) column names exactly (snake_case, as PostgREST
// returns them) before being normalized into CompleteNewWordStudyResult.
interface CompleteNewWordStudyRpcRow {
  inserted?: unknown;
  already_completed?: unknown;
  new_words_completed_today?: unknown;
}

export interface CompleteNewWordStudyResult {
  // True only when this call actually created the user_word_progress row —
  // false on an idempotent retry/duplicate where the row already existed.
  inserted: boolean;
  // The mirror of `inserted`: true when the word was already persisted
  // before this call (safe to treat as success, per the RPC's idempotency
  // contract).
  alreadyCompleted: boolean;
  newWordsCompletedToday: number;
}

async function supabaseProgressMutationRequest<TResponse>(
  session: StoredSupabaseSession,
  path: string,
  body: unknown,
  method: "POST" | "PATCH" = "POST",
): Promise<TResponse> {
  const freshSession = await ensureFreshSupabaseSession(session);
  const requestInit: RequestInit = {
    method,
    body: JSON.stringify(body),
  };

  try {
    return await supabaseRequest<TResponse>(path, {
      ...requestInit,
      headers: getAuthorizedHeaders(freshSession),
    });
  } catch (error) {
    if (!(error instanceof Error) || !/jwt expired/i.test(error.message)) {
      throw error;
    }

    const refreshedSession = await refreshSupabaseSession(freshSession);
    return supabaseRequest<TResponse>(path, {
      ...requestInit,
      headers: getAuthorizedHeaders(refreshedSession),
    });
  }
}

function parseCompleteNewWordStudyRow(
  row: CompleteNewWordStudyRpcRow | undefined,
): CompleteNewWordStudyResult {
  if (!row) {
    throw new NewWordStudyPersistenceError("complete_new_word_study returned no row.", true);
  }

  const rawCount = row.new_words_completed_today;
  return {
    inserted: Boolean(row.inserted),
    alreadyCompleted: Boolean(row.already_completed),
    newWordsCompletedToday: typeof rawCount === "number" && Number.isFinite(rawCount) ? rawCount : 0,
  };
}

// Persists exactly one completed word: one call, one atomic RPC transaction
// (insert into user_word_progress + upsert-increment user_daily_stats), safe
// to retry verbatim on double-click/refresh/network-retry because the RPC's
// (user_id, word_id, target_language) uniqueness makes it idempotent — see
// complete_new_word_study's own definition for the transaction itself.
//
// user_id is deliberately not a parameter here or on the RPC: the function
// derives it from auth.uid() server-side, so this client can only ever act
// as the authenticated caller, never on another user's behalf.
//
// The RPC also takes no completion-timestamp parameter: last_practiced_at
// and next_review_at are both derived from the database's own clock
// (v_completed_at := now() inside complete_new_word_study), never from the
// browser. Only p_word_id/p_target_language/p_stat_date are sent — see this
// function's own CompleteNewWordStudyParams above, which has no
// completedAtISO field to accidentally wire up.
export async function completeNewWordStudy(
  params: CompleteNewWordStudyParams,
): Promise<CompleteNewWordStudyResult> {
  const { session, conceptId, targetLanguage, statDateISO } = params;

  if (!session.access_token || !session.user?.id) {
    throw new NewWordStudyPersistenceError("Missing authenticated session.", false);
  }
  if (!conceptId || !targetLanguage || !statDateISO) {
    throw new NewWordStudyPersistenceError("Missing required fields to save this word.", false);
  }

  let rows: CompleteNewWordStudyRpcRow[] | CompleteNewWordStudyRpcRow;
  try {
    rows = await supabaseProgressMutationRequest<CompleteNewWordStudyRpcRow[] | CompleteNewWordStudyRpcRow>(
      session,
      "/rest/v1/rpc/complete_new_word_study",
      {
        p_word_id: conceptId,
        p_target_language: targetLanguage,
        p_stat_date: statDateISO,
      },
    );
  } catch (error) {
    if (error instanceof Error && /jwt|session|unauthorized|401/i.test(error.message)) {
      throw new NewWordStudyPersistenceError("Your session has expired. Please sign in again.", false);
    }
    // Never surface the raw Supabase/PostgreSQL message to the UI — only
    // this safe, generic, retryable-failure copy.
    throw new NewWordStudyPersistenceError(
      "We couldn't save this word. Check your connection and try again.",
      true,
    );
  }

  const row = Array.isArray(rows) ? rows[0] : rows;
  return parseCompleteNewWordStudyRow(row);
}

// ---------------------------------------------------------------------
// Phase 4: Vocabulary page — reads the full set of a user's progress rows
// for one target language, and updates one row's favorite flag. Both stay
// in this module because it already owns every user_word_progress access
// in the app; splitting Vocabulary's reads into a separate file would just
// duplicate the auth-refresh/request plumbing above for no benefit.
// ---------------------------------------------------------------------

const VALID_WORD_STATES = new Set<WordState>(["seen", "learning", "familiar", "strong", "mastered"]);

function isWordState(value: unknown): value is WordState {
  return typeof value === "string" && VALID_WORD_STATES.has(value as WordState);
}

interface UserWordProgressFullRawRow {
  id?: unknown;
  word_id?: unknown;
  word_state?: unknown;
  is_favorite?: unknown;
  last_practiced_at?: unknown;
}

export interface UserWordProgressFullRow {
  id: string;
  wordId: string;
  wordState: WordState;
  isFavorite: boolean;
  lastPracticedAt: string | null;
}

// Read-only: loads every persisted progress row for the Vocabulary page's
// summary counts/tabs/table, scoped to one target language the same way
// readStudiedConceptIds already is (user_id + target_language together,
// never user_id alone) so a different practice language's progress can
// never leak into this one's counts or list.
export async function readUserWordProgress(
  session: StoredSupabaseSession,
  targetLanguage: string,
): Promise<UserWordProgressFullRow[]> {
  const userId = session.user?.id;
  if (!userId || !targetLanguage) {
    return [];
  }

  const rawRows = await supabaseProgressRequest<UserWordProgressFullRawRow[]>(
    session,
    `/rest/v1/user_word_progress?user_id=eq.${encodeURIComponent(userId)}&target_language=eq.${encodeURIComponent(
      targetLanguage,
    )}&select=id,word_id,word_state,is_favorite,last_practiced_at`,
  );

  const rows: UserWordProgressFullRow[] = [];
  for (const raw of rawRows) {
    // Skips a malformed row (missing id/word_id, or an unrecognized
    // word_state) rather than crashing the whole Vocabulary page over one
    // bad row — the schema's own constraints should make this unreachable,
    // but a page that lists dozens of rows must stay resilient regardless.
    if (typeof raw.id !== "string" || typeof raw.word_id !== "string" || !isWordState(raw.word_state)) {
      continue;
    }

    rows.push({
      id: raw.id,
      wordId: raw.word_id,
      wordState: raw.word_state,
      isFavorite: Boolean(raw.is_favorite),
      lastPracticedAt: typeof raw.last_practiced_at === "string" ? raw.last_practiced_at : null,
    });
  }

  return rows;
}

// User-safe wrapper — never exposes a raw Supabase/PostgreSQL error to the
// Favorite button's UI, matching NewWordStudyPersistenceError's precedent.
export class VocabularyFavoriteUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VocabularyFavoriteUpdateError";
  }
}

// Updates exactly one row's is_favorite flag, scoped by both the row's own
// id AND the authenticated user's id. RLS is expected to already restrict
// updates to the caller's own rows; filtering by user_id here too is
// defense in depth — if RLS were ever misconfigured, this still can't touch
// another user's row (the request would just match zero rows instead).
export async function updateWordProgressFavorite(
  session: StoredSupabaseSession,
  progressRowId: string,
  isFavorite: boolean,
): Promise<void> {
  const userId = session.user?.id;
  if (!userId || !progressRowId) {
    throw new VocabularyFavoriteUpdateError("Missing authenticated session or word.");
  }

  try {
    await supabaseProgressMutationRequest<unknown>(
      session,
      `/rest/v1/user_word_progress?id=eq.${encodeURIComponent(progressRowId)}&user_id=eq.${encodeURIComponent(
        userId,
      )}`,
      { is_favorite: isFavorite },
      "PATCH",
    );
  } catch {
    throw new VocabularyFavoriteUpdateError("We couldn't update this favorite. Please try again.");
  }
}

// ---------------------------------------------------------------------
// Daily Streak card — reads the recent user_daily_stats history a streak is
// computed from (see src/data/learning/dailyStreak.ts for the actual
// current/best-streak and current-week math; this function only fetches
// the raw rows).
// ---------------------------------------------------------------------

// Bounds the lookback window instead of an unbounded historical query —
// generous enough to cover a full year of best-streak history without the
// request growing as an account ages.
const DAILY_STREAK_LOOKBACK_DAYS = 400;

export interface DailyStreakStatRow {
  dateISO: string;
  newWordsCompleted: number;
}

interface UserDailyStatsStreakRawRow {
  stat_date?: unknown;
  new_words_completed?: unknown;
}

export async function readDailyStreakStats(
  session: StoredSupabaseSession,
  targetLanguage: string,
  todayISO: string,
): Promise<DailyStreakStatRow[]> {
  const userId = session.user?.id;
  if (!userId || !targetLanguage || !todayISO) {
    return [];
  }

  const sinceDateISO = addDaysISO(todayISO, -DAILY_STREAK_LOOKBACK_DAYS);

  const rawRows = await supabaseProgressRequest<UserDailyStatsStreakRawRow[]>(
    session,
    `/rest/v1/user_daily_stats?user_id=eq.${encodeURIComponent(userId)}&target_language=eq.${encodeURIComponent(
      targetLanguage,
    )}&stat_date=gte.${encodeURIComponent(sinceDateISO)}&select=stat_date,new_words_completed`,
  );

  const rows: DailyStreakStatRow[] = [];
  for (const raw of rawRows) {
    if (typeof raw.stat_date !== "string") {
      continue;
    }
    const rawCount = raw.new_words_completed;
    rows.push({
      dateISO: raw.stat_date,
      newWordsCompleted: typeof rawCount === "number" && Number.isFinite(rawCount) ? rawCount : 0,
    });
  }
  return rows;
}
