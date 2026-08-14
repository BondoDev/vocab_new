// Focused contract guard for Phase 1 of the authenticated profile-section
// data optimization: useProfileSharedProgressData.ts
// (src/features/user-profile/sections/) must be the single frontend owner,
// for the whole /profile dashboard, of both getCurrentLearningDate() and
// readUserWordProgress() — none of LearningSection, VocabularySection,
// MilestonesSection, or VocabularyGrowthSection may call either directly
// anymore, and UserProfileDashboardPage must call the shared hook exactly
// once and forward all six of its return values into the three sections.
// Also proves the narrow invalidation/refetch mechanism for real
// learning/review mutations: completeNewWordStudy/completeWordReview
// (src/lib/newWordProgress.ts) must notify src/lib/sharedProgressInvalidation.ts
// on a successful write, and the shared hook must subscribe to it — this is
// what refreshes the shared word-progress rows after a mutation without
// depending on UserProfileDashboardPage happening to unmount/remount across
// a route change.
//
// Deliberately static/deterministic (Node stdlib only, no build, no
// network), matching every other architecture/data-flow guard in this repo
// (see test-learning-section-date-ownership.mjs,
// test-vocabulary-profile-data-flow.mjs).
//
// Run: node --experimental-strip-types scripts/tests/learning/test-profile-shared-progress-data-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const PROFILE_DIR = path.join(ROOT_DIR, "src", "features", "user-profile");
const SECTIONS_DIR = path.join(PROFILE_DIR, "sections");

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

