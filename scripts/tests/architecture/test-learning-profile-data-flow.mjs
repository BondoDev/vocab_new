// Architecture guard for "Frontend Cleanup 1": the Learning dashboard
// (src/features/user-profile/sections/learning/) must read the signed-in
// user's profile exactly once per load, at the App.tsx level
// (useUserProfileLoad), and thread it down through LearningSection as
// typed props rather than each card fetching its own copy.
//
// Before this cleanup, DailyGoalSelector, DailyStreakCard, and
// TodayProgressCard each independently called readStoredUserProfile /
// readSupabaseUserProfile on mount, quadrupling the profile GET request
// for a single Learning dashboard load and letting the three cards drift
// out of sync with each other until a full page reload.
//
// This guard is deliberately static/deterministic (Node stdlib + git only,
// no build, no network) so it stays cheap to run in CI and can't rot into
// a flaky check.
//
// Run: node scripts/tests/architecture/test-learning-profile-data-flow.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const LEARNING_DIR = path.join(ROOT_DIR, "src", "features", "user-profile", "sections", "learning");

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

console.log("\n=== Learning dashboard profile data-flow guards ===\n");

const dailyGoalSelector = read("src/features/user-profile/sections/learning/DailyGoalSelector.tsx");
const dailyStreakCard = read("src/features/user-profile/sections/learning/DailyStreakCard.tsx");
const todayProgressCard = read("src/features/user-profile/sections/learning/TodayProgressCard.tsx");
const learningSection = read("src/features/user-profile/sections/learning/LearningSection.tsx");
const dashboardPage = read("src/features/user-profile/sections/UserProfileDashboardPage.tsx");
const appTsx = read("src/app/App.tsx");
const useUserProfileLoad = read("src/app/hooks/useUserProfileLoad.ts");
const userProfileLib = read("src/lib/userProfile.ts");
const sharedDailyStats = read("src/features/user-profile/sections/useProfileSharedDailyStats.ts");

