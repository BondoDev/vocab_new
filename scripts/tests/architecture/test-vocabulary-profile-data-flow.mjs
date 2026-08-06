// Architecture guard for "Frontend Cleanup 2": the Vocabulary dashboard
// section (src/features/user-profile/sections/vocabulary/) must reuse the
// signed-in user's profile already loaded once at the App.tsx level
// (useUserProfileLoad), threaded down through VocabularySection as typed
// props, rather than fetching its own copy.
//
// Before this cleanup, VocabularySection independently called
// readStoredUserProfile / readSupabaseUserProfile on every mount (i.e. every
// time the user opened the Vocabulary tab), duplicating the profile GET
// request App.tsx already makes and letting it drift out of sync with the
// rest of the dashboard until a full page reload.
//
// This guard is deliberately static/deterministic (Node stdlib + git only,
// no build, no network) so it stays cheap to run in CI and can't rot into a
// flaky check. Modeled directly on
// scripts/tests/architecture/test-learning-profile-data-flow.mjs.
//
// Run: node scripts/tests/architecture/test-vocabulary-profile-data-flow.mjs
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

console.log("\n=== Vocabulary section profile data-flow guards ===\n");

const vocabularySection = read(
  "src/features/user-profile/sections/vocabulary/VocabularySection.tsx",
);
const summaryCards = read(
  "src/features/user-profile/sections/vocabulary/VocabularySummaryCards.tsx",
);
const tabs = read("src/features/user-profile/sections/vocabulary/VocabularyTabs.tsx");
const table = read("src/features/user-profile/sections/vocabulary/VocabularyTable.tsx");
const loadVocabularyProgress = read(
  "src/features/user-profile/sections/vocabulary/loadVocabularyProgress.ts",
);
const dashboardPage = read("src/features/user-profile/sections/UserProfileDashboardPage.tsx");
const appTsx = read("src/app/App.tsx");
const useUserProfileLoad = read("src/app/hooks/useUserProfileLoad.ts");
const userProfileLib = read("src/lib/userProfile.ts");

const CHILD_FILES = {
  "VocabularySummaryCards.tsx": summaryCards,
  "VocabularyTabs.tsx": tabs,
  "VocabularyTable.tsx": table,
  "loadVocabularyProgress.ts": loadVocabularyProgress,
};

test("1. VocabularySection has no direct profile-read call", () => {
  const PROFILE_READ_NAMES = ["readStoredUserProfile", "readSupabaseUserProfile"];
  const offenders = PROFILE_READ_NAMES.filter((name) => vocabularySection.includes(name));
  assert.deepEqual(
    offenders,
    [],
    `VocabularySection.tsx must not call these directly: ${offenders.join(", ")}`,
  );

  // useUserProfileLoad.ts (called once from App.tsx) must still be the
  // authoritative loader.
  assert.ok(
    useUserProfileLoad.includes("readSupabaseUserProfile") &&
      useUserProfileLoad.includes("readStoredUserProfile"),
    "useUserProfileLoad.ts must remain the profile-loading path",
  );
});

test("2. VocabularySection and its children never reference the user_profiles table", () => {
  const allFiles = { "VocabularySection.tsx": vocabularySection, ...CHILD_FILES };
  const offenders = Object.entries(allFiles)
    .filter(([, content]) => content.includes("user_profiles"))
    .map(([file]) => file);
  assert.deepEqual(offenders, [], `unexpected user_profiles reference(s): ${offenders.join(", ")}`);
});

