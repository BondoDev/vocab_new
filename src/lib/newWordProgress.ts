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
import {
  classifySupabaseError,
  describeSupabaseError,
  type SupabaseErrorCategory,
} from "./supabaseError";
import type { WordState } from "../data/learning/wordReviewSchedule";
import { addDaysISO } from "../data/learning/dailyStreak";
import { isValidWordTimeSeconds } from "../data/learning/activeWordTimer";
export { isValidWordTimeSeconds } from "../data/learning/activeWordTimer";
import { notifyWordProgressChanged } from "./sharedProgressInvalidation";

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
// PostgreSQL error reach the UI. `category` (see src/lib/supabaseError.ts)
// replaces the previous plain `retryable` boolean: the caller picks its
// user-facing message from it (session-expired / temporarily-unavailable /
// this-action-not-permitted / connection-problem / this phase's own
// generic retry copy) instead of a single collapsed retryable/not-retryable
// split.
export class NewWordStudyPersistenceError extends Error {
  readonly category: SupabaseErrorCategory;

  constructor(message: string, category: SupabaseErrorCategory) {
    super(message);
    this.name = "NewWordStudyPersistenceError";
    this.category = category;
  }
}

export interface CompleteNewWordStudyParams {
  session: StoredSupabaseSession;
  // Vocabulary concept id — becomes user_word_progress.word_id.
  conceptId: string;
  targetLanguage: string;
  // Frozen output of an ActiveWordTimer (src/data/learning/activeWordTimer.ts)
  // covering this word's full 3-exercise sequence — never a per-exercise
  // duration. Validated client-side (isValidWordTimeSeconds, re-exported
  // below) before ever reaching the request body; the database independently
  // re-validates the same bounds inside complete_new_word_study and never
  // trusts this value either.
  studyTimeSeconds: number;
}

// Mirrors the RPC's RETURNS TABLE(inserted, already_completed,
// new_words_completed_today) column names exactly (snake_case, as PostgREST
// returns them) before being normalized into CompleteNewWordStudyResult.
interface CompleteNewWordStudyRpcRow {
  inserted?: unknown;
  already_completed?: unknown;
  new_words_completed_today?: unknown;
  stat_date?: unknown;
}

