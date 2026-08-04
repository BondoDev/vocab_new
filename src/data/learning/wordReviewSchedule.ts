// Centralized review-interval configuration for the hybrid review-priority
// model used by `next_review_at` on user_word_progress: that timestamp marks
// the point after which a word becomes eligible for overdue-priority review,
// not an exact appointment that forces immediate review.
//
// This module is deliberately import-free (like newWordStudyQueue.ts) so it
// stays loadable directly via `node --experimental-strip-types` for
// scripts/tests/learning/test-word-review-schedule.mjs.
//
// Two write-side callers persist next_review_at using this same "base
// interval + one-time ±10% jitter" formula, each computed from the
// database's own clock (never a client-supplied timestamp):
//   - complete_new_word_study (Study New Words, Phase 3) — always writes
//     word_state = "seen", so it only ever needs the "seen" base interval.
//   - complete_word_review (Review Words, Phase 3) — can persist any of the
//     five states, since a review outcome may promote, demote, or leave the
//     word's state unchanged.
// Both are SQL functions and cannot import TypeScript, so if either this
// map or the jitter fraction changes, update the matching SQL by hand.
export type WordState = "seen" | "learning" | "familiar" | "strong" | "mastered";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const BASE_REVIEW_INTERVAL_MS_BY_STATE: Record<WordState, number> = {
  seen: ONE_DAY_MS,
  learning: 3 * ONE_DAY_MS,
  familiar: 10 * ONE_DAY_MS,
  strong: 45 * ONE_DAY_MS,
  mastered: 180 * ONE_DAY_MS,
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

// Throws for an unrecognized word_state rather than silently defaulting —
// every valid WordState has a configured base interval, so reaching this
// guard means a caller passed a value TypeScript wouldn't have allowed
// (e.g. an untyped JS call site or a malformed string), and that should
// surface immediately rather than silently producing a wrong deadline.
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
