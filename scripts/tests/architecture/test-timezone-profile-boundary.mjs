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
  const offenders = [];
  for (const file of sourceFiles) {
    const relative = path.relative(ROOT_DIR, file).replace(/\\/g, "/");
    const content = fs.readFileSync(file, "utf8");
    if (relative === "src/lib/userProfile.ts" || relative === "src/lib/userProfileTimezone.ts") {
      continue;
    }
    if (content.includes("timezone_updated_at") || content.includes("p_timezone")) {
      offenders.push(relative);
    }
  }
  assert.deepEqual(offenders, [], `unexpected timezone write/details outside userProfile.ts: ${offenders.join(", ")}`);
  assert.match(userProfileSource, /\/rest\/v1\/rpc\/initialize_user_timezone/);
});

test("2. Generic profile upsert cannot modify timezone", () => {
  const patchMatch = userProfileSource.match(/function toSupabaseProfilePatch[\s\S]*?return \{([\s\S]*?)\n  \};/);
  assert.ok(patchMatch, "toSupabaseProfilePatch must exist");
  assert.doesNotMatch(patchMatch[1], /\btimezone\b|timezone_updated_at|timezoneUpdatedAt/);
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
