// Focused guard for readMilestoneDailyStats's request contract in
// src/lib/newWordProgress.ts. Can't be exercised as a runtime unit test
// because that module transitively imports src/lib/supabaseAuth.ts, which
// reads import.meta.env.VITE_SUPABASE_URL — a Vite-only global unavailable
// under plain `node --experimental-strip-types` (same limitation documented
// in test-daily-streak-data-contract.mjs, which this guard mirrors).
//
// Also confirms loadMilestoneMetrics.ts (the Milestones orchestrator) stays
// a pure, read-only computation and never touches a new milestones table or
// vocabulary resolution/imports, per the Phase 1 data contract.
//
// Fetch-audit Phase 1 (the profile-section data-fetch optimization's own
// Phase 1) widened readMilestoneDailyStats to also select daily_goal — the
// one column readDailyStreakStats had that this row shape was missing —
// making it the app's single canonical user_daily_stats reader (see the
// fetch audit's FETCH-004), and moved loadMilestoneMetrics.ts from calling
// it directly to accepting the already-loaded rows as a parameter (see the
// audit's FETCH-001): MilestonesSection now requests the shared,
// unbounded array from useProfileSharedDailyStats.ts instead of fetching
// its own copy on every Progress-page mount.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-milestones-data-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
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

// Strips `// ...` line comments so guards below check live code only —
// loadMilestoneMetrics.ts's own header comment discusses
// "readMilestoneDailyStats" by name to document exactly its absence as a
// live call, which would otherwise false-match a whole-file regex (same
// precedent as test-learning-section-date-ownership.mjs).
function stripLineComments(source) {
  return source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

const libSource = fs.readFileSync(path.join(ROOT_DIR, "src", "lib", "newWordProgress.ts"), "utf8");
const fnMatch = libSource.match(/export async function readMilestoneDailyStats\(([\s\S]*?)\n\}/);

console.log("\n=== readMilestoneDailyStats request contract ===\n");

test("1. readMilestoneDailyStats exists", () => {
  assert.ok(fnMatch, "readMilestoneDailyStats must exist");
});

test("2. Scoped by user_id and target_language (language isolation)", () => {
  assert.match(fnMatch[1], /user_id=eq\.\$\{encodeURIComponent\(userId\)\}/);
  assert.match(fnMatch[1], /target_language=eq\.\$\{encodeURIComponent\(\s*targetLanguage,?\s*\)\}/);
});

test("3. Not bounded by a stat_date lower bound — the Reviews track needs a true lifetime sum", () => {
  assert.doesNotMatch(fnMatch[1], /stat_date=gte\./);
});

test("4. Selects exactly stat_date, new_words_completed, reviews_completed, the three active-time columns, and daily_goal (Fetch-audit Phase 1's addition)", () => {
  assert.match(
    fnMatch[1],
    /select=stat_date,new_words_completed,reviews_completed,new_word_study_time_seconds,review_time_seconds,custom_practice_time_seconds,daily_goal/,
  );
});

test("5. Read-only: no insert/update/PATCH/POST verb in this function", () => {
  assert.doesNotMatch(fnMatch[1], /"PATCH"|"POST"/);
});

test("6. MilestoneDailyStatRow carries dateISO/newWordsCompleted/reviewsCompleted/dailyGoal", () => {
  assert.match(
    libSource,
    /export interface MilestoneDailyStatRow \{[\s\S]*?dateISO: string;[\s\S]*?newWordsCompleted: number;[\s\S]*?reviewsCompleted: number;[\s\S]*?dailyGoal: number \| null;[\s\S]*?\}/,
  );
});

test("6b. A malformed non-null daily_goal is rejected (row skipped), matching readDailyStreakStats's own precedent", () => {
  const parseBlock = fnMatch[1].match(/for \(const raw of rawRows\) \{[\s\S]*?\r?\n  \}\r?\n  return rows;/);
  assert.ok(parseBlock, "readMilestoneDailyStats row-parsing loop must exist");
  assert.match(parseBlock[0], /typeof rawGoal === "number" && Number\.isFinite\(rawGoal\)/);
  assert.match(parseBlock[0], /continue;/);
});

console.log("\n=== loadMilestoneMetrics.ts orchestrator contract ===\n");

const orchestratorSource = fs.readFileSync(
  path.join(ROOT_DIR, "src", "features", "user-profile", "sections", "progress", "loadMilestoneMetrics.ts"),
  "utf8",
);
const orchestratorLiveCode = stripLineComments(orchestratorSource);

test("7. Accepts already-loaded progressRows AND dailyStatsRows (Fetch-audit Phase 1's shared sources) — no data-loading infrastructure of its own remains", () => {
  // Phase 1 of the profile-section data optimization: progressRows are
  // fetched once by UserProfileDashboardPage's shared
  // useProfileSharedProgressData. Fetch-audit Phase 1 extended the same
  // pattern to dailyStatsRows (useProfileSharedDailyStats) — this
  // orchestrator calls neither readUserWordProgress nor
  // readMilestoneDailyStats itself; both are plain parameters now.
  assert.doesNotMatch(orchestratorLiveCode, /readUserWordProgress\(/);
  assert.doesNotMatch(orchestratorLiveCode, /readMilestoneDailyStats\(/);
  assert.match(orchestratorLiveCode, /progressRows: UserWordProgressFullRow\[\];/);
  assert.match(orchestratorLiveCode, /dailyStatsRows: MilestoneDailyStatRow\[\];/);
});

test("7b. loadMilestoneMetrics is a plain synchronous function — no session parameter, no async, no network of its own", () => {
  assert.doesNotMatch(orchestratorLiveCode, /\basync function loadMilestoneMetrics\b/);
  assert.doesNotMatch(orchestratorLiveCode, /session:\s*StoredSupabaseSession/);
  assert.match(orchestratorLiveCode, /export function loadMilestoneMetrics\(/);
});

test("8. No Supabase write verbs anywhere in the orchestrator", () => {
  assert.doesNotMatch(orchestratorLiveCode, /"PATCH"|"POST"|supabaseRequest/);
});

test("9. No milestones table is read or written", () => {
  assert.doesNotMatch(orchestratorLiveCode, /milestones\?|\/rest\/v1\/milestone/i);
});

test("10. No vocabulary.json / concept resolution import — milestones only need word_state, not translations", () => {
  // Scoped to actual `import` statements, not prose comments (this file's
  // own header comment mentions "vocabulary.json" by name to document that
  // exact absence, which would otherwise false-match a whole-file regex).
  const importLines = orchestratorSource
    .split("\n")
    .filter((line) => /^\s*import\b/.test(line))
    .join("\n");
  assert.doesNotMatch(importLines, /vocabulary\.json|resolveVocabularyWordData|buildVocabularyConceptResolver/);
});

console.log("\n=== MilestonesSection.tsx: requests the shared resource, no fetch effect of its own ===\n");

const sectionSource = fs.readFileSync(
  path.join(ROOT_DIR, "src", "features", "user-profile", "sections", "progress", "MilestonesSection.tsx"),
  "utf8",
);
const sectionLiveCode = stripLineComments(sectionSource);

test("11. MilestonesSection requests the shared daily-stats resource once per mount and never fetches its own copy", () => {
  assert.match(
    sectionLiveCode,
    /useEffect\(\(\) => \{\s*onRequestDailyStats\(\);\s*\}, \[onRequestDailyStats\]\);/,
    "MilestonesSection must request the shared resource exactly once, in its own mount effect",
  );
  assert.doesNotMatch(sectionLiveCode, /getStoredSupabaseSession|supabaseRequest/, "MilestonesSection must not read a Supabase session itself");
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("milestones-data-contract guard passed");
}
