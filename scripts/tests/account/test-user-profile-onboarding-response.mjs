// Contract guard for complete_user_profile_onboarding's response parser
// (src/lib/userProfileOnboarding.ts) — Profile Phase 1's narrow onboarding
// RPC. Behavioral, not source-text: this imports and exercises the real
// parser directly via Node's native TypeScript stripping
// (--experimental-strip-types), matching
// scripts/tests/learning/test-daily-goal-selector-contract.mjs's precedent
// for src/lib/dailyGoalUpdate.ts (both files are extension-imported and
// import-chain-free of anything that would require a bundler).
//
// Run: node --experimental-strip-types scripts/tests/account/test-user-profile-onboarding-response.mjs
import assert from "node:assert/strict";
import {
  parseCompleteUserProfileOnboardingRow,
  isSupportedLanguageCode,
  SUPPORTED_LANGUAGE_CODES,
} from "../../../src/lib/userProfileOnboarding.ts";

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
  nickname: "Alex",
  native_language: "en",
  learning_language: "es",
  current_level: "B1",
  user_age: 27,
  birth_month: 6,
  birth_day: 15,
  onboarding_completed: true,
  daily_goal: 15,
  timezone: "Europe/Tbilisi",
  timezone_updated_at: "2026-08-06T12:00:00.000Z",
  updated_at: "2026-08-06T12:00:00.000Z",
};

console.log("\n=== complete_user_profile_onboarding response parser contract ===\n");

test("1. SUPPORTED_LANGUAGE_CODES is exactly the seven supported codes", () => {
  assert.deepEqual(SUPPORTED_LANGUAGE_CODES, ["en", "es", "fr", "pt", "it", "de", "ru"]);
});

test("2. isSupportedLanguageCode accepts every supported code and rejects everything else", () => {
  for (const code of ["en", "es", "fr", "pt", "it", "de", "ru"]) {
    assert.equal(isSupportedLanguageCode(code), true, `${code} must be accepted`);
  }
  for (const code of ["EN", "en-US", "zh", "", null, undefined, 5, ["en"]]) {
    assert.equal(isSupportedLanguageCode(code), false, `${JSON.stringify(code)} must be rejected`);
  }
});

test("3. A fully valid row parses to the expected typed result", () => {
  const result = parseCompleteUserProfileOnboardingRow(VALID_ROW);
  assert.deepEqual(result, {
    nickname: "Alex",
    nativeLanguage: "en",
    learningLanguage: "es",
    currentLevel: "B1",
    userAge: 27,
    birthMonth: 6,
    birthDay: 15,
    onboardingCompleted: true,
    dailyGoal: 15,
    timezone: "Europe/Tbilisi",
    timezoneUpdatedAt: "2026-08-06T12:00:00.000Z",
    updatedAt: "2026-08-06T12:00:00.000Z",
  });
});

test("4. A row with null timezone/timezone_updated_at (never-initialized profile) parses those as null, not an error", () => {
  const result = parseCompleteUserProfileOnboardingRow({
    ...VALID_ROW,
    timezone: null,
    timezone_updated_at: null,
  });
  assert.equal(result.timezone, null);
  assert.equal(result.timezoneUpdatedAt, null);
});

test("5. Every one of the five supported daily-goal presets is accepted", () => {
  for (const dailyGoal of [10, 15, 20, 30, 50]) {
    const result = parseCompleteUserProfileOnboardingRow({ ...VALID_ROW, daily_goal: dailyGoal });
    assert.equal(result.dailyGoal, dailyGoal);
  }
});

test("6. An unsupported-in-range daily_goal (e.g. 25) is rejected as unexpected_response", () => {
  assert.throws(
    () => parseCompleteUserProfileOnboardingRow({ ...VALID_ROW, daily_goal: 25 }),
    (err) => err.category === "unexpected_response" && /daily_goal must be one of 10, 15, 20, 30, 50/.test(err.message),
  );
});

test("7. Empty response array shape is not a row this parser accepts directly (caller's own array-length check applies first)", () => {
  // Mirrors updateDailyGoal/initializeUserTimezone's own contract: the
  // parser itself only ever receives a single row object (or undefined) —
  // the caller (completeUserProfileOnboarding in userProfile.ts) is
  // responsible for rejecting a zero/multi-length array before calling
  // this parser. Passing an array directly must still fail safely, not
  // silently unwrap it.
  assert.throws(() => parseCompleteUserProfileOnboardingRow([]), /malformed row/);
  assert.throws(() => parseCompleteUserProfileOnboardingRow([VALID_ROW]), /malformed row/);
  assert.throws(() => parseCompleteUserProfileOnboardingRow([VALID_ROW, VALID_ROW]), /malformed row/);
});

