// Focused guard for the pure activity-day streak computation in
// src/data/learning/milestoneStreak.ts (Milestones Consistency track,
// Phase 1). Distinct from scripts/tests/learning/test-daily-streak.mjs,
// which covers the goal-based Daily Streak card instead.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-milestone-streak.mjs
import assert from "node:assert/strict";
import { computeMilestoneStreak } from "../../../src/data/learning/milestoneStreak.ts";
import { addDaysISO } from "../../../src/data/learning/dailyStreak.ts";

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

// Wednesday, 2026-08-19.
const TODAY = "2026-08-19";

function stat(dateISO, { newWords = 0, reviews = 0 } = {}) {
  return { dateISO, newWordsCompleted: newWords, reviewsCompleted: reviews };
}

console.log("\n=== computeMilestoneStreak — activity qualification ===\n");

test("A day with new_words_completed > 0 alone qualifies", () => {
  const streak = computeMilestoneStreak([stat(TODAY, { newWords: 1 })], TODAY);
  assert.equal(streak, 1);
});

test("A day with reviews_completed > 0 alone qualifies (no new words needed)", () => {
  const streak = computeMilestoneStreak([stat(TODAY, { reviews: 1 })], TODAY);
  assert.equal(streak, 1);
});

test("A day with both at 0 does not qualify", () => {
  const streak = computeMilestoneStreak([stat(TODAY, { newWords: 0, reviews: 0 })], TODAY);
  assert.equal(streak, 0);
});

console.log("\n=== computeMilestoneStreak — consecutive-day walk ===\n");

test("Consecutive active dates count the full run", () => {
  const stats = [0, -1, -2, -3, -4].map((offset) => stat(addDaysISO(TODAY, offset), { newWords: 1 }));
  assert.equal(computeMilestoneStreak(stats, TODAY), 5);
});

test("A missing day breaks the streak at the gap", () => {
  const stats = [
    stat(TODAY, { newWords: 1 }),
    stat(addDaysISO(TODAY, -1), { newWords: 1 }),
    // -2 missing entirely
    stat(addDaysISO(TODAY, -3), { newWords: 1 }),
  ];
  assert.equal(computeMilestoneStreak(stats, TODAY), 2);
});

test("An inactive (0/0) day breaks the streak exactly like a missing row", () => {
  const stats = [
    stat(TODAY, { newWords: 1 }),
    stat(addDaysISO(TODAY, -1), { newWords: 1 }),
    stat(addDaysISO(TODAY, -2), { newWords: 0, reviews: 0 }),
    stat(addDaysISO(TODAY, -3), { newWords: 1 }),
  ];
  assert.equal(computeMilestoneStreak(stats, TODAY), 2);
});

test("Today active counts today", () => {
  const stats = [stat(TODAY, { reviews: 3 }), stat(addDaysISO(TODAY, -1), { newWords: 2 })];
  assert.equal(computeMilestoneStreak(stats, TODAY), 2);
});

test("Today inactive but yesterday active preserves yesterday's streak (today isn't over yet)", () => {
  const stats = [
    stat(addDaysISO(TODAY, -1), { newWords: 1 }),
    stat(addDaysISO(TODAY, -2), { newWords: 1 }),
  ];
  // No row at all for TODAY.
  assert.equal(computeMilestoneStreak(stats, TODAY), 2);
});

test("Today missing and yesterday also missing/inactive returns 0", () => {
  const stats = [stat(addDaysISO(TODAY, -3), { newWords: 1 })];
  assert.equal(computeMilestoneStreak(stats, TODAY), 0);
});

test("No stats at all returns 0", () => {
  assert.equal(computeMilestoneStreak([], TODAY), 0);
});

test("Future-dated rows (later than today) are irrelevant to the backward walk", () => {
  const stats = [stat(TODAY, { newWords: 1 }), stat(addDaysISO(TODAY, 1), { newWords: 1 })];
  assert.equal(computeMilestoneStreak(stats, TODAY), 1);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("milestone-streak guard passed");
}
