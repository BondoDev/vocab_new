// Focused guard for the pure Words Learned summary in
// src/data/learning/wordsLearnedSummary.ts.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-words-learned-summary.mjs
import assert from "node:assert/strict";
import { computeWordsLearnedSummary } from "../../../src/data/learning/wordsLearnedSummary.ts";

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

const TODAY = "2026-08-10";

console.log("\n=== computeWordsLearnedSummary ===\n");

test("12. Last-7-day total sums exactly the last 7 calendar days (today and the 6 before)", () => {
  const stats = [
    { dateISO: "2026-08-04", newWordsCompleted: 3 }, // today-6, in range
    { dateISO: "2026-08-06", newWordsCompleted: 5 },
    { dateISO: "2026-08-10", newWordsCompleted: 2 }, // today
    { dateISO: "2026-08-03", newWordsCompleted: 100 }, // today-7, out of range
  ];
  const summary = computeWordsLearnedSummary(stats, TODAY);
  assert.equal(summary.total, 10);
  assert.equal(summary.days.length, 7);
  assert.equal(summary.days[0].dateISO, "2026-08-04");
  assert.equal(summary.days[6].dateISO, "2026-08-10");
});

test("13. Previous-7-day total sums days 8–14 back, independent of the current window", () => {
  const stats = [
    { dateISO: "2026-08-03", newWordsCompleted: 4 }, // today-7, in previous window
    { dateISO: "2026-07-28", newWordsCompleted: 6 }, // today-13, in previous window
    { dateISO: "2026-07-27", newWordsCompleted: 50 }, // today-14, out of previous window
    { dateISO: "2026-08-10", newWordsCompleted: 999 }, // today, out of previous window
  ];
  const summary = computeWordsLearnedSummary(stats, TODAY);
  assert.equal(summary.previousTotal, 10);
});

test("14. Positive difference when the current window beats the previous one", () => {
  const stats = [
    { dateISO: "2026-08-10", newWordsCompleted: 20 }, // current window
    { dateISO: "2026-08-03", newWordsCompleted: 4 }, // previous window
  ];
  const summary = computeWordsLearnedSummary(stats, TODAY);
  assert.equal(summary.total, 20);
  assert.equal(summary.previousTotal, 4);
  assert.equal(summary.difference, 16);
  assert.ok(summary.difference > 0);
});

test("15. Negative difference when the current window is behind the previous one", () => {
  const stats = [
    { dateISO: "2026-08-10", newWordsCompleted: 2 }, // current window
    { dateISO: "2026-08-03", newWordsCompleted: 7 }, // previous window
  ];
  const summary = computeWordsLearnedSummary(stats, TODAY);
  assert.equal(summary.total, 2);
  assert.equal(summary.previousTotal, 7);
  assert.equal(summary.difference, -5);
  assert.ok(summary.difference < 0);
});

test("16. Zero activity in both windows yields real zeros, not omitted/undefined values", () => {
  const summary = computeWordsLearnedSummary([], TODAY);
  assert.equal(summary.total, 0);
  assert.equal(summary.previousTotal, 0);
  assert.equal(summary.difference, 0);
  assert.equal(summary.days.length, 7);
  assert.ok(summary.days.every((day) => day.count === 0));
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("words-learned-summary guard passed");
}
