// Strict response parser for the reset_learning_language_progress RPC — same
// one-file-per-RPC precedent as userProfileLanguages.ts/dailyGoalUpdate.ts/
// userProfileTimezone.ts. See
// supabase/migrations/20260808120000_add_learning_language_progress_reset_rpc.sql
// for the function's own full audit.
//
// ACTIVATED (Settings backend follow-up,
// supabase/migrations/20260812130000_activate_learning_progress_reset_rpc.sql)
// and CORRECTED (supabase/migrations/20260813120000_fix_learning_progress_
// reset_column_ambiguity.sql, which fixed a live Postgres 42702 "ambiguous
// column reference" bug in the function body — see that migration's own
// header): `authenticated` holds EXECUTE on this function and it is
// confirmed working end-to-end. This parser's caller
// (resetLearningLanguageProgress in userProfile.ts) is the real, live
// Settings "Reset language progress" write path.
//
// Imported with an explicit .ts extension, matching every sibling parser
// file, so it stays loadable directly via Node's native TypeScript stripping
// for scripts/tests/account/test-learning-progress-reset-response.mjs.
import { ClassifiedSupabaseError } from "./supabaseError.ts";
import { requireLanguageCode, type SupportedLanguageCode } from "./userProfileOnboarding.ts";

interface ResetLearningLanguageProgressRpcRow {
  reset?: unknown;
  target_language?: unknown;
  word_progress_deleted?: unknown;
  daily_stats_deleted?: unknown;
  review_events_deleted?: unknown;
  custom_practice_events_deleted?: unknown;
}

export interface ResetLearningLanguageProgressResult {
  reset: boolean;
  targetLanguage: SupportedLanguageCode;
  wordProgressDeleted: number;
  dailyStatsDeleted: number;
  reviewEventsDeleted: number;
  customPracticeEventsDeleted: number;
}

const RPC_NAME = "reset_learning_language_progress";

function requireNonNegativeInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ClassifiedSupabaseError(
      `${RPC_NAME} returned a malformed row: ${fieldName} must be a non-negative integer.`,
      "unexpected_response",
    );
  }
  return value;
}

export function parseResetLearningLanguageProgressRow(row: unknown): ResetLearningLanguageProgressResult {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new ClassifiedSupabaseError(`${RPC_NAME} returned a malformed row.`, "unexpected_response");
  }

  const rpcRow = row as ResetLearningLanguageProgressRpcRow;

  if (typeof rpcRow.reset !== "boolean") {
    throw new ClassifiedSupabaseError(
      `${RPC_NAME} returned a malformed row: reset must be a boolean.`,
      "unexpected_response",
    );
  }

  return {
    reset: rpcRow.reset,
    targetLanguage: requireLanguageCode(rpcRow.target_language, "target_language", RPC_NAME),
    wordProgressDeleted: requireNonNegativeInteger(rpcRow.word_progress_deleted, "word_progress_deleted"),
    dailyStatsDeleted: requireNonNegativeInteger(rpcRow.daily_stats_deleted, "daily_stats_deleted"),
    reviewEventsDeleted: requireNonNegativeInteger(rpcRow.review_events_deleted, "review_events_deleted"),
    customPracticeEventsDeleted: requireNonNegativeInteger(
      rpcRow.custom_practice_events_deleted,
      "custom_practice_events_deleted",
    ),
  };
}
