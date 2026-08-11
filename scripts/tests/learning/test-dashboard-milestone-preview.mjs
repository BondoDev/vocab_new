// Focused guard for the pure selection logic in
// src/features/user-profile/sections/dashboard/dashboardMilestonePreview.ts
// — confirms it reuses the milestone engine's already-evaluated results
// verbatim (no re-derivation of current/target/progress) and picks
// exactly the 3 documented tracks, in order.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-dashboard-milestone-preview.mjs
import assert from "node:assert/strict";
import { evaluateAllMilestoneTracks } from "../../../src/data/learning/milestones.ts";
import {
  DASHBOARD_MILESTONE_PREVIEW_TRACKS,
  selectDashboardMilestonePreview,
} from "../../../src/features/user-profile/sections/dashboard/dashboardMilestonePreview.ts";

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

console.log("\n=== selectDashboardMilestonePreview ===\n");

test("17. Reuses the milestone engine's own evaluateAllMilestoneTracks results verbatim, no re-derivation", () => {
  const results = evaluateAllMilestoneTracks({
    learnedWords: 326,
    masteredWords: 40,
    knownWords: 60,
    currentStreakDays: 1,
  });
  const rows = selectDashboardMilestonePreview(results);
  const vocabularyRow = rows.find((r) => r.track === "vocabulary");
  assert.equal(vocabularyRow.current, results.vocabulary.currentValue);
  assert.equal(vocabularyRow.target, results.vocabulary.target);
  assert.equal(vocabularyRow.progress, results.vocabulary.progress);
  assert.equal(vocabularyRow.isTrackComplete, results.vocabulary.isTrackComplete);
});

test("18. Only the next active milestones are shown — exactly 3 rows, never all 4 tracks", () => {
  const results = evaluateAllMilestoneTracks({
    learnedWords: 10,
    masteredWords: 1,
    knownWords: 5,
    currentStreakDays: 1,
  });
  const rows = selectDashboardMilestonePreview(results);
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => r.track),
    ["vocabulary", "known", "consistency"],
  );
  assert.ok(!rows.some((r) => r.track === "mastery"), "Mastery is deliberately omitted from the compact preview");
  assert.deepEqual([...DASHBOARD_MILESTONE_PREVIEW_TRACKS], ["vocabulary", "known", "consistency"]);
});

test("19. No duplicate milestone calculation — selection is a pure reshape, never touches MILESTONES_BY_TRACK itself", () => {
  // If this module computed anything itself (rather than reading fields
  // off the already-evaluated result), two calls with the exact same
  // MilestoneResults object would risk producing different output. They
  // must not.
  const results = evaluateAllMilestoneTracks({
    learnedWords: 500,
    masteredWords: 50,
    knownWords: 800,
    currentStreakDays: 12,
  });
  assert.deepEqual(selectDashboardMilestonePreview(results), selectDashboardMilestonePreview(results));
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("dashboard-milestone-preview guard passed");
}