test("1. useUserProfileLoad is the only profile-loading path reachable from the Learning dashboard", () => {
  // The three Learning cards must not import or call either profile-read
  // helper directly - they receive profile data as props instead.
  const PROFILE_READ_NAMES = ["readStoredUserProfile", "readSupabaseUserProfile"];
  const cardFiles = {
    "DailyGoalSelector.tsx": dailyGoalSelector,
    "DailyStreakCard.tsx": dailyStreakCard,
    "TodayProgressCard.tsx": todayProgressCard,
  };
  const offenders = [];
  for (const [file, content] of Object.entries(cardFiles)) {
    for (const name of PROFILE_READ_NAMES) {
      if (content.includes(name)) {
        offenders.push(`${file} references ${name}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `unexpected direct profile read(s): ${offenders.join(", ")}`);

  // useUserProfileLoad.ts (called once from App.tsx) must still be the
  // authoritative loader.
  assert.ok(
    useUserProfileLoad.includes("readSupabaseUserProfile") && useUserProfileLoad.includes("readStoredUserProfile"),
    "useUserProfileLoad.ts must remain the profile-loading path",
  );
});

test("2. Removed child components no longer reference the user_profiles table at all", () => {
  const cardFiles = {
    "DailyGoalSelector.tsx": dailyGoalSelector,
    "DailyStreakCard.tsx": dailyStreakCard,
    "TodayProgressCard.tsx": todayProgressCard,
  };
  const offenders = Object.entries(cardFiles)
    .filter(([, content]) => content.includes("user_profiles"))
    .map(([file]) => file);
  assert.deepEqual(offenders, [], `unexpected user_profiles reference(s): ${offenders.join(", ")}`);
});

test("3. DailyGoalSelector, DailyStreakCard, and TodayProgressCard each receive profile data as typed props", () => {
  assert.match(
    dailyGoalSelector,
    /interface DailyGoalSelectorProps\s*\{[^}]*userProfile:\s*UserProfile/s,
    "DailyGoalSelector must accept a typed userProfile prop",
  );
  assert.match(
    dailyStreakCard,
    /interface DailyStreakCardProps\s*\{[^}]*practiceLanguage:/s,
    "DailyStreakCard must accept a typed practiceLanguage prop",
  );
  // Unlike DailyGoalSelector/TodayProgressCard, DailyStreakCard must NOT
  // accept dailyGoal at all: the live, mutable current profile goal has no
  // legitimate role in historical streak completion (see
  // src/data/learning/dailyStreak.ts). This is the inverse of this guard's
  // usual "must accept" shape, on purpose. Checks the props interface
  // specifically (not the whole file) so the component's own prose
  // explaining the omission doesn't trip this guard.
  assert.doesNotMatch(
    dailyStreakCard,
    /interface DailyStreakCardProps\s*\{[^}]*dailyGoal/s,
    "DailyStreakCardProps must not declare a dailyGoal field",
  );
  assert.match(
    todayProgressCard,
    /interface TodayProgressCardProps\s*\{[^}]*practiceLanguage:[^}]*dailyGoal:/s,
    "TodayProgressCard must accept typed practiceLanguage/dailyGoal props",
  );
});

test("4. LearningSection wires the single shared profile down to all three cards", () => {
  assert.match(learningSection, /<DailyGoalSelector\s+userProfile=\{userProfile\}/);
  // Matches the whole <DailyStreakCard ... /> tag as one block rather than
  // pinning an exact prop order/count (see streakRefreshToken, added by
  // the Streak Phase 1 corrective refresh fix) — still proves dailyGoal is
  // never among its props.
  const dailyStreakCardJsxMatch = learningSection.match(/<DailyStreakCard\s+([\s\S]*?)\/>/);
  assert.ok(dailyStreakCardJsxMatch, "LearningSection must render <DailyStreakCard ... />");
  assert.match(dailyStreakCardJsxMatch[1], /practiceLanguage=\{userProfile\.practiceLanguage\}/);
  assert.match(dailyStreakCardJsxMatch[1], /isProfileLoaded=\{isProfileLoaded\}/);
  assert.doesNotMatch(
    dailyStreakCardJsxMatch[1],
    /dailyGoal/,
    "DailyStreakCard must never receive dailyGoal",
  );
  assert.match(learningSection, /<TodayProgressCard\s+practiceLanguage=\{userProfile\.practiceLanguage\}\s+dailyGoal=\{userProfile\.dailyGoal\}/);
});

test("5. Daily-goal updates propagate from DailyGoalSelector back up to App.tsx's shared profile state", () => {
  assert.match(
    dailyGoalSelector,
    /onDailyGoalChange\?\.\(nextProfile\.dailyGoal\)/,
    "DailyGoalSelector must call onDailyGoalChange after a successful save",
  );
  assert.match(
    dashboardPage,
    /onDailyGoalChange=\{onDailyGoalChange\}/,
    "UserProfileDashboardPage must forward onDailyGoalChange to LearningSection",
  );
  assert.match(
    appTsx,
    /onDailyGoalChange=\{\(dailyGoal\)\s*=>\s*\n?\s*setUserProfile/,
    "App.tsx must update its shared userProfile state on onDailyGoalChange",
  );
});

test("6. Loading and error states remain represented in all three cards", () => {
  assert.match(dailyGoalSelector, /saveError/, "DailyGoalSelector must keep a save-error toast path");
  assert.match(dailyStreakCard, /"loading"/, "DailyStreakCard must keep a loading state");
  assert.match(todayProgressCard, /"loading"/, "TodayProgressCard must keep a loading state");
  // Fetch-audit Phase 1: DailyStreakCard/TodayProgressCard no longer fetch
  // their own daily-stats read at all (see
  // test-daily-stats-shared-ownership.mjs) — both are now pure derivations
  // over the shared useProfileSharedDailyStats.ts resource, so a failed
  // load's dev logging moved with the fetch itself, into that shared hook,
  // rather than staying duplicated in every consuming card. TodayProgressCard
  // keeps an unrelated console.warn for an invalid/missing daily goal (not a
  // fetch failure), so this checks for the old fetch-failure message
  // specifically, not console.warn's mere presence.
  assert.doesNotMatch(dailyStreakCard, /failed to load streak data/, "DailyStreakCard no longer owns a fetch to log a failure from");
  assert.doesNotMatch(todayProgressCard, /failed to load today's progress/, "TodayProgressCard no longer owns a fetch to log a failure from");
  assert.match(sharedDailyStats, /console\.warn/, "useProfileSharedDailyStats.ts must keep dev logging on failure");
});

test("7. Learning profile writes cannot smuggle timezone through either narrow profile RPC (Profile Phase 1 removed the generic upsert entirely)", () => {
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

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("learning-profile-data-flow guard passed");
}
