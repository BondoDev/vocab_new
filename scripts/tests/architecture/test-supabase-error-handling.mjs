// Architecture guard for "Frontend Cleanup 3": Study New Words, Review
// Words, favorite/unfavorite, vocabulary progress/count loading, daily
// statistics loading, and profile load/save must all classify Supabase/
// PostgREST failures through the one shared src/lib/supabaseError.ts
// module instead of each hand-rolling its own `/jwt|session|unauthorized|
// 401/i` message-regex check.
//
// Before this cleanup, that exact regex was hand-copied three times
// (completeNewWordStudy, completeWordReview, updateWordProgressFavorite in
// src/lib/newWordProgress.ts), src/lib/supabaseAuth.ts's supabaseRequest
// discarded every structured PostgREST field (code/details/hint/status)
// before it ever reached a caller, and several read paths (vocabulary
// progress, daily stats, profile load) had no classification or even
// console logging at all.
//
// This guard is deliberately static/deterministic (Node stdlib + git only,
// no build, no network) so it stays cheap to run in CI and can't rot into
// a flaky check. Modeled on
// scripts/tests/architecture/test-vocabulary-profile-data-flow.mjs.
//
// Run: node scripts/tests/architecture/test-supabase-error-handling.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

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

function read(relPath) {
  return fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8");
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT_DIR, encoding: "utf8" });
  } catch {
    return "";
  }
}

console.log("\n=== Supabase error-classification guards ===\n");

const supabaseErrorLib = read("src/lib/supabaseError.ts");
const supabaseAuth = read("src/lib/supabaseAuth.ts");
const newWordProgress = read("src/lib/newWordProgress.ts");
const newWordStudySession = read("src/features/study-new-words/NewWordStudySession.tsx");
const reviewSession = read("src/features/review-words/ReviewSession.tsx");
const vocabularySection = read("src/features/user-profile/sections/vocabulary/VocabularySection.tsx");
const dailyGoalSelector = read("src/features/user-profile/sections/learning/DailyGoalSelector.tsx");
const useUserProfileLoad = read("src/app/hooks/useUserProfileLoad.ts");
// Phase 1 profile-write gap fix (2026-08-06): the onboarding-save and
// account-language-save catch paths used to bypass this shared classifier
// entirely, returning/setting the raw error.message string. Both now
// classify through supabaseError.ts like every other write path above.
const useAccountOnboarding = read("src/app/hooks/useAccountOnboarding.ts");
const useAccountLanguageConfirm = read("src/app/hooks/useAccountLanguageConfirm.ts");
const accountLanguageSave = read("src/app/utils/accountLanguageSave.ts");

