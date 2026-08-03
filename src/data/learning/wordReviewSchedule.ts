// Centralized review-interval configuration for the hybrid review-priority
// model used by `next_review_at` on user_word_progress: that timestamp marks
// the point after which a word becomes eligible for overdue-priority review,
// not an exact appointment that forces immediate review. A future Review
// Words phase is expected to import BASE_REVIEW_INTERVAL_MS_BY_STATE from
// here instead of hardcoding its own per-state intervals.
//
// This module is deliberately import-free (like newWordStudyQueue.ts) so it
// stays loadable directly via `node --experimental-strip-types` for
// scripts/tests/learning/test-word-review-schedule.mjs.
//
// The authoritative computation that actually gets persisted happens inside
// the complete_new_word_study Postgres function (so the write stays atomic
// with the insert) — that SQL hardcodes the same "1 day base, ±10% jitter"
// formula documented here, applied to v_completed_at := now(), the
// database's own clock (never a client-supplied timestamp — the RPC takes
// no completion-timestamp parameter). If either side changes, update both
// together.
export type WordState = "seen" | "learning" | "familiar" | "strong" | "mastered";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Only "seen" is populated as of Phase 3 (initial study never leaves a word
// in any other state). The remaining states are reserved for the future
// review engine — declaring the key set now (even though only one has a
// value) keeps one source of truth instead of two once Review Words adds
// them.
export const BASE_REVIEW_INTERVAL_MS_BY_STATE: Partial<Record<WordState, number>> = {
  seen: ONE_DAY_MS,
};

// +/-10% one-time jitter, applied once at insertion time and persisted —
// never recalculated when the queue is later loaded (see this file's header
// and the user_word_progress.next_review_at column comment in the SQL).
export const REVIEW_JITTER_FRACTION = 0.1;

export interface ComputeNextReviewAtParams {
  wordState: WordState;
  completedAt: Date;
  // Injectable so tests can assert exact bounds instead of asserting a
  // random range probabilistically.
  randomFn?: () => number;
}

// Throws for a word_state with no configured base interval rather than
// silently defaulting — Phase 3 only ever calls this with "seen", and a
// missing interval for any other state should surface immediately once
// Review Words starts calling this for those states, not fail silently with
// a wrong deadline.
export function computeNextReviewAt({
  wordState,
  completedAt,
  randomFn = Math.random,
}: ComputeNextReviewAtParams): Date {
  const baseIntervalMs = BASE_REVIEW_INTERVAL_MS_BY_STATE[wordState];
  if (!baseIntervalMs) {
    throw new Error(`computeNextReviewAt: no configured base interval for word_state "${wordState}".`);
  }

  // randomFn() in [0, 1) -> jitter factor in [1 - fraction, 1 + fraction).
  const jitterFactor = 1 - REVIEW_JITTER_FRACTION + randomFn() * (REVIEW_JITTER_FRACTION * 2);
  return new Date(completedAt.getTime() + baseIntervalMs * jitterFactor);
}
