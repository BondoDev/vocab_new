// Focused guard for the pure total-time derivation helper in
// src/lib/learningTimeStats.ts. Import-free beyond its own module, so it
// loads directly via `node --experimental-strip-types`, matching every
// other pure module's test script in this repository.
//
// Run: node --experimental-strip-types scripts/tests/lib/test-learning-time-stats.mjs
import assert from "node:assert/strict";
import {
  computeTotalTimeSeconds,
  deriveLearningModeTimeTotals,
  parseLearningModeTimeRow,
} from "../../../src/lib/learningTimeStats.ts";

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

console.log("\n=== learningTimeStats: total calculation ===\n");

test("1. 10 + 20 + 30 = 60", () => {
  const total = computeTotalTimeSeconds({ newWordStudyTimeSeconds: 10, reviewTimeSeconds: 20, customPracticeTimeSeconds: 30 });
  assert.equal(total, 60);
});

test("2. All-zero input sums to 0", () => {
  const total = computeTotalTimeSeconds({ newWordStudyTimeSeconds: 0, reviewTimeSeconds: 0, customPracticeTimeSeconds: 0 });
  assert.equal(total, 0);
});

console.log("\n=== learningTimeStats: parsing raw rows ===\n");

test("3. A fully-populated row parses all three columns correctly", () => {
  const parsed = parseLearningModeTimeRow({
    new_word_study_time_seconds: 111,
    review_time_seconds: 222,
    custom_practice_time_seconds: 333,
  });
  assert.deepEqual(parsed, { newWordStudyTimeSeconds: 111, reviewTimeSeconds: 222, customPracticeTimeSeconds: 333 });
});

test("4. Missing legacy values (row predates the new columns) safely fall back to 0", () => {
  const parsed = parseLearningModeTimeRow({ new_word_study_time_seconds: 42 });
  assert.deepEqual(parsed, { newWordStudyTimeSeconds: 42, reviewTimeSeconds: 0, customPracticeTimeSeconds: 0 });
});

test("5. null row falls back to all zeros", () => {
  const parsed = parseLearningModeTimeRow(null);
  assert.deepEqual(parsed, { newWordStudyTimeSeconds: 0, reviewTimeSeconds: 0, customPracticeTimeSeconds: 0 });
});

test("6. undefined row falls back to all zeros", () => {
  const parsed = parseLearningModeTimeRow(undefined);
  assert.deepEqual(parsed, { newWordStudyTimeSeconds: 0, reviewTimeSeconds: 0, customPracticeTimeSeconds: 0 });
});

test("7. Non-numeric raw values (string/null/undefined) fall back to 0 per field", () => {
  const parsed = parseLearningModeTimeRow({
    new_word_study_time_seconds: "12",
    review_time_seconds: null,
    custom_practice_time_seconds: undefined,
  });
  assert.deepEqual(parsed, { newWordStudyTimeSeconds: 0, reviewTimeSeconds: 0, customPracticeTimeSeconds: 0 });
});

test("8. NaN/Infinity raw values fall back to 0", () => {
  const parsed = parseLearningModeTimeRow({
    new_word_study_time_seconds: Number.NaN,
    review_time_seconds: Number.POSITIVE_INFINITY,
    custom_practice_time_seconds: Number.NEGATIVE_INFINITY,
  });
  assert.deepEqual(parsed, { newWordStudyTimeSeconds: 0, reviewTimeSeconds: 0, customPracticeTimeSeconds: 0 });
});

test("9. A negative raw value (should be unreachable given the DB's own CHECK constraints) is floored to 0, never propagated", () => {
  const parsed = parseLearningModeTimeRow({ new_word_study_time_seconds: -5, review_time_seconds: -1, custom_practice_time_seconds: 0 });
  assert.deepEqual(parsed, { newWordStudyTimeSeconds: 0, reviewTimeSeconds: 0, customPracticeTimeSeconds: 0 });
});

console.log("\n=== learningTimeStats: derived totals ===\n");

test("10. deriveLearningModeTimeTotals attaches the correct derived total to a full row", () => {
  const totals = deriveLearningModeTimeTotals({
    new_word_study_time_seconds: 10,
    review_time_seconds: 20,
    custom_practice_time_seconds: 30,
  });
  assert.deepEqual(totals, {
    newWordStudyTimeSeconds: 10,
    reviewTimeSeconds: 20,
    customPracticeTimeSeconds: 30,
    totalTimeSeconds: 60,
  });
});

test("11. deriveLearningModeTimeTotals on a legacy/partial row never returns a negative total", () => {
  const totals = deriveLearningModeTimeTotals({});
  assert.equal(totals.totalTimeSeconds, 0);
  assert.ok(totals.totalTimeSeconds >= 0);
});

test("12. The total is never itself stored/returned as a raw column key (no total_time_seconds passthrough field)", () => {
  const totals = deriveLearningModeTimeTotals({ new_word_study_time_seconds: 5, review_time_seconds: 5, custom_practice_time_seconds: 5 });
  assert.equal(Object.keys(totals).sort().join(","), "customPracticeTimeSeconds,newWordStudyTimeSeconds,reviewTimeSeconds,totalTimeSeconds");
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("learning-time-stats guard passed");
}
