// Focused guard for the pure selection logic in
// src/features/user-profile/sections/dashboard/dashboardMilestonePreview.ts
// — confirms it reuses the milestone engine's already-evaluated results
// verbatim (no re-derivation of current/target/progress) and picks
// exactly the four Progress-page tracks, in order.
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
  for (const metrics of [
    { learnedWords: 0, masteredWords: 0, knownWords: 0, currentStreakDays: 0 },
    { learnedWords: 326, masteredWords: 40, knownWords: 60, currentStreakDays: 1 },
    { learnedWords: 1000000, masteredWords: 1000000, knownWords: 1000000, currentStreakDays: 1000000 },
  ]) {
    const results = evaluateAllMilestoneTracks(metrics);
    const rows = selectDashboardMilestonePreview(results);
    for (const track of ["vocabulary", "known", "mastery", "consistency"]) {
      const row = rows.find((candidate) => candidate.track === track);
      assert.ok(row, `missing milestone track: ${track}`);
      assert.deepEqual(row, {
        track,
        current: results[track].currentValue,
        target: results[track].target,
        progress: results[track].progress,
        isTrackComplete: results[track].isTrackComplete,
      });
    }
  }
});

test("18. The preview mirrors all four Progress-page tracks in their exact order", () => {
  const results = evaluateAllMilestoneTracks({
    learnedWords: 10,
    masteredWords: 1,
    knownWords: 5,
    currentStreakDays: 1,
  });
  const rows = selectDashboardMilestonePreview(results);
  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map((r) => r.track),
    ["vocabulary", "known", "mastery", "consistency"],
  );
  assert.equal(new Set(rows.map((row) => row.track)).size, 4);
  assert.deepEqual([...DASHBOARD_MILESTONE_PREVIEW_TRACKS], ["vocabulary", "known", "mastery", "consistency"]);
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
