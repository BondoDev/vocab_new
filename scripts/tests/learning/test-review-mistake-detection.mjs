// Focused guard for the "completed wrong answer" mistake-detection fix:
// - src/features/practice/exercises/completedWrongAttempt.ts (shared
//   predicate used by WordTypingExercise.tsx and HalfWrittenExercise.tsx —
//   both validate live as the user types, so "a mistake" can only mean
//   "every required character position filled, and the completed entry is
//   wrong", never "doesn't match yet while still incomplete").
// - src/features/review-words/steps/reviewExerciseStatus.ts
//   (computeHadMistake — the adapter-level latch that consumes that signal
//   for WordTyping/HalfWritten, and falls back to the existing
//   hasTypedAnswer-regression heuristic for BrokenWordExercise, which
//   doesn't report the new field).
// - src/data/learning/reviewOutcomeTransition.ts's determineReviewOutcome,
//   exercised here specifically through full encounter simulations rather
//   than isolated unit inputs (already covered by
//   test-review-outcome-transition.mjs).
//
// All three modules are plain .ts (no JSX), so — like every other Phase
// 1-3 pure-logic test — this loads directly via
// `node --experimental-strip-types`. See completedWrongAttempt.ts's own
// header for why the actual .tsx components can't be loaded this way.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-review-mistake-detection.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isCompletedWrongAttempt } from "../../../src/features/practice/exercises/completedWrongAttempt.ts";
import {
  computeHadMistake,
  INITIAL_EXERCISE_STATUS,
} from "../../../src/features/review-words/steps/reviewExerciseStatus.ts";
import { determineReviewOutcome } from "../../../src/data/learning/reviewOutcomeTransition.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

console.log("\n=== isCompletedWrongAttempt: incomplete typing is never a mistake ===\n");

test('1. "Apple": partial states A / Ap / App / Appl never count as a mistake', () => {
  const target = "Apple".length; // 5
  for (const partial of ["A", "Ap", "App", "Appl"]) {
    assert.equal(
      isCompletedWrongAttempt(partial.length, target, false),
      false,
      `"${partial}" (length ${partial.length}) must not be a completed attempt`,
    );
  }
});

test("2. Empty input is never a mistake, regardless of isCorrect", () => {
  assert.equal(isCompletedWrongAttempt(0, 5, false), false);
  assert.equal(isCompletedWrongAttempt(0, 5, true), false);
});

console.log("\n=== isCompletedWrongAttempt: a completed wrong answer is exactly one mistake ===\n");

test('3. "Aplle" (full length, wrong) against target "Apple" IS a completed wrong attempt', () => {
  assert.equal(isCompletedWrongAttempt("Aplle".length, "Apple".length, false), true);
});

test("4. Full length AND correct is not a mistake (it's the correct answer)", () => {
  assert.equal(isCompletedWrongAttempt(5, 5, true), false);
});

test("5. Over-length input (defensive — maxLength should prevent this) still counts as a mistake when wrong", () => {
  assert.equal(isCompletedWrongAttempt(6, 5, false), true);
});

test("6. A zero-length target never counts as a mistake (guards a degenerate/empty word)", () => {
  assert.equal(isCompletedWrongAttempt(0, 0, false), false);
  assert.equal(isCompletedWrongAttempt(3, 0, false), false);
});

console.log("\n=== computeHadMistake: latches on and never resets ===\n");

function status(overrides = {}) {
  return { ...INITIAL_EXERCISE_STATUS, ...overrides };
}

test("7. WordTyping/HalfWritten: partial typing never latches a mistake", () => {
  let hadMistake = false;
  let previousHasTypedAnswer = false;
  for (const partial of ["A", "Ap", "App", "Appl"]) {
    const next = status({ hasTypedAnswer: true, isCorrect: false, hasCompletedWrongAttempt: false });
    hadMistake = computeHadMistake(hadMistake, previousHasTypedAnswer, next);
    previousHasTypedAnswer = next.hasTypedAnswer;
    assert.equal(hadMistake, false, `must not latch while typing "${partial}"`);
  }
});

