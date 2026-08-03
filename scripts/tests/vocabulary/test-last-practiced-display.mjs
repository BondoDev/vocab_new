// Focused guard for the pure relative-date classification in
// src/features/user-profile/sections/vocabulary/lastPracticedDisplay.ts.
//
// Run: node --experimental-strip-types scripts/tests/vocabulary/test-last-practiced-display.mjs
import assert from "node:assert/strict";
import { computeLastPracticedDisplay } from "../../../src/features/user-profile/sections/vocabulary/lastPracticedDisplay.ts";

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

const NOW = new Date(2026, 7, 15, 14, 30, 0); // Aug 15, 2026, 2:30pm local

console.log("\n=== computeLastPracticedDisplay ===\n");

test("1. null -> never", () => {
  assert.deepEqual(computeLastPracticedDisplay(null, NOW), { kind: "never" });
});

test("2. undefined -> never", () => {
  assert.deepEqual(computeLastPracticedDisplay(undefined, NOW), { kind: "never" });
});

test("3. Unparseable string -> never (does not throw)", () => {
  assert.deepEqual(computeLastPracticedDisplay("not-a-date", NOW), { kind: "never" });
});

test("4. Same calendar day, earlier time -> today", () => {
  const earlierToday = new Date(2026, 7, 15, 9, 0, 0).toISOString();
  assert.deepEqual(computeLastPracticedDisplay(earlierToday, NOW), { kind: "today" });
});

test("5. Previous calendar day, even if less than 24h ago -> yesterday", () => {
  // 11pm the day before "now" (2:30pm) is only ~15.5 hours earlier, but it's
  // a different calendar day, so this must read as Yesterday, not Today.
  const lateYesterday = new Date(2026, 7, 14, 23, 0, 0).toISOString();
  assert.deepEqual(computeLastPracticedDisplay(lateYesterday, NOW), { kind: "yesterday" });
});

test("6. Two calendar days back -> daysAgo: 2", () => {
  const twoDaysAgo = new Date(2026, 7, 13, 10, 0, 0).toISOString();
  assert.deepEqual(computeLastPracticedDisplay(twoDaysAgo, NOW), { kind: "daysAgo", days: 2 });
});

test("7. One week back -> daysAgo: 7", () => {
  const oneWeekAgo = new Date(2026, 7, 8, 10, 0, 0).toISOString();
  assert.deepEqual(computeLastPracticedDisplay(oneWeekAgo, NOW), { kind: "daysAgo", days: 7 });
});

test("8. Future/clock-skew timestamp defensively reads as today, not negative days", () => {
  const future = new Date(2026, 7, 20, 10, 0, 0).toISOString();
  assert.deepEqual(computeLastPracticedDisplay(future, NOW), { kind: "today" });
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("last-practiced-display guard passed");
}
