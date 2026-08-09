// Focused guard for readMilestoneDailyStats's request contract in
// src/lib/newWordProgress.ts. Can't be exercised as a runtime unit test
// because that module transitively imports src/lib/supabaseAuth.ts, which
// reads import.meta.env.VITE_SUPABASE_URL — a Vite-only global unavailable
// under plain `node --experimental-strip-types` (same limitation documented
// in test-daily-streak-data-contract.mjs, which this guard mirrors).
//
// Also confirms loadMilestoneMetrics.ts (the Milestones orchestrator) stays
// read-only and never touches a new milestones table or vocabulary
// resolution/imports, per the Phase 1 data contract.
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

test("4. Selects exactly stat_date, new_words_completed, and reviews_completed", () => {
  assert.match(fnMatch[1], /select=stat_date,new_words_completed,reviews_completed/);
});

test("5. Read-only: no insert/update/PATCH/POST verb in this function", () => {
  assert.doesNotMatch(fnMatch[1], /"PATCH"|"POST"/);
});

test("6. MilestoneDailyStatRow carries dateISO/newWordsCompleted/reviewsCompleted", () => {
  assert.match(
    libSource,
    /export interface MilestoneDailyStatRow \{[\s\S]*?dateISO: string;[\s\S]*?newWordsCompleted: number;[\s\S]*?reviewsCompleted: number;[\s\S]*?\}/,
  );
});

console.log("\n=== loadMilestoneMetrics.ts orchestrator contract ===\n");

const orchestratorSource = fs.readFileSync(
  path.join(ROOT_DIR, "src", "features", "user-profile", "sections", "progress", "loadMilestoneMetrics.ts"),
  "utf8",
);

test("7. Accepts already-loaded progressRows (Phase 1's shared word-progress source) and reuses readMilestoneDailyStats — no duplicate data-loading infrastructure", () => {
  // Phase 1 of the profile-section data optimization: progressRows are
  // fetched once by UserProfileDashboardPage's shared
  // useProfileSharedProgressData and passed in here — this orchestrator no
  // longer calls readUserWordProgress itself.
  assert.doesNotMatch(orchestratorSource, /readUserWordProgress\(/);
  assert.match(orchestratorSource, /progressRows: UserWordProgressFullRow\[\];/);
  assert.match(orchestratorSource, /readMilestoneDailyStats/);
});

test("8. No Supabase write verbs anywhere in the orchestrator", () => {
  assert.doesNotMatch(orchestratorSource, /"PATCH"|"POST"|supabaseRequest/);
});

test("9. No milestones table is read or written", () => {
  assert.doesNotMatch(orchestratorSource, /milestones\?|\/rest\/v1\/milestone/i);
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

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("milestones-data-contract guard passed");
}
