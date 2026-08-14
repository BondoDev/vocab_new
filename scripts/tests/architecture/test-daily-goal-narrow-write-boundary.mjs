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

test("3. Onboarding and language-confirm profile saves use their own narrow RPCs — the broad writeSupabaseUserProfile upsert no longer exists anywhere (Profile Phase 1)", () => {
  const expectedCallers = {
    "src/app/hooks/useAccountOnboarding.ts": "completeUserProfileOnboarding",
    "src/app/hooks/useAccountLanguageConfirm.ts": "updateUserProfileLanguages",
  };
  const missing = [];
  for (const [relPath, expectedSymbol] of Object.entries(expectedCallers)) {
    const content = fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8");
    if (!content.includes(expectedSymbol)) {
      missing.push(`${relPath} (expected ${expectedSymbol})`);
    }
  }
  assert.deepEqual(missing, [], `expected narrow-RPC call(s) missing: ${missing.join(", ")}`);

  // Comments referencing the removed symbol by name (historical explanation
  // of what Profile Phase 1 replaced) are fine and expected — only a real
  // call expression or an import naming it would indicate the function
  // still exists and is reachable.
  const offenders = [];
  for (const file of sourceFiles) {
    const relPath = path.relative(ROOT_DIR, file).replace(/\\/g, "/");
    const content = fs.readFileSync(file, "utf8");
    const isLiveReference =
      /\bwriteSupabaseUserProfile\s*\(/.test(content) ||
      /import\s*\{[^}]*\bwriteSupabaseUserProfile\b[^}]*\}/.test(content);
    if (isLiveReference) {
      offenders.push(relPath);
    }
  }
  assert.deepEqual(offenders, [], `unexpected live writeSupabaseUserProfile call/import in: ${offenders.join(", ")}`);
});

test("3b. src/lib/userProfile.ts no longer exports writeSupabaseUserProfile or toSupabaseProfilePatch", () => {
  const userProfileSource = fs.readFileSync(path.join(SRC_DIR, "lib", "userProfile.ts"), "utf8");
  assert.doesNotMatch(userProfileSource, /export\s+(async\s+)?function\s+writeSupabaseUserProfile/);
  assert.doesNotMatch(userProfileSource, /function\s+toSupabaseProfilePatch/);
  assert.match(userProfileSource, /export\s+async\s+function\s+completeUserProfileOnboarding/);
  assert.match(userProfileSource, /export\s+async\s+function\s+updateUserProfileLanguages/);
});

test("4. The daily-streak read path selects the per-row daily_goal snapshot", () => {
  const newWordProgressSource = fs.readFileSync(path.join(SRC_DIR, "lib", "newWordProgress.ts"), "utf8");
  const fnMatch = newWordProgressSource.match(/export async function readDailyStreakStats\(([\s\S]*?)\r?\n\}/);
  assert.ok(fnMatch, "readDailyStreakStats must exist");
  assert.match(fnMatch[1], /select=stat_date,new_words_completed,daily_goal/);
});

test("5. The pure streak model resolves each row's own goal, never the live/mutable current profile goal", () => {
  const dailyStreakSource = fs.readFileSync(path.join(SRC_DIR, "data", "learning", "dailyStreak.ts"), "utf8");
  // A stored snapshot always wins; a legacy (null) row falls back to a
  // fixed constant, never to any value the caller supplies — proven at the
  // type level too, since computeDailyStreakSummary has no such parameter
  // to supply one through (see test-daily-streak.mjs's own arity guard).
  assert.match(dailyStreakSource, /rowDailyGoal \?\? LEGACY_DAILY_GOAL/);
  assert.match(dailyStreakSource, /dailyGoal: number \| null;/);
  // Checks for a *live* usage (a typed parameter, or an argument/closing
  // paren directly after the identifier) rather than banning the word
  // outright — the file legitimately still explains in prose why it has
  // no such parameter anymore.
  assert.doesNotMatch(
    dailyStreakSource,
    /currentProfileDailyGoal\s*[:,)]/,
    "the live user_profiles.daily_goal must never be threaded into historical streak completion as an actual parameter/argument",
  );
  assert.match(
    dailyStreakSource,
    /export function computeDailyStreakSummary\(\s*stats: readonly DailyStreakDayStat\[\],\s*todayISO: string,\s*\): DailyStreakSummary/,
    "computeDailyStreakSummary must take only (stats, todayISO) — no current-goal parameter",
  );
});