const LEARNING_STAT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseNullableLearningStatDate(
  value: unknown,
  createError: (message: string) => Error,
): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "string" && LEARNING_STAT_DATE_PATTERN.test(value)) {
    return value;
  }
  throw createError("RPC returned a malformed stat_date.");
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
  statDateISO: string | null;
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
    throw new NewWordStudyPersistenceError("complete_new_word_study returned no row.", "unexpected_response");
  }

  const rawCount = row.new_words_completed_today;
  return {
    inserted: Boolean(row.inserted),
    alreadyCompleted: Boolean(row.already_completed),
    newWordsCompletedToday: typeof rawCount === "number" && Number.isFinite(rawCount) ? rawCount : 0,
    statDateISO: parseNullableLearningStatDate(
      row.stat_date,
      (message) => new NewWordStudyPersistenceError(message, "unexpected_response"),
    ),
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
// browser. Exactly three fields are sent — p_word_id/p_target_language/
// p_study_time_seconds — see this function's own
// CompleteNewWordStudyParams above, which has no completedAtISO field to
// accidentally wire up. p_study_time_seconds is the frozen output of an
// ActiveWordTimer covering this word's whole 3-exercise sequence, never a
// per-exercise duration and never a value computed from Date.now() at save
// time.
export async function completeNewWordStudy(
  params: CompleteNewWordStudyParams,
): Promise<CompleteNewWordStudyResult> {
  const { session, conceptId, targetLanguage, studyTimeSeconds } = params;

  if (!session.access_token || !session.user?.id) {
    throw new NewWordStudyPersistenceError("Missing authenticated session.", "unauthenticated");
  }
  if (!conceptId || !targetLanguage) {
    throw new NewWordStudyPersistenceError("Missing required fields to save this word.", "validation");
  }
  // Never sends a negative/decimal/above-cap/missing duration — the RPC
  // (complete_new_word_study(text, text, integer)) independently
  // re-validates the same 0 to 300 bound and never trusts this check alone.
  if (!isValidWordTimeSeconds(studyTimeSeconds)) {
    throw new NewWordStudyPersistenceError("Missing required fields to save this word.", "validation");
  }

  let rows: CompleteNewWordStudyRpcRow[] | CompleteNewWordStudyRpcRow;
  try {
    rows = await supabaseProgressMutationRequest<CompleteNewWordStudyRpcRow[] | CompleteNewWordStudyRpcRow>(
      session,
      "/rest/v1/rpc/complete_new_word_study",
      {
        p_word_id: conceptId,
        p_target_language: targetLanguage,
        p_study_time_seconds: studyTimeSeconds,
      },
    );
  } catch (error) {
    const category = classifySupabaseError(error);
    // Structured, privacy-safe diagnostics logged here (where the raw
    // Supabase/PostgREST error — code/status/details/hint — is still
    // available) rather than at the UI layer, which only ever sees the
    // generic message below. See src/lib/supabaseError.ts's own header for
    // what this deliberately excludes (tokens, session objects, email).
    console.warn("newWordProgress: completeNewWordStudy failed.", describeSupabaseError("completeNewWordStudy", error));

    if (category === "unauthenticated") {
      throw new NewWordStudyPersistenceError("Your session has expired. Please sign in again.", category);
    }
    // Never surface the raw Supabase/PostgreSQL message to the UI — only
    // this safe, generic, retry copy. The caller picks a more specific
    // safe message for forbidden/missing_rpc/network via `category`
    // instead (see NewWordStudySession.tsx).
    throw new NewWordStudyPersistenceError(
      "We couldn't save this word. Check your connection and try again.",
      category,
    );
  }

  const row = Array.isArray(rows) ? rows[0] : rows;
  const result = parseCompleteNewWordStudyRow(row);
  // This write is the only path that inserts a user_word_progress row —
  // the profile dashboard's shared active-language rows (see
  // sharedProgressInvalidation.ts's own header) may now be stale.
  notifyWordProgressChanged();
  return result;
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
  created_at?: unknown;
  first_studied_stat_date?: unknown;
}

export interface UserWordProgressFullRow {
  id: string;
  wordId: string;
  wordState: WordState;
  isFavorite: boolean;
  lastPracticedAt: string | null;
  // Added for Vocabulary Growth's history reconstruction (see
  // src/data/learning/vocabularyGrowth.ts). createdAt is the table's own
  // NOT NULL created_at; null here only if a response row is somehow
  // malformed. firstStudiedStatDate is the server-derived learning date
  // (nullable — legacy rows written before
  // 20260806150000_add_server_derived_learning_dates.sql have none); pass
  // both to resolveWordCreatedDateISO rather than assuming either alone.
  createdAt: string | null;
  firstStudiedStatDate: string | null;
}

// Read-only: loads every persisted progress row for the Vocabulary page's
// summary counts/tabs/table (and, via the two extra columns above,
// Vocabulary Growth's word-creation dates — see
// loadVocabularyGrowthHistory.ts), scoped to one target language the same
// way readStudiedConceptIds already is (user_id + target_language
// together, never user_id alone) so a different practice language's
// progress can never leak into this one's counts or list.
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
    )}&select=id,word_id,word_state,is_favorite,last_practiced_at,created_at,first_studied_stat_date`,
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
      createdAt: typeof raw.created_at === "string" ? raw.created_at : null,
      firstStudiedStatDate: typeof raw.first_studied_stat_date === "string" ? raw.first_studied_stat_date : null,
    });
  }

  return rows;
}

// User-safe wrapper — never exposes a raw Supabase/PostgreSQL error to the
// Favorite button's UI, matching NewWordStudyPersistenceError's precedent.
// `category` (see src/lib/supabaseError.ts) lets the caller pick a
// session-expired / not-permitted / temporarily-unavailable / connection-
// problem message instead of always showing the same generic copy.
export class VocabularyFavoriteUpdateError extends Error {
  readonly category: SupabaseErrorCategory;

  constructor(message: string, category: SupabaseErrorCategory) {
    super(message);
    this.name = "VocabularyFavoriteUpdateError";
    this.category = category;
  }
}

// Mirrors the RPC's RETURNS TABLE(word_progress_id, is_favorite) column
// names exactly (snake_case, as PostgREST returns them).
interface SetWordProgressFavoriteRpcRow {
  word_progress_id?: unknown;
  is_favorite?: unknown;
}

// Updates exactly one row's is_favorite flag via the set_word_progress_favorite
// RPC — never a direct PATCH to user_word_progress (that table only grants
// authenticated clients SELECT; every protected write, including this one,
// goes through a SECURITY DEFINER RPC). The RPC derives the caller from
// auth.uid() server-side and scopes its update by both the row's own id and
// that caller id, so this client can only ever act as the authenticated
// user, never on another user's row or any other column.
export async function updateWordProgressFavorite(
  session: StoredSupabaseSession,
  progressRowId: string,
  isFavorite: boolean,
): Promise<void> {
  const userId = session.user?.id;
  if (!userId) {
    throw new VocabularyFavoriteUpdateError("Missing authenticated session or word.", "unauthenticated");
  }
  if (!progressRowId) {
    throw new VocabularyFavoriteUpdateError("Missing authenticated session or word.", "validation");
  }

  let rows: SetWordProgressFavoriteRpcRow[] | SetWordProgressFavoriteRpcRow;
  try {
    rows = await supabaseProgressMutationRequest<SetWordProgressFavoriteRpcRow[] | SetWordProgressFavoriteRpcRow>(
      session,
      "/rest/v1/rpc/set_word_progress_favorite",
      {
        p_word_progress_id: progressRowId,
        p_is_favorite: isFavorite,
      },
    );
  } catch (error) {
    const category = classifySupabaseError(error);
    // See completeNewWordStudy's own catch above for why this logs here
    // (full structured diagnostics) rather than at the UI layer.
    console.warn("newWordProgress: updateWordProgressFavorite failed.", describeSupabaseError("updateWordProgressFavorite", error));

    if (category === "unauthenticated") {
      throw new VocabularyFavoriteUpdateError("Your session has expired. Please sign in again.", category);
    }
    // Never surface the raw Supabase/PostgreSQL message to the UI — only
    // this safe, generic failure copy, matching completeNewWordStudy /
    // completeWordReview's precedent above. VocabularySection.tsx picks a
    // more specific safe message for forbidden/missing_rpc/network via
    // `category` instead.
    throw new VocabularyFavoriteUpdateError("We couldn't update this favorite. Please try again.", category);
  }

  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || typeof row.word_progress_id !== "string" || typeof row.is_favorite !== "boolean") {
    throw new VocabularyFavoriteUpdateError("set_word_progress_favorite returned a malformed row.", "unexpected_response");
  }
}

// ---------------------------------------------------------------------
// Review Words Phase 1 — read-only progress load feeding the pure hybrid
// review-queue engine (src/data/learning/reviewQueue.ts). Selects the extra
// scheduling columns (correct_streak, next_review_at, created_at) that
// readUserWordProgress's Vocabulary-page read above doesn't need, scoped by
// the same user_id + target_language isolation as every other read in this
// module — a German progress row can never enter a Spanish review queue.
// ---------------------------------------------------------------------

interface UserWordProgressReviewRawRow {
  id?: unknown;
  word_id?: unknown;
  word_state?: unknown;
  correct_streak?: unknown;
  last_practiced_at?: unknown;
  next_review_at?: unknown;
  created_at?: unknown;
}

export interface UserWordProgressReviewRow {
  id: string;
  wordId: string;
  wordState: WordState;
  correctStreak: number;
  lastPracticedAt: string | null;
  nextReviewAt: string | null;
  createdAt: string | null;
}

// Read-only: no insert/update/upsert/RPC call anywhere in this function —
// Review Words Phase 1 must never write to user_word_progress.
export async function readUserWordProgressForReview(
  session: StoredSupabaseSession,
  targetLanguage: string,
): Promise<UserWordProgressReviewRow[]> {
  const userId = session.user?.id;
  if (!userId || !targetLanguage) {
    return [];
  }

  const rawRows = await supabaseProgressRequest<UserWordProgressReviewRawRow[]>(
    session,
    `/rest/v1/user_word_progress?user_id=eq.${encodeURIComponent(userId)}&target_language=eq.${encodeURIComponent(
      targetLanguage,
    )}&select=id,word_id,word_state,correct_streak,last_practiced_at,next_review_at,created_at`,
  );

  const rows: UserWordProgressReviewRow[] = [];
  for (const raw of rawRows) {
    // Skips a malformed row rather than crashing queue selection over one
    // bad row — matching readUserWordProgress's own precedent above.
    if (typeof raw.id !== "string" || typeof raw.word_id !== "string" || !isWordState(raw.word_state)) {
      continue;
    }

    const correctStreakRaw = raw.correct_streak;
    rows.push({
      id: raw.id,
      wordId: raw.word_id,
      wordState: raw.word_state,
      correctStreak: typeof correctStreakRaw === "number" && Number.isFinite(correctStreakRaw) ? correctStreakRaw : 0,
      lastPracticedAt: typeof raw.last_practiced_at === "string" ? raw.last_practiced_at : null,
      nextReviewAt: typeof raw.next_review_at === "string" ? raw.next_review_at : null,
      createdAt: typeof raw.created_at === "string" ? raw.created_at : null,
    });
  }

  return rows;
}

// ---------------------------------------------------------------------
// Review Words Phase 3 — persists exactly one individual word-review
// outcome via the complete_word_review RPC. Mirrors completeNewWordStudy's
// shape and safety properties (single atomic call, idempotent by design,
// never sends a client-computed timestamp/state/streak — see that
// function's own header for the same reasoning). The RPC derives the
// user from auth.uid(), locks the owned progress row, and recalculates the
// resulting state/streak/deadline entirely server-side; this client only
// supplies the four inputs the RPC actually needs.
// ---------------------------------------------------------------------

export type ReviewResult = "correct" | "incorrect" | "skipped";

// Thrown by completeWordReview instead of letting a raw Supabase/PostgreSQL
// error reach the UI — same precedent as NewWordStudyPersistenceError,
// including `category` (see src/lib/supabaseError.ts) in place of the
// previous plain `retryable` boolean.
export class ReviewPersistenceError extends Error {
  readonly category: SupabaseErrorCategory;

  constructor(message: string, category: SupabaseErrorCategory) {
    super(message);
    this.name = "ReviewPersistenceError";
    this.category = category;
  }
}

export interface CompleteWordReviewParams {
  session: StoredSupabaseSession;
  // Stable per-word-encounter id generated once when the review session
  // plan is built (see reviewSessionPlan.ts) and reused verbatim across
  // network/auth/component retries — never regenerated per attempt. This is
  // what makes the RPC call idempotent.
  eventId: string;
  // The user_word_progress row id this encounter is for (from the already-
  // prepared review queue — never a concept/word id).
  wordProgressId: string;
  result: ReviewResult;
  // Frozen output of an ActiveWordTimer covering this word's single review
  // exercise (word_exercise -> WORD_OUTCOME_DETERMINED) — never a group
  // exercise's shared duration. Validated client-side via
  // isValidWordTimeSeconds before ever reaching the request body; the RPC
  // independently re-validates the same 0 to 300 bound.
  reviewTimeSeconds: number;
}

// Mirrors the RPC's RETURNS TABLE column names exactly (snake_case, as
// PostgREST returns them) before normalization into CompleteWordReviewResult.
interface CompleteWordReviewRpcRow {
  already_processed?: unknown;
  previous_state?: unknown;
  new_state?: unknown;
  previous_correct_streak?: unknown;
  new_correct_streak?: unknown;
  promoted?: unknown;
  demoted?: unknown;
  result?: unknown;
  reviews_completed_today?: unknown;
  last_practiced_at?: unknown;
  next_review_at?: unknown;
  stat_date?: unknown;
}

export interface CompleteWordReviewResult {
  alreadyProcessed: boolean;
  previousState: WordState;
  newState: WordState;
  previousCorrectStreak: number;
  newCorrectStreak: number;
  promoted: boolean;
  demoted: boolean;
  result: ReviewResult;
  reviewsCompletedToday: number;
  lastPracticedAt: string;
  nextReviewAt: string;
  statDateISO: string | null;
}

function parseCompleteWordReviewRow(row: CompleteWordReviewRpcRow | undefined): CompleteWordReviewResult {
  if (!row) {
    throw new ReviewPersistenceError("complete_word_review returned no row.", "unexpected_response");
  }

  if (
    !isWordState(row.previous_state) ||
    !isWordState(row.new_state) ||
    typeof row.result !== "string" ||
    !["correct", "incorrect", "skipped"].includes(row.result) ||
    typeof row.last_practiced_at !== "string" ||
    typeof row.next_review_at !== "string"
  ) {
    throw new ReviewPersistenceError("complete_word_review returned a malformed row.", "unexpected_response");
  }

  const previousCorrectStreak = row.previous_correct_streak;
  const newCorrectStreak = row.new_correct_streak;
  const reviewsCompletedToday = row.reviews_completed_today;

  return {
    alreadyProcessed: Boolean(row.already_processed),
    previousState: row.previous_state,
    newState: row.new_state,
    previousCorrectStreak:
      typeof previousCorrectStreak === "number" && Number.isFinite(previousCorrectStreak) ? previousCorrectStreak : 0,
    newCorrectStreak: typeof newCorrectStreak === "number" && Number.isFinite(newCorrectStreak) ? newCorrectStreak : 0,
    promoted: Boolean(row.promoted),
    demoted: Boolean(row.demoted),
    result: row.result as ReviewResult,
    reviewsCompletedToday:
      typeof reviewsCompletedToday === "number" && Number.isFinite(reviewsCompletedToday) ? reviewsCompletedToday : 0,
    lastPracticedAt: row.last_practiced_at,
    nextReviewAt: row.next_review_at,
    statDateISO: parseNullableLearningStatDate(
      row.stat_date,
      (message) => new ReviewPersistenceError(message, "unexpected_response"),
    ),
  };
}

// Persists exactly one review encounter: one call, one atomic RPC
// transaction (verify ownership + lock the row, apply the state/streak
// transition, recalculate the deadline, upsert-increment
// user_daily_stats.reviews_completed, record the review event). Safe to
// retry verbatim (same eventId) on double-click/network-retry/component
// retry — the RPC's review_events primary key makes it idempotent: a
// retried event id returns the originally-applied transition without
// touching user_word_progress or user_daily_stats again.
//
// user_id is deliberately not a parameter here or on the RPC (derived from
// auth.uid() server-side), and neither is previous state/streak/next
// state/a completion timestamp — the RPC always recomputes those from the
// locked database row, never trusts them from the client. See this
// function's CompleteWordReviewParams above, which has no fields for any
// of that. p_review_time_seconds is the one new field: the frozen output of
// an ActiveWordTimer covering this word's single review exercise, added to
// review_time_seconds only — study_time_seconds is never touched by this
// call.
//
// Idempotency/conflict note: a *retried* eventId is not an error case at
// all — the RPC itself detects it (review_events' primary key) and returns
// a normal success row with already_processed: true, which this function
// returns like any other result (see parseCompleteWordReviewRow above).
// A genuine "conflict" classification below (an unexpected duplicate-key
// failure this RPC's own idempotency contract does not explain) is
// therefore never treated as success — it falls through to the same
// generic retry message as any other unclassified failure, exactly like
// before this refactor.
export async function completeWordReview(params: CompleteWordReviewParams): Promise<CompleteWordReviewResult> {
  const { session, eventId, wordProgressId, result, reviewTimeSeconds } = params;

  if (!session.access_token || !session.user?.id) {
    throw new ReviewPersistenceError("Missing authenticated session.", "unauthenticated");
  }
  if (!eventId || !wordProgressId || !result) {
    throw new ReviewPersistenceError("Missing required fields to save this review.", "validation");
  }
  // Never sends a negative/decimal/above-cap/missing duration — the RPC
  // (complete_word_review(uuid, uuid, text, integer)) independently
  // re-validates the same 0 to 300 bound and never trusts this check alone.
  if (!isValidWordTimeSeconds(reviewTimeSeconds)) {
    throw new ReviewPersistenceError("Missing required fields to save this review.", "validation");
  }

  let rows: CompleteWordReviewRpcRow[] | CompleteWordReviewRpcRow;
  try {
    rows = await supabaseProgressMutationRequest<CompleteWordReviewRpcRow[] | CompleteWordReviewRpcRow>(
      session,
      "/rest/v1/rpc/complete_word_review",
      {
        p_event_id: eventId,
        p_word_progress_id: wordProgressId,
        p_result: result,
        p_review_time_seconds: reviewTimeSeconds,
      },
    );
  } catch (error) {
    const category = classifySupabaseError(error);
    // See completeNewWordStudy's own catch above for why this logs here
    // (full structured diagnostics) rather than at the UI layer.
    console.warn("newWordProgress: completeWordReview failed.", describeSupabaseError("completeWordReview", error));

    if (category === "unauthenticated") {
      throw new ReviewPersistenceError("Your session has expired. Please sign in again.", category);
    }
    // Never surface the raw Supabase/PostgreSQL message to the UI — only
    // this safe, generic, retry copy. The caller picks a more specific
    // safe message for forbidden/missing_rpc/network via `category`
    // instead (see ReviewSession.tsx).
    throw new ReviewPersistenceError("We couldn't save this review. Check your connection and try again.", category);
  }

  const row = Array.isArray(rows) ? rows[0] : rows;
  const parsedResult = parseCompleteWordReviewRow(row);
  // This write is the only path that transitions an existing
  // user_word_progress row's word_state — see sharedProgressInvalidation.ts's
  // own header for what subscribing to this signal does and doesn't affect.
  notifyWordProgressChanged();
  return parsedResult;
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

// dailyGoal is this row's own Streak Phase 1 snapshot (see
// supabase/migrations/20260806190000_add_daily_goal_snapshot_and_update_rpc.sql)
// — null for any row written before that migration, or (in principle) a
// row whose value column genuinely came back null. src/data/learning/
// dailyStreak.ts falls back to the current profile goal only when this is
// null; a stored value always wins, frozen to whatever goal was active the
// day the row was created.
export interface DailyStreakStatRow {
  dateISO: string;
  newWordsCompleted: number;
  dailyGoal: number | null;
}

interface UserDailyStatsStreakRawRow {
  stat_date?: unknown;
  new_words_completed?: unknown;
  daily_goal?: unknown;
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
    )}&stat_date=gte.${encodeURIComponent(sinceDateISO)}&select=stat_date,new_words_completed,daily_goal`,
  );

  const rows: DailyStreakStatRow[] = [];
  for (const raw of rawRows) {
    if (typeof raw.stat_date !== "string") {
      continue;
    }

    const rawGoal = raw.daily_goal;
    let dailyGoal: number | null;
    if (rawGoal === null || rawGoal === undefined) {
      dailyGoal = null;
    } else if (typeof rawGoal === "number" && Number.isFinite(rawGoal)) {
      dailyGoal = rawGoal;
    } else {
      // Malformed non-null daily_goal — skip the whole row rather than
      // silently guessing a fallback for a value the schema's own CHECK
      // constraint should make unreachable.
      continue;
    }

    const rawCount = raw.new_words_completed;
    rows.push({
      dateISO: raw.stat_date,
      newWordsCompleted: typeof rawCount === "number" && Number.isFinite(rawCount) ? rawCount : 0,
      dailyGoal,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------
// Milestones (Phase 1) — reads every user_daily_stats row for one target
// language, unbounded. Unlike readDailyStreakStats's 400-day lookback
// (which only needs to support a *displayed* best-streak window), the
// Milestones Reviews track needs a true lifetime sum of reviews_completed,
// so this cannot apply the same bound. user_daily_stats has at most one row
// per calendar day per user/language, so even several years of history is
// a small request. Also feeds the Consistency track's current-streak
// computation (src/data/learning/milestoneStreak.ts) via the same rows —
// one request serves both tracks, per the "load once, evaluate all tracks
// locally" requirement.
// ---------------------------------------------------------------------

export interface MilestoneDailyStatRow {
  dateISO: string;
  newWordsCompleted: number;
  reviewsCompleted: number;
}

interface UserDailyStatsMilestoneRawRow {
  stat_date?: unknown;
  new_words_completed?: unknown;
  reviews_completed?: unknown;
}

export async function readMilestoneDailyStats(
  session: StoredSupabaseSession,
  targetLanguage: string,
): Promise<MilestoneDailyStatRow[]> {
  const userId = session.user?.id;
  if (!userId || !targetLanguage) {
    return [];
  }

  const rawRows = await supabaseProgressRequest<UserDailyStatsMilestoneRawRow[]>(
    session,
    `/rest/v1/user_daily_stats?user_id=eq.${encodeURIComponent(userId)}&target_language=eq.${encodeURIComponent(
      targetLanguage,
    )}&select=stat_date,new_words_completed,reviews_completed`,
  );

  const rows: MilestoneDailyStatRow[] = [];
  for (const raw of rawRows) {
    if (typeof raw.stat_date !== "string") {
      continue;
    }

    const rawNewWords = raw.new_words_completed;
    const rawReviews = raw.reviews_completed;
    rows.push({
      dateISO: raw.stat_date,
      newWordsCompleted: typeof rawNewWords === "number" && Number.isFinite(rawNewWords) ? rawNewWords : 0,
      reviewsCompleted: typeof rawReviews === "number" && Number.isFinite(rawReviews) ? rawReviews : 0,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------
// Vocabulary Growth — reads the caller's own review_events state
// transitions via the narrow read_vocabulary_growth_events RPC (see
// supabase/migrations/20260808130000_add_vocabulary_growth_events_rpc.sql).
// review_events itself stays exactly as locked down as before (RLS
// enabled, zero policies, no anon/authenticated table grant) — this goes
// through the RPC, not a direct table read, the same way every write in
// this file already goes through complete_new_word_study/
// complete_word_review rather than a direct INSERT/UPDATE.
// ---------------------------------------------------------------------

export interface VocabularyGrowthEventRow {
  wordProgressId: string;
  previousState: WordState;
  newState: WordState;
  // Already resolved server-side by the RPC (stat_date, falling back to a
  // UTC slice of last_practiced_at for legacy pre-stat_date rows) — see
  // that migration's own header. Feed straight into
  // src/data/learning/vocabularyGrowth.ts's VocabularyGrowthEventInput.eventDateISO.
  eventDateISO: string;
}

interface VocabularyGrowthEventRawRow {
  word_progress_id?: unknown;
  previous_state?: unknown;
  new_state?: unknown;
  event_date?: unknown;
}

export async function readVocabularyGrowthEvents(
  session: StoredSupabaseSession,
  targetLanguage: string,
): Promise<VocabularyGrowthEventRow[]> {
  if (!session.user?.id || !targetLanguage) {
    return [];
  }

  let rawRows: VocabularyGrowthEventRawRow[];
  try {
    rawRows = await supabaseProgressMutationRequest<VocabularyGrowthEventRawRow[]>(
      session,
      "/rest/v1/rpc/read_vocabulary_growth_events",
      { p_target_language: targetLanguage },
    );
  } catch (error) {
    // Read-only load, same "log full diagnostics, let the caller decide
    // the user-facing message" contract as readDailyStreakStats/
    // readMilestoneDailyStats — never a write, so nothing to roll back.
    console.warn(
      "newWordProgress: readVocabularyGrowthEvents failed.",
      describeSupabaseError("readVocabularyGrowthEvents", error),
    );
    throw error;
  }

  const rows: VocabularyGrowthEventRow[] = [];
  for (const raw of rawRows) {
    if (
      typeof raw.word_progress_id !== "string" ||
      !isWordState(raw.previous_state) ||
      !isWordState(raw.new_state) ||
      typeof raw.event_date !== "string"
    ) {
      // Skips a malformed row rather than crashing the whole chart over
      // one bad event — the RPC's own column types/constraints should
      // make this unreachable, but stays defensive regardless (same
      // precedent as readUserWordProgress above).
      continue;
    }

    rows.push({
      wordProgressId: raw.word_progress_id,
      previousState: raw.previous_state,
      newState: raw.new_state,
      eventDateISO: raw.event_date,
    });
  }

  return rows;
}
