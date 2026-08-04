// Focused guard for Review Words Phase 3's pure outcome-mapping and
// state-transition logic in src/data/learning/reviewOutcomeTransition.ts.
// This module mirrors the complete_word_review SQL function's transition
// rules exactly (see that module's own header) so they're testable without
// a database — the SQL remains authoritative; this only has to prove the
// TypeScript mirror computes the same thing the requirements describe.
//
// Only a type-only import (erased at runtime), so this stays loadable
// directly via `node --experimental-strip-types`.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-review-outcome-transition.mjs
import assert from "node:assert/strict";
import {
  computeReviewStateTransition,
  determineReviewOutcome,
  REVIEW_DEMOTED_STATE_BY_STATE,
  REVIEW_PROMOTED_STATE_BY_STATE,
  REVIEW_PROMOTION_THRESHOLD_BY_STATE,
} from "../../../src/data/learning/reviewOutcomeTransition.ts";

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

console.log("\n=== determineReviewOutcome: mapping priority ===\n");

test("1. Correct without any mistake -> correct", () => {
  assert.equal(
    determineReviewOutcome({ hadMistake: false, usedShowWord: false, usedSkip: false, finalCorrect: true }),
    "correct",
  );
});

test("2. Hint used, then correct, no mistake -> correct (hints never affect the outcome)", () => {
  // Ordinary hints aren't even a parameter here — this asserts the
  // omission is deliberate: nothing about a hint can make this "incorrect".
  assert.equal(
    determineReviewOutcome({ hadMistake: false, usedShowWord: false, usedSkip: false, finalCorrect: true }),
    "correct",
  );
});

test("3. One mistake, then eventually correct -> incorrect (the mistake taints the whole encounter)", () => {
  assert.equal(
    determineReviewOutcome({ hadMistake: true, usedShowWord: false, usedSkip: false, finalCorrect: true }),
    "incorrect",
  );
});

test("4. Show Word -> skipped", () => {
  assert.equal(
    determineReviewOutcome({ hadMistake: false, usedShowWord: true, usedSkip: false, finalCorrect: true }),
    "skipped",
  );
});

test("5. Skip -> skipped", () => {
  assert.equal(
    determineReviewOutcome({ hadMistake: false, usedShowWord: false, usedSkip: true, finalCorrect: false }),
    "skipped",
  );
});

test("6. Show Word or Skip takes priority over a prior mistake — still skipped, not incorrect", () => {
  assert.equal(
    determineReviewOutcome({ hadMistake: true, usedShowWord: true, usedSkip: false, finalCorrect: true }),
    "skipped",
  );
  assert.equal(
    determineReviewOutcome({ hadMistake: true, usedShowWord: false, usedSkip: true, finalCorrect: false }),
    "skipped",
  );
});

console.log("\n=== computeReviewStateTransition: promotion ===\n");

test("7. Seen, correct once -> Learning, streak 0", () => {
  const result = computeReviewStateTransition({ currentState: "seen", currentStreak: 0, outcome: "correct" });
  assert.deepEqual(result, { newState: "learning", newStreak: 0, promoted: true, demoted: false });
});

test("8. Learning, first correct -> stays Learning, streak 1", () => {
  const result = computeReviewStateTransition({ currentState: "learning", currentStreak: 0, outcome: "correct" });
  assert.deepEqual(result, { newState: "learning", newStreak: 1, promoted: false, demoted: false });
});

test("9. Learning, second correct -> Familiar, streak 0", () => {
  const result = computeReviewStateTransition({ currentState: "learning", currentStreak: 1, outcome: "correct" });
  assert.deepEqual(result, { newState: "familiar", newStreak: 0, promoted: true, demoted: false });
});

test("10. Familiar promotes to Strong after 3 consecutive correct", () => {
  let streak = 0;
  let state = "familiar";
  for (let i = 0; i < 2; i++) {
    const result = computeReviewStateTransition({ currentState: state, currentStreak: streak, outcome: "correct" });
    assert.equal(result.promoted, false, `unexpected promotion on correct #${i + 1}`);
    streak = result.newStreak;
    state = result.newState;
  }
  const final = computeReviewStateTransition({ currentState: state, currentStreak: streak, outcome: "correct" });
  assert.deepEqual(final, { newState: "strong", newStreak: 0, promoted: true, demoted: false });
});

test("11. Strong promotes to Mastered after 4 consecutive correct", () => {
  let streak = 0;
  let state = "strong";
  for (let i = 0; i < 3; i++) {
    const result = computeReviewStateTransition({ currentState: state, currentStreak: streak, outcome: "correct" });
    assert.equal(result.promoted, false, `unexpected promotion on correct #${i + 1}`);
    streak = result.newStreak;
    state = result.newState;
  }
  const final = computeReviewStateTransition({ currentState: state, currentStreak: streak, outcome: "correct" });
  assert.deepEqual(final, { newState: "mastered", newStreak: 0, promoted: true, demoted: false });
});

