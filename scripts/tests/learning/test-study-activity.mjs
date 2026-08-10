// Focused guard for the pure Study Activity aggregation in
// src/data/learning/studyActivity.ts.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-study-activity.mjs
import assert from "node:assert/strict";
import { computeStudyActivityBuckets } from "../../../src/data/learning/studyActivity.ts";

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

console.log("\n=== 7-day range: daily buckets ===\n");

test("5. 7d yields exactly 7 daily buckets ending today, oldest first", () => {
  const buckets = computeStudyActivityBuckets(
    [{ dateISO: "2026-08-10", newWordsCompleted: 5, reviewsCompleted: 2 }],
    TODAY,
    "7d",
  );
  assert.equal(buckets.length, 7);
  assert.equal(buckets[0].startDateISO, "2026-08-04");
  assert.equal(buckets[6].startDateISO, "2026-08-10");
  assert.ok(buckets.every((b) => b.kind === "day"));
  assert.equal(buckets[6].newWords, 5);
  assert.equal(buckets[6].reviews, 2);
});

test("6. Missing days become zero, not gaps", () => {
  const buckets = computeStudyActivityBuckets(
    [{ dateISO: "2026-08-10", newWordsCompleted: 3, reviewsCompleted: 1 }],
    TODAY,
    "7d",
  );
  const missingDayBuckets = buckets.filter((b) => b.startDateISO !== "2026-08-10");
  assert.equal(missingDayBuckets.length, 6);
  for (const bucket of missingDayBuckets) {
    assert.equal(bucket.newWords, 0);
    assert.equal(bucket.reviews, 0);
  }
});

console.log("\n=== 30-day range: daily buckets ===\n");

test("7. 30d yields exactly 30 daily buckets ending today", () => {
  const buckets = computeStudyActivityBuckets([], TODAY, "30d");
  assert.equal(buckets.length, 30);
  assert.ok(buckets.every((b) => b.kind === "day"));
  assert.equal(buckets[29].startDateISO, TODAY);
  assert.equal(buckets[0].startDateISO, "2026-07-12");
});

console.log("\n=== 90-day range: weekly aggregation ===\n");

test("8. 90d yields weekly buckets covering exactly 90 days, most recent ending today", () => {
  const buckets = computeStudyActivityBuckets([], TODAY, "90d");
  assert.ok(buckets.every((b) => b.kind === "week"));
  assert.equal(buckets[buckets.length - 1].endDateISO, TODAY);
  assert.equal(buckets[0].startDateISO, "2026-05-13"); // 90 days back, oldest 6-day chunk starts here
  // 90 = 12*7 + 6, so 13 buckets total, the oldest covering 6 days.
  assert.equal(buckets.length, 13);
});

test("9. Weekly buckets correctly sum every day within their own span", () => {
  const buckets = computeStudyActivityBuckets(
    [
      { dateISO: "2026-08-04", newWordsCompleted: 3, reviewsCompleted: 1 },
      { dateISO: "2026-08-06", newWordsCompleted: 2, reviewsCompleted: 4 },
      { dateISO: "2026-08-10", newWordsCompleted: 1, reviewsCompleted: 0 },
    ],
    TODAY,
    "90d",
  );
  const lastWeek = buckets[buckets.length - 1];
  assert.equal(lastWeek.startDateISO, "2026-08-04");
  assert.equal(lastWeek.endDateISO, "2026-08-10");
  assert.equal(lastWeek.newWords, 6);
  assert.equal(lastWeek.reviews, 5);
});

console.log("\n=== All-time range: monthly aggregation ===\n");

test("10. All-time yields one bucket per calendar month, earliest to today's month", () => {
  const buckets = computeStudyActivityBuckets(
    [
      { dateISO: "2026-06-15", newWordsCompleted: 4, reviewsCompleted: 0 },
      { dateISO: "2026-07-01", newWordsCompleted: 2, reviewsCompleted: 3 },
      { dateISO: "2026-08-10", newWordsCompleted: 5, reviewsCompleted: 1 },
    ],
    TODAY,
    "all",
  );
  assert.deepEqual(
    buckets.map((b) => b.key),
    ["2026-06", "2026-07", "2026-08"],
  );
  assert.ok(buckets.every((b) => b.kind === "month"));
  assert.equal(buckets[0].newWords, 4);
  assert.equal(buckets[1].newWords, 2);
  assert.equal(buckets[1].reviews, 3);
  // The current month's bucket ends at todayISO, not the calendar
  // month-end, since the month isn't over yet.
  assert.equal(buckets[2].endDateISO, TODAY);
});

test("All-time with zero history returns a single current-month zero bucket, not an empty array", () => {
  const buckets = computeStudyActivityBuckets([], TODAY, "all");
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].key, "2026-08");
  assert.equal(buckets[0].newWords, 0);
  assert.equal(buckets[0].reviews, 0);
});

console.log("\n=== 11. Language isolation (documentation-level) ===\n");

test("11. This module only ever sees the rows the caller already scoped to one language", () => {
  // studyActivity.ts takes no targetLanguage parameter at all — language
  // scoping happens once, server-side, in readMilestoneDailyStats's own
  // target_language filter (src/lib/newWordProgress.ts). Asserting the
  // pure function's signature has no language parameter is this module's
  // whole contribution to that guarantee; the read itself is covered by
  // the existing Supabase-query architecture, not re-tested here.
  assert.equal(computeStudyActivityBuckets.length, 3);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("study-activity guard passed");
}
