// Import-free on purpose so scripts/tests/practice/test-practiced-word-counter.mjs
// can load it directly via Node's TypeScript stripping.

export type ExerciseResult = "correct" | "incorrect" | "skipped";

export interface PracticedAttempt {
  conceptId: string;
  result: ExerciseResult;
  // connectWords/listening: words matched, never written.
  isGroupExercise: boolean;
  // The learner wrote the word themselves on that card in any attempt
  // (see the exercises' onStatusChange `wroteWord`).
  wroteWord: boolean;
}

// The one "practiced" rule, shared by the header counter and the finish
// screen's word list: a single-word card counts once the learner wrote the
// word themselves — earlier Show me word reveals, retries or wrong letters
// don't matter.
export const isWrittenWordAttempt = (
  attempt: Pick<PracticedAttempt, "isGroupExercise" | "wroteWord">,
): boolean => !attempt.isGroupExercise && attempt.wroteWord;

// Counter only: group matches have nothing written, so they count when the
// whole group was matched correctly; they never enter the word list.
export const isPracticedAttempt = (
  attempt: Omit<PracticedAttempt, "conceptId">,
): boolean =>
  isWrittenWordAttempt(attempt) ||
  (attempt.isGroupExercise && attempt.result === "correct");

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
// rather than kept as separate state: each word counts once it has a
// practiced attempt (isPracticedAttempt), so repeats never double-count.
// `pendingConceptIds` covers the current card once it qualifies but is not
// yet recorded (the attempt is only appended on Next). Resetting
// attemptHistory (new session / Start Again) resets the counter with it.
export const countPracticedWords = (
  attemptHistory: readonly PracticedAttempt[],
  pendingConceptIds: readonly string[] = [],
): number => {
  const practiced = new Set<string>(pendingConceptIds);
  for (const attempt of attemptHistory) {
    if (isPracticedAttempt(attempt)) {
      practiced.add(attempt.conceptId);
    }
  }
  return practiced.size;
};
