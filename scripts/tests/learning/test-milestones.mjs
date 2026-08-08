// Focused guard for the pure milestone engine in
// src/data/learning/milestones.ts (Phase 1 of the milestone system).
//
// Run: node --experimental-strip-types scripts/tests/learning/test-milestones.mjs
import assert from "node:assert/strict";
import {
  MILESTONE_TRACK_IDS,
  MILESTONES_BY_TRACK,
  evaluateMilestoneTrack,
  evaluateAllMilestoneTracks,
} from "../../../src/data/learning/milestones.ts";

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

console.log("\n=== Milestone definitions ===\n");

for (const track of MILESTONE_TRACK_IDS) {
  const milestones = MILESTONES_BY_TRACK[track];

  test(`${track}: at least one milestone is configured`, () => {
    assert.ok(milestones.length > 0);
  });

  test(`${track}: every milestone id is unique`, () => {
    const ids = milestones.map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test(`${track}: every milestone's own track field matches "${track}"`, () => {
    for (const milestone of milestones) {
      assert.equal(milestone.track, track);
    }
  });

  test(`${track}: targets are strictly ascending`, () => {
    for (let i = 1; i < milestones.length; i++) {
      assert.ok(
        milestones[i].target > milestones[i - 1].target,
        `target at index ${i} (${milestones[i].target}) must exceed the previous target (${milestones[i - 1].target})`,
      );
    }
  });

  test(`${track}: every target is a positive integer`, () => {
    for (const milestone of milestones) {
      assert.ok(Number.isInteger(milestone.target) && milestone.target > 0);
    }
  });
}

test("Milestone ids are unique across every track (never reused between tracks)", () => {
  const allIds = MILESTONE_TRACK_IDS.flatMap((track) => MILESTONES_BY_TRACK[track].map((m) => m.id));
  assert.equal(new Set(allIds).size, allIds.length);
});

console.log("\n=== evaluateMilestoneTrack — Vocabulary ===\n");

test("0 learned words -> next target 1", () => {
  const result = evaluateMilestoneTrack("vocabulary", 0);
  assert.equal(result.nextMilestone.id, "learned-1");
  assert.equal(result.target, 1);
  assert.equal(result.progress, 0);
  assert.equal(result.previousMilestone, null);
  assert.equal(result.isTrackComplete, false);
});

test("1 learned word -> next target 10", () => {
  const result = evaluateMilestoneTrack("vocabulary", 1);
  assert.equal(result.nextMilestone.id, "learned-10");
  assert.equal(result.previousMilestone.id, "learned-1");
});

test("84 learned words -> next target 100", () => {
  const result = evaluateMilestoneTrack("vocabulary", 84);
  assert.equal(result.nextMilestone.target, 100);
  assert.equal(result.currentValue, 84);
  assert.equal(result.target, 100);
  assert.equal(result.progress, 0.84);
});

test("100 learned words (exact boundary) -> moves on to next target 250", () => {
  const result = evaluateMilestoneTrack("vocabulary", 100);
  assert.equal(result.nextMilestone.target, 250);
  assert.equal(result.previousMilestone.id, "learned-100");
  // Cumulative, not reset: 100 / 250, not 0 / 150.
  assert.equal(result.target, 250);
  assert.equal(result.progress, 100 / 250);
});

test("122 learned words -> 122 / 250 (matches the task brief's own worked example)", () => {
  const result = evaluateMilestoneTrack("vocabulary", 122);
  assert.equal(result.target, 250);
  assert.equal(result.currentValue, 122);
  assert.ok(Math.abs(result.progress - 122 / 250) < 1e-9);
});

test("more than 10,000 learned words -> track complete, no invented higher milestone", () => {
  const result = evaluateMilestoneTrack("vocabulary", 10500);
  assert.equal(result.isTrackComplete, true);
  assert.equal(result.nextMilestone, null);
  assert.equal(result.previousMilestone.id, "learned-10000");
  assert.equal(result.target, 10000);
});

console.log("\n=== evaluateMilestoneTrack — Mastery ===\n");

test("0 mastered words -> next target 1", () => {
  assert.equal(evaluateMilestoneTrack("mastery", 0).nextMilestone.target, 1);
});

test("27 mastered words -> next target 50", () => {
  const result = evaluateMilestoneTrack("mastery", 27);
  assert.equal(result.nextMilestone.target, 50);
  assert.equal(result.previousMilestone.id, "mastered-25");
});

test("50 mastered words (exact boundary) -> next target 100", () => {
  assert.equal(evaluateMilestoneTrack("mastery", 50).nextMilestone.target, 100);
});

console.log("\n=== evaluateMilestoneTrack — Reviews ===\n");

test("0 reviews -> next target 1", () => {
  assert.equal(evaluateMilestoneTrack("reviews", 0).nextMilestone.target, 1);
});

test("1 review -> next target 100", () => {
  assert.equal(evaluateMilestoneTrack("reviews", 1).nextMilestone.target, 100);
});

test("326 reviews -> next target 500", () => {
  assert.equal(evaluateMilestoneTrack("reviews", 326).nextMilestone.target, 500);
});

test("10,000 reviews -> track complete", () => {
  const result = evaluateMilestoneTrack("reviews", 10000);
  assert.equal(result.isTrackComplete, true);
  assert.equal(result.nextMilestone, null);
});

console.log("\n=== evaluateMilestoneTrack — Consistency (streak) ===\n");

test("0-day streak -> next target 3", () => {
  assert.equal(evaluateMilestoneTrack("consistency", 0).nextMilestone.target, 3);
});

test("3-day streak (exact boundary) -> next target 7", () => {
  assert.equal(evaluateMilestoneTrack("consistency", 3).nextMilestone.target, 7);
});

test("6-day streak -> next target still 7 (not yet reached)", () => {
  const result = evaluateMilestoneTrack("consistency", 6);
  assert.equal(result.nextMilestone.target, 7);
  assert.equal(result.previousMilestone.id, "streak-3");
});

test("7-day streak -> next target 14", () => {
  assert.equal(evaluateMilestoneTrack("consistency", 7).nextMilestone.target, 14);
});

test("365-day streak -> track complete", () => {
  const result = evaluateMilestoneTrack("consistency", 365);
  assert.equal(result.isTrackComplete, true);
  assert.equal(result.nextMilestone, null);
  assert.equal(result.previousMilestone.id, "streak-365");
});

console.log("\n=== Progress ratio behavior ===\n");

test("Progress is always clamped to [0, 1]", () => {
  for (const value of [-5, 0, 1, 100, 999999]) {
    const result = evaluateMilestoneTrack("vocabulary", value);
    assert.ok(result.progress >= 0 && result.progress <= 1, `progress out of range for value ${value}: ${result.progress}`);
  }
});

test("A negative or non-finite current value is treated as 0, never crashes", () => {
  assert.equal(evaluateMilestoneTrack("vocabulary", -10).currentValue, 0);
  assert.equal(evaluateMilestoneTrack("vocabulary", NaN).currentValue, 0);
  assert.equal(evaluateMilestoneTrack("vocabulary", Infinity).currentValue, 0);
});

test("A fully completed track still reports currentValue >= target and progress 1", () => {
  const result = evaluateMilestoneTrack("mastery", 1500);
  assert.equal(result.isTrackComplete, true);
  assert.equal(result.progress, 1);
  assert.equal(result.target, 1000);
});

test("completedMilestoneIds only ever contains milestones actually reached, in ascending order", () => {
  const result = evaluateMilestoneTrack("vocabulary", 60);
  assert.deepEqual(result.completedMilestoneIds, ["learned-1", "learned-10", "learned-25", "learned-50"]);
});

console.log("\n=== evaluateAllMilestoneTracks — independence across tracks ===\n");

test("Each track is evaluated purely from its own metric, independent of the others", () => {
  const results = evaluateAllMilestoneTracks({
    learnedWords: 100,
    masteredWords: 50,
    totalReviews: 0,
    currentStreakDays: 0,
  });

  assert.equal(results.vocabulary.isTrackComplete, false);
  assert.equal(results.vocabulary.previousMilestone.id, "learned-100");
  assert.equal(results.mastery.previousMilestone.id, "mastered-50");
  // Reviews/Consistency reaching zero milestones does not affect the
  // Vocabulary/Mastery results that did reach one — no combined/synthetic
  // milestone is ever produced.
  assert.equal(results.reviews.previousMilestone, null);
  assert.equal(results.consistency.previousMilestone, null);
});

test("evaluateAllMilestoneTracks returns exactly the four track ids", () => {
  const results = evaluateAllMilestoneTracks({ learnedWords: 0, masteredWords: 0, totalReviews: 0, currentStreakDays: 0 });
  assert.deepEqual(Object.keys(results).sort(), [...MILESTONE_TRACK_IDS].sort());
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("milestones guard passed");
}
