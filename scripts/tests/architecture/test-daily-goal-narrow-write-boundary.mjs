// Architecture guard for Streak Phase 1's narrow daily-goal write path.
//
// Before this phase, DailyGoalSelector was the only UI that changed
// daily_goal, and it did so through the same broad writeSupabaseUserProfile
// upsert every other profile-save flow uses (re-sending all 11 profile
// fields for a single-field change). This guard fixes that boundary in
// place: DailyGoalSelector must call only the narrow update_daily_goal RPC,
// no other file may call that RPC, the streak read path must select the
// per-row daily_goal snapshot, and the migration that introduced the
// snapshot column must never bulk-rewrite existing rows.
//
// Run: node scripts/tests/architecture/test-daily-goal-narrow-write-boundary.mjs
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

const sourceFiles = walkFiles(SRC_DIR, [".ts", ".tsx"]);

console.log("\n=== daily-goal narrow-write boundary guards ===\n");

test("1. Only src/lib/userProfile.ts references the update_daily_goal RPC endpoint", () => {
  const offenders = [];
  for (const file of sourceFiles) {
    const relPath = path.relative(ROOT_DIR, file).replace(/\\/g, "/");
    if (relPath === "src/lib/userProfile.ts") continue;
    const content = fs.readFileSync(file, "utf8");
    if (content.includes("/rest/v1/rpc/update_daily_goal")) {
      offenders.push(relPath);
    }
  }
  assert.deepEqual(offenders, [], `unexpected update_daily_goal reference(s) outside userProfile.ts: ${offenders.join(", ")}`);
});

test("2. DailyGoalSelector never calls the broad profile upsert (writeSupabaseUserProfile)", () => {
  const selectorSource = fs.readFileSync(
    path.join(SRC_DIR, "features", "user-profile", "sections", "learning", "DailyGoalSelector.tsx"),
    "utf8",
  );
  assert.doesNotMatch(selectorSource, /writeSupabaseUserProfile/);
  assert.match(selectorSource, /updateDailyGoal/);
});

test("3. writeSupabaseUserProfile remains the write path for onboarding and language-confirm profile saves", () => {
  const offenders = [];
  const expectedCallers = [
    "src/app/hooks/useAccountOnboarding.ts",
    "src/app/hooks/useAccountLanguageConfirm.ts",
  ];
  for (const relPath of expectedCallers) {
    const content = fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8");
    if (!content.includes("writeSupabaseUserProfile")) {
      offenders.push(relPath);
    }
  }
  assert.deepEqual(offenders, [], `expected writeSupabaseUserProfile call(s) missing from: ${offenders.join(", ")}`);
});

test("4. The daily-streak read path selects the per-row daily_goal snapshot", () => {
  const newWordProgressSource = fs.readFileSync(path.join(SRC_DIR, "lib", "newWordProgress.ts"), "utf8");
  const fnMatch = newWordProgressSource.match(/export async function readDailyStreakStats\(([\s\S]*?)\r?\n\}/);
  assert.ok(fnMatch, "readDailyStreakStats must exist");
  assert.match(fnMatch[1], /select=stat_date,new_words_completed,daily_goal/);
});

test("5. The pure streak model resolves each row's own goal, never one profile goal applied uniformly", () => {
  const dailyStreakSource = fs.readFileSync(path.join(SRC_DIR, "data", "learning", "dailyStreak.ts"), "utf8");
  assert.match(dailyStreakSource, /rowDailyGoal \?\? currentProfileDailyGoal/);
  assert.match(dailyStreakSource, /dailyGoal: number \| null;/);
});

test("6. Streak Phase 1's migration never bulk-rewrites existing user_profiles or user_daily_stats rows", () => {
  const migrationPath = path.join(
    ROOT_DIR,
    "supabase",
    "migrations",
    "20260806190000_add_daily_goal_snapshot_and_update_rpc.sql",
  );
  const source = fs.readFileSync(migrationPath, "utf8");
  const withoutFunctionBodies = source.replace(/create or replace function[\s\S]*?\$function\$;/gi, "");
  assert.doesNotMatch(withoutFunctionBodies, /update\s+public\.user_profiles/i);
  assert.doesNotMatch(withoutFunctionBodies, /update\s+public\.user_daily_stats/i);
  // The column additions themselves must carry no default (a default would
  // implicitly "backfill" every pre-existing row the moment it's read as
  // non-null) - "backfill" itself is expected to appear only in this
  // file's own explanatory comments, not in a doesNotMatch assertion here.
  assert.match(source, /add column if not exists daily_goal integer null;/i);
  assert.doesNotMatch(source, /daily_goal integer.*default/i);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("daily-goal-narrow-write-boundary guard passed");
}