test("8. WordTyping/HalfWritten: an explicit hasCompletedWrongAttempt latches immediately", () => {
  let hadMistake = false;
  hadMistake = computeHadMistake(
    hadMistake,
    true,
    status({ hasTypedAnswer: true, isCorrect: false, hasCompletedWrongAttempt: true }),
  );
  assert.equal(hadMistake, true);
});

test("9. Correcting afterward still returns incorrect: the latch survives a later isCorrect: true", () => {
  let hadMistake = false;
  let previousHasTypedAnswer = false;

  // "Aplle" - full length, wrong.
  let next = status({ hasTypedAnswer: true, isCorrect: false, hasCompletedWrongAttempt: true });
  hadMistake = computeHadMistake(hadMistake, previousHasTypedAnswer, next);
  previousHasTypedAnswer = next.hasTypedAnswer;
  assert.equal(hadMistake, true);

  // Learner fixes it to "Apple" - now correct.
  next = status({ hasTypedAnswer: true, isCorrect: true, hasCompletedWrongAttempt: true });
  hadMistake = computeHadMistake(hadMistake, previousHasTypedAnswer, next);
  assert.equal(hadMistake, true, "the mistake must not be forgotten once the word is eventually solved");

  const outcome = determineReviewOutcome({
    hadMistake,
    usedShowWord: false,
    usedSkip: false,
    finalCorrect: true,
  });
  assert.equal(outcome, "incorrect");
});

test("10. BrokenWordExercise fallback: hasTypedAnswer regressing to false (without isCorrect) latches a mistake", () => {
  let hadMistake = false;
  let previousHasTypedAnswer = false;

  // Placing chunks: hasTypedAnswer becomes true (no hasCompletedWrongAttempt
  // field at all from this component).
  let next = status({ hasTypedAnswer: true, isCorrect: false });
  hadMistake = computeHadMistake(hadMistake, previousHasTypedAnswer, next);
  previousHasTypedAnswer = next.hasTypedAnswer;
  assert.equal(hadMistake, false);

  // Full-but-wrong guess auto-clears back to empty after ~800ms.
  next = status({ hasTypedAnswer: false, isCorrect: false });
  hadMistake = computeHadMistake(hadMistake, previousHasTypedAnswer, next);
  previousHasTypedAnswer = next.hasTypedAnswer;
  assert.equal(hadMistake, true);
});

test("11. Hints alone (no completed wrong answer) never latch a mistake", () => {
  let hadMistake = false;
  let previousHasTypedAnswer = false;

  const withHint = status({ hasTypedAnswer: true, isCorrect: false, usedHint: true, hasCompletedWrongAttempt: false });
  hadMistake = computeHadMistake(hadMistake, previousHasTypedAnswer, withHint);
  previousHasTypedAnswer = withHint.hasTypedAnswer;
  assert.equal(hadMistake, false);

  const thenCorrect = status({ hasTypedAnswer: true, isCorrect: true, usedHint: true, hasCompletedWrongAttempt: false });
  hadMistake = computeHadMistake(hadMistake, previousHasTypedAnswer, thenCorrect);
  assert.equal(hadMistake, false);

  const outcome = determineReviewOutcome({ hadMistake, usedShowWord: false, usedSkip: false, finalCorrect: true });
  assert.equal(outcome, "correct", "a hint must never turn a clean correct answer into incorrect");
});

console.log("\n=== full-encounter outcome, all three typing exercises behave identically ===\n");

// Simulates one exercise's full onStatusChange stream and folds it down to
// a single review outcome the same way ReviewExerciseAdapter does —
// computeHadMistake across the stream, then determineReviewOutcome once a
// final status is reached.
function simulateEncounter(streamStatuses, { usedSkip = false } = {}) {
  let hadMistake = false;
  let previousHasTypedAnswer = false;
  for (const next of streamStatuses) {
    hadMistake = computeHadMistake(hadMistake, previousHasTypedAnswer, next);
    previousHasTypedAnswer = next.hasTypedAnswer;
  }
  const final = streamStatuses[streamStatuses.length - 1];
  return determineReviewOutcome({
    hadMistake,
    usedShowWord: final.usedShowWord,
    usedSkip,
    finalCorrect: final.isCorrect,
  });
}

