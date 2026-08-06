// Contract guard for Streak Phase 1's narrow daily-goal write path.
// DailyGoalSelector must call only the narrow update_daily_goal RPC
// (src/lib/userProfile.ts's updateDailyGoal) instead of the broad
// writeSupabaseUserProfile upsert every other profile-save flow still uses.
//
// This is a source-text guard (like test-daily-streak-data-contract.mjs) —
// DailyGoalSelector.tsx is a React component and can't be exercised as a
// plain-Node unit test.
//
// Run: node scripts/tests/learning/test-daily-goal-selector-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SUPPORTED_DAILY_GOAL_VALUES,
  isSupportedDailyGoalValue,
  parseUpdateDailyGoalRow,
} from "../../../src/lib/dailyGoalUpdate.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

const selectorSource = read("src/features/user-profile/sections/learning/DailyGoalSelector.tsx");
const userProfileSource = read("src/lib/userProfile.ts");
const dailyGoalUpdateSource = read("src/lib/dailyGoalUpdate.ts");
const onboardingSource = read("src/app/hooks/useAccountOnboarding.ts");
const languageConfirmSource = read("src/app/hooks/useAccountLanguageConfirm.ts");

console.log("\n=== DailyGoalSelector narrow-RPC contract ===\n");

test("1. DailyGoalSelector no longer references the broad writeSupabaseUserProfile upsert", () => {
  assert.doesNotMatch(selectorSource, /writeSupabaseUserProfile/);
});

test("2. DailyGoalSelector calls updateDailyGoal instead", () => {
  assert.match(selectorSource, /import\s*\{[^}]*updateDailyGoal[^}]*\}\s*from\s*"\.\.\/\.\.\/\.\.\/\.\.\/lib\/userProfile"/s);
  assert.match(selectorSource, /updateDailyGoal\(session, goal\)/);
});

test("3. userProfile.ts's updateDailyGoal sends only p_daily_goal to the RPC", () => {
  const fnMatch = userProfileSource.match(/export async function updateDailyGoal\(([\s\S]*?)\r?\n\}/);
  assert.ok(fnMatch, "updateDailyGoal must exist in userProfile.ts");
  assert.match(fnMatch[1], /\/rest\/v1\/rpc\/update_daily_goal/);
  const bodyMatch = fnMatch[1].match(/body:\s*JSON\.stringify\(([^)]*)\)/);
  assert.ok(bodyMatch, "updateDailyGoal must send a JSON body");
  assert.match(bodyMatch[1].trim(), /^\{\s*p_daily_goal:\s*dailyGoal\s*\}$/, "request body must contain only p_daily_goal");
});

test("4. updateDailyGoal never sends the broader profile payload shape (toSupabaseProfilePatch)", () => {
  const fnMatch = userProfileSource.match(/export async function updateDailyGoal\(([\s\S]*?)\r?\n\}/);
  assert.doesNotMatch(fnMatch[1], /toSupabaseProfilePatch/);
});

test("5. update_daily_goal's response is strictly parsed (exact preset daily_goal, YYYY-MM-DD stat_date, non-negative row count)", () => {
  assert.match(dailyGoalUpdateSource, /\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$/);
  assert.match(dailyGoalUpdateSource, /value < 0/);
  assert.match(dailyGoalUpdateSource, /Number\.isInteger\(value\)/);
  assert.doesNotMatch(dailyGoalUpdateSource, /value < 1 \|\| value > 200/, "must not fall back to a 1-200 range check");
});

test("5b. SUPPORTED_DAILY_GOAL_VALUES is exactly the five presets, in order", () => {
  assert.deepEqual(SUPPORTED_DAILY_GOAL_VALUES, [10, 15, 20, 30, 50]);
});

test("5c. isSupportedDailyGoalValue accepts every preset and rejects unsupported in-range values and non-numbers", () => {
  for (const goal of [10, 15, 20, 30, 50]) {
    assert.equal(isSupportedDailyGoalValue(goal), true, `${goal} must be accepted`);
  }
  for (const goal of [0, 1, 7, 9, 11, 25, 42, 51, 199, 200, 201, -15, NaN, Infinity]) {
    assert.equal(isSupportedDailyGoalValue(goal), false, `${goal} must be rejected even though some are in-range numbers`);
  }
  for (const goal of ["15", null, undefined, {}, [15]]) {
    assert.equal(isSupportedDailyGoalValue(goal), false, `non-number ${JSON.stringify(goal)} must be rejected`);
  }
});

test("5d. parseUpdateDailyGoalRow behaviorally accepts every preset row and rejects unsupported-in-range/malformed rows", () => {
  for (const goal of [10, 15, 20, 30, 50]) {
    const result = parseUpdateDailyGoalRow({ daily_goal: goal, stat_date: "2026-08-19", updated_daily_stats_rows: 1 });
    assert.equal(result.dailyGoal, goal);
  }
  for (const goal of [7, 25, 42, 199, 0, 200, 201]) {
    assert.throws(
      () => parseUpdateDailyGoalRow({ daily_goal: goal, stat_date: "2026-08-19", updated_daily_stats_rows: 1 }),
      /daily_goal must be one of 10, 15, 20, 30, 50/,
      `daily_goal ${goal} must be rejected even though it is within the old 1-200 range`,
    );
  }
});

test("6. On success, DailyGoalSelector updates the shared profile state immediately via onDailyGoalChange", () => {
  assert.match(selectorSource, /onDailyGoalChange\?\.\(nextProfile\.dailyGoal\)/);
});

test("7. DailyGoalSelector keeps its existing loading/disabled/error-toast behavior", () => {
  assert.match(selectorSource, /setIsSaving\(true\)/);
  assert.match(selectorSource, /disabled=\{isSaving \|\| !isProfileLoaded \|\| isUnchanged\}/);
  assert.match(selectorSource, /saveError/);
});

test("8. Onboarding and language-confirm profile writes are untouched — still use the broad upsert", () => {
  assert.match(onboardingSource, /writeSupabaseUserProfile/);
  assert.match(languageConfirmSource, /writeSupabaseUserProfile/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("daily-goal-selector-contract guard passed");
}
