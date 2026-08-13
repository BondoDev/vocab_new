// Focused source-text contract guard for Vocabulary Growth's real data
// layer: src/lib/newWordProgress.ts's readVocabularyGrowthEvents/extended
// readUserWordProgress, and
// src/features/user-profile/sections/progress/loadVocabularyGrowthHistory.ts.
// Can't be exercised as a runtime unit test because these modules
// transitively import src/lib/supabaseAuth.ts, which reads
// import.meta.env.VITE_SUPABASE_URL — a Vite-only global unavailable under
// plain `node --experimental-strip-types` (same limitation documented in
// test-daily-streak-data-contract.mjs/test-milestones-data-contract.mjs,
// which this guard mirrors).
//
// Run: node --experimental-strip-types scripts/tests/learning/test-vocabulary-growth-data-contract.mjs
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
// several of these files' own header comments discuss "Supabase"/"write"/
// "insert" by name to document exactly their absence, which would
// otherwise false-match a whole-file regex (same precedent as
// test-learning-section-date-ownership.mjs).
// CRLF-safe: \r\n is normalized to \n before splitting. Without that, a
// CRLF line's trailing \r survives split("\n") and blocks /\/\/.*$/ from
// ever reaching $ (`.` never matches \r, and $ without /m only matches the
// true string end) — silently stripping nothing on this repo's Windows/
// CRLF checkout and letting comment prose leak through as a false
// positive (see test-vocabulary-growth.mjs's own guard for the exact bug
// this pattern once had).
function stripLineComments(source) {
  return source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

const libSource = fs.readFileSync(path.join(ROOT_DIR, "src", "lib", "newWordProgress.ts"), "utf8");

console.log("\n=== readVocabularyGrowthEvents request contract ===\n");

const eventsFnMatch = libSource.match(/export async function readVocabularyGrowthEvents\(([\s\S]*?)\n\}/);

test("1. readVocabularyGrowthEvents exists", () => {
  assert.ok(eventsFnMatch, "readVocabularyGrowthEvents must exist");
});

test("2. Calls the read_vocabulary_growth_events RPC via POST, not a direct table SELECT", () => {
  assert.match(eventsFnMatch[1], /\/rest\/v1\/rpc\/read_vocabulary_growth_events/);
  assert.doesNotMatch(eventsFnMatch[1], /\/rest\/v1\/review_events/);
});

test("3. Sends only p_target_language in the RPC body — no p_user_id, no p_since_date bound", () => {
  const bodyMatch = eventsFnMatch[1].match(/\{\s*p_target_language:\s*targetLanguage\s*\}/);
  assert.ok(bodyMatch, "expected the RPC body to be exactly { p_target_language: targetLanguage }");
});

test("4. Read-only: no write verb anywhere in this function", () => {
  assert.doesNotMatch(eventsFnMatch[1], /"PATCH"|"DELETE"/);
});

test("5. VocabularyGrowthEventRow carries wordProgressId/previousState/newState/eventDateISO", () => {
  assert.match(
    libSource,
    /export interface VocabularyGrowthEventRow \{[\s\S]*?wordProgressId: string;[\s\S]*?previousState: WordState;[\s\S]*?newState: WordState;[\s\S]*?eventDateISO: string;[\s\S]*?\}/,
  );
});

console.log("\n=== readUserWordProgress extension contract ===\n");

const progressFnMatch = libSource.match(/export async function readUserWordProgress\(([\s\S]*?)\n\}/);

test("6. readUserWordProgress now also selects created_at and first_studied_stat_date", () => {
  assert.match(progressFnMatch[1], /select=id,word_id,word_state,is_favorite,last_practiced_at,created_at,first_studied_stat_date/);
});

test("7. Still scoped by user_id AND target_language together (language isolation preserved)", () => {
  assert.match(progressFnMatch[1], /user_id=eq\.\$\{encodeURIComponent\(userId\)\}/);
  assert.match(progressFnMatch[1], /target_language=eq\.\$\{encodeURIComponent\(\s*targetLanguage,?\s*\)\}/);
});

console.log("\n=== loadVocabularyGrowthHistory.ts orchestrator contract ===\n");

const loaderPath = path.join(
  ROOT_DIR,
  "src",
  "features",
  "user-profile",
  "sections",
  "progress",
  "loadVocabularyGrowthHistory.ts",
);
const loaderSource = fs.readFileSync(loaderPath, "utf8");
const loaderLiveCode = stripLineComments(loaderSource);

test("8. Accepts already-loaded progressRows (Phase 1's shared word-progress source) and reuses readVocabularyGrowthEvents — no duplicate data-loading infrastructure", () => {
  // Phase 1 of the profile-section data optimization: progressRows are
  // fetched once by UserProfileDashboardPage's shared
  // useProfileSharedProgressData and passed in here — this orchestrator no
  // longer calls readUserWordProgress itself.
  assert.doesNotMatch(loaderLiveCode, /readUserWordProgress\(/);
  assert.match(loaderLiveCode, /progressRows: UserWordProgressFullRow\[\];/);
  assert.match(loaderLiveCode, /readVocabularyGrowthEvents/);
});

test("9. Reuses the pure reconstruction engine — computeVocabularyGrowthHistory, applyCurrentDayOverride, resolveWordCreatedDateISO — never reimplements it", () => {
  assert.match(loaderLiveCode, /computeVocabularyGrowthHistory/);
  assert.match(loaderLiveCode, /applyCurrentDayOverride/);
  assert.match(loaderLiveCode, /resolveWordCreatedDateISO/);
  // Guards against a second, parallel copy of the algorithm: this file's
  // own body must not declare category-mapping/breakpoint logic itself.
  assert.doesNotMatch(loaderLiveCode, /function buildWordBreakpoints|function categoryOnDate/);
});

test("10. Reuses computeVocabularyCounts (the Vocabulary page's own current-state calculator) for the override snapshot — never a second, separate current-count calculation", () => {
  assert.match(loaderLiveCode, /computeVocabularyCounts/);
});

test("11. Returns [] before ever calling applyCurrentDayOverride when there are no words (the empty state, not a one-point all-zero override)", () => {
  const returnEmptyIndex = loaderLiveCode.indexOf("if (words.length === 0)");
  const overrideCallIndex = loaderLiveCode.indexOf("applyCurrentDayOverride(history");
  assert.ok(returnEmptyIndex !== -1, "expected an explicit words.length === 0 empty-state guard");
  assert.ok(overrideCallIndex !== -1, "expected an applyCurrentDayOverride call");
  assert.ok(returnEmptyIndex < overrideCallIndex, "the empty-state guard must run before the override call");
});

test("12. No Supabase write verb anywhere in the loader — read-only orchestration only", () => {
  assert.doesNotMatch(loaderLiveCode, /"PATCH"|"POST"|"DELETE"/);
  assert.doesNotMatch(loaderLiveCode, /supabaseRequest|supabaseProgressMutationRequest/);
});

test("13. filterVocabularyGrowthByRange is re-exported for local, non-refetching range switching", () => {
  assert.match(loaderSource, /export \{ filterVocabularyGrowthByRange \}/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("vocabulary-growth-data-contract guard passed");
}