test("8. Missing required fields are each rejected individually with a field-naming message", () => {
  for (const field of [
    "nickname",
    "native_language",
    "learning_language",
    "current_level",
    "user_age",
    "birth_month",
    "birth_day",
    "onboarding_completed",
    "daily_goal",
    "updated_at",
  ]) {
    const row = { ...VALID_ROW };
    delete row[field];
    assert.throws(
      () => parseCompleteUserProfileOnboardingRow(row),
      (err) => err.category === "unexpected_response",
      `missing ${field} must be rejected`,
    );
  }
});

test("9. An invalid language code is rejected", () => {
  assert.throws(
    () => parseCompleteUserProfileOnboardingRow({ ...VALID_ROW, native_language: "zh" }),
    /native_language must be one of/,
  );
  assert.throws(
    () => parseCompleteUserProfileOnboardingRow({ ...VALID_ROW, learning_language: "EN" }),
    /learning_language must be one of/,
  );
});

test("10. An invalid CEFR level is rejected", () => {
  assert.throws(
    () => parseCompleteUserProfileOnboardingRow({ ...VALID_ROW, current_level: "D1" }),
    /current_level must be one of/,
  );
});

test("11. Out-of-range/non-integer numbers are rejected (age, birth_month, birth_day)", () => {
  assert.throws(() => parseCompleteUserProfileOnboardingRow({ ...VALID_ROW, user_age: 9 }), /user_age must be an integer between 10 and 100/);
  assert.throws(() => parseCompleteUserProfileOnboardingRow({ ...VALID_ROW, user_age: 101 }), /user_age must be an integer between 10 and 100/);
  assert.throws(() => parseCompleteUserProfileOnboardingRow({ ...VALID_ROW, user_age: 27.5 }), /user_age must be an integer/);
  assert.throws(() => parseCompleteUserProfileOnboardingRow({ ...VALID_ROW, birth_month: 0 }), /birth_month must be an integer between 1 and 12/);
  assert.throws(() => parseCompleteUserProfileOnboardingRow({ ...VALID_ROW, birth_month: 13 }), /birth_month must be an integer between 1 and 12/);
  assert.throws(() => parseCompleteUserProfileOnboardingRow({ ...VALID_ROW, birth_day: 0 }), /birth_day must be an integer between 1 and 31/);
  assert.throws(() => parseCompleteUserProfileOnboardingRow({ ...VALID_ROW, birth_day: 32 }), /birth_day must be an integer between 1 and 31/);
});

test("12. A malformed boolean (string 'true' instead of a real boolean) is rejected, never coerced", () => {
  assert.throws(
    () => parseCompleteUserProfileOnboardingRow({ ...VALID_ROW, onboarding_completed: "true" }),
    /onboarding_completed must be a boolean/,
  );
});

test("13. A malformed (empty/whitespace) updated_at timestamp is rejected", () => {
  assert.throws(() => parseCompleteUserProfileOnboardingRow({ ...VALID_ROW, updated_at: "" }), /updated_at must be a non-empty string/);
  assert.throws(() => parseCompleteUserProfileOnboardingRow({ ...VALID_ROW, updated_at: "   " }), /updated_at must be a non-empty string/);
  assert.throws(() => parseCompleteUserProfileOnboardingRow({ ...VALID_ROW, updated_at: 12345 }), /updated_at must be a non-empty string/);
});

test("14. An unexpected null row, a bare string, and a bare number are all rejected", () => {
  assert.throws(() => parseCompleteUserProfileOnboardingRow(null), /malformed row/);
  assert.throws(() => parseCompleteUserProfileOnboardingRow(undefined), /malformed row/);
  assert.throws(() => parseCompleteUserProfileOnboardingRow("not a row"), /malformed row/);
  assert.throws(() => parseCompleteUserProfileOnboardingRow(42), /malformed row/);
});

test("15. A non-empty timezone that is only whitespace is rejected rather than silently accepted", () => {
  assert.throws(
    () => parseCompleteUserProfileOnboardingRow({ ...VALID_ROW, timezone: "   " }),
    /timezone must be null or a non-empty string/,
  );
});

test("16. Every thrown error carries the unexpected_response category (ClassifiedSupabaseError contract)", () => {
  try {
    parseCompleteUserProfileOnboardingRow(null);
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
  console.log("complete_user_profile_onboarding response parser contract passed");
}
