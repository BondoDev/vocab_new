// Import-free on purpose so scripts/tests/practice/test-practiced-word-counter.mjs
// can load it directly via Node's TypeScript stripping.

export type ExerciseResult = "correct" | "incorrect" | "skipped";

export interface PracticedAttempt {
  conceptId: string;
  result: ExerciseResult;
}

export interface ExerciseOutcomeStatus {
  isCorrect: boolean;
  hasTypedAnswer: boolean;
  usedShowWord: boolean;
  usedHintForBrokenWord: boolean;
}

// Single source of truth for how an exercise's status maps to a recorded
// result: VocabularyPractice's runNextStep records it into attemptHistory,
// and the header counter uses it to count the on-screen card the moment it
// is answered correctly (before the user presses Next).
export const classifyExerciseResult = (
  status: ExerciseOutcomeStatus,
  exerciseType: string,
  isFourWordExercise: boolean,
): ExerciseResult => {
  if (isFourWordExercise) {
    return status.isCorrect ? "correct" : "skipped";
  }
  if (status.usedShowWord || status.usedHintForBrokenWord) {
    return "incorrect";
  }
  if (exerciseType === "brokenWord") {
    return status.isCorrect ? "correct" : "skipped";
  }
  if (status.hasTypedAnswer) {
    return status.isCorrect ? "correct" : "incorrect";
  }
  return "skipped";
};

// Header "N practiced" counter, derived from the session's attemptHistory
// rather than kept as separate state: a word counts once it has at least one
// "correct" attempt, so skipped/revealed/incorrect attempts never count and
// repeats of the same word never double-count. `pendingCorrectConceptIds`
// covers the current card once it is correct but not yet recorded (the
// attempt is only appended on Next). Resetting attemptHistory (new session /
// Start Again) resets the counter with it.
export const countPracticedWords = (
  attemptHistory: readonly PracticedAttempt[],
  pendingCorrectConceptIds: readonly string[] = [],
): number => {
  const practiced = new Set<string>(pendingCorrectConceptIds);
  for (const attempt of attemptHistory) {
    if (attempt.result === "correct") {
      practiced.add(attempt.conceptId);
    }
  }
  return practiced.size;
};