test("1. src/lib/supabaseError.ts exists and exports the stable classification API", () => {
  assert.match(supabaseErrorLib, /export type SupabaseErrorCategory\s*=/);
  assert.match(supabaseErrorLib, /export function classifySupabaseError\(/);
  assert.match(supabaseErrorLib, /export function describeSupabaseError\(/);
  assert.match(supabaseErrorLib, /export function resolveSupabaseErrorMessageKey\(/);
  assert.match(supabaseErrorLib, /export class ClassifiedSupabaseError extends Error/);
});

test('2. All eight required categories are present, exactly once each, in SupabaseErrorCategory', () => {
  const match = supabaseErrorLib.match(/export type SupabaseErrorCategory\s*=([\s\S]*?);/);
  assert.ok(match, "SupabaseErrorCategory type must be found");
  const body = match[1];
  const required = [
    "unauthenticated",
    "forbidden",
    "missing_rpc",
    "conflict",
    "network",
    "validation",
    "unexpected_response",
    "unknown",
  ];
  for (const category of required) {
    const occurrences = body.split(`"${category}"`).length - 1;
    assert.equal(occurrences, 1, `"${category}" must appear exactly once in SupabaseErrorCategory`);
  }
});

test("3. supabaseRequest throws a structured SupabaseRequestError (status/code/details/hint), not a plain Error", () => {
  assert.match(supabaseAuth, /export class SupabaseRequestError extends Error \{/);
  assert.match(supabaseAuth, /readonly status: number;/);
  assert.match(supabaseAuth, /readonly code: string \| null;/);
  const fnMatch = supabaseAuth.match(/export async function supabaseRequest[\s\S]*?\n\}/);
  assert.ok(fnMatch, "supabaseRequest must exist");
  assert.match(fnMatch[0], /throw new SupabaseRequestError\(/, "must throw the structured error type on a non-2xx response");
});

test("4. The old hand-copied /jwt|session|unauthorized|401/i auth-failure regex is gone from newWordProgress.ts's three write paths — classifySupabaseError is the only classifier left", () => {
  assert.doesNotMatch(
    newWordProgress,
    /jwt\|session\|unauthorized\|401/,
    "the fragile duplicated auth-failure regex must not remain anywhere in newWordProgress.ts",
  );
  const classifyCallCount = (newWordProgress.match(/classifySupabaseError\(error\)/g) ?? []).length;
  assert.equal(
    classifyCallCount,
    3,
    "completeNewWordStudy, completeWordReview, and updateWordProgressFavorite must each classify via the shared function exactly once",
  );
});

test("5. The narrow refresh-retry 'jwt expired' check is untouched (a different, intentionally-kept mechanism, not the classification duplication this refactor targets)", () => {
  const occurrences = (newWordProgress.match(/\/jwt expired\/i/g) ?? []).length;
  assert.equal(occurrences, 2, "supabaseProgressRequest and supabaseProgressMutationRequest must both keep their refresh-retry check");
});

test("6. NewWordStudyPersistenceError, ReviewPersistenceError, and VocabularyFavoriteUpdateError all carry a classified category instead of a bare boolean", () => {
  for (const className of ["NewWordStudyPersistenceError", "ReviewPersistenceError", "VocabularyFavoriteUpdateError"]) {
    const classMatch = newWordProgress.match(new RegExp(`class ${className} extends Error \\{([\\s\\S]*?)\\n\\}`));
    assert.ok(classMatch, `${className} must exist`);
    assert.match(classMatch[1], /readonly category: SupabaseErrorCategory;/, `${className} must expose a typed category`);
    assert.doesNotMatch(classMatch[1], /readonly retryable/, `${className} must not keep the old retryable boolean alongside category`);
  }
});

test("7. Study New Words preserves its existing user-facing save-error and session-expired copy for the categories that already had one", () => {
  assert.match(newWordStudySession, /"studyNewWords\.saveErrorMessage"/, "must still reference the existing generic save-error key");
  assert.match(newWordStudySession, /"studyNewWords\.sessionExpiredMessage"/, "must still reference the existing session-expired key");
  assert.match(
    newWordStudySession,
    /saveErrorCategory === "unauthenticated"\s*\?\s*"studyNewWords\.sessionExpiredMessage"/,
    "unauthenticated must keep using this screen's own pre-existing session-expired key, not a different one",
  );
});

test("8. Review Words preserves its existing user-facing save-error and session-expired copy for the categories that already had one", () => {
  assert.match(reviewSession, /"reviewWords\.saveErrorMessage"/, "must still reference the existing generic save-error key");
  assert.match(reviewSession, /"reviewWords\.sessionExpiredMessage"/, "must still reference the existing session-expired key");
  assert.match(
    reviewSession,
    /saveErrorCategory === "unauthenticated"\s*\?\s*"reviewWords\.sessionExpiredMessage"/,
    "unauthenticated must keep using this screen's own pre-existing session-expired key, not a different one",
  );
});

test("9. Session-expired cases across Study/Review/Favorite/Profile-save all resolve to a 'session expired' message (either the screen's own pre-existing key or the new shared one) — never the raw Supabase error text", () => {
  assert.match(newWordStudySession, /"studyNewWords\.sessionExpiredMessage"/);
  assert.match(reviewSession, /"reviewWords\.sessionExpiredMessage"/);
  assert.match(vocabularySection, /t\("supabaseErrors\.sessionExpired"\)/, "the favorite toggle's own missing-session guard must use the shared session-expired key");
  assert.match(
    supabaseErrorLib,
    /unauthenticated:\s*"supabaseErrors\.sessionExpired"/,
    "the shared classifier must map unauthenticated to supabaseErrors.sessionExpired",
  );
});

test("10. Missing-RPC cases resolve to the shared temporarily-unavailable message everywhere the classifier is used for a write operation", () => {
  assert.match(
    supabaseErrorLib,
    /missing_rpc:\s*"supabaseErrors\.temporarilyUnavailable"/,
    "the shared classifier must map missing_rpc to supabaseErrors.temporarilyUnavailable",
  );
  // Every write-operation call site that shows a category-based message
  // must go through resolveSupabaseErrorMessageKey (not hand-roll its own
  // per-category branching), so missing_rpc reaches this same mapping
  // everywhere.
  for (const [label, source] of [
    ["NewWordStudySession.tsx", newWordStudySession],
    ["ReviewSession.tsx", reviewSession],
    ["VocabularySection.tsx", vocabularySection],
    ["DailyGoalSelector.tsx", dailyGoalSelector],
  ]) {
    assert.match(source, /resolveSupabaseErrorMessageKey\(/, `${label} must resolve its category-based message via the shared helper`);
  }
});

test("11. All 7 locale files define the same supabaseErrors key set with non-empty string values", () => {
  const LOCALE_FILES = [
    "english_interface.json",
    "german_interface.json",
    "spanish_interface.json",
    "french_interface.json",
    "italian_interface.json",
    "portuguese_interface.json",
    "russian_interface.json",
  ];
  const englishKeys = Object.keys(
    JSON.parse(read(`src/data/interface/${LOCALE_FILES[0]}`)).supabaseErrors ?? {},
  ).sort();
  assert.deepEqual(englishKeys, ["forbidden", "network", "sessionExpired", "temporarilyUnavailable"]);

  for (const fileName of LOCALE_FILES) {
    const data = JSON.parse(read(`src/data/interface/${fileName}`));
    assert.ok(data.supabaseErrors, `${fileName} is missing a top-level "supabaseErrors" section`);
    assert.deepEqual(Object.keys(data.supabaseErrors).sort(), englishKeys, `${fileName} supabaseErrors keys differ from English`);
    for (const [key, value] of Object.entries(data.supabaseErrors)) {
      assert.equal(typeof value, "string", `${fileName}: supabaseErrors.${key} is not a string`);
      assert.ok(value.trim().length > 0, `${fileName}: supabaseErrors.${key} is empty`);
    }
  }
});

test("12. Raw Supabase error text (.message/.details/.hint off a caught error) is never interpolated directly into a rendered string", () => {
  const filesToCheck = {
    "NewWordStudySession.tsx": newWordStudySession,
    "ReviewSession.tsx": reviewSession,
    "VocabularySection.tsx": vocabularySection,
    "DailyGoalSelector.tsx": dailyGoalSelector,
    "useUserProfileLoad.ts": useUserProfileLoad,
    "useAccountOnboarding.ts": useAccountOnboarding,
    "accountLanguageSave.ts": accountLanguageSave,
  };
  for (const [file, source] of Object.entries(filesToCheck)) {
    assert.doesNotMatch(
      source,
      /\{\s*error\.message\s*\}|`.*\$\{error\.(message|details|hint)\}/,
      `${file} must never render a raw error field directly`,
    );
  }
});

test("13. Favorite toggle's optimistic-update rollback is untouched by this refactor (still reverts row + count on failure)", () => {
  const fnMatch = vocabularySection.match(/const handleToggleFavorite = \(row: ResolvedVocabularyRow\) => \{([\s\S]*?)\n  \};/);
  assert.ok(fnMatch, "handleToggleFavorite must exist");
  const body = fnMatch[1];
  assert.match(body, /applyFavoriteToggle\(prev\.data\.rows, row\.id, previousIsFavorite\)/, "must still revert the row's favorite flag on failure");
  assert.match(
    body,
    /adjustFavoritesCount\(prev\.data\.counts\.favorites, nextIsFavorite, previousIsFavorite\)/,
    "must still revert the favorites count on failure",
  );
});

test("14. completeWordReview's idempotency contract is documented: a genuine conflict is never silently converted into success", () => {
  const fnBodyMatch = newWordProgress.match(/export async function completeWordReview\(([\s\S]*?)\n\}/);
  assert.ok(fnBodyMatch, "completeWordReview must exist");
  assert.doesNotMatch(
    fnBodyMatch[1],
    /category === "conflict"/,
    "a conflict-classified error must not be special-cased into a success path",
  );
  assert.match(
    newWordProgress,
    /Idempotency\/conflict note/i,
    "the idempotency-vs-conflict distinction must be documented near completeWordReview",
  );
});

test("15. Supabase-error refactor guard does not own unrelated timezone migration scope", () => {
  const mergeBase = git(["merge-base", "master", "HEAD"]).trim();
  const changed = new Set();
  const collect = (out) =>
    out
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((f) => changed.add(f));
  if (mergeBase) {
    collect(git(["diff", "--name-only", mergeBase, "HEAD"]));
  }
  collect(git(["diff", "--name-only", "HEAD"]));
  collect(git(["diff", "--name-only", "--cached"]));

  const offenders = [...changed].filter((file) => {
    if (file === "supabase/README.md") {
      return false;
    }
    if (file.startsWith("supabase/migrations/") && file.includes("timezone")) {
      return false;
    }
    // Same carve-out as the timezone-migration exclusion above: this guard's
    // offender check is purely path-based (git diff --name-only), not a
    // content/text inspection, so it has no way to tell "this migration
    // happens to touch Supabase-error-classification concerns" apart from
    // "this migration exists in the same repo as that refactor." Profile
    // Phase 1's narrow-write-boundary migration is independently verified
    // (see docs/task reports for that phase) and unrelated in scope to the
    // Supabase-error-classification refactor this guard polices — exact
    // filename only, not a directory/wildcard, to keep the guard's blanket
    // supabase/migrations/ check meaningful for every other migration.
    if (file === "supabase/migrations/20260806200000_restrict_user_profiles_writes_and_add_narrow_rpcs.sql") {
      return false;
    }
    // Same carve-out again: Vocabulary Growth's read_vocabulary_growth_events
    // RPC (Progress page) is a narrow, independently-reviewed, read-only RPC
    // over review_events — unrelated in scope to the Supabase-error-
    // classification refactor this guard polices, and not a change to any
    // learning-write RPC or review/study-transition state machine. Exact
    // filename only, same reasoning as the two exemptions above.
    if (file === "supabase/migrations/20260808130000_add_vocabulary_growth_events_rpc.sql") {
      return false;
    }

    return (
      file.startsWith("supabase/migrations/") ||
      file.includes("reviewSessionState.ts") ||
      file.includes("reviewSessionPlan.ts") ||
      file.includes("/data/learning/reviewQueue") ||
      file.includes("newWordStudySessionState.ts")
    );
  });
  assert.deepEqual(
    offenders,
    [],
    `this refactor guard still protects learning migrations and review/study-transition state machines: ${offenders.join(", ")}`,
  );
});

console.log("\n=== Phase 1: profile-write gap fix (useAccountOnboarding.ts / accountLanguageSave.ts) ===\n");

test("16. Both files classify through the shared supabaseError.ts API instead of hand-rolling their own logic", () => {
  for (const [label, source] of [
    ["useAccountOnboarding.ts", useAccountOnboarding],
    ["accountLanguageSave.ts", accountLanguageSave],
  ]) {
    assert.match(source, /classifySupabaseError\(error\)/, `${label} must classify the caught error`);
    assert.match(source, /describeSupabaseError\(/, `${label} must log structured diagnostics`);
    assert.match(source, /resolveSupabaseErrorMessageKey\(/, `${label} must resolve its message via the shared helper`);
  }
});

test("17. Neither file renders or returns the raw error.message/.details/.hint, and neither defines a new local classifier", () => {
  for (const [label, source] of [
    ["useAccountOnboarding.ts", useAccountOnboarding],
    ["accountLanguageSave.ts", accountLanguageSave],
  ]) {
    assert.doesNotMatch(
      source,
      /error instanceof Error\s*&&\s*error\.message/,
      `${label} must not branch on error.message directly (the old raw-message-leak pattern)`,
    );
    assert.doesNotMatch(
      source,
      /:\s*error\.message/,
      `${label} must never assign/return error.message as a user-facing value`,
    );
    // No hand-rolled classification regex (the exact anti-pattern
    // classifySupabaseError replaced everywhere else — see this file's own
    // header and test 4 above).
    assert.doesNotMatch(
      source,
      /\/jwt\|session\|unauthorized\|401\//,
      `${label} must not reintroduce the fragile duplicated auth-failure regex`,
    );
  }
});

test("18. Hard-coded Supabase/PostgREST codes remain centralized in src/lib/supabaseError.ts — neither new file introduces its own", () => {
  const CODE_PATTERN = /PGRST\d{3}|"23505"|"42501"|"22P02"|"22023"|"P0002"/;
  for (const [label, source] of [
    ["useAccountOnboarding.ts", useAccountOnboarding],
    ["accountLanguageSave.ts", accountLanguageSave],
  ]) {
    assert.doesNotMatch(source, CODE_PATTERN, `${label} must not hard-code a Supabase/PostgREST code directly`);
  }
});

test("19. The existing JWT-refresh retry mechanism is untouched by this fix (still exactly 2 occurrences in newWordProgress.ts, unrelated to this task)", () => {
  const occurrences = (newWordProgress.match(/\/jwt expired\/i/g) ?? []).length;
  assert.equal(occurrences, 2, "the Phase 1 profile-write fix must not touch the intentionally-kept refresh-retry check");
  assert.doesNotMatch(useAccountOnboarding, /jwt expired/i);
  assert.doesNotMatch(accountLanguageSave, /jwt expired/i);
});

test("20. SupabaseErrorCategory's 8 categories are unchanged by this fix (no new/renamed category introduced)", () => {
  const match = supabaseErrorLib.match(/export type SupabaseErrorCategory\s*=([\s\S]*?);/);
  assert.ok(match, "SupabaseErrorCategory type must be found");
  const categories = [...match[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    categories.sort(),
    [
      "conflict",
      "forbidden",
      "missing_rpc",
      "network",
      "unauthenticated",
      "unexpected_response",
      "unknown",
      "validation",
    ],
    "this fix must not add, remove, or rename an error category",
  );
});

test("21. useAccountLanguageConfirm.ts translates the classified key (never renders a bare translation key or a raw message)", () => {
  assert.match(useAccountLanguageConfirm, /import \{ useLanguage \} from "\.\.\/\.\.\/contexts\/LanguageContext"/);
  assert.match(useAccountLanguageConfirm, /setSaveError\(t\(result\.error\)\)/);
  assert.doesNotMatch(useAccountLanguageConfirm, /setSaveError\(result\.error\)/, "must not store the bare untranslated key");
});

test("22. The two new fallback locale keys exist in all 7 locales with non-empty values, alongside the untouched supabaseErrors.* keys", () => {
  const LOCALE_FILES = [
    "english_interface.json",
    "german_interface.json",
    "spanish_interface.json",
    "french_interface.json",
    "italian_interface.json",
    "portuguese_interface.json",
    "russian_interface.json",
  ];
  for (const fileName of LOCALE_FILES) {
    const data = JSON.parse(read(`src/data/interface/${fileName}`));
    assert.ok(
      typeof data.accountOnboarding?.saveError === "string" && data.accountOnboarding.saveError.trim().length > 0,
      `${fileName} is missing a non-empty accountOnboarding.saveError`,
    );
    assert.ok(
      typeof data.accountLanguageConfirm?.saveError === "string" &&
        data.accountLanguageConfirm.saveError.trim().length > 0,
      `${fileName} is missing a non-empty accountLanguageConfirm.saveError`,
    );
    // Unrelated to this fix - confirms it didn't disturb the existing keys.
    assert.equal(typeof data.accountLanguageConfirm?.cancel, "string");
  }
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("supabase-error-handling guard passed");
}
