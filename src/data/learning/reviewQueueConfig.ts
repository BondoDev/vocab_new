// Centralized configuration for the Review Words hybrid selection engine
// (src/data/learning/reviewQueue.ts). Every tunable number the engine and its
// weighted-sampling helper (reviewQueueWeights.ts) use lives here — nothing
// about overdue urgency, state weighting, cooldown, or session sizing should
// ever be hardcoded inline in a component or in reviewQueue.ts itself.
//
// Import-free apart from a type-only import (erased at runtime, like
// newWordStudySessionState.ts's own import of ResolvedStudyQueueItem), so
// this stays loadable directly via `node --experimental-strip-types` for
// scripts/tests/learning/test-review-queue.mjs.
import type { WordState } from "./wordReviewSchedule";

export type { WordState };

// Default review-session size when a caller doesn't request a specific size.
// The engine works with any positive session size — nothing below assumes 20
// specifically, this is only the product-agreed starting default.
export const REVIEW_SESSION_SIZE_DEFAULT = 20;

// Weighted-random base weight per word_state — higher means more likely to
// surface in ordinary (non-overdue) rotation. Strong/Mastered stay
// selectable (nonzero) rather than excluded, just much less frequently.
export const REVIEW_STATE_WEIGHT: Record<WordState, number> = {
  seen: 12,
  learning: 8,
  familiar: 4,
  strong: 1.5,
  mastered: 0.35,
};

// Overdue-priority urgency multiplier per word_state — how much one overdue
// day "counts" for that state when ranking the overdue pool. See
// computeOverduePriority in reviewQueue.ts for the full formula
// (overdueDays * urgencyMultiplier[state]).
export const REVIEW_OVERDUE_URGENCY_MULTIPLIER: Record<WordState, number> = {
  seen: 5,
  learning: 4,
  familiar: 2.5,
  strong: 1.5,
  mastered: 1,
};

// Target fraction of a session reserved for overdue words. A target, not a
// hard cap or floor: reviewQueue.ts expands beyond it when the random pool
// can't fill the remaining slots, and never pads it out with unavailable
// overdue words just to hit the percentage.
export const REVIEW_OVERDUE_SESSION_SHARE = 0.4;

// Safe minimum for `overdueDays` in the overdue-priority formula (1 hour,
// expressed in days) — without this, a word that became overdue moments ago
// would compute an overdueDays of ~0 and its urgencyMultiplier would have no
// effect on its priority/ranking against other freshly-overdue words.
export const REVIEW_MIN_OVERDUE_DAYS = 1 / 24;

// Recent-practice cooldown for the weighted-random pool. Thresholds are
// hours since the reference practice timestamp (last_practiced_at, falling
// back to created_at); a factor of 0 excludes the word from ordinary random
// selection for this session entirely. Does not apply to the overdue pool —
// an overdue word is never excluded by this cooldown (see reviewQueue.ts).
export const REVIEW_RECENCY_COOLDOWN_THRESHOLDS_HOURS = {
  veryRecent: 2,
  recent: 12,
  sameDay: 24,
  extended: 72,
} as const;

export const REVIEW_RECENCY_COOLDOWN_FACTORS = {
  veryRecent: 0,
  recent: 0.1,
  sameDay: 0.3,
  extended: 0.7,
  distant: 1,
} as const;

// Below this many total learned words for the active target language, a
// learner has very likely just finished their first (or an early) Study New
// Words session and immediately wants to review what they just learned.
// Hard-excluding everything practiced in the last two hours (the
// `veryRecent` tier above) would make Review Words look completely broken
// for exactly that learner — "I have words, but nothing is reviewable".
// Below this threshold, the `veryRecent` tier is bypassed entirely (treated
// as fully eligible, same as `distant`) so freshly-studied words remain
// reachable; the recent/sameDay/extended tiers are unaffected either way —
// they already allow selection, just at reduced likelihood. At or above the
// threshold, the normal two-hour cooldown applies exactly as before. See
// computeRecencyFactor's `bypassVeryRecentCooldown` parameter in
// reviewQueue.ts.
export const REVIEW_SMALL_LIBRARY_WORD_COUNT_THRESHOLD = 100;

// Deadline-approach factor shape for words not yet overdue: factor =
// base + progress * range, where progress is elapsed/total interval clamped
// to [0, 1]. base=0.5 immediately after practice, base+range=2 at/after the
// deadline (overdue words are handled by the separate overdue-priority
// formula instead). `neutral` is used when last_practiced_at or
// next_review_at is missing/invalid.
export const REVIEW_DEADLINE_APPROACH_BASE = 0.5;
export const REVIEW_DEADLINE_APPROACH_RANGE = 1.5;
export const REVIEW_DEADLINE_APPROACH_NEUTRAL = 1;

// Base review intervals (all 5 states) now live in wordReviewSchedule.ts's
// BASE_REVIEW_INTERVAL_MS_BY_STATE — the write-side phase that actually
// consumes them (Review Words Phase 3, via complete_word_review) has
// arrived, so this module no longer keeps its own documentation-only copy.
// Import from wordReviewSchedule.ts instead.
