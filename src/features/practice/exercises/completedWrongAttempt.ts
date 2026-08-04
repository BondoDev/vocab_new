// Shared predicate for WordTypingExercise.tsx and HalfWrittenExercise.tsx:
// both validate live as the user types, so "is this a mistake" cannot be
// "the current input doesn't match yet" (true for every partial keystroke
// on the way to a correct answer) — it must be "every required character
// position has been filled, and the completed entry doesn't match".
// Extracted here (rather than left duplicated inline) so both exercises
// provably apply the exact same rule, and so it's unit-testable without
// rendering either component — this repo has no component-rendering test
// framework (see scripts/tests/learning/test-complete-new-word-study-contract.mjs's
// own header comment for why: React components here transitively import
// Vite-only globals that don't exist under plain Node).
//
// Zero imports, so this stays loadable directly via
// `node --experimental-strip-types`.
export function isCompletedWrongAttempt(inputLength: number, targetLength: number, isCorrect: boolean): boolean {
  return !isCorrect && targetLength > 0 && inputLength >= targetLength;
}
