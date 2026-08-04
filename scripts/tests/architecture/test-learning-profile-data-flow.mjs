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
import { execFileSync } from "node:child_process";
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

function git(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT_DIR, encoding: "utf8" });
  } catch {
    return "";
  }
}

console.log("\n=== Learning dashboard profile data-flow guards ===\n");

const dailyGoalSelector = read("src/features/user-profile/sections/learning/DailyGoalSelector.tsx");
const dailyStreakCard = read("src/features/user-profile/sections/learning/DailyStreakCard.tsx");
const todayProgressCard = read("src/features/user-profile/sections/learning/TodayProgressCard.tsx");
const learningSection = read("src/features/user-profile/sections/learning/LearningSection.tsx");
const dashboardPage = read("src/features/user-profile/sections/UserProfileDashboardPage.tsx");
const appTsx = read("src/app/App.tsx");
const useUserProfileLoad = read("src/app/hooks/useUserProfileLoad.ts");

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
    /interface DailyStreakCardProps\s*\{[^}]*practiceLanguage:[^}]*dailyGoal:/s,
    "DailyStreakCard must accept typed practiceLanguage/dailyGoal props",
  );
  assert.match(
    todayProgressCard,
    /interface TodayProgressCardProps\s*\{[^}]*practiceLanguage:[^}]*dailyGoal:/s,
    "TodayProgressCard must accept typed practiceLanguage/dailyGoal props",
  );
});

test("4. LearningSection wires the single shared profile down to all three cards", () => {
  assert.match(learningSection, /<DailyGoalSelector\s+userProfile=\{userProfile\}/);
  assert.match(learningSection, /<DailyStreakCard\s+practiceLanguage=\{userProfile\.practiceLanguage\}\s+dailyGoal=\{userProfile\.dailyGoal\}/);
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
  assert.match(dailyStreakCard, /console\.warn/, "DailyStreakCard must keep dev logging on failure");
  assert.match(todayProgressCard, /"loading"/, "TodayProgressCard must keep a loading state");
  assert.match(todayProgressCard, /console\.warn/, "TodayProgressCard must keep dev logging on failure");
});

test("7. No Supabase migration or learning-RPC file is touched by this refactor", () => {
  const mergeBase = git(["merge-base", "master", "HEAD"]).trim();
  const changed = new Set();
  const collect = (out) => out.split("\n").map((line) => line.trim()).filter(Boolean).forEach((f) => changed.add(f));
  if (mergeBase) {
    collect(git(["diff", "--name-only", mergeBase, "HEAD"]));
  }
  collect(git(["diff", "--name-only", "HEAD"]));
  collect(git(["diff", "--name-only", "--cached"]));

  const offenders = [...changed].filter(
    (file) => file.startsWith("supabase/") || file === "src/lib/newWordProgress.ts",
  );
  assert.deepEqual(
    offenders,
    [],
    `this refactor must not touch migrations or RPC-calling modules: ${offenders.join(", ")}`,
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
