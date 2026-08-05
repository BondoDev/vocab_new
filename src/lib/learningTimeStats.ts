// Pure read-side helper for the three per-mode active-time columns on
// public.user_daily_stats (study_time_seconds, review_time_seconds,
// custom_practice_time_seconds — see
// supabase/migrations/20260805190000_add_learning_mode_time_tracking.sql).
// total_time_seconds is NEVER stored in the database — every reader derives
// it here, at read time, from the three stored columns. No React, no
// Supabase — a plain data-shaping module, loadable directly via
// `node --experimental-strip-types` for
// scripts/tests/lib/test-learning-time-stats.mjs, matching every other pure
// module in src/data/learning/.
//
// As of this module's introduction, no UI reads or displays learning time
// anywhere in the app (audit-confirmed: study_time_seconds/
// review_time_seconds/custom_practice_time_seconds are written by the
// three completion RPCs but never selected by any frontend code). This
// module exists to establish the data contract a future Statistics page
// will consume — see docs/architecture.md's Learning Statistics section —
// not to back any current screen.

export interface LearningModeTimeSeconds {
  studyTimeSeconds: number;
  reviewTimeSeconds: number;
  customPracticeTimeSeconds: number;
}

export interface LearningModeTimeTotals extends LearningModeTimeSeconds {
  totalTimeSeconds: number;
}

// Raw shape a user_daily_stats row's three time columns take over the wire
// (PostgREST/RPC responses — snake_case, possibly absent on a legacy row
// written before review_time_seconds/custom_practice_time_seconds existed,
// possibly null, possibly a non-finite/string value from a malformed
// response). Every field is `unknown` on purpose — this module never trusts
// the network shape.
export interface RawLearningModeTimeRow {
  study_time_seconds?: unknown;
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

// Parses one user_daily_stats row's three raw time columns into a safe,
// fully-defaulted shape. Never throws — a malformed/missing field always
// resolves to 0 rather than propagating an error into a statistics display.
export function parseLearningModeTimeRow(row: RawLearningModeTimeRow | null | undefined): LearningModeTimeSeconds {
  return {
    studyTimeSeconds: parseSafeNonNegativeSeconds(row?.study_time_seconds),
    reviewTimeSeconds: parseSafeNonNegativeSeconds(row?.review_time_seconds),
    customPracticeTimeSeconds: parseSafeNonNegativeSeconds(row?.custom_practice_time_seconds),
  };
}

// The one place total_time_seconds is ever computed. Accepts already-parsed
// (safe, non-negative) values — callers reading raw network data should go
// through parseLearningModeTimeRow first (or use
// deriveLearningModeTimeTotals below, which does both in one call).
// Never returns a negative total: every input is already guaranteed
// non-negative by this module's own parsing, and the sum of non-negative
// numbers is never negative.
export function computeTotalTimeSeconds(seconds: LearningModeTimeSeconds): number {
  return seconds.studyTimeSeconds + seconds.reviewTimeSeconds + seconds.customPracticeTimeSeconds;
}

// Convenience wrapper: parse a raw row and attach its derived total in one
// call. This is the shape a future Statistics page reads — see this
// module's own header.
export function deriveLearningModeTimeTotals(row: RawLearningModeTimeRow | null | undefined): LearningModeTimeTotals {
  const seconds = parseLearningModeTimeRow(row);
  return {
    ...seconds,
    totalTimeSeconds: computeTotalTimeSeconds(seconds),
  };
}
