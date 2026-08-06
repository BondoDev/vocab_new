// Supabase access for Custom Practice's active-time tracking. Custom
// Practice (src/features/practice/VocabularyPractice.tsx) previously wrote
// nothing to Supabase at all — this module adds exactly one narrow write
// path: complete_custom_practice_word, which records one completed
// single-word exercise's active duration and nothing else. It deliberately
// never touches user_word_progress, never creates a review_events row,
// never increments new_words_completed/reviews_completed — Custom Practice
// stays fully independent of spaced-repetition state (see
// supabase/migrations/20260805190000_add_learning_mode_time_tracking.sql's
// header for the full design rationale, including why review_events isn't
// reused for this).
//
// Same refresh-then-retry-once request shape as src/lib/newWordProgress.ts —
// duplicated rather than imported because that module's helpers aren't
// exported (see its own header comment for the same precedent), and this
// module intentionally stays the only place that knows about
// custom_practice_events.
import {
  ensureFreshSupabaseSession,
  getAuthHeaders,
  refreshSupabaseSession,
  supabaseRequest,
  type StoredSupabaseSession,
} from "./supabaseAuth";
import { classifySupabaseError, describeSupabaseError, type SupabaseErrorCategory } from "./supabaseError";
import { isValidWordTimeSeconds } from "../data/learning/activeWordTimer";

function getAuthorizedHeaders(session: StoredSupabaseSession) {
  return {
    ...getAuthHeaders(),
    Authorization: `Bearer ${session.access_token}`,
  };
}

