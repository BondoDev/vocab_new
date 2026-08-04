// Pure, database-mirroring logic for Review Words Phase 3: how one
// individual word-review encounter's raw signals collapse into a single
// final outcome, and how that outcome moves a word's state/correct_streak.
//
// The SQL function complete_word_review is the authoritative implementation
// (it recalculates from the database row inside a locked transaction, never
// trusting a client-supplied state/streak) — this module exists so the same
// transition rules can be unit-tested without a database, and so the exact
// promotion thresholds / demotion map / outcome-priority rules are defined
// in exactly one TypeScript place. If either side changes, update both by
// hand (same relationship wordReviewSchedule.ts already documents between
// itself and complete_new_word_study's SQL).
//
// Only a type-only import (erased at runtime), so this stays loadable
// directly via `node --experimental-strip-types` for
// scripts/tests/learning/test-review-outcome-transition.mjs.
import type { WordState } from "./wordReviewSchedule";

export type ReviewOutcome = "correct" | "incorrect" | "skipped";

// ---------------------------------------------------------------------
// Outcome mapping — collapses an exercise encounter's raw signals into
// exactly one of the three final outcomes. Show Word and Skip both mean
// "skipped" and take priority over everything else, even a prior mistake;
// otherwise any mistake makes the whole encounter "incorrect" regardless of
// a later correct answer; only a clean, mistake-free correct completion is
// "correct". Ordinary hints are deliberately not a parameter here — a hint
// never affects the outcome.
// ---------------------------------------------------------------------

export interface DetermineReviewOutcomeParams {
  hadMistake: boolean;
  usedShowWord: boolean;
  usedSkip: boolean;
  finalCorrect: boolean;
}

export function determineReviewOutcome({
  hadMistake,
  usedShowWord,
  usedSkip,
  finalCorrect,
}: DetermineReviewOutcomeParams): ReviewOutcome {
  if (usedShowWord || usedSkip) {
    return "skipped";
  }
  if (hadMistake) {
    return "incorrect";
  }
  return finalCorrect ? "correct" : "incorrect";
}

// ---------------------------------------------------------------------
// State transition — exactly mirrors complete_word_review's SQL. Consulted
// only for local testing/documentation; the database recomputes this from
// its own locked row and is the only copy that is ever actually persisted.
// ---------------------------------------------------------------------

// Consecutive-correct reviews required to promote out of each state.
// mastered has no entry: there is no next state to promote into.
export const REVIEW_PROMOTION_THRESHOLD_BY_STATE: Partial<Record<WordState, number>> = {
  seen: 1,
  learning: 2,
  familiar: 3,
  strong: 4,
};

export const REVIEW_PROMOTED_STATE_BY_STATE: Partial<Record<WordState, WordState>> = {
  seen: "learning",
  learning: "familiar",
  familiar: "strong",
  strong: "mastered",
};

// One incorrect result demotes exactly one state — seen has nowhere lower
// to go, so it maps to itself.
export const REVIEW_DEMOTED_STATE_BY_STATE: Record<WordState, WordState> = {
  seen: "seen",
  learning: "seen",
  familiar: "learning",
  strong: "familiar",
  mastered: "strong",
};

export interface ComputeReviewStateTransitionParams {
  currentState: WordState;
  currentStreak: number;
  outcome: ReviewOutcome;
}

export interface ReviewStateTransitionResult {
  newState: WordState;
  newStreak: number;
  promoted: boolean;
  demoted: boolean;
}

export function computeReviewStateTransition({
  currentState,
  currentStreak,
  outcome,
}: ComputeReviewStateTransitionParams): ReviewStateTransitionResult {
  if (outcome === "skipped") {
    // Neutral: preserves both state and streak — only the deadline moves.
    return { newState: currentState, newStreak: currentStreak, promoted: false, demoted: false };
  }

  if (outcome === "incorrect") {
    const newState = REVIEW_DEMOTED_STATE_BY_STATE[currentState];
    return { newState, newStreak: 0, promoted: false, demoted: newState !== currentState };
  }

  // outcome === "correct"
  // Mastered is a terminal, always-reset case: it never accumulates a
  // streak (there is nothing left to promote into), matching the
  // requirement that a correct Mastered encounter stays Mastered with
  // correct_streak pinned at 0 rather than counting upward forever.
  if (currentState === "mastered") {
    return { newState: "mastered", newStreak: 0, promoted: false, demoted: false };
  }

  const incrementedStreak = currentStreak + 1;
  const threshold = REVIEW_PROMOTION_THRESHOLD_BY_STATE[currentState];
  if (threshold !== undefined && incrementedStreak >= threshold) {
    const promotedState = REVIEW_PROMOTED_STATE_BY_STATE[currentState] ?? currentState;
    return { newState: promotedState, newStreak: 0, promoted: true, demoted: false };
  }

  return { newState: currentState, newStreak: incrementedStreak, promoted: false, demoted: false };
}
