// Focused guard for the pure daily-streak computation in
// src/data/learning/dailyStreak.ts.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-daily-streak.mjs
import assert from "node:assert/strict";
import { computeDailyStreakSummary } from "../../../src/data/learning/dailyStreak.ts";

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

const GOAL = 15;
// Wednesday, 2026-08-19 (2026-08-17 is a Monday).
const TODAY = "2026-08-19";

function stat(dateISO, newWordsCompleted) {
  return { dateISO, newWordsCompleted };
}

console.log("\n=== current week activity ===\n");

test("1. Completing today's goal fills today's weekday square", () => {
  const summary = computeDailyStreakSummary([stat(TODAY, GOAL)], GOAL, TODAY);
  const wednesday = summary.currentWeek.find((day) => day.dateISO === TODAY);
  assert.equal(wednesday.isComplete, true);
});

test("2. Under-goal activity on a day does not mark it complete", () => {
  const summary = computeDailyStreakSummary([stat(TODAY, GOAL - 1)], GOAL, TODAY);
  const wednesday = summary.currentWeek.find((day) => day.dateISO === TODAY);
  assert.equal(wednesday.isComplete, false);
});

test("3. Week is Monday-first and spans exactly the 7 days containing today", () => {
  const summary = computeDailyStreakSummary([], GOAL, TODAY);
  assert.deepEqual(
    summary.currentWeek.map((d) => d.dateISO),
    ["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23"],
  );
});

test("4. Future days later this week (no stat row yet) are simply not complete", () => {
  const summary = computeDailyStreakSummary([], GOAL, TODAY);
  const friday = summary.currentWeek.find((day) => day.dateISO === "2026-08-21");
  assert.equal(friday.isComplete, false);
});

test("5. A day from last week does not leak into this week's view", () => {
  const summary = computeDailyStreakSummary([stat("2026-08-10", GOAL)], GOAL, TODAY);
  assert.equal(summary.currentWeek.some((d) => d.dateISO === "2026-08-10"), false);
});

console.log("\n=== current streak ===\n");

test("6. No activity at all -> current streak is 0", () => {
  assert.equal(computeDailyStreakSummary([], GOAL, TODAY).currentStreakDays, 0);
});

test("7. Today complete, no prior days -> current streak is 1", () => {
  assert.equal(computeDailyStreakSummary([stat(TODAY, GOAL)], GOAL, TODAY).currentStreakDays, 1);
});

test("8. Today complete + 3 consecutive prior days complete -> current streak is 4", () => {
  const stats = [
    stat(TODAY, GOAL),
    stat("2026-08-18", GOAL),
    stat("2026-08-17", GOAL),
    stat("2026-08-16", GOAL),
  ];
  assert.equal(computeDailyStreakSummary(stats, GOAL, TODAY).currentStreakDays, 4);
});

test("9. A gap breaks the streak at the gap, not before it", () => {
  const stats = [
    stat(TODAY, GOAL), // today
    stat("2026-08-18", GOAL), // yesterday
    // 2026-08-17 missing — gap here
    stat("2026-08-16", GOAL),
  ];
  assert.equal(computeDailyStreakSummary(stats, GOAL, TODAY).currentStreakDays, 2);
});

test("10. Today not yet complete does not zero out an intact streak through yesterday", () => {
  const stats = [stat("2026-08-18", GOAL), stat("2026-08-17", GOAL)];
  assert.equal(computeDailyStreakSummary(stats, GOAL, TODAY).currentStreakDays, 2);
});

test("11. Today not complete AND yesterday not complete -> current streak is 0", () => {
  const stats = [stat("2026-08-17", GOAL)]; // two days back, with a gap at yesterday
  assert.equal(computeDailyStreakSummary(stats, GOAL, TODAY).currentStreakDays, 0);
});

console.log("\n=== best streak ===\n");

test("12. Best streak is at least the current streak", () => {
  const stats = [stat(TODAY, GOAL), stat("2026-08-18", GOAL)];
  const summary = computeDailyStreakSummary(stats, GOAL, TODAY);
  assert.equal(summary.bestStreakDays, summary.currentStreakDays);
});

test("13. An older, longer run outranks the current (shorter) streak", () => {
  const stats = [
    // Current streak: just today (1 day).
    stat(TODAY, GOAL),
    // An older 5-day run, with a gap separating it from today.
    stat("2026-08-10", GOAL),
    stat("2026-08-09", GOAL),
    stat("2026-08-08", GOAL),
    stat("2026-08-07", GOAL),
    stat("2026-08-06", GOAL),
  ];
  const summary = computeDailyStreakSummary(stats, GOAL, TODAY);
  assert.equal(summary.currentStreakDays, 1);
  assert.equal(summary.bestStreakDays, 5);
});

test("14. Non-consecutive complete days never combine into one run", () => {
  const stats = [stat("2026-08-01", GOAL), stat("2026-08-03", GOAL), stat("2026-08-05", GOAL)];
  const summary = computeDailyStreakSummary(stats, GOAL, TODAY);
  assert.equal(summary.bestStreakDays, 1);
});

console.log("\n=== goal edge cases ===\n");

test("15. A goal of zero is handled safely — nothing can ever be complete", () => {
  const summary = computeDailyStreakSummary([stat(TODAY, 100)], 0, TODAY);
  assert.equal(summary.currentStreakDays, 0);
  assert.equal(summary.bestStreakDays, 0);
  assert.equal(summary.currentWeek.every((d) => d.isComplete === false), true);
});

test("16. A negative/non-finite goal is handled safely, not crashed on", () => {
  for (const badGoal of [-5, NaN, Infinity]) {
    const summary = computeDailyStreakSummary([stat(TODAY, 100)], badGoal, TODAY);
    assert.equal(summary.currentStreakDays, 0);
  }
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("daily-streak guard passed");
}
