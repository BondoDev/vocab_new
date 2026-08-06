// Architecture guard for Profile Phase 1's user_profiles write boundary.
//
// Before this phase, onboarding and the account-language-confirm popup both
// wrote user_profiles through a single broad upsert
// (writeSupabaseUserProfile, a direct POST /rest/v1/user_profiles), which
// re-sent every cached profile field on a single-field change. This guard
// fixes that boundary in place: the broad upsert no longer exists anywhere
// in src/, onboarding calls only the narrow complete_user_profile_onboarding
// RPC, language-confirm calls only the narrow update_user_profile_languages
// RPC, and neither RPC's request body can carry daily_goal or a timezone
// field. See
// scripts/tests/learning/test-restrict-user-profiles-writes-migration-contract.mjs
// for this same boundary's database-side coverage.
//
// Run: node scripts/tests/architecture/test-user-profiles-narrow-write-boundary.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const SRC_DIR = path.join(ROOT_DIR, "src");

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

function walkFiles(dir, extensions, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(abs, extensions, out);
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      out.push(abs);
    }
  }
  return out;
}

function read(relPath) {
  return fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8");
}

const sourceFiles = walkFiles(SRC_DIR, [".ts", ".tsx"]);

console.log("\n=== user_profiles narrow-write boundary guards (Profile Phase 1) ===\n");

test("1. No frontend source file constructs a direct POST/PATCH/upsert against /rest/v1/user_profiles (reads via GET are unaffected)", () => {
  const offenders = [];
  for (const file of sourceFiles) {
    const relPath = path.relative(ROOT_DIR, file).replace(/\\/g, "/");
    const content = fs.readFileSync(file, "utf8");
    // A direct table write would reference the bare REST collection path
    // together with a mutating verb — reads use the same path with GET and
    // a query string, which this pattern does not match (no method: "POST"/
    // "PATCH" immediately associated). The narrow RPCs below use
    // /rest/v1/rpc/<name>, a different path shape entirely.
    if (/\/rest\/v1\/user_profiles["'`]/.test(content) && /method:\s*["'](POST|PATCH|PUT|DELETE)["']/.test(content)) {
      offenders.push(relPath);
    }
  }
  assert.deepEqual(offenders, [], `unexpected direct user_profiles table mutation in: ${offenders.join(", ")}`);
});

test("2. The broad writeSupabaseUserProfile function and its toSupabaseProfilePatch helper no longer exist anywhere in src/", () => {
  const offenders = [];
  for (const file of sourceFiles) {
    const relPath = path.relative(ROOT_DIR, file).replace(/\\/g, "/");
    const content = fs.readFileSync(file, "utf8");
    if (/\bfunction\s+writeSupabaseUserProfile\b/.test(content) || /\bfunction\s+toSupabaseProfilePatch\b/.test(content)) {
      offenders.push(relPath);
    }
    // A live call/import (not merely a historical comment) would match this
    // shape — a call expression or a named import.
    if (/\bwriteSupabaseUserProfile\s*\(/.test(content) || /import\s*\{[^}]*\bwriteSupabaseUserProfile\b[^}]*\}/.test(content)) {
      offenders.push(relPath);
    }
  }
  assert.deepEqual(offenders, [], `unexpected writeSupabaseUserProfile definition/call/import in: ${offenders.join(", ")}`);
});

test("3. useAccountOnboarding.ts calls completeUserProfileOnboarding and nothing else writes user_profiles onboarding fields", () => {
  const onboardingHookSource = read("src/app/hooks/useAccountOnboarding.ts");
  assert.match(onboardingHookSource, /import\s*\{[^}]*completeUserProfileOnboarding[^}]*\}\s*from\s*"\.\.\/\.\.\/lib\/userProfile"/s);
  assert.match(onboardingHookSource, /completeUserProfileOnboarding\(authSession, onboardingInput\)/);

  const offenders = [];
  for (const file of sourceFiles) {
    const relPath = path.relative(ROOT_DIR, file).replace(/\\/g, "/");
    if (relPath === "src/lib/userProfile.ts") continue; // the wrapper's own definition
    const content = fs.readFileSync(file, "utf8");
    if (content.includes("/rest/v1/rpc/complete_user_profile_onboarding")) {
      offenders.push(relPath);
    }
  }
  assert.deepEqual(offenders, [], `unexpected direct RPC endpoint reference outside userProfile.ts: ${offenders.join(", ")}`);
});

