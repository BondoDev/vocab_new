// Architecture guard confirming Vocabulary Growth is actually wired into
// the Progress page's real render tree — below Milestones, not just
// implemented as an unused component — and that its 7/30/90/all range
// controls exist and are wired correctly. This repository has no DOM test
// runner (no jsdom/testing-library — grepped package.json), so this
// guard's own precedent is source-text/structural, matching every other
// "ownership"/"data-flow" architecture guard already in this folder
// (e.g. test-vocabulary-profile-data-flow.mjs,
// test-learning-section-date-ownership.mjs). Deliberately
// static/deterministic (Node stdlib only, no build, no network).
//
// Run: node scripts/tests/architecture/test-vocabulary-growth-section-rendering.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const PROGRESS_DIR = path.join(ROOT_DIR, "src", "features", "user-profile", "sections", "progress");

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

function read(fileName) {
  return fs.readFileSync(path.join(PROGRESS_DIR, fileName), "utf8");
}

console.log("\n=== Vocabulary Growth is rendered on the real Progress page, below Milestones ===\n");

const progressSectionSource = read("ProgressSection.tsx");

test("1. ProgressSection.tsx imports VocabularyGrowthSection", () => {
  assert.match(progressSectionSource, /import \{ VocabularyGrowthSection \} from "\.\/VocabularyGrowthSection";/);
});

test("2. ProgressSection.tsx renders <MilestonesSection> before <VocabularyGrowthSection> (visual order: Milestones, then Vocabulary Growth)", () => {
  const milestonesIndex = progressSectionSource.indexOf("<MilestonesSection");
  const growthIndex = progressSectionSource.indexOf("<VocabularyGrowthSection");
  assert.ok(milestonesIndex !== -1, "expected <MilestonesSection> to be rendered");
  assert.ok(growthIndex !== -1, "expected <VocabularyGrowthSection> to be rendered");
  assert.ok(milestonesIndex < growthIndex, "MilestonesSection must render before VocabularyGrowthSection");
});

test("3. Both sections receive the same shared userProfile/isProfileLoaded props — no second profile load introduced", () => {
  const growthBlock = progressSectionSource.slice(progressSectionSource.indexOf("<VocabularyGrowthSection"));
  assert.match(growthBlock, /userProfile=\{userProfile\}/);
  assert.match(growthBlock, /isProfileLoaded=\{isProfileLoaded\}/);
});

test("4. UserProfileDashboardPage.tsx renders the 'progress' section id and reaches ProgressSection", () => {
  const dashboardSource = fs.readFileSync(
    path.join(ROOT_DIR, "src", "features", "user-profile", "sections", "UserProfileDashboardPage.tsx"),
    "utf8",
  );
  assert.match(dashboardSource, /activeSection === "progress" \? \(\s*<ProgressSection/);
});

console.log("\n=== Range controls (7/30/90/all) ===\n");

const sectionSource = read("VocabularyGrowthSection.tsx");

test("5. Exactly the four required range values are configured: 7d, 30d, 90d, all", () => {
  const values = [...sectionSource.matchAll(/value:\s*"(7d|30d|90d|all)"/g)].map((m) => m[1]);
  assert.deepEqual(values.sort(), ["30d", "7d", "90d", "all"]);
});

test("6. Each range option uses an already-existing localized label key (userProfile.vocabularyGrowthSection.ranges.*) — no hardcoded English label", () => {
  assert.match(sectionSource, /labelKey: "userProfile\.vocabularyGrowthSection\.ranges\.sevenDays"/);
  assert.match(sectionSource, /labelKey: "userProfile\.vocabularyGrowthSection\.ranges\.thirtyDays"/);
  assert.match(sectionSource, /labelKey: "userProfile\.vocabularyGrowthSection\.ranges\.ninetyDays"/);
  assert.match(sectionSource, /labelKey: "userProfile\.vocabularyGrowthSection\.ranges\.allTime"/);
});

test("7. Default range is 30 days", () => {
  assert.match(sectionSource, /const DEFAULT_RANGE: VocabularyGrowthRange = "30d";/);
});

test("8. Selecting a range only updates local state (setRange) — it never triggers a new Supabase load", () => {
  // The range-button onClick must call setRange, and setRange must not
  // appear anywhere in the load-effect's own dependency array (only
  // authUserId/isProfileLoaded/targetLanguage/retryToken may) — a
  // regression here would silently turn every range click into a fresh
  // network round trip, defeating "filter locally, don't refetch".
  assert.match(sectionSource, /onClick=\{\(\) => setRange\(option\.value\)\}/);
  const effectDeps = sectionSource.match(/\}, \[authUserId, isProfileLoaded, targetLanguage, retryToken\]\);/);
  assert.ok(effectDeps, "the load effect's dependency array must be exactly [authUserId, isProfileLoaded, targetLanguage, retryToken] — range must not appear in it");
});

test("9. The visible chart data is derived via filterVocabularyGrowthByRange(fullHistory, range, ...) — a local slice, not a refetch", () => {
  assert.match(sectionSource, /filterVocabularyGrowthByRange\(fullHistory, range, todayISO\)/);
});

console.log("\n=== No Supabase writes anywhere in the section/chart components ===\n");

test("10. VocabularyGrowthSection.tsx contains no write verb or direct table path", () => {
  assert.doesNotMatch(sectionSource, /"PATCH"|"DELETE"|\/rest\/v1\/(?!rpc\/get_current_learning_date)/);
});

test("11. VocabularyGrowthChart.tsx is purely presentational — no Supabase import at all", () => {
  const chartSource = read("VocabularyGrowthChart.tsx");
  assert.doesNotMatch(chartSource, /supabase/i);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("vocabulary-growth-section-rendering guard passed");
}
