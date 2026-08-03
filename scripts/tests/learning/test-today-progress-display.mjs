// Focused guard for the pure Today's Progress normalization in
// src/data/learning/todayProgressDisplay.ts.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-today-progress-display.mjs
import assert from "node:assert/strict";
import { computeTodayProgressDisplay } from "../../../src/data/learning/todayProgressDisplay.ts";

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

console.log("\n=== computeTodayProgressDisplay ===\n");

test("1. Missing daily row (completed 0) with a normal goal", () => {
  const display = computeTodayProgressDisplay(0, 15);
  assert.equal(display.completed, 0);
  assert.equal(display.goal, 15);
  assert.equal(display.progressRatio, 0);
  assert.equal(display.hasInvalidGoal, false);
});

test("2. Existing row with a real completed count below goal", () => {
  const display = computeTodayProgressDisplay(7, 15);
  assert.equal(display.completed, 7);
  assert.equal(display.progressRatio, 7 / 15);
});

test("3. Completed equals goal -> ratio exactly 1", () => {
  const display = computeTodayProgressDisplay(15, 15);
  assert.equal(display.completed, 15);
  assert.equal(display.progressRatio, 1);
});

test("4. Completed exceeds goal -> real count shown, visual ratio clamped to 1", () => {
  const display = computeTodayProgressDisplay(18, 15);
  assert.equal(display.completed, 18, "the real completed count must not be clamped");
  assert.equal(display.progressRatio, 1, "the visual ratio must clamp to 100%");
});

test("5. Goal of zero is handled safely (no division by zero, no NaN/Infinity)", () => {
  const display = computeTodayProgressDisplay(5, 0);
  assert.equal(display.goal, 0);
  assert.equal(display.progressRatio, 0);
  assert.equal(display.hasInvalidGoal, true);
  assert.ok(Number.isFinite(display.progressRatio));
});

test("6. Negative or non-finite goal is treated as invalid, not crashed on", () => {
  for (const badGoal of [-5, NaN, Infinity, -Infinity]) {
    const display = computeTodayProgressDisplay(3, badGoal);
    assert.equal(display.hasInvalidGoal, true, `goal ${badGoal} should be invalid`);
    assert.equal(display.progressRatio, 0);
    assert.ok(Number.isFinite(display.progressRatio));
  }
});

test("7. Negative or non-finite completed is treated as zero, not crashed on", () => {
  for (const badCompleted of [-3, NaN, -Infinity]) {
    const display = computeTodayProgressDisplay(badCompleted, 15);
    assert.equal(display.completed, 0, `completed ${badCompleted} should normalize to 0`);
  }
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("today-progress-display guard passed");
}
