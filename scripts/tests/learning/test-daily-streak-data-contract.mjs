// Focused guard for readDailyStreakStats's request contract in
// src/lib/newWordProgress.ts. Can't be exercised as a runtime unit test
// because that module transitively imports src/lib/supabaseAuth.ts, which
// reads import.meta.env.VITE_SUPABASE_URL — a Vite-only global unavailable
// under plain `node --experimental-strip-types` (same limitation documented
// in test-complete-new-word-study-contract.mjs). So, like that test, this is
// a precise source-text guard rather than a behavioral one.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-daily-streak-data-contract.mjs
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

const libSource = fs.readFileSync(path.join(ROOT_DIR, "src", "lib", "newWordProgress.ts"), "utf8");
const fnMatch = libSource.match(/export async function readDailyStreakStats\(([\s\S]*?)\n\}/);

console.log("\n=== readDailyStreakStats request contract ===\n");

test("1. readDailyStreakStats exists", () => {
  assert.ok(fnMatch, "readDailyStreakStats must exist");
});

test("2. Scoped by user_id and target_language (language isolation)", () => {
  assert.match(fnMatch[1], /user_id=eq\.\$\{encodeURIComponent\(userId\)\}/);
  assert.match(fnMatch[1], /target_language=eq\.\$\{encodeURIComponent\(\s*targetLanguage,?\s*\)\}/);
});

test("3. Bounded by a stat_date gte lookback, not an unbounded historical query", () => {
  assert.match(fnMatch[1], /stat_date=gte\.\$\{encodeURIComponent\(\s*sinceDateISO,?\s*\)\}/);
});

test("4. Selects stat_date, new_words_completed, and the Streak Phase 1 daily_goal snapshot", () => {
  assert.match(fnMatch[1], /select=stat_date,new_words_completed,daily_goal/);
});

test("5. Read-only: no insert/update/PATCH/POST verb in this function", () => {
  assert.doesNotMatch(fnMatch[1], /"PATCH"|"POST"/);
});

test("6. DailyStreakStatRow carries a dailyGoal: number | null field", () => {
  assert.match(libSource, /export interface DailyStreakStatRow \{[\s\S]*?dailyGoal: number \| null;[\s\S]*?\}/);
});

test("7. A malformed non-null daily_goal is rejected (row skipped), never silently coerced", () => {
  // Scoped to readDailyStreakStats's own body (fnMatch[1]) — newWordProgress.ts
  // has two other "for (const raw of rawRows)" loops (readUserWordProgress,
  // readUserWordProgressForReview) that would otherwise false-match first.
  const parseBlock = fnMatch[1].match(/for \(const raw of rawRows\) \{[\s\S]*?\r?\n  \}\r?\n  return rows;/);
  assert.ok(parseBlock, "readDailyStreakStats row-parsing loop must exist");
  assert.match(parseBlock[0], /typeof rawGoal === "number" && Number\.isFinite\(rawGoal\)/);
  assert.match(parseBlock[0], /continue;/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("daily-streak-data-contract guard passed");
}
