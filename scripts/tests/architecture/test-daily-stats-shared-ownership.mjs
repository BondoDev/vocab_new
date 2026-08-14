// Architecture guard for Fetch-audit Phase 1 of the profile-section
// data-fetch optimization: useProfileSharedDailyStats.ts
// (src/features/user-profile/sections/) must be the single, LAZY, shared
// owner — for the whole /profile dashboard — of two datasets Dashboard,
// Learning, and Progress previously each fetched independently on their own
// mount:
//
//   - the unbounded, language-scoped user_daily_stats rows
//     (readMilestoneDailyStats, widened to also select daily_goal);
//   - the vocabulary-growth review_events (readVocabularyGrowthEvents).
//
// Unlike useProfileSharedProgressData.ts (Phase 1 of the original
// optimization, which fetches eagerly because word-progress rows are
// needed by nearly every section), this hook must stay LAZY: Vocabulary/My
// Lists/Settings never need either dataset, so none of the three sections
// that don't need them may reference the shared hook, a request function,
// or either resource's rows at all — UserProfileDashboardPage mounting
// must not, on its own, fetch either dataset. See the fetch audit's own
// "shared + lazy + cached, not shared + eagerly fetched" requirement.
//
// Also proves the narrow invalidation wiring: every write that changes
// user_daily_stats and/or review_events fires the correct signal(s) —
// see src/lib/sharedProgressInvalidation.ts's own header for the full
// mutation -> signal matrix this guard checks against.
//
// Deliberately static/deterministic (Node stdlib only, no build, no
// network), matching every other architecture/data-flow guard in this repo
// (see test-learning-section-date-ownership.mjs,
// test-profile-shared-progress-data-contract.mjs, which this guard is a
// direct sibling of).
//
// Run: node --experimental-strip-types scripts/tests/architecture/test-daily-stats-shared-ownership.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const SRC_DIR = path.join(ROOT_DIR, "src");
const SECTIONS_DIR = path.join(SRC_DIR, "features", "user-profile", "sections");

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
// several of these files' own prose explains an absent call/prop by name
// (e.g. "never fetched here"), which would otherwise false-match a naive
// whole-file text search. Same CRLF-safe precedent as
// test-learning-section-date-ownership.mjs/test-vocabulary-growth-data-
// contract.mjs.
function stripLineComments(source) {
  return source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

function read(relPath) {
  return fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8");
}

const sharedHookPath = path.join(SECTIONS_DIR, "useProfileSharedDailyStats.ts");
const sharedHook = fs.readFileSync(sharedHookPath, "utf8");
const sharedHookLive = stripLineComments(sharedHook);
const dashboardPage = read("src/features/user-profile/sections/UserProfileDashboardPage.tsx");
const dashboardSection = read("src/features/user-profile/sections/dashboard/DashboardSection.tsx");
const learningSection = read("src/features/user-profile/sections/learning/LearningSection.tsx");
const milestonesSection = read("src/features/user-profile/sections/progress/MilestonesSection.tsx");
const vocabularyGrowthSection = read("src/features/user-profile/sections/progress/VocabularyGrowthSection.tsx");
const vocabularySection = read("src/features/user-profile/sections/vocabulary/VocabularySection.tsx");
const myListsSection = read("src/features/user-profile/sections/my-lists/MyListsSection.tsx");
const settingsSection = read("src/features/user-profile/sections/settings/SettingsSection.tsx");
const invalidationStore = read("src/lib/sharedProgressInvalidation.ts");
const newWordProgress = read("src/lib/newWordProgress.ts");
const customPracticeProgress = read("src/lib/customPracticeProgress.ts");
const dailyGoalSelector = read("src/features/user-profile/sections/learning/DailyGoalSelector.tsx");

console.log("\n=== Shared ownership: one hook, one call site ===\n");

test("1. UserProfileDashboardPage calls useProfileSharedDailyStats exactly once and forwards all eight return values", () => {
  const callCount = (dashboardPage.match(/useProfileSharedDailyStats\(/g) || []).length;
  assert.equal(callCount, 1, `expected exactly one useProfileSharedDailyStats( call site, found ${callCount}`);
  for (const propName of [
    "dailyStatsStatus",
    "dailyStatsRows",
    "requestDailyStats",
    "retryDailyStats",
    "vocabularyGrowthStatus",
    "vocabularyGrowthEvents",
    "requestVocabularyGrowthEvents",
    "retryVocabularyGrowthEvents",
  ]) {
    const occurrences = (dashboardPage.match(new RegExp(`\\b${propName}\\b`, "g")) || []).length;
    assert.ok(occurrences >= 2, `${propName} must be both received from the hook and forwarded as a prop (found ${occurrences} occurrence(s))`);
  }
});

test("2. readMilestoneDailyStats/readVocabularyGrowthEvents are called nowhere under src/features/user-profile/ except inside useProfileSharedDailyStats.ts", () => {
  function readFilesRecursive(dir, results = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        readFilesRecursive(fullPath, results);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
    return results;
  }
  const profileFiles = readFilesRecursive(path.join(SRC_DIR, "features", "user-profile"));
  const offenders = [];
  for (const file of profileFiles) {
    if (file === sharedHookPath) continue;
    const live = stripLineComments(fs.readFileSync(file, "utf8"));
    if (/readMilestoneDailyStats\(/.test(live) || /readVocabularyGrowthEvents\(/.test(live)) {
      offenders.push(path.relative(path.join(SRC_DIR, "features", "user-profile"), file).replace(/\\/g, "/"));
    }
  }
  assert.deepEqual(offenders, [], `unexpected direct call(s) outside useProfileSharedDailyStats.ts: ${offenders.join(", ")}`);
});

console.log("\n=== Lazy, not eager: sections that don't need either resource never reference it ===\n");

test("3. Vocabulary/My Lists/Settings never reference useProfileSharedDailyStats, dailyStatsRows, or vocabularyGrowthEvents", () => {
  for (const [label, source] of [
    ["vocabulary/VocabularySection.tsx", vocabularySection],
    ["my-lists/MyListsSection.tsx", myListsSection],
    ["settings/SettingsSection.tsx", settingsSection],
  ]) {
    const live = stripLineComments(source);
    assert.doesNotMatch(live, /useProfileSharedDailyStats/, `${label} must not reference useProfileSharedDailyStats`);
    assert.doesNotMatch(live, /dailyStatsRows|onRequestDailyStats/, `${label} must not reference the shared daily-stats resource`);
    assert.doesNotMatch(live, /vocabularyGrowthEvents|onRequestVocabularyGrowthEvents/, `${label} must not reference the shared vocabulary-growth resource`);
  }
});

test("4. Neither resource is fetched inside useProfileSharedDailyStats until a consumer actually requests it — the fetch branch is gated behind requestedKeyRef, not run unconditionally on mount", () => {
  // The hook's single fetch effect must check requestedKeyRef.current
  // against the live contextKey before ever calling fetchRows — a mount
  // alone (contextKey resolving) must not be sufficient on its own.
  assert.match(sharedHookLive, /requestedKeyRef\.current !== contextKey/, "the effect must gate on whether this context has actually been requested");
  assert.match(sharedHookLive, /await fetchRows\(session, targetLanguage\)/, "the fetch must be reachable only past that gate");
  const gateIndex = sharedHookLive.indexOf("requestedKeyRef.current !== contextKey");
  const fetchIndex = sharedHookLive.indexOf("await fetchRows(session, targetLanguage)");
  assert.ok(gateIndex >= 0 && fetchIndex > gateIndex, "the requestedKeyRef gate must appear before the fetch call in source order");
});

test("5. Each of Dashboard/Learning/Progress requests exactly the resource(s) it actually needs, once per mount", () => {
  // Dashboard needs both.
  assert.match(
    dashboardSection,
    /useEffect\(\(\) => \{\s*onRequestDailyStats\(\);\s*onRequestVocabularyGrowthEvents\(\);\s*\}, \[onRequestDailyStats, onRequestVocabularyGrowthEvents\]\);/,
    "DashboardSection must request both shared resources in its own mount effect",
  );
  // Learning needs only daily stats (Today's Progress/Daily Streak) — never
  // vocabulary-growth events (that's a Progress/Dashboard-only chart).
  assert.match(
    learningSection,
    /useEffect\(\(\) => \{\s*onRequestDailyStats\(\);\s*\}, \[onRequestDailyStats\]\);/,
    "LearningSection must request only the daily-stats resource in its own mount effect",
  );
  assert.doesNotMatch(
    stripLineComments(learningSection),
    /onRequestVocabularyGrowthEvents|vocabularyGrowthEvents/,
    "LearningSection must not reference the vocabulary-growth resource at all",
  );
  // Milestones needs only daily stats; Vocabulary Growth needs only growth
  // events — each Progress child requests its own single resource, not
  // both (avoiding an unnecessary fetch of a resource that child doesn't
  // render).
  assert.match(
    milestonesSection,
    /useEffect\(\(\) => \{\s*onRequestDailyStats\(\);\s*\}, \[onRequestDailyStats\]\);/,
    "MilestonesSection must request only the daily-stats resource in its own mount effect",
  );
  assert.doesNotMatch(
    stripLineComments(milestonesSection),
    /onRequestVocabularyGrowthEvents|vocabularyGrowthEvents/,
    "MilestonesSection must not reference the vocabulary-growth resource at all",
  );
  assert.match(
    vocabularyGrowthSection,
    /useEffect\(\(\) => \{\s*onRequestVocabularyGrowthEvents\(\);\s*\}, \[onRequestVocabularyGrowthEvents\]\);/,
    "VocabularyGrowthSection must request only the vocabulary-growth resource in its own mount effect",
  );
  assert.doesNotMatch(
    stripLineComments(vocabularyGrowthSection),
    /onRequestDailyStats\(\)|dailyStatsRows/,
    "VocabularyGrowthSection must not reference the daily-stats resource at all",
  );
});

console.log("\n=== Cache key: (authUserId, targetLanguage) only — never todayISO/timezone ===\n");

test("6. The shared context key is derived from authUserId + isProfileLoaded + targetLanguage only", () => {
  assert.match(
    sharedHookLive,
    /const contextKey = authUserId && isProfileLoaded && targetLanguage \? `\$\{authUserId\}:\$\{targetLanguage\}` : null;/,
    "contextKey must be exactly authUserId + targetLanguage, gated on isProfileLoaded",
  );
  assert.doesNotMatch(sharedHookLive, /contextKey.*todayISO|todayISO.*contextKey/, "the context key must never incorporate todayISO");
});

test("7. A missing context (signed out / profile not loaded / no target language) hard-resets both resources to idle with empty rows", () => {
  assert.match(sharedHookLive, /if \(!contextKey\) \{/);
  const noContextBranch = sharedHookLive.match(/if \(!contextKey\) \{([\s\S]*?)\}/);
  assert.ok(noContextBranch, "expected an explicit !contextKey branch");
  assert.match(noContextBranch[1], /requestedKeyRef\.current = null/);
  assert.match(noContextBranch[1], /setState\(idleState\(null\)\)/);
});

console.log("\n=== Retry: a failed load can be retried, independent of the other resource ===\n");

test("8. Both resources expose an independent retry() that force-refetches even from a ready/error state", () => {
  assert.match(sharedHookLive, /retryDailyStats: dailyStats\.retry/);
  assert.match(sharedHookLive, /retryVocabularyGrowthEvents: vocabularyGrowth\.retry/);
  const retryFnMatch = sharedHookLive.match(/const retry = useCallback\(\(\) => \{([\s\S]*?)\}, \[contextKey\]\);/);
  assert.ok(retryFnMatch, "retry() must exist as a useCallback scoped to contextKey");
  assert.match(retryFnMatch[1], /setRetryToken/, "retry() must bump a retry token to force the effect to re-run");
});

test("9. A previously-failed context is retried automatically on the next request() (not permanently stuck) — request() does not treat 'error' as already-settled", () => {
  const requestFnMatch = sharedHookLive.match(/const request = useCallback\(\(\) => \{([\s\S]*?)\}, \[contextKey\]\);/);
  assert.ok(requestFnMatch, "request() must exist as a useCallback scoped to contextKey");
  assert.match(
    requestFnMatch[1],
    /stateRef\.current\.status !== "error"/,
    "request()'s already-settled check must exclude 'error' — a fresh mount must be able to retry a previously-failed load",
  );
});

console.log("\n=== Invalidation signals: narrow, not a single combined \"something changed\" event ===\n");

test("10. sharedProgressInvalidation.ts exports independent word-progress/daily-stats/vocabulary-growth channels", () => {
  for (const fnName of [
    "notifyWordProgressChanged",
    "subscribeWordProgressChanged",
    "notifyDailyStatsChanged",
    "subscribeDailyStatsChanged",
    "notifyVocabularyGrowthChanged",
    "subscribeVocabularyGrowthChanged",
  ]) {
    assert.match(invalidationStore, new RegExp(`export function ${fnName}\\(`), `sharedProgressInvalidation.ts must export ${fnName}`);
  }
  assert.doesNotMatch(invalidationStore, /from "react"|supabaseRequest|StoredSupabaseSession/, "the invalidation module must stay dependency-free");
});

test("11. useProfileSharedDailyStats subscribes each resource to its own matching signal", () => {
  assert.match(sharedHookLive, /subscribeDailyStatsChanged/, "the daily-stats resource must subscribe to subscribeDailyStatsChanged");
  assert.match(sharedHookLive, /subscribeVocabularyGrowthChanged/, "the vocabulary-growth resource must subscribe to subscribeVocabularyGrowthChanged");
});

// Mutation -> signal matrix (see sharedProgressInvalidation.ts's own header
// for the full rationale of each row):
//   completeNewWordStudy            -> notifyWordProgressChanged, notifyDailyStatsChanged
//   completeWordReview              -> notifyWordProgressChanged, notifyDailyStatsChanged, notifyVocabularyGrowthChanged
//   completeCustomPracticeWord      -> notifyDailyStatsChanged only (never notifyWordProgressChanged)
//   resetLearningLanguageProgress   -> all three (SettingsSection.tsx call site)
//   updateDailyGoal                 -> notifyDailyStatsChanged only (DailyGoalSelector.tsx call site, success branch only)

test("12. completeNewWordStudy notifies word-progress AND daily-stats, but never vocabulary-growth (it never writes review_events)", () => {
  const fnMatch = newWordProgress.match(/export async function completeNewWordStudy\(([\s\S]*?)\n\}/);
  assert.ok(fnMatch, "completeNewWordStudy must exist");
  assert.match(fnMatch[1], /notifyWordProgressChanged\(\)/);
  assert.match(fnMatch[1], /notifyDailyStatsChanged\(\)/);
  assert.doesNotMatch(fnMatch[1], /notifyVocabularyGrowthChanged\(\)/);
});

test("13. completeWordReview notifies all three signals (it writes user_word_progress, user_daily_stats, and review_events)", () => {
  const fnMatch = newWordProgress.match(/export async function completeWordReview\(([\s\S]*?)\n\}/);
  assert.ok(fnMatch, "completeWordReview must exist");
  assert.match(fnMatch[1], /notifyWordProgressChanged\(\)/);
  assert.match(fnMatch[1], /notifyDailyStatsChanged\(\)/);
  assert.match(fnMatch[1], /notifyVocabularyGrowthChanged\(\)/);
});

test("14. completeCustomPracticeWord notifies daily-stats only — never word-progress (untouched) or vocabulary-growth (no review_events write)", () => {
  const fnMatch = customPracticeProgress.match(/export async function completeCustomPracticeWord\(([\s\S]*?)\n\}/);
  assert.ok(fnMatch, "completeCustomPracticeWord must exist");
  assert.match(fnMatch[1], /notifyDailyStatsChanged\(\)/);
  assert.doesNotMatch(fnMatch[1], /notifyWordProgressChanged\(\)/);
  assert.doesNotMatch(fnMatch[1], /notifyVocabularyGrowthChanged\(\)/);
});

test("15. resetLearningLanguageProgress's call site (SettingsSection.tsx) fires all three signals on success", () => {
  const handlerMatch = settingsSection.match(/const handleConfirmReset = \(\) => \{[\s\S]*?\n  \};/);
  assert.ok(handlerMatch, "SettingsSection's handleConfirmReset must exist");
  const [, afterThen] = handlerMatch[0].split(/\.then\(\(\) => \{/);
  assert.ok(afterThen, "handleConfirmReset must have a .then(() => { ... branch");
  const [thenBody] = afterThen.split(/\.catch\(\(error\) => \{/);
  assert.ok(thenBody, "handleConfirmReset must have a .catch boundary after its .then");
  for (const signal of ["notifyWordProgressChanged", "notifyDailyStatsChanged", "notifyVocabularyGrowthChanged"]) {
    assert.match(thenBody, new RegExp(`${signal}\\(\\)`), `handleConfirmReset's success branch must call ${signal}()`);
  }
});

test("16. updateDailyGoal's call site (DailyGoalSelector.tsx) fires notifyDailyStatsChanged only from its success branch, never its failure branch", () => {
  const handleSaveMatch = dailyGoalSelector.match(/const handleSave = \(\) => \{[\s\S]*?\n  \};/);
  assert.ok(handleSaveMatch, "DailyGoalSelector's handleSave must exist");
  const [, afterThen] = handleSaveMatch[0].split(/\.then\(\(result\) => \{/);
  assert.ok(afterThen, "handleSave must have a .then((result) => { ... branch");
  const [thenBody, afterCatch] = afterThen.split(/\.catch\(\(error\) => \{/);
  assert.ok(afterCatch, "handleSave must have a .catch((error) => { ... branch");
  const [catchBody] = afterCatch.split(/\.finally\(/);
  assert.ok(catchBody, "handleSave must have a .finally( branch closing the catch body");
  assert.match(thenBody, /notifyDailyStatsChanged\(\)/);
  assert.doesNotMatch(catchBody, /notifyDailyStatsChanged/);
  // updateDailyGoal never touches review_events — vocabulary-growth must
  // never be invalidated by a plain goal change.
  assert.doesNotMatch(stripLineComments(dailyGoalSelector), /notifyVocabularyGrowthChanged/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("daily-stats-shared-ownership guard passed");
}