test("4. useAccountLanguageConfirm.ts (via accountLanguageSave.ts) calls updateUserProfileLanguages and nothing else writes the language pair", () => {
  const hookSource = read("src/app/hooks/useAccountLanguageConfirm.ts");
  assert.match(hookSource, /import\s*\{[^}]*updateUserProfileLanguages[^}]*\}\s*from\s*"\.\.\/\.\.\/lib\/userProfile"/s);
  assert.match(hookSource, /writeLanguagesToSupabase:\s*\(profile\)\s*=>\s*\{/);
  assert.match(hookSource, /updateUserProfileLanguages\(authSession, input\)/);

  const offenders = [];
  for (const file of sourceFiles) {
    const relPath = path.relative(ROOT_DIR, file).replace(/\\/g, "/");
    if (relPath === "src/lib/userProfile.ts") continue;
    const content = fs.readFileSync(file, "utf8");
    if (content.includes("/rest/v1/rpc/update_user_profile_languages")) {
      offenders.push(relPath);
    }
  }
  assert.deepEqual(offenders, [], `unexpected direct RPC endpoint reference outside userProfile.ts: ${offenders.join(", ")}`);
});

test("5. Neither the onboarding nor the language RPC's request body ever includes daily_goal or a timezone field", () => {
  const userProfileSource = read("src/lib/userProfile.ts");
  const onboardingFnMatch = userProfileSource.match(/export async function completeUserProfileOnboarding\(([\s\S]*?)\r?\n\}/);
  const languagesFnMatch = userProfileSource.match(/export async function updateUserProfileLanguages\(([\s\S]*?)\r?\n\}/);
  assert.ok(onboardingFnMatch, "completeUserProfileOnboarding must exist");
  assert.ok(languagesFnMatch, "updateUserProfileLanguages must exist");

  const onboardingBodyMatch = onboardingFnMatch[1].match(/body:\s*JSON\.stringify\(\{([\s\S]*?)\}\),/);
  const languagesBodyMatch = languagesFnMatch[1].match(/body:\s*JSON\.stringify\(\{([\s\S]*?)\}\),/);
  assert.ok(onboardingBodyMatch, "completeUserProfileOnboarding must send a JSON request body");
  assert.ok(languagesBodyMatch, "updateUserProfileLanguages must send a JSON request body");

  for (const [label, body] of [
    ["complete_user_profile_onboarding", onboardingBodyMatch[1]],
    ["update_user_profile_languages", languagesBodyMatch[1]],
  ]) {
    assert.doesNotMatch(body, /p_daily_goal/i, `${label}'s request body must never include p_daily_goal`);
    assert.doesNotMatch(body, /p_timezone/i, `${label}'s request body must never include p_timezone`);
  }

  // Onboarding's exact expected field set (order-independent membership).
  assert.match(onboardingBodyMatch[1], /p_nickname:\s*input\.nickname/);
  assert.match(onboardingBodyMatch[1], /p_native_language:\s*input\.nativeLanguage/);
  assert.match(onboardingBodyMatch[1], /p_learning_language:\s*input\.practiceLanguage/);
  assert.match(onboardingBodyMatch[1], /p_current_level:\s*input\.languageLevel/);
  assert.match(onboardingBodyMatch[1], /p_user_age:\s*input\.age/);
  assert.match(onboardingBodyMatch[1], /p_birth_month:\s*Number\(input\.birthMonth\)/);
  assert.match(onboardingBodyMatch[1], /p_birth_day:\s*Number\(input\.birthDay\)/);

  // Exclusivity, not just presence — the seven checks above only prove each
  // expected key is somewhere in the body; a stray eighth key (e.g. a
  // reintroduced p_user_id, or any other field) would satisfy all seven and
  // still pass. This closes that gap by asserting the request body's `p_`
  // keys are exactly this set, nothing more.
  const onboardingPKeys = [...onboardingBodyMatch[1].matchAll(/p_[a-z_]+(?=:)/gi)].map((m) => m[0]);
  assert.deepEqual(
    onboardingPKeys.sort(),
    [
      "p_nickname",
      "p_native_language",
      "p_learning_language",
      "p_current_level",
      "p_user_age",
      "p_birth_month",
      "p_birth_day",
    ].sort(),
  );

  // Language RPC's request body must be exactly the two fields — nothing
  // else appears as a `p_` key.
  const languagePKeys = [...languagesBodyMatch[1].matchAll(/p_[a-z_]+(?=:)/gi)].map((m) => m[0]);
  assert.deepEqual(languagePKeys.sort(), ["p_learning_language", "p_native_language"].sort());
});

