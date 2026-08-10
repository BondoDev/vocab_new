// Focused guard for the pure Dashboard hero-card CTA decision logic in
// src/features/user-profile/sections/dashboard/dashboardHeroCta.ts, plus a
// light re-confirmation (not a reimplementation) of the shared
// computeTodayProgressDisplay clamping the hero card reuses from the
// Learning page's Today's Progress card (src/data/learning/
// todayProgressDisplay.ts, already covered end-to-end by
// test-today-progress-display.mjs) and the {count} interpolation the hero
// card's Continue Learning message needs (src/lib/interpolateTemplate.ts,
// already covered by test-dashboard-greeting-period.mjs for {name}).
// Import-free of React so it loads directly via
// `node --experimental-strip-types`.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-dashboard-hero-cta.mjs
import assert from "node:assert/strict";
import {
  resolveDashboardHeroCta,
  computeRemainingWords,
} from "../../../src/features/user-profile/sections/dashboard/dashboardHeroCta.ts";
import { computeTodayProgressDisplay } from "../../../src/data/learning/todayProgressDisplay.ts";
import { interpolateTemplate } from "../../../src/lib/interpolateTemplate.ts";

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

console.log("\n=== resolveDashboardHeroCta ===\n");

test("1. Daily goal incomplete -> Continue Learning CTA", () => {
  const result = resolveDashboardHeroCta({
    isTodayDataTrusted: true,
    completed: 5,
    goal: 15,
    hasInvalidGoal: false,
    hasAnyWordProgress: true,
  });
  assert.equal(result.kind, "continueLearning");
});

test("1b. Brand-new user (completed 0, valid goal) also resolves to Continue Learning, not Start Learning", () => {
  const result = resolveDashboardHeroCta({
    isTodayDataTrusted: true,
    completed: 0,
    goal: 15,
    hasInvalidGoal: false,
    hasAnyWordProgress: false,
  });
  assert.equal(result.kind, "continueLearning");
  assert.equal(result.remaining, 15);
});

test("2. Remaining count calculated correctly (goal 15, completed 8 -> 7)", () => {
  const result = resolveDashboardHeroCta({
    isTodayDataTrusted: true,
    completed: 8,
    goal: 15,
    hasInvalidGoal: false,
    hasAnyWordProgress: true,
  });
  assert.equal(result.kind, "continueLearning");
  assert.equal(result.remaining, 7);
});

test("3. computeRemainingWords never goes below zero, even when completed exceeds goal", () => {
  assert.equal(computeRemainingWords(15, 20), 0);
  assert.equal(computeRemainingWords(15, 15), 0);
  assert.equal(computeRemainingWords(15, 8), 7);
});

test("4. Daily goal complete, vocabulary exists -> Review Words CTA", () => {
  const result = resolveDashboardHeroCta({
    isTodayDataTrusted: true,
    completed: 15,
    goal: 15,
    hasInvalidGoal: false,
    hasAnyWordProgress: true,
  });
  assert.equal(result.kind, "reviewWords");
  assert.equal(result.remaining, null);
});

test("4b. Goal exceeded (completed > goal), vocabulary exists -> still Review Words, never a negative-remaining Continue Learning", () => {
  const result = resolveDashboardHeroCta({
    isTodayDataTrusted: true,
    completed: 18,
    goal: 15,
    hasInvalidGoal: false,
    hasAnyWordProgress: true,
  });
  assert.equal(result.kind, "reviewWords");
});

test("5. Goal complete but no vocabulary at all -> Start Learning, not Review Words (Case 3)", () => {
  const result = resolveDashboardHeroCta({
    isTodayDataTrusted: true,
    completed: 0,
    goal: 0, // e.g. an invalid/zero goal trivially reads as "met"
    hasInvalidGoal: true,
    hasAnyWordProgress: false,
  });
  assert.equal(result.kind, "startLearning");
});

test("6. Untrusted today data (read failed) + existing vocabulary -> neutral Continue Learning, no fabricated count", () => {
  const result = resolveDashboardHeroCta({
    isTodayDataTrusted: false,
    completed: 0,
    goal: 15,
    hasInvalidGoal: false,
    hasAnyWordProgress: true,
  });
  assert.equal(result.kind, "continueLearning");
  assert.equal(result.remaining, null, "an untrusted read must never produce a specific remaining count");
});

test("7. Untrusted today data + no vocabulary at all -> Start Learning", () => {
  const result = resolveDashboardHeroCta({
    isTodayDataTrusted: false,
    completed: 0,
    goal: 15,
    hasInvalidGoal: false,
    hasAnyWordProgress: false,
  });
  assert.equal(result.kind, "startLearning");
  assert.equal(result.remaining, null);
});

console.log("\n=== computeTodayProgressDisplay reuse (progress bar / over-completion) ===\n");

test("8. Progress ratio clamps at 100% once completed reaches the goal", () => {
  assert.equal(computeTodayProgressDisplay(15, 15).progressRatio, 1);
  assert.equal(computeTodayProgressDisplay(20, 15).progressRatio, 1);
});

test("9. The real completed count is preserved (never clamped) even when it exceeds the goal", () => {
  const display = computeTodayProgressDisplay(18, 15);
  assert.equal(display.completed, 18, "the hero must show the true completed count, e.g. 18 / 15");
  assert.equal(display.goal, 15);
  assert.equal(display.progressRatio, 1, "only the visual bar/ring clamps, not the displayed numbers");
});

console.log("\n=== {count} interpolation for the Continue Learning message ===\n");

test("11. {count} is substituted correctly in the exact supplied English template", () => {
  assert.equal(
    interpolateTemplate("You have {count} words left for today.", { count: "7" }),
    "You have 7 words left for today.",
  );
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("dashboard-hero-cta guard passed");
}
