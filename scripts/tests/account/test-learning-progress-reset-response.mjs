// Contract guard for reset_learning_language_progress's response parser
// (src/lib/learningProgressReset.ts) — Settings Phase 1's target-language
// reset primitive. Same behavioral, direct-import precedent as
// test-user-profile-languages-response.mjs.
//
// Run: node --experimental-strip-types scripts/tests/account/test-learning-progress-reset-response.mjs
import assert from "node:assert/strict";
import { parseResetLearningLanguageProgressRow } from "../../../src/lib/learningProgressReset.ts";

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

const VALID_ROW = {
  reset: true,
  target_language: "de",
  word_progress_deleted: 42,
  daily_stats_deleted: 7,
  review_events_deleted: 130,
  custom_practice_events_deleted: 3,
};

console.log("\n=== reset_learning_language_progress response parser contract ===\n");

test("1. A fully valid row parses to the expected typed result", () => {
  const result = parseResetLearningLanguageProgressRow(VALID_ROW);
  assert.deepEqual(result, {
    reset: true,
    targetLanguage: "de",
    wordProgressDeleted: 42,
    dailyStatsDeleted: 7,
    reviewEventsDeleted: 130,
    customPracticeEventsDeleted: 3,
  });
});

test("2. Every supported language code round-trips as target_language", () => {
  for (const code of ["en", "es", "fr", "pt", "it", "de", "ru"]) {
    const result = parseResetLearningLanguageProgressRow({ ...VALID_ROW, target_language: code });
    assert.equal(result.targetLanguage, code);
  }
});

test("3. An unsupported language code is rejected", () => {
  assert.throws(
    () => parseResetLearningLanguageProgressRow({ ...VALID_ROW, target_language: "zh" }),
    /target_language must be one of/,
  );
});

test("4. Zero-count deletions (a language the caller never studied) still parse successfully — idempotent, never a not-found error", () => {
  const result = parseResetLearningLanguageProgressRow({
    ...VALID_ROW,
    word_progress_deleted: 0,
    daily_stats_deleted: 0,
    review_events_deleted: 0,
    custom_practice_events_deleted: 0,
  });
  assert.equal(result.wordProgressDeleted, 0);
  assert.equal(result.dailyStatsDeleted, 0);
  assert.equal(result.reviewEventsDeleted, 0);
  assert.equal(result.customPracticeEventsDeleted, 0);
});

test("5. A non-boolean reset flag is rejected", () => {
  assert.throws(() => parseResetLearningLanguageProgressRow({ ...VALID_ROW, reset: "true" }), /reset must be a boolean/);
  assert.throws(() => parseResetLearningLanguageProgressRow({ ...VALID_ROW, reset: undefined }), /reset must be a boolean/);
});

test("6. Negative or non-integer deletion counts are each rejected individually", () => {
  for (const field of [
    "word_progress_deleted",
    "daily_stats_deleted",
    "review_events_deleted",
    "custom_practice_events_deleted",
  ]) {
    assert.throws(
      () => parseResetLearningLanguageProgressRow({ ...VALID_ROW, [field]: -1 }),
      new RegExp(`${field} must be a non-negative integer`),
      `${field} must reject a negative value`,
    );
    assert.throws(
      () => parseResetLearningLanguageProgressRow({ ...VALID_ROW, [field]: 1.5 }),
      new RegExp(`${field} must be a non-negative integer`),
      `${field} must reject a non-integer value`,
    );
    assert.throws(
      () => parseResetLearningLanguageProgressRow({ ...VALID_ROW, [field]: "3" }),
      new RegExp(`${field} must be a non-negative integer`),
      `${field} must reject a string value`,
    );
  }
});

test("7. An unexpected null row, a bare string, and an array are all rejected", () => {
  assert.throws(() => parseResetLearningLanguageProgressRow(null), /malformed row/);
  assert.throws(() => parseResetLearningLanguageProgressRow(undefined), /malformed row/);
  assert.throws(() => parseResetLearningLanguageProgressRow("not a row"), /malformed row/);
  assert.throws(() => parseResetLearningLanguageProgressRow([VALID_ROW]), /malformed row/);
});

test("8. Every thrown error carries the unexpected_response category (ClassifiedSupabaseError contract)", () => {
  try {
    parseResetLearningLanguageProgressRow(null);
    assert.fail("must throw");
  } catch (err) {
    assert.equal(err.category, "unexpected_response");
    assert.equal(err.name, "ClassifiedSupabaseError");
  }
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("reset_learning_language_progress response parser contract passed");
}
