// Architecture guard for the timezone profile boundary and server-derived
// learning-date ownership.
//
// Run: node scripts/tests/architecture/test-timezone-profile-boundary.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8");
}

function readFilesRecursive(relativeDir, predicate = () => true) {
  const dir = path.join(ROOT_DIR, relativeDir);
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (predicate(fullPath)) {
        files.push(fullPath);
      }
    }
  };
  walk(dir);
  return files;
}

console.log("\n=== timezone profile boundary architecture guard ===\n");

const userProfileSource = read("src/lib/userProfile.ts");
const migrationSource = read("supabase/migrations/20260806120000_add_user_timezone_foundation.sql");

test("1. Runtime timezone writes go through initialize_user_timezone only", () => {
  const sourceFiles = readFilesRecursive("src", (file) => /\.(ts|tsx)$/.test(file));
  // src/lib/userProfileOnboarding.ts is a Profile Phase 1 addition: it
  // parses complete_user_profile_onboarding's RETURNS TABLE row, which
  // legitimately echoes back the server-computed timezone/
  // timezone_updated_at values as part of the authoritative post-onboarding
  // profile snapshot (never a client-supplied write — the RPC itself never
  // accepts a p_timezone argument at all, see the migration). It never
  // constructs a request body, so it cannot smuggle a timezone write; only
  // read-side parsing lives there.
  const readOnlyExceptions = new Set([
    "src/lib/userProfile.ts",
    "src/lib/userProfileTimezone.ts",
    "src/lib/userProfileOnboarding.ts",
  ]);
  const offenders = [];
  for (const file of sourceFiles) {
    const relative = path.relative(ROOT_DIR, file).replace(/\\/g, "/");
    if (readOnlyExceptions.has(relative)) {
      continue;
    }
    const content = fs.readFileSync(file, "utf8");
    if (content.includes("timezone_updated_at") || content.includes("p_timezone")) {
      offenders.push(relative);
    }
  }
  assert.deepEqual(offenders, [], `unexpected timezone write/details outside the allowed files: ${offenders.join(", ")}`);
  assert.match(userProfileSource, /\/rest\/v1\/rpc\/initialize_user_timezone/);
});

test("1b. complete_user_profile_onboarding's response parser only ever reads timezone fields, never sends p_timezone", () => {
  const onboardingParserSource = read("src/lib/userProfileOnboarding.ts");
  assert.doesNotMatch(onboardingParserSource, /p_timezone/, "the onboarding RPC parser must never construct a p_timezone write argument");
  assert.doesNotMatch(onboardingParserSource, /JSON\.stringify/, "this file must contain no request-body construction at all — parsing only");
});

test("2. Neither narrow profile RPC can modify timezone (Profile Phase 1 removed the generic upsert entirely)", () => {
  assert.doesNotMatch(
    userProfileSource,
    /function toSupabaseProfilePatch/,
    "the broad generic profile upsert must no longer exist",
  );
  const onboardingFnMatch = userProfileSource.match(/export async function completeUserProfileOnboarding\(([\s\S]*?)\r?\n\}/);
  const languagesFnMatch = userProfileSource.match(/export async function updateUserProfileLanguages\(([\s\S]*?)\r?\n\}/);
  assert.ok(onboardingFnMatch, "completeUserProfileOnboarding must exist");
  assert.ok(languagesFnMatch, "updateUserProfileLanguages must exist");
  const onboardingBodyMatch = onboardingFnMatch[1].match(/body:\s*JSON\.stringify\(\{([\s\S]*?)\}\),/);
  const languagesBodyMatch = languagesFnMatch[1].match(/body:\s*JSON\.stringify\(\{([\s\S]*?)\}\),/);
  assert.ok(onboardingBodyMatch, "completeUserProfileOnboarding must send a JSON request body");
  assert.ok(languagesBodyMatch, "updateUserProfileLanguages must send a JSON request body");
  assert.doesNotMatch(onboardingBodyMatch[1], /\btimezone\b|timezone_updated_at|p_timezone/i);
  assert.doesNotMatch(languagesBodyMatch[1], /\btimezone\b|timezone_updated_at|p_timezone/i);
  assert.match(migrationSource, /prevent_direct_user_timezone_write/);
});

test("3. No Settings timezone UI is introduced in this phase", () => {
  const sourceFiles = readFilesRecursive("src", (file) => /\.(ts|tsx)$/.test(file));
  const offenders = [];
  for (const file of sourceFiles) {
    const relative = path.relative(ROOT_DIR, file).replace(/\\/g, "/");
    const content = fs.readFileSync(file, "utf8");
    if (/timezone/i.test(content) && /settings/i.test(content)) {
      offenders.push(relative);
    }
  }
  assert.deepEqual(offenders, [], `unexpected timezone Settings UI reference(s): ${offenders.join(", ")}`);
});

test("4. Authoritative learning paths use server-derived dates, not browser-local dates", () => {
  const learningSources = [
    read("src/lib/newWordProgress.ts"),
    read("src/lib/customPracticeProgress.ts"),
    read("src/lib/learningDate.ts"),
    read("src/data/learning/dailyStreak.ts"),
    read("src/features/study-new-words/loadNewWordStudyQueue.ts"),
    read("src/features/user-profile/sections/learning/TodayProgressCard.tsx"),
    read("src/features/user-profile/sections/learning/DailyStreakCard.tsx"),
  ].join("\n");
  assert.match(learningSources, /get_current_learning_date/);
  assert.match(learningSources, /getCurrentLearningDate/);
  assert.doesNotMatch(learningSources, /p_stat_date:\s*statDateISO/);
  assert.doesNotMatch(learningSources, /getLocalCalendarDateISO/);
  assert.doesNotMatch(learningSources, /initialize_user_timezone|timezone_updated_at/);
});

console.log(`\n-----------------------------------------`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`-----------------------------------------\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("timezone profile boundary guard passed");
}
