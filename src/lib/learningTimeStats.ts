// Pure read-side helper for the four active-time columns on
// public.user_daily_stats (new_word_study_time_seconds, review_time_seconds,
// custom_practice_time_seconds, study_time_seconds — see
// supabase/migrations/20260805190000_add_learning_mode_time_tracking.sql and
// supabase/migrations/20260811120000_add_new_word_study_time_and_repurpose_total.sql).
// No React, no Supabase — a plain data-shaping module, loadable directly via
// `node --experimental-strip-types` for
// scripts/tests/lib/test-learning-time-stats.mjs, matching every other pure
// module in src/data/learning/.
//
// STUDY ACTIVITY PHASE 1 NAMING NOTE — study_time_seconds is, as of
// 20260811120000, the server-maintained per-day TOTAL across all three
// modes (new_word_study_time_seconds + review_time_seconds +
// custom_practice_time_seconds), never a mode on its own. This module still
// derives totalTimeSeconds by summing the three mode fields rather than
// trusting the raw study_time_seconds passthrough — the same "never trust a
// stored total" precedent this module has always followed, now provably
// correct by construction via the RPCs' own atomic invariant rather than
// merely assumed.
//
// The Dashboard's Study Activity card (src/features/user-profile/sections/
// dashboard/StudyActivityCard.tsx) is this module's first real UI consumer.

export interface LearningModeTimeSeconds {
  newWordStudyTimeSeconds: number;
  reviewTimeSeconds: number;
  customPracticeTimeSeconds: number;
}

export interface LearningModeTimeTotals extends LearningModeTimeSeconds {
  totalTimeSeconds: number;
}

// Raw shape the three mode columns take over the wire (PostgREST/RPC
// responses — snake_case, possibly absent on a row selected before this
// column existed, possibly null, possibly a non-finite/string value from a
// malformed response). Every field is `unknown` on purpose — this module
// never trusts the network shape.
export interface RawLearningModeTimeRow {
  new_word_study_time_seconds?: unknown;
  review_time_seconds?: unknown;
  custom_practice_time_seconds?: unknown;
}

// 0 is the safe fallback for a missing/null/non-numeric/negative value —
// covers both "column didn't exist yet on an old row" and "response was
// malformed" without ever producing a negative or NaN contribution to the
// total. Negative raw values are also floored to 0 here rather than passed
// through: the database's own non-negative CHECK constraints should make a
// negative value unreachable, but this parser doesn't depend on that being
// true to stay safe.
function parseSafeNonNegativeSeconds(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

// Parses one user_daily_stats row's three raw mode-time columns into a
// safe, fully-defaulted shape. Never throws — a malformed/missing field
// always resolves to 0 rather than propagating an error into a statistics
// display.
export function parseLearningModeTimeRow(row: RawLearningModeTimeRow | null | undefined): LearningModeTimeSeconds {
  return {
    newWordStudyTimeSeconds: parseSafeNonNegativeSeconds(row?.new_word_study_time_seconds),
    reviewTimeSeconds: parseSafeNonNegativeSeconds(row?.review_time_seconds),
    customPracticeTimeSeconds: parseSafeNonNegativeSeconds(row?.custom_practice_time_seconds),
  };
}

// The one place total_time_seconds is ever computed for display. Accepts
// already-parsed (safe, non-negative) values — callers reading raw network
// data should go through parseLearningModeTimeRow first (or use
// deriveLearningModeTimeTotals below, which does both in one call). Never
// returns a negative total: every input is already guaranteed non-negative
// by this module's own parsing, and the sum of non-negative numbers is
// never negative.
export function computeTotalTimeSeconds(seconds: LearningModeTimeSeconds): number {
  return seconds.newWordStudyTimeSeconds + seconds.reviewTimeSeconds + seconds.customPracticeTimeSeconds;
}

// Convenience wrapper: parse a raw row and attach its derived total in one
// call. This is the shape the Dashboard's Study Activity card and its
// aggregation engine (src/data/learning/studyActivity.ts) consume.
export function deriveLearningModeTimeTotals(row: RawLearningModeTimeRow | null | undefined): LearningModeTimeTotals {
  const seconds = parseLearningModeTimeRow(row);
  return {
    ...seconds,
    totalTimeSeconds: computeTotalTimeSeconds(seconds),
  };
}
