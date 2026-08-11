// Focused guard for the pure Study Activity aggregation in
// src/data/learning/studyActivity.ts.
//
// STUDY ACTIVITY PHASE 1 — this module now aggregates ACTIVE STUDY TIME
// (three per-mode second counts) instead of quantities (new words/reviews
// completed) — see studyActivity.ts's own header. This test file was
// rewritten accordingly; the bucketing structure itself (7d/30d daily, 90d
// weekly, all monthly, zero-bucket preservation) is unchanged from the
// quantity-era version and is still exercised the same way, just with
// three-mode-seconds inputs/outputs instead of two-count ones.
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

function stat(dateISO, newWordStudyTimeSeconds, reviewTimeSeconds, customPracticeTimeSeconds) {
  return { dateISO, newWordStudyTimeSeconds, reviewTimeSeconds, customPracticeTimeSeconds };
}

console.log("\n=== 7-day range: daily buckets ===\n");

test("1. 7d yields exactly 7 daily buckets ending today, oldest first", () => {
  const buckets = computeStudyActivityBuckets([stat("2026-08-10", 300, 120, 60)], TODAY, "7d");
  assert.equal(buckets.length, 7);
  assert.equal(buckets[0].startDateISO, "2026-08-04");
  assert.equal(buckets[6].startDateISO, "2026-08-10");
  assert.ok(buckets.every((b) => b.kind === "day"));
});

test("2. Each bucket carries the three per-mode seconds fields plus a derived total", () => {
  const buckets = computeStudyActivityBuckets([stat("2026-08-10", 300, 120, 60)], TODAY, "7d");
  const today = buckets[6];
  assert.equal(today.newWordStudyTimeSeconds, 300);
  assert.equal(today.reviewTimeSeconds, 120);
  assert.equal(today.customPracticeTimeSeconds, 60);
  assert.equal(today.totalSeconds, 480);
});

test("3. Missing days become a genuine zero bucket, not a gap", () => {
  const buckets = computeStudyActivityBuckets([stat("2026-08-10", 180, 60, 0)], TODAY, "7d");
  const missingDayBuckets = buckets.filter((b) => b.startDateISO !== "2026-08-10");
  assert.equal(missingDayBuckets.length, 6);
  for (const bucket of missingDayBuckets) {
    assert.equal(bucket.newWordStudyTimeSeconds, 0);
    assert.equal(bucket.reviewTimeSeconds, 0);
    assert.equal(bucket.customPracticeTimeSeconds, 0);
    assert.equal(bucket.totalSeconds, 0);
  }
});

test("4. total = sum of the three modes for every bucket", () => {
  const buckets = computeStudyActivityBuckets(
    [stat("2026-08-08", 100, 50, 25), stat("2026-08-10", 40, 0, 10)],
    TODAY,
    "7d",
  );
  for (const bucket of buckets) {
    assert.equal(
      bucket.totalSeconds,
      bucket.newWordStudyTimeSeconds + bucket.reviewTimeSeconds + bucket.customPracticeTimeSeconds,
    );
  }
});

console.log("\n=== 30-day range: daily buckets ===\n");

test("5. 30d yields exactly 30 daily buckets ending today", () => {
  const buckets = computeStudyActivityBuckets([], TODAY, "30d");
  assert.equal(buckets.length, 30);
  assert.ok(buckets.every((b) => b.kind === "day"));
  assert.equal(buckets[29].startDateISO, TODAY);
  assert.equal(buckets[0].startDateISO, "2026-07-12");
});

test("6. 30d with no history at all is all genuine zero buckets (not omitted)", () => {
  const buckets = computeStudyActivityBuckets([], TODAY, "30d");
  assert.ok(buckets.every((b) => b.totalSeconds === 0));
  assert.equal(buckets.length, 30);
});

console.log("\n=== 90-day range: weekly aggregation ===\n");

test("7. 90d yields weekly buckets covering exactly 90 days, most recent ending today", () => {
  const buckets = computeStudyActivityBuckets([], TODAY, "90d");
  assert.ok(buckets.every((b) => b.kind === "week"));
  assert.equal(buckets[buckets.length - 1].endDateISO, TODAY);
  assert.equal(buckets[0].startDateISO, "2026-05-13"); // 90 days back, oldest 6-day chunk starts here
  // 90 = 12*7 + 6, so 13 buckets total, the oldest covering 6 days.
  assert.equal(buckets.length, 13);
});

test("8. Weekly buckets correctly sum every mode across every day within their own span", () => {
  const buckets = computeStudyActivityBuckets(
    [stat("2026-08-04", 180, 60, 0), stat("2026-08-06", 120, 240, 30), stat("2026-08-10", 60, 0, 15)],
    TODAY,
    "90d",
  );
  const lastWeek = buckets[buckets.length - 1];
  assert.equal(lastWeek.startDateISO, "2026-08-04");
  assert.equal(lastWeek.endDateISO, "2026-08-10");
  assert.equal(lastWeek.newWordStudyTimeSeconds, 360);
  assert.equal(lastWeek.reviewTimeSeconds, 300);
  assert.equal(lastWeek.customPracticeTimeSeconds, 45);
  assert.equal(lastWeek.totalSeconds, 705);
});

console.log("\n=== All-time range: monthly aggregation ===\n");

test("9. All-time yields one bucket per calendar month, earliest to today's month", () => {
  const buckets = computeStudyActivityBuckets(
    [stat("2026-06-15", 240, 0, 0), stat("2026-07-01", 120, 180, 0), stat("2026-08-10", 300, 60, 30)],
    TODAY,
    "all",
  );
  assert.deepEqual(
    buckets.map((b) => b.key),
    ["2026-06", "2026-07", "2026-08"],
  );
  assert.ok(buckets.every((b) => b.kind === "month"));
  assert.equal(buckets[0].newWordStudyTimeSeconds, 240);
  assert.equal(buckets[1].newWordStudyTimeSeconds, 120);
  assert.equal(buckets[1].reviewTimeSeconds, 180);
  // The current month's bucket ends at todayISO, not the calendar
  // month-end, since the month isn't over yet.
  assert.equal(buckets[2].endDateISO, TODAY);
});

test("10. All-time with zero history returns a single current-month zero bucket, not an empty array", () => {
  const buckets = computeStudyActivityBuckets([], TODAY, "all");
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].key, "2026-08");
  assert.equal(buckets[0].totalSeconds, 0);
});

console.log("\n=== Legacy data is never falsely assigned to a mode ===\n");

test("11. A row with only newWordStudyTimeSeconds populated never leaks into review/practice totals", () => {
  const buckets = computeStudyActivityBuckets([stat("2026-08-10", 900, 0, 0)], TODAY, "7d");
  const today = buckets[6];
  assert.equal(today.newWordStudyTimeSeconds, 900);
  assert.equal(today.reviewTimeSeconds, 0);
  assert.equal(today.customPracticeTimeSeconds, 0);
  // This module never fabricates a fourth "Uncategorized" bucket or field —
  // every StudyActivityBucket has exactly the three named modes plus their
  // derived total, nothing else.
  assert.deepEqual(
    Object.keys(buckets[0]).sort(),
    ["customPracticeTimeSeconds", "endDateISO", "key", "kind", "newWordStudyTimeSeconds", "reviewTimeSeconds", "startDateISO", "totalSeconds"],
  );
});

console.log("\n=== Language isolation (documentation-level) ===\n");

test("12. This module only ever sees the rows the caller already scoped to one language", () => {
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