function readFilesRecursive(dir, predicate = () => true, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      readFilesRecursive(fullPath, predicate, results);
    } else if (predicate(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

// Strips `// ...` line-comment text so guards below check live code only —
// several of these files' own prose explains an absent call by name (e.g.
// "no longer calls getCurrentLearningDate itself"), which would otherwise
// false-match a naive whole-file text search. Same precedent as
// test-learning-section-date-ownership.mjs.
function stripLineComments(source) {
  return source
    .split("\n")
    .map((line) => line.replace(/\/\/.*/, ""))
    .join("\n");
}

const sharedHookPath = path.join(SECTIONS_DIR, "useProfileSharedProgressData.ts");
const dashboardPagePath = path.join(SECTIONS_DIR, "UserProfileDashboardPage.tsx");
const learningSectionPath = path.join(SECTIONS_DIR, "learning", "LearningSection.tsx");
const vocabularySectionPath = path.join(SECTIONS_DIR, "vocabulary", "VocabularySection.tsx");
const milestonesSectionPath = path.join(SECTIONS_DIR, "progress", "MilestonesSection.tsx");
const vocabularyGrowthSectionPath = path.join(SECTIONS_DIR, "progress", "VocabularyGrowthSection.tsx");
const invalidationStorePath = path.join(ROOT_DIR, "src", "lib", "sharedProgressInvalidation.ts");
const newWordProgressPath = path.join(ROOT_DIR, "src", "lib", "newWordProgress.ts");

const sharedHook = fs.readFileSync(sharedHookPath, "utf8");
const dashboardPage = fs.readFileSync(dashboardPagePath, "utf8");
const learningSection = fs.readFileSync(learningSectionPath, "utf8");
const vocabularySection = fs.readFileSync(vocabularySectionPath, "utf8");
const milestonesSection = fs.readFileSync(milestonesSectionPath, "utf8");
const vocabularyGrowthSection = fs.readFileSync(vocabularyGrowthSectionPath, "utf8");
const invalidationStore = fs.readFileSync(invalidationStorePath, "utf8");
const newWordProgress = fs.readFileSync(newWordProgressPath, "utf8");

const CONSUMER_SECTIONS = {
  "learning/LearningSection.tsx": learningSection,
  "vocabulary/VocabularySection.tsx": vocabularySection,
  "progress/MilestonesSection.tsx": milestonesSection,
  "progress/VocabularyGrowthSection.tsx": vocabularyGrowthSection,
};

console.log("\n=== Profile dashboard shared progress-data ownership ===\n");

test("1. useProfileSharedProgressData.ts is the only file under src/features/user-profile/ that calls getCurrentLearningDate( or readUserWordProgress(", () => {
  const profileFiles = readFilesRecursive(PROFILE_DIR, (file) => /\.(ts|tsx)$/.test(file));
  const offenders = [];
  for (const file of profileFiles) {
    if (file === sharedHookPath) continue;
    const live = stripLineComments(fs.readFileSync(file, "utf8"));
    if (/getCurrentLearningDate\(/.test(live) || /readUserWordProgress\(/.test(live)) {
      offenders.push(path.relative(PROFILE_DIR, file));
    }
  }
  assert.deepEqual(offenders, [], `unexpected direct call(s) outside useProfileSharedProgressData.ts: ${offenders.join(", ")}`);
});

test("2. Each of the four sections neither imports nor calls either function (live code, not prose)", () => {
  for (const [label, source] of Object.entries(CONSUMER_SECTIONS)) {
    const live = stripLineComments(source);
    assert.doesNotMatch(live, /getCurrentLearningDate/, `${label} must not reference getCurrentLearningDate in live code`);
    assert.doesNotMatch(live, /readUserWordProgress/, `${label} must not reference readUserWordProgress in live code`);
  }
});

test("3. UserProfileDashboardPage calls useProfileSharedProgressData exactly once and forwards all six return values", () => {
  const callCount = (dashboardPage.match(/useProfileSharedProgressData\(/g) || []).length;
  assert.equal(callCount, 1, `expected exactly one useProfileSharedProgressData( call site, found ${callCount}`);
  for (const propName of [
    "todayISO",
    "todayISOStatus",
    "onRetryLearningDate",
    "wordProgressRows",
    "wordProgressStatus",
    "onRetryWordProgress",
  ]) {
    const occurrences = (dashboardPage.match(new RegExp(`\\b${propName}\\b`, "g")) || []).length;
    assert.ok(occurrences >= 2, `${propName} must be both received from the hook and forwarded as a prop (found ${occurrences} occurrence(s))`);
  }
});

test("4. The word-progress effect depends on authUserId/targetLanguage; the date effect does not depend on targetLanguage", () => {
  const progressEffectMatch = sharedHook.match(
    /useEffect\(\(\) => \{(?:(?!useEffect)[\s\S])*?readUserWordProgress[\s\S]*?\}, \[([^\]]*)\]\);/,
  );
  assert.ok(progressEffectMatch, "the word-progress effect must exist and call readUserWordProgress within its own body");
  assert.match(progressEffectMatch[1], /\bauthUserId\b/);
  assert.match(progressEffectMatch[1], /\btargetLanguage\b/);

  const dateEffectMatch = sharedHook.match(
    /useEffect\(\(\) => \{(?:(?!useEffect)[\s\S])*?getCurrentLearningDate[\s\S]*?\}, \[([^\]]*)\]\);/,
  );
  assert.ok(dateEffectMatch, "the date effect must exist and call getCurrentLearningDate within its own body");
  assert.doesNotMatch(dateEffectMatch[1], /\btargetLanguage\b/, "the date effect must not depend on targetLanguage");
});

console.log("\n=== Narrow invalidation for real learning/review mutations ===\n");

test("5. completeNewWordStudy and completeWordReview both notify the shared invalidation store on a successful write", () => {
  const newWordStudyFnMatch = newWordProgress.match(/export async function completeNewWordStudy\(([\s\S]*?)\n\}/);
  const wordReviewFnMatch = newWordProgress.match(/export async function completeWordReview\(([\s\S]*?)\n\}/);
  assert.ok(newWordStudyFnMatch, "completeNewWordStudy must exist");
  assert.ok(wordReviewFnMatch, "completeWordReview must exist");
  assert.match(newWordStudyFnMatch[1], /notifyWordProgressChanged\(\)/, "completeNewWordStudy must call notifyWordProgressChanged()");
  assert.match(wordReviewFnMatch[1], /notifyWordProgressChanged\(\)/, "completeWordReview must call notifyWordProgressChanged()");
  // Fetch-audit Phase 1 widened this to a multi-name import (also pulling
  // in notifyDailyStatsChanged/notifyVocabularyGrowthChanged — see
  // test-daily-stats-invalidation-contract.mjs for that phase's own
  // guards) — this only proves notifyWordProgressChanged is still one of
  // the names imported from ./sharedProgressInvalidation, not that it's
  // the sole one.
  const importBlockMatch = newWordProgress.match(/import\s*\{([^}]*)\}\s*from\s*"\.\/sharedProgressInvalidation"/);
  assert.ok(importBlockMatch, "newWordProgress.ts must import from ./sharedProgressInvalidation");
  assert.match(importBlockMatch[1], /\bnotifyWordProgressChanged\b/, "newWordProgress.ts must import notifyWordProgressChanged from ./sharedProgressInvalidation");
});

test("6. useProfileSharedProgressData subscribes to the shared invalidation store", () => {
  assert.match(
    sharedHook,
    /import\s*\{\s*subscribeWordProgressChanged\s*\}\s*from\s*"..\/..\/..\/lib\/sharedProgressInvalidation"/,
    "useProfileSharedProgressData.ts must import subscribeWordProgressChanged",
  );
  assert.match(sharedHook, /subscribeWordProgressChanged\(/, "useProfileSharedProgressData.ts must call subscribeWordProgressChanged");
});

test("7. sharedProgressInvalidation.ts is a narrow pub/sub with no Supabase/React import of its own", () => {
  assert.match(invalidationStore, /export function notifyWordProgressChanged/);
  assert.match(invalidationStore, /export function subscribeWordProgressChanged/);
  assert.doesNotMatch(invalidationStore, /from "react"|supabaseRequest|StoredSupabaseSession/);
});

console.log("\n=== Each section's Retry action reaches the shared retry callbacks ===\n");

test("8. LearningSection's date-error Retry calls the shared onRetryLearningDate prop, not a local token", () => {
  assert.match(learningSection, /onClick=\{onRetryLearningDate\}/);
  assert.doesNotMatch(stripLineComments(learningSection), /setDateRetryToken|dateRetryToken/);
});

test("9. VocabularySection's Retry calls the shared onRetryWordProgress prop", () => {
  const handlerMatch = vocabularySection.match(/const handleRetry = \(\) => \{([\s\S]*?)\};/);
  assert.ok(handlerMatch, "VocabularySection must define handleRetry");
  assert.match(handlerMatch[1], /onRetryWordProgress\(\)/, "handleRetry must call the shared onRetryWordProgress prop");
});

test("10. MilestonesSection's and VocabularyGrowthSection's Retry each call both shared retry props", () => {
  for (const [label, source] of [
    ["MilestonesSection", milestonesSection],
    ["VocabularyGrowthSection", vocabularyGrowthSection],
  ]) {
    const handlerMatch = source.match(/const handleRetry = \(\) => \{([\s\S]*?)\};/);
    assert.ok(handlerMatch, `${label} must define handleRetry`);
    assert.match(handlerMatch[1], /onRetryLearningDate\(\)/, `${label}'s handleRetry must call onRetryLearningDate`);
    assert.match(handlerMatch[1], /onRetryWordProgress\(\)/, `${label}'s handleRetry must call onRetryWordProgress`);
  }
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("profile-shared-progress-data-contract guard passed");
}