test("5b. DailyStreakCard never receives or forwards a dailyGoal prop into the streak computation", () => {
  const dailyStreakCardSource = fs.readFileSync(
    path.join(SRC_DIR, "features", "user-profile", "sections", "learning", "DailyStreakCard.tsx"),
    "utf8",
  );
  const learningSectionSource = fs.readFileSync(
    path.join(SRC_DIR, "features", "user-profile", "sections", "learning", "LearningSection.tsx"),
    "utf8",
  );
  // Checks for a *live* reference (a props field, a destructured
  // parameter, or an argument passed to computeDailyStreakSummary) rather
  // than banning the word "dailyGoal" outright — the file legitimately
  // still explains in prose why it has none.
  assert.doesNotMatch(
    dailyStreakCardSource,
    /interface DailyStreakCardProps\s*\{[^}]*dailyGoal/s,
    "DailyStreakCardProps must not declare a dailyGoal field",
  );
  assert.doesNotMatch(
    dailyStreakCardSource,
    /export function DailyStreakCard\([^)]*dailyGoal/s,
    "DailyStreakCard must not destructure a dailyGoal parameter",
  );
  assert.doesNotMatch(
    dailyStreakCardSource,
    /computeDailyStreakSummary\([^)]*dailyGoal/s,
    "DailyStreakCard must not pass dailyGoal into computeDailyStreakSummary",
  );
  // Matches the whole <DailyStreakCard ... /> JSX tag as one block (rather
  // than pinning an exact prop order/count) so this guard survives an
  // unrelated prop being added later, while still proving dailyGoal is
  // never among them.
  const dailyStreakCardJsxMatch = learningSectionSource.match(/<DailyStreakCard\s+([\s\S]*?)\/>/);
  assert.ok(dailyStreakCardJsxMatch, "LearningSection must render <DailyStreakCard ... />");
  assert.match(dailyStreakCardJsxMatch[1], /practiceLanguage=\{userProfile\.practiceLanguage\}/);
  assert.match(dailyStreakCardJsxMatch[1], /isProfileLoaded=\{isProfileLoaded\}/);
  assert.doesNotMatch(
    dailyStreakCardJsxMatch[1],
    /dailyGoal/,
    "LearningSection must not pass dailyGoal to DailyStreakCard",
  );
});

test("5c. A successful daily-goal save — and only a successful save — refreshes the shared daily-stats resource DailyStreakCard derives from", () => {
  // Fetch-audit Phase 1 replaced LearningSection's local streakRefreshToken
  // (a card-specific refetch trigger) with the general
  // notifyDailyStatsChanged/subscribeDailyStatsChanged signal
  // (src/lib/sharedProgressInvalidation.ts), fired directly from
  // DailyGoalSelector's own save handler. DailyStreakCard no longer takes a
  // refresh-token prop at all — see test 5b above for its full prop
  // contract, unchanged by this phase except for gaining
  // dailyStatsStatus/dailyStatsRows (checked in
  // test-learning-section-date-ownership.mjs).
  const learningSectionSource = fs.readFileSync(
    path.join(SRC_DIR, "features", "user-profile", "sections", "learning", "LearningSection.tsx"),
    "utf8",
  );
  const selectorSource = fs.readFileSync(
    path.join(SRC_DIR, "features", "user-profile", "sections", "learning", "DailyGoalSelector.tsx"),
    "utf8",
  );

  // Checks for a *live* reference (a useState declaration or a JSX prop),
  // not the word appearing at all — LearningSection's own comments
  // legitimately still explain what replaced the mechanism, by name.
  assert.doesNotMatch(
    learningSectionSource,
    /const \[streakRefreshToken/,
    "LearningSection must no longer declare a local streakRefreshToken state",
  );
  assert.doesNotMatch(
    learningSectionSource,
    /streakRefreshToken=\{/,
    "LearningSection must no longer pass a streakRefreshToken prop to DailyStreakCard",
  );
  assert.match(
    learningSectionSource,
    /<DailyGoalSelector[\s\S]*?onDailyGoalChange=\{onDailyGoalChange\}[\s\S]*?\/>/,
    "DailyGoalSelector must receive the raw onDailyGoalChange prop directly — no wrapping handler is needed once the shared resource owns its own refresh",
  );

  // DailyGoalSelector must import and call notifyDailyStatsChanged from the
  // shared invalidation module — the same narrow-signal module
  // completeNewWordStudy/completeWordReview/completeCustomPracticeWord/
  // resetLearningLanguageProgress also fire (see
  // src/lib/sharedProgressInvalidation.ts).
  assert.match(
    selectorSource,
    /import\s*\{\s*notifyDailyStatsChanged\s*\}\s*from\s*"..\/..\/..\/..\/lib\/sharedProgressInvalidation"/,
    "DailyGoalSelector must import notifyDailyStatsChanged from src/lib/sharedProgressInvalidation.ts",
  );

  // notifyDailyStatsChanged's own call site must stay inside a success
  // branch (.then), never in its .catch — a failed save must never falsely
  // refresh the shared daily-stats resource. Split on the .then(/.catch(/
  // .finally( boundaries themselves (rather than a brace-balancing regex,
  // which can't handle the nested object literal inside the .then branch)
  // to isolate each branch's own text.
  const handleSaveMatch = selectorSource.match(/const handleSave = \(\) => \{[\s\S]*?\n  \};/);
  assert.ok(handleSaveMatch, "DailyGoalSelector's handleSave must exist");
  const [, afterThen] = handleSaveMatch[0].split(/\.then\(\(result\) => \{/);
  assert.ok(afterThen, "handleSave must have a .then((result) => { ... branch");
  const [thenBody, afterCatch] = afterThen.split(/\.catch\(\(error\) => \{/);
  assert.ok(afterCatch, "handleSave must have a .catch((error) => { ... branch");
  const [catchBody] = afterCatch.split(/\.finally\(/);
  assert.ok(catchBody, "handleSave must have a .finally( branch closing the catch body");
  assert.match(thenBody, /onDailyGoalChange\?\.\(nextProfile\.dailyGoal\)/);
  assert.match(thenBody, /notifyDailyStatsChanged\(\)/, "a successful save must call notifyDailyStatsChanged()");
  assert.doesNotMatch(
    catchBody,
    /onDailyGoalChange/,
    "a failed save must never call onDailyGoalChange",
  );
  assert.doesNotMatch(
    catchBody,
    /notifyDailyStatsChanged/,
    "a failed save must never call notifyDailyStatsChanged — that would falsely refresh the shared daily-stats resource",
  );
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