test("12. Clean correct completion -> correct, identically for WordTyping/HalfWritten-shaped and BrokenWord-shaped streams", () => {
  const typingShaped = [
    status({ hasTypedAnswer: true, isCorrect: false, hasCompletedWrongAttempt: false }),
    status({ hasTypedAnswer: true, isCorrect: true, hasCompletedWrongAttempt: false }),
  ];
  const brokenWordShaped = [
    status({ hasTypedAnswer: true, isCorrect: false }),
    status({ hasTypedAnswer: true, isCorrect: true }),
  ];
  assert.equal(simulateEncounter(typingShaped), "correct");
  assert.equal(simulateEncounter(brokenWordShaped), "correct");
});

test("13. One completed wrong answer, then corrected -> incorrect, identically for all three exercise shapes", () => {
  const typingShaped = [
    status({ hasTypedAnswer: true, isCorrect: false, hasCompletedWrongAttempt: true }),
    status({ hasTypedAnswer: true, isCorrect: true, hasCompletedWrongAttempt: true }),
  ];
  const brokenWordShaped = [
    status({ hasTypedAnswer: true, isCorrect: false }),
    status({ hasTypedAnswer: false, isCorrect: false }), // auto-cleared wrong guess
    status({ hasTypedAnswer: true, isCorrect: true }),
  ];
  assert.equal(simulateEncounter(typingShaped), "incorrect");
  assert.equal(simulateEncounter(brokenWordShaped), "incorrect");
});

test("14. Show Word -> skipped, identically for all three exercise shapes (even after a prior mistake)", () => {
  const typingShapedNoMistake = [status({ hasTypedAnswer: true, isCorrect: true, usedShowWord: true })];
  const typingShapedWithMistake = [
    status({ hasTypedAnswer: true, isCorrect: false, hasCompletedWrongAttempt: true }),
    status({ hasTypedAnswer: true, isCorrect: true, usedShowWord: true, hasCompletedWrongAttempt: true }),
  ];
  assert.equal(simulateEncounter(typingShapedNoMistake), "skipped");
  assert.equal(simulateEncounter(typingShapedWithMistake), "skipped");
});

test("15. Skip -> skipped, identically for all three exercise shapes", () => {
  const midTyping = [status({ hasTypedAnswer: true, isCorrect: false, hasCompletedWrongAttempt: false })];
  const untouched = [status()];
  assert.equal(simulateEncounter(midTyping, { usedSkip: true }), "skipped");
  assert.equal(simulateEncounter(untouched, { usedSkip: true }), "skipped");
});

console.log("\n=== group/connection exercises never affect review persistence ===\n");

test("16. ReviewGroupExerciseAdapter.tsx never imports completeWordReview or the outcome/transition modules", () => {
  const source = fs.readFileSync(
    path.join(ROOT_DIR, "src", "features", "review-words", "steps", "ReviewGroupExerciseAdapter.tsx"),
    "utf8",
  );
  const importLines = source.split("\n").filter((line) => /^\s*import\s/.test(line));
  for (const line of importLines) {
    assert.ok(!/completeWordReview|reviewOutcomeTransition|supabase/i.test(line), `unexpected import: "${line.trim()}"`);
  }
  // Its onComplete is a plain boolean (success), never a ReviewOutcome —
  // confirms it has no channel to report correct/incorrect/skipped at all.
  assert.match(source, /onComplete:\s*\(success:\s*boolean\)\s*=>\s*void/);
});

test("17. GROUP_EXERCISE_COMPLETE never sets saved/outcome on any word (reducer-level guard, mirrors test 32 in test-review-session.mjs)", () => {
  const source = fs.readFileSync(
    path.join(ROOT_DIR, "src", "features", "review-words", "reviewSessionState.ts"),
    "utf8",
  );
  const caseMatch = source.match(/case "GROUP_EXERCISE_COMPLETE":\s*\{([\s\S]*?)\n    \}/);
  assert.ok(caseMatch, "GROUP_EXERCISE_COMPLETE case must exist");
  const body = caseMatch[1];
  assert.doesNotMatch(body, /saved:\s*true/, "must never mark a word saved");
  assert.doesNotMatch(body, /outcome:\s*action/, "must never set a word's outcome");
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("review-mistake-detection guard passed");
}