test("3. App.tsx's useUserProfileLoad remains the single profile-loading source reachable from the dashboard", () => {
  assert.match(
    appTsx,
    /useUserProfileLoad\(\{/,
    "App.tsx must still call useUserProfileLoad",
  );
  assert.match(
    appTsx,
    /<UserProfileDashboardPage[\s\S]*?userProfile=\{userProfile\}[\s\S]*?isProfileLoaded=\{isProfileLoaded\}/,
    "App.tsx must pass its shared userProfile/isProfileLoaded into UserProfileDashboardPage",
  );
});

test("4. VocabularySection accepts userProfile/isProfileLoaded as typed props", () => {
  assert.match(
    vocabularySection,
    /interface VocabularySectionProps\s*\{[^}]*userProfile:\s*UserProfile;[^}]*isProfileLoaded:\s*boolean;/s,
    "VocabularySection must accept typed userProfile/isProfileLoaded props",
  );
  assert.match(
    vocabularySection,
    /export function VocabularySection\(\{\s*userProfile,\s*isProfileLoaded,/,
    "VocabularySection must destructure userProfile/isProfileLoaded from its props",
  );
});

test("5. UserProfileDashboardPage wires the shared profile down to VocabularySection", () => {
  assert.match(
    dashboardPage,
    /<VocabularySection\s+userProfile=\{userProfile\}\s+isProfileLoaded=\{isProfileLoaded\}/,
    "UserProfileDashboardPage must forward userProfile/isProfileLoaded to VocabularySection",
  );
});

test("6. VocabularySection derives its target/native language from the shared profile prop and reacts to it changing", () => {
  assert.match(
    vocabularySection,
    /const targetLanguage = userProfile\.practiceLanguage;/,
    "must read targetLanguage from the userProfile prop",
  );
  assert.match(
    vocabularySection,
    /const nativeLanguage = userProfile\.nativeLanguage;/,
    "must read nativeLanguage from the userProfile prop",
  );
  const effectMatch = vocabularySection.match(
    /}, \[authUserId, isProfileLoaded, targetLanguage, nativeLanguage, retryToken\]\);/,
  );
  assert.ok(
    effectMatch,
    "the vocabulary-progress load effect must depend on targetLanguage/nativeLanguage (derived from the profile prop) so a practiceLanguage change reloads it without a page refresh",
  );
});

test("7. Loading, signed-out, and not-yet-loaded-profile states remain represented", () => {
  assert.match(vocabularySection, /if \(!authUserId\) \{/, "must keep the signed-out branch");
  assert.match(
    vocabularySection,
    /if \(!isProfileLoaded\) \{/,
    "must wait for the shared profile load before fetching vocabulary progress",
  );
  assert.match(vocabularySection, /status: "loading"/, "must keep a loading state");
  assert.match(vocabularySection, /console\.warn/, "must keep dev logging on failure");
});

test("8. Counts and favorites are computed from progress rows scoped to the current practice language, not re-fetched profile state", () => {
  assert.match(
    loadVocabularyProgress,
    /readUserWordProgress\(session, targetLanguage\)/,
    "loadVocabularyProgress must scope reads by the passed-in targetLanguage",
  );
  assert.match(
    vocabularySection,
    /loadVocabularyProgress\(\{ session, targetLanguage, nativeLanguage \}\)/,
    "VocabularySection must call loadVocabularyProgress with the profile-derived language pair",
  );
});

test("9. Vocabulary profile writes cannot smuggle timezone through either narrow profile RPC (Profile Phase 1 removed the generic upsert entirely)", () => {
  assert.doesNotMatch(
    userProfileLib,
    /function toSupabaseProfilePatch/,
    "the broad generic profile upsert must no longer exist",
  );
  const onboardingFnMatch = userProfileLib.match(/export async function completeUserProfileOnboarding\(([\s\S]*?)\r?\n\}/);
  const languagesFnMatch = userProfileLib.match(/export async function updateUserProfileLanguages\(([\s\S]*?)\r?\n\}/);
  assert.ok(onboardingFnMatch, "completeUserProfileOnboarding must exist");
  assert.ok(languagesFnMatch, "updateUserProfileLanguages must exist");
  const onboardingBodyMatch = onboardingFnMatch[1].match(/body:\s*JSON\.stringify\(\{([\s\S]*?)\}\),/);
  const languagesBodyMatch = languagesFnMatch[1].match(/body:\s*JSON\.stringify\(\{([\s\S]*?)\}\),/);
  assert.ok(onboardingBodyMatch, "completeUserProfileOnboarding must send a JSON request body");
  assert.ok(languagesBodyMatch, "updateUserProfileLanguages must send a JSON request body");
  assert.doesNotMatch(
    onboardingBodyMatch[1],
    /\btimezone\b|timezone_updated_at|p_timezone/i,
    "the onboarding RPC's request body must not include any timezone field",
  );
  assert.doesNotMatch(
    languagesBodyMatch[1],
    /\btimezone\b|timezone_updated_at|p_timezone/i,
    "the language-change RPC's request body must not include any timezone field",
  );
  assert.match(
    userProfileLib,
    /\/rest\/v1\/rpc\/initialize_user_timezone/,
    "timezone initialization must stay on the narrow RPC path",
  );
});

test("10. Switching between Learning and Vocabulary sections routes through the same single App.tsx profile load — no second loader is introduced", () => {
  // Only two files in the whole tree may call the profile-read helpers:
  // useUserProfileLoad.ts (the authoritative loader) and lib/userProfile.ts
  // (where they're defined). Every other file — including both dashboard
  // sections — must receive profile data as props.
  const trackedFiles = git(["ls-files", "src"])
    .split("\n")
    .map((line) => line.trim())
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"));

  const ALLOWED_CALLERS = new Set([
    "src/app/hooks/useUserProfileLoad.ts",
    "src/lib/userProfile.ts",
  ]);

  const offenders = [];
  for (const file of trackedFiles) {
    if (ALLOWED_CALLERS.has(file)) continue;
    const absPath = path.join(ROOT_DIR, file);
    if (!fs.existsSync(absPath)) continue;
    const content = fs.readFileSync(absPath, "utf8");
    if (content.includes("readSupabaseUserProfile(") || content.includes("readStoredUserProfile(")) {
      offenders.push(file);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `only useUserProfileLoad.ts may call the profile-read helpers; found additional caller(s): ${offenders.join(", ")}`,
  );
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("vocabulary-profile-data-flow guard passed");
}
