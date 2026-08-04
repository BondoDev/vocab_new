// Pure status shape and mistake-latching logic for ReviewExerciseAdapter.tsx.
// Kept in its own .ts (not .tsx) sibling file — ReviewExerciseAdapter.tsx
// contains JSX, which `node --experimental-strip-types` cannot parse (it
// strips TypeScript types but doesn't transform JSX), so anything meant to
// be unit-testable directly via Node has to live outside the .tsx file.
// Same convention completedWrongAttempt.ts and reviewOutcomeTransition.ts
// already follow.
//
// Zero imports, so this stays loadable directly via
// `node --experimental-strip-types` for
// scripts/tests/learning/test-review-mistake-detection.mjs.
export interface ExerciseStatus {
  isCorrect: boolean;
  hasTypedAnswer: boolean;
  usedShowWord: boolean;
  usedHintForBrokenWord: boolean;
  // Reported explicitly by WordTypingExercise/HalfWrittenExercise.
  // BrokenWordExercise doesn't set this field at all, so it arrives as
  // undefined there (see computeHadMistake's fallback branch below).
  hasCompletedWrongAttempt?: boolean;
  usedHint?: boolean;
}

export const INITIAL_EXERCISE_STATUS: ExerciseStatus = {
  isCorrect: false,
  hasTypedAnswer: false,
  usedShowWord: false,
  usedHintForBrokenWord: false,
  hasCompletedWrongAttempt: false,
  usedHint: false,
};

// Mirrors exactly what ReviewExerciseAdapter's handleStatusChange does on
// every onStatusChange call: once `wasAlreadyMistake` is true it stays true
// (a completed wrong answer taints the whole encounter, per the
// correct-result rule); otherwise a mistake is detected either via the
// explicit hasCompletedWrongAttempt signal (WordTypingExercise/
// HalfWrittenExercise) or via the hasTypedAnswer-regression fallback
// (BrokenWordExercise, which clears its placed chunks back to empty after a
// full-but-wrong guess, without ever reaching isCorrect).
export function computeHadMistake(
  wasAlreadyMistake: boolean,
  previousHasTypedAnswer: boolean,
  next: ExerciseStatus,
): boolean {
  if (wasAlreadyMistake) {
    return true;
  }
  if (next.hasCompletedWrongAttempt) {
    return true;
  }
  return previousHasTypedAnswer && !next.hasTypedAnswer && !next.isCorrect;
}