test("12. Mastered, correct -> remains Mastered, streak pinned at 0 (never accumulates)", () => {
  const first = computeReviewStateTransition({ currentState: "mastered", currentStreak: 0, outcome: "correct" });
  assert.deepEqual(first, { newState: "mastered", newStreak: 0, promoted: false, demoted: false });

  // Even starting from a nonzero streak (defensive: should never happen in
  // practice since mastered always resets to 0), the result still pins to 0.
  const fromNonzero = computeReviewStateTransition({
    currentState: "mastered",
    currentStreak: 7,
    outcome: "correct",
  });
  assert.deepEqual(fromNonzero, { newState: "mastered", newStreak: 0, promoted: false, demoted: false });
});

test("13. A word never moves through more than one state in a single encounter", () => {
  // Familiar with an already-high streak (as if thresholds had changed)
  // must still only promote one step, to Strong — never jump to Mastered.
  const result = computeReviewStateTransition({ currentState: "familiar", currentStreak: 10, outcome: "correct" });
  assert.equal(result.newState, "strong");
});

console.log("\n=== computeReviewStateTransition: incorrect (demotion) ===\n");

test("14. Seen, incorrect -> remains Seen (floor state), streak reset to 0", () => {
  const result = computeReviewStateTransition({ currentState: "seen", currentStreak: 0, outcome: "incorrect" });
  assert.deepEqual(result, { newState: "seen", newStreak: 0, promoted: false, demoted: false });
});

test("15. Learning, incorrect -> Seen", () => {
  const result = computeReviewStateTransition({ currentState: "learning", currentStreak: 1, outcome: "incorrect" });
  assert.deepEqual(result, { newState: "seen", newStreak: 0, promoted: false, demoted: true });
});

test("16. Familiar, incorrect -> Learning", () => {
  const result = computeReviewStateTransition({ currentState: "familiar", currentStreak: 2, outcome: "incorrect" });
  assert.deepEqual(result, { newState: "learning", newStreak: 0, promoted: false, demoted: true });
});

test("17. Strong, incorrect -> Familiar", () => {
  const result = computeReviewStateTransition({ currentState: "strong", currentStreak: 3, outcome: "incorrect" });
  assert.deepEqual(result, { newState: "familiar", newStreak: 0, promoted: false, demoted: true });
});

test("18. Mastered, incorrect -> Strong", () => {
  const result = computeReviewStateTransition({ currentState: "mastered", currentStreak: 0, outcome: "incorrect" });
  assert.deepEqual(result, { newState: "strong", newStreak: 0, promoted: false, demoted: true });
});

test("19. Every incorrect result resets correct_streak to 0, regardless of starting streak", () => {
  for (const state of ["seen", "learning", "familiar", "strong", "mastered"]) {
    for (const startingStreak of [0, 1, 5, 12]) {
      const result = computeReviewStateTransition({ currentState: state, currentStreak: startingStreak, outcome: "incorrect" });
      assert.equal(result.newStreak, 0, `state=${state} startingStreak=${startingStreak}`);
    }
  }
});

console.log("\n=== computeReviewStateTransition: skipped ===\n");

test("20. Skipped preserves state and streak exactly, for every state", () => {
  for (const state of ["seen", "learning", "familiar", "strong", "mastered"]) {
    for (const streak of [0, 2, 5]) {
      const result = computeReviewStateTransition({ currentState: state, currentStreak: streak, outcome: "skipped" });
      assert.deepEqual(result, { newState: state, newStreak: streak, promoted: false, demoted: false });
    }
  }
});

console.log("\n=== transition maps stay internally consistent ===\n");

test("21. Every non-mastered state has a promotion threshold; mastered has none", () => {
  for (const state of ["seen", "learning", "familiar", "strong"]) {
    assert.ok(typeof REVIEW_PROMOTION_THRESHOLD_BY_STATE[state] === "number");
  }
  assert.equal(REVIEW_PROMOTION_THRESHOLD_BY_STATE.mastered, undefined);
});

test("22. Promotion thresholds are exactly seen:1, learning:2, familiar:3, strong:4", () => {
  assert.deepEqual(REVIEW_PROMOTION_THRESHOLD_BY_STATE, { seen: 1, learning: 2, familiar: 3, strong: 4 });
});

test("23. Demotion map is exactly seen->seen, learning->seen, familiar->learning, strong->familiar, mastered->strong", () => {
  assert.deepEqual(REVIEW_DEMOTED_STATE_BY_STATE, {
    seen: "seen",
    learning: "seen",
    familiar: "learning",
    strong: "familiar",
    mastered: "strong",
  });
});

test("24. Promotion map is exactly seen->learning, learning->familiar, familiar->strong, strong->mastered", () => {
  assert.deepEqual(REVIEW_PROMOTED_STATE_BY_STATE, {
    seen: "learning",
    learning: "familiar",
    familiar: "strong",
    strong: "mastered",
  });
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("review-outcome-transition guard passed");
}