async function supabaseCustomPracticeMutationRequest<TResponse>(
  session: StoredSupabaseSession,
  path: string,
  body: unknown,
): Promise<TResponse> {
  const freshSession = await ensureFreshSupabaseSession(session);
  const requestInit: RequestInit = {
    method: "POST",
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

// Thrown by completeCustomPracticeWord instead of letting a raw Supabase/
// PostgreSQL error reach the UI — same precedent as
// NewWordStudyPersistenceError/ReviewPersistenceError, including `category`
// (see src/lib/supabaseError.ts).
export class CustomPracticePersistenceError extends Error {
  readonly category: SupabaseErrorCategory;

  constructor(message: string, category: SupabaseErrorCategory) {
    super(message);
    this.name = "CustomPracticePersistenceError";
    this.category = category;
  }
}

export interface CompleteCustomPracticeWordParams {
  session: StoredSupabaseSession;
  // Fresh per-word-exercise-encounter id, minted once when the exercise
  // becomes current and reused verbatim across every retry of this same
  // encounter — never regenerated per attempt (mirrors reviewSessionPlan.ts's
  // eventId precedent). A forced-repeat re-showing of the same concept later
  // is a separate encounter with its own fresh event id.
  eventId: string;
  targetLanguage: string;
  // Frozen output of an ActiveWordTimer covering exactly one single-word
  // exercise (brokenWord/halfWritten/wordTyping) — never a four-word group
  // exercise's duration (connectWords/listening are excluded from
  // persisted time in this phase — see this module's header). Validated
  // client-side via isValidWordTimeSeconds before ever reaching the request
  // body; the RPC independently re-validates the same 0-300 bound.
  customPracticeTimeSeconds: number;
}

// Mirrors the RPC's RETURNS TABLE(already_processed,
// custom_practice_time_seconds_today) column names exactly (snake_case, as
// PostgREST returns them).
interface CompleteCustomPracticeWordRpcRow {
  already_processed?: unknown;
  custom_practice_time_seconds_today?: unknown;
  stat_date?: unknown;
}

const LEARNING_STAT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface CompleteCustomPracticeWordResult {
  // True only on an idempotent retry of an event id already processed —
  // mirrors complete_word_review's already_processed contract.
  alreadyProcessed: boolean;
  customPracticeTimeSecondsToday: number;
  statDateISO: string | null;
}

function parseCompleteCustomPracticeWordRow(
  row: CompleteCustomPracticeWordRpcRow | undefined,
): CompleteCustomPracticeWordResult {
  if (!row) {
    throw new CustomPracticePersistenceError("complete_custom_practice_word returned no row.", "unexpected_response");
  }

  const rawTimeToday = row.custom_practice_time_seconds_today;
  const statDate = row.stat_date;
  if (statDate != null && (typeof statDate !== "string" || !LEARNING_STAT_DATE_PATTERN.test(statDate))) {
    throw new CustomPracticePersistenceError("RPC returned a malformed stat_date.", "unexpected_response");
  }

  return {
    alreadyProcessed: Boolean(row.already_processed),
    customPracticeTimeSecondsToday:
      typeof rawTimeToday === "number" && Number.isFinite(rawTimeToday) ? rawTimeToday : 0,
    statDateISO: typeof statDate === "string" ? statDate : null,
  };
}

// Persists exactly one completed single-word Custom Practice exercise: one
// call, one atomic RPC transaction (insert the idempotency ledger row +
// upsert-increment user_daily_stats.custom_practice_time_seconds only).
// Safe to retry verbatim (same eventId) — the RPC's custom_practice_events
// primary key makes it idempotent, exactly like complete_word_review's
// review_events primary key.
//
// user_id is deliberately not a parameter here or on the RPC (derived from
// auth.uid() server-side). No word/concept id, no exercise type, no
// correctness/reveal/skip outcome is sent — per the product requirement,
// this call must never influence or even describe spaced-repetition state,
// only record that active time was spent.
export async function completeCustomPracticeWord(
  params: CompleteCustomPracticeWordParams,
): Promise<CompleteCustomPracticeWordResult> {
  const { session, eventId, targetLanguage, customPracticeTimeSeconds } = params;

  if (!session.access_token || !session.user?.id) {
    throw new CustomPracticePersistenceError("Missing authenticated session.", "unauthenticated");
  }
  if (!eventId || !targetLanguage) {
    throw new CustomPracticePersistenceError("Missing required fields to save this practice time.", "validation");
  }
  // Never sends a negative/decimal/above-cap/missing duration — the RPC
  // (complete_custom_practice_word(uuid, text, integer))
  // independently re-validates the same 0-300 bound and never trusts this
  // check alone.
  if (!isValidWordTimeSeconds(customPracticeTimeSeconds)) {
    throw new CustomPracticePersistenceError("Missing required fields to save this practice time.", "validation");
  }

  let rows: CompleteCustomPracticeWordRpcRow[] | CompleteCustomPracticeWordRpcRow;
  try {
    rows = await supabaseCustomPracticeMutationRequest<
      CompleteCustomPracticeWordRpcRow[] | CompleteCustomPracticeWordRpcRow
    >(session, "/rest/v1/rpc/complete_custom_practice_word", {
      p_event_id: eventId,
      p_target_language: targetLanguage,
      p_custom_practice_time_seconds: customPracticeTimeSeconds,
    });
  } catch (error) {
    const category = classifySupabaseError(error);
    // Structured, privacy-safe diagnostics logged here — same precedent as
    // completeNewWordStudy/completeWordReview's own catches
    // (src/lib/newWordProgress.ts).
    console.warn(
      "customPracticeProgress: completeCustomPracticeWord failed.",
      describeSupabaseError("completeCustomPracticeWord", error),
    );

    if (category === "unauthenticated") {
      throw new CustomPracticePersistenceError("Your session has expired. Please sign in again.", category);
    }
    // Never surface the raw Supabase/PostgreSQL message to the UI — only
    // this safe, generic, retry copy, matching the other two modes'
    // precedent.
    throw new CustomPracticePersistenceError(
      "We couldn't save your practice time. Check your connection and try again.",
      category,
    );
  }

  const row = Array.isArray(rows) ? rows[0] : rows;
  return parseCompleteCustomPracticeWordRow(row);
}
