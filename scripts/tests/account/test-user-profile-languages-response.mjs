// Contract guard for update_user_profile_languages's response parser
// (src/lib/userProfileLanguages.ts) — Profile Phase 1's narrow
// language-change RPC. Same behavioral, direct-import precedent as
// test-user-profile-onboarding-response.mjs.
//
// Run: node --experimental-strip-types scripts/tests/account/test-user-profile-languages-response.mjs
import assert from "node:assert/strict";
import { parseUpdateUserProfileLanguagesRow } from "../../../src/lib/userProfileLanguages.ts";

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
  updated_at: "2026-08-06T12:00:00.000Z",
};

console.log("\n=== update_user_profile_languages response parser contract ===\n");

test("1. A fully valid row parses to the expected typed result", () => {
  const result = parseUpdateUserProfileLanguagesRow(VALID_ROW);
  assert.deepEqual(result, {
    nativeLanguage: "en",
    learningLanguage: "fr",
    updatedAt: "2026-08-06T12:00:00.000Z",
  });
});

test("2. Every supported language code round-trips for both fields", () => {
  for (const code of ["en", "es", "fr", "pt", "it", "de", "ru"]) {
    const result = parseUpdateUserProfileLanguagesRow({ ...VALID_ROW, native_language: code });
    assert.equal(result.nativeLanguage, code);
    const result2 = parseUpdateUserProfileLanguagesRow({ ...VALID_ROW, learning_language: code });
    assert.equal(result2.learningLanguage, code);
  }
});

test("3. An unsupported language code is rejected for either field", () => {
  assert.throws(
    () => parseUpdateUserProfileLanguagesRow({ ...VALID_ROW, native_language: "zh" }),
    /native_language must be one of/,
  );
  assert.throws(
    () => parseUpdateUserProfileLanguagesRow({ ...VALID_ROW, learning_language: "EN" }),
    /learning_language must be one of/,
  );
});

test("4. Empty response array shape is rejected directly by this parser (the caller's own array-length check applies first)", () => {
  assert.throws(() => parseUpdateUserProfileLanguagesRow([]), /malformed row/);
  assert.throws(() => parseUpdateUserProfileLanguagesRow([VALID_ROW]), /malformed row/);
  assert.throws(() => parseUpdateUserProfileLanguagesRow([VALID_ROW, VALID_ROW]), /malformed row/);
});

test("5. Missing required fields are each rejected individually", () => {
  for (const field of ["native_language", "learning_language", "updated_at"]) {
    const row = { ...VALID_ROW };
    delete row[field];
    assert.throws(
      () => parseUpdateUserProfileLanguagesRow(row),
      (err) => err.category === "unexpected_response",
      `missing ${field} must be rejected`,
    );
  }
});

test("6. A malformed (empty/whitespace/non-string) updated_at timestamp is rejected", () => {
  assert.throws(() => parseUpdateUserProfileLanguagesRow({ ...VALID_ROW, updated_at: "" }), /updated_at must be a non-empty string/);
  assert.throws(() => parseUpdateUserProfileLanguagesRow({ ...VALID_ROW, updated_at: "   " }), /updated_at must be a non-empty string/);
  assert.throws(() => parseUpdateUserProfileLanguagesRow({ ...VALID_ROW, updated_at: 12345 }), /updated_at must be a non-empty string/);
  assert.throws(() => parseUpdateUserProfileLanguagesRow({ ...VALID_ROW, updated_at: null }), /updated_at must be a non-empty string/);
});

test("7. An unexpected null row, a bare string, and a bare number are all rejected", () => {
  assert.throws(() => parseUpdateUserProfileLanguagesRow(null), /malformed row/);
  assert.throws(() => parseUpdateUserProfileLanguagesRow(undefined), /malformed row/);
  assert.throws(() => parseUpdateUserProfileLanguagesRow("not a row"), /malformed row/);
  assert.throws(() => parseUpdateUserProfileLanguagesRow(42), /malformed row/);
});

test("8. A boolean or array standing in for a language code is rejected (never truthy-coerced)", () => {
  assert.throws(() => parseUpdateUserProfileLanguagesRow({ ...VALID_ROW, native_language: true }), /native_language must be one of/);
  assert.throws(() => parseUpdateUserProfileLanguagesRow({ ...VALID_ROW, learning_language: ["fr"] }), /learning_language must be one of/);
});

test("9. Every thrown error carries the unexpected_response category (ClassifiedSupabaseError contract)", () => {
  try {
    parseUpdateUserProfileLanguagesRow(null);
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
  console.log("update_user_profile_languages response parser contract passed");
}