test("6. A language change cannot modify daily goal, timezone, CEFR level, nickname, age, birth fields, or onboarding status", () => {
  const hookSource = read("src/app/hooks/useAccountLanguageConfirm.ts");
  const inputMatch = hookSource.match(/const input: UpdateUserProfileLanguagesInput = \{([\s\S]*?)\};/);
  assert.ok(inputMatch, "the narrow language-update input object must be found");
  const fields = [...inputMatch[1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
  assert.deepEqual(fields.sort(), ["nativeLanguage", "practiceLanguage"].sort());
});

test("7. Both new RPC response parsers exist and reject malformed rows as unexpected_response (never silently coerced)", () => {
  const onboardingParser = read("src/lib/userProfileOnboarding.ts");
  const languagesParser = read("src/lib/userProfileLanguages.ts");
  assert.match(onboardingParser, /export function parseCompleteUserProfileOnboardingRow/);
  assert.match(onboardingParser, /"unexpected_response"/);
  assert.match(languagesParser, /export function parseUpdateUserProfileLanguagesRow/);
  assert.match(languagesParser, /"unexpected_response"/);
});

test("8. App-level profile state and localStorage cache are updated from the parsed RPC output, not re-derived from the raw request input", () => {
  const onboardingHookSource = read("src/app/hooks/useAccountOnboarding.ts");
  assert.match(onboardingHookSource, /const supabaseProfile = authSession\s*\n\s*\? await completeUserProfileOnboarding\(authSession, onboardingInput\)\s*\n\s*: \{\};/);
  assert.match(onboardingHookSource, /writeStoredUserProfile\(submitPreparation\.authUserId, \{\s*\.\.\.profileToSave,\s*\.\.\.supabaseProfile,\s*\}\)/);
  assert.match(onboardingHookSource, /setUserProfile\(nextProfile\)/);
});

test("9. Onboarding validation, submitting state, centralized error classification, and dialog-close behavior are unchanged", () => {
  const onboardingHookSource = read("src/app/hooks/useAccountOnboarding.ts");
  assert.match(onboardingHookSource, /prepareAccountOnboardingSubmit/);
  assert.match(onboardingHookSource, /setIsAccountOnboardingSubmitting\(true\)/);
  assert.match(onboardingHookSource, /classifySupabaseError\(error\)/);
  assert.match(onboardingHookSource, /resolveSupabaseErrorMessageKey\(category, ACCOUNT_ONBOARDING_SAVE_FALLBACK_KEY\)/);
  assert.match(onboardingHookSource, /setIsAccountOnboardingOpen\(false\)/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("user-profiles-narrow-write-boundary guard passed");
}
