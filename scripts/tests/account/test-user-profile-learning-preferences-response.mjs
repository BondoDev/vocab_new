// Contract guard for update_user_profile_learning_preferences's response
// parser (src/lib/userProfileLearningPreferences.ts) — Settings Current Level
// editing follow-up. Same behavioral, direct-import precedent as
// test-user-profile-languages-response.mjs.
//
// Run: node --experimental-strip-types scripts/tests/account/test-user-profile-learning-preferences-response.mjs
import assert from "node:assert/strict";
import { parseUpdateUserProfileLearningPreferencesRow } from "../../../src/lib/userProfileLearningPreferences.ts";

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
  native_language: "en",
  learning_language: "fr",
  current_level: "B2",
  updated_at: "2026-08-13T12:00:00.000Z",
};

console.log("\n=== update_user_profile_learning_preferences response parser contract ===\n");

test("1. A fully valid row parses to the expected typed result", () => {
  const result = parseUpdateUserProfileLearningPreferencesRow(VALID_ROW);
  assert.deepEqual(result, {
    nativeLanguage: "en",
    learningLanguage: "fr",
    currentLevel: "B2",
    updatedAt: "2026-08-13T12:00:00.000Z",
  });
});

test("2. Every supported language code round-trips for both language fields", () => {
  for (const code of ["en", "es", "fr", "pt", "it", "de", "ru"]) {
    const result = parseUpdateUserProfileLearningPreferencesRow({ ...VALID_ROW, native_language: code });
    assert.equal(result.nativeLanguage, code);
    const result2 = parseUpdateUserProfileLearningPreferencesRow({ ...VALID_ROW, learning_language: code });
    assert.equal(result2.learningLanguage, code);
  }
});

test("3. Every supported CEFR level round-trips for current_level, in rank order, never alphabetical", () => {
  for (const code of ["A1", "A2", "B1", "B2", "C1", "C2"]) {
    const result = parseUpdateUserProfileLearningPreferencesRow({ ...VALID_ROW, current_level: code });
    assert.equal(result.currentLevel, code);
  }
});

test("4. An unsupported language code is rejected for either field", () => {
  assert.throws(
    () => parseUpdateUserProfileLearningPreferencesRow({ ...VALID_ROW, native_language: "zh" }),
    /native_language must be one of/,
  );
  assert.throws(
    () => parseUpdateUserProfileLearningPreferencesRow({ ...VALID_ROW, learning_language: "EN" }),
    /learning_language must be one of/,
  );
});

test("5. An unsupported CEFR level is rejected — no lowercase, no partial code, no out-of-set value", () => {
  assert.throws(
    () => parseUpdateUserProfileLearningPreferencesRow({ ...VALID_ROW, current_level: "b2" }),
    /current_level must be one of/,
  );
  assert.throws(
    () => parseUpdateUserProfileLearningPreferencesRow({ ...VALID_ROW, current_level: "A" }),
    /current_level must be one of/,
  );
  assert.throws(
    () => parseUpdateUserProfileLearningPreferencesRow({ ...VALID_ROW, current_level: "D1" }),
    /current_level must be one of/,
  );
});

test("6. Empty response array shape is rejected directly by this parser (the caller's own array-length check applies first)", () => {
  assert.throws(() => parseUpdateUserProfileLearningPreferencesRow([]), /malformed row/);
  assert.throws(() => parseUpdateUserProfileLearningPreferencesRow([VALID_ROW]), /malformed row/);
  assert.throws(() => parseUpdateUserProfileLearningPreferencesRow([VALID_ROW, VALID_ROW]), /malformed row/);
});

test("7. Missing required fields are each rejected individually", () => {
  for (const field of ["native_language", "learning_language", "current_level", "updated_at"]) {
    const row = { ...VALID_ROW };
    delete row[field];
    assert.throws(
      () => parseUpdateUserProfileLearningPreferencesRow(row),
      (err) => err.category === "unexpected_response",
      `missing ${field} must be rejected`,
    );
  }
});

test("8. A malformed (empty/whitespace/non-string) updated_at timestamp is rejected", () => {
  assert.throws(
    () => parseUpdateUserProfileLearningPreferencesRow({ ...VALID_ROW, updated_at: "" }),
    /updated_at must be a non-empty string/,
  );
  assert.throws(
    () => parseUpdateUserProfileLearningPreferencesRow({ ...VALID_ROW, updated_at: "   " }),
    /updated_at must be a non-empty string/,
  );
  assert.throws(
    () => parseUpdateUserProfileLearningPreferencesRow({ ...VALID_ROW, updated_at: 12345 }),
    /updated_at must be a non-empty string/,
  );
  assert.throws(
    () => parseUpdateUserProfileLearningPreferencesRow({ ...VALID_ROW, updated_at: null }),
    /updated_at must be a non-empty string/,
  );
});

test("9. An unexpected null row, a bare string, and a bare number are all rejected", () => {
  assert.throws(() => parseUpdateUserProfileLearningPreferencesRow(null), /malformed row/);
  assert.throws(() => parseUpdateUserProfileLearningPreferencesRow(undefined), /malformed row/);
  assert.throws(() => parseUpdateUserProfileLearningPreferencesRow("not a row"), /malformed row/);
  assert.throws(() => parseUpdateUserProfileLearningPreferencesRow(42), /malformed row/);
});

test("10. A boolean or array standing in for a value is rejected (never truthy-coerced)", () => {
  assert.throws(
    () => parseUpdateUserProfileLearningPreferencesRow({ ...VALID_ROW, native_language: true }),
    /native_language must be one of/,
  );
  assert.throws(
    () => parseUpdateUserProfileLearningPreferencesRow({ ...VALID_ROW, current_level: ["B2"] }),
    /current_level must be one of/,
  );
});

test("11. Every thrown error carries the unexpected_response category (ClassifiedSupabaseError contract)", () => {
  try {
    parseUpdateUserProfileLearningPreferencesRow(null);
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
  console.log("update_user_profile_learning_preferences response parser contract passed");
}
