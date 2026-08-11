// Focused guard for the pure duration-formatting helper in
// src/data/learning/studyDuration.ts. Import-free beyond its own module, so
// it loads directly via `node --experimental-strip-types`, matching every
// other pure module's test script in this repository.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-study-duration.mjs
import assert from "node:assert/strict";
import {
  computeDurationParts,
  computeStudyActivityChartScale,
  computeVisibleLabelIndices,
} from "../../../src/data/learning/studyDuration.ts";

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

console.log("\n=== computeDurationParts: seconds/minutes/hours ===\n");

test("1. 0 seconds -> {hours: 0, minutes: 0}", () => {
  assert.deepEqual(computeDurationParts(0), { hours: 0, minutes: 0 });
});

test("2. 45 seconds (under one minute) -> {hours: 0, minutes: 0} — raw seconds never surface", () => {
  assert.deepEqual(computeDurationParts(45), { hours: 0, minutes: 0 });
});

test("3. 15 minutes exactly (900s) -> {hours: 0, minutes: 15}", () => {
  assert.deepEqual(computeDurationParts(900), { hours: 0, minutes: 15 });
});

test("4. 59 minutes 59 seconds (3599s) -> {hours: 0, minutes: 59}, never rounds up to an hour", () => {
  assert.deepEqual(computeDurationParts(3599), { hours: 0, minutes: 59 });
});

test("5. Exactly 1 hour (3600s) -> {hours: 1, minutes: 0}", () => {
  assert.deepEqual(computeDurationParts(3600), { hours: 1, minutes: 0 });
});

test("6. 1 hour 30 minutes (5400s) -> {hours: 1, minutes: 30}", () => {
  assert.deepEqual(computeDurationParts(5400), { hours: 1, minutes: 30 });
});

test("7. 3h 42m (13320s) -> {hours: 3, minutes: 42}", () => {
  assert.deepEqual(computeDurationParts(13320), { hours: 3, minutes: 42 });
});

test("8. Multi-day durations still split correctly (25h 5m)", () => {
  assert.deepEqual(computeDurationParts(25 * 3600 + 5 * 60), { hours: 25, minutes: 5 });
});

test("9. Floors partial minutes rather than rounding (89 seconds -> 1 minute, not 1.48)", () => {
  assert.deepEqual(computeDurationParts(89), { hours: 0, minutes: 1 });
});

console.log("\n=== computeDurationParts: safety ===\n");

test("10. Negative input never produces a negative part", () => {
  const parts = computeDurationParts(-100);
  assert.deepEqual(parts, { hours: 0, minutes: 0 });
});

test("11. NaN input never produces a NaN part", () => {
  const parts = computeDurationParts(Number.NaN);
  assert.deepEqual(parts, { hours: 0, minutes: 0 });
});

test("12. Infinity input never produces an infinite part", () => {
  const parts = computeDurationParts(Number.POSITIVE_INFINITY);
  assert.deepEqual(parts, { hours: 0, minutes: 0 });
});

test("13. Every returned part is an integer", () => {
  const parts = computeDurationParts(13321.9);
  assert.ok(Number.isInteger(parts.hours));
  assert.ok(Number.isInteger(parts.minutes));
});

console.log("\n=== computeStudyActivityChartScale: adaptive Y-axis (Study Activity redesign) ===\n");

test("14. 16 minutes of activity produces the brief's own worked example: 0/10/20/30m", () => {
  const scale = computeStudyActivityChartScale(16 * 60);
  assert.deepEqual(scale.tickSecondsList, [0, 600, 1200, 1800]);
  assert.equal(scale.stepSeconds, 600);
  assert.equal(scale.maxSeconds, 1800);
});

test("15. Always exactly 4 gridlines (baseline + 3 ticks), ascending, starting at 0", () => {
  for (const seconds of [0, 30, 600, 5400, 90000]) {
    const scale = computeStudyActivityChartScale(seconds);
    assert.equal(scale.tickSecondsList.length, 4);
    assert.equal(scale.tickSecondsList[0], 0);
    for (let i = 1; i < scale.tickSecondsList.length; i += 1) {
      assert.ok(scale.tickSecondsList[i] > scale.tickSecondsList[i - 1]);
    }
  }
});

test("16. The scale's top tick always covers (is >=) the real max — the tallest bar never overflows the chart", () => {
  for (const seconds of [1, 59, 61, 1799, 1800, 1801, 7199, 100000]) {
    const scale = computeStudyActivityChartScale(seconds);
    assert.ok(scale.maxSeconds >= seconds, `scale max ${scale.maxSeconds} must cover real max ${seconds}`);
  }
});

test("17. A small real max (2 minutes) is not force-scaled up to a large fixed ceiling", () => {
  const scale = computeStudyActivityChartScale(120);
  // Adapts down to a 1-minute step (0/1/2/3m), not stuck at some large
  // hardcoded scale like 30 minutes.
  assert.equal(scale.stepSeconds, 60);
  assert.equal(scale.maxSeconds, 180);
});

test("18. Zero activity (nothing tracked in the current view) still produces a legible non-degenerate axis", () => {
  const scale = computeStudyActivityChartScale(0);
  assert.ok(scale.stepSeconds > 0);
  assert.equal(scale.tickSecondsList.length, 4);
});

test("19. Negative/NaN/Infinity input is treated the same safe way as zero — never throws, never a negative/NaN scale", () => {
  for (const input of [-100, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const scale = computeStudyActivityChartScale(input);
    assert.ok(Number.isFinite(scale.stepSeconds) && scale.stepSeconds > 0);
    assert.ok(scale.tickSecondsList.every((tick) => Number.isFinite(tick) && tick >= 0));
  }
});

test("20. The top tick is always exactly 3x the step (3 equal intervals)", () => {
  for (const seconds of [16 * 60, 500, 999999]) {
    const scale = computeStudyActivityChartScale(seconds);
    assert.equal(scale.maxSeconds, scale.stepSeconds * 3);
  }
});

test("21. Step sizes are whole seconds (never fractional)", () => {
  for (const seconds of [1, 47, 12345, 987654]) {
    const scale = computeStudyActivityChartScale(seconds);
    assert.ok(Number.isInteger(scale.stepSeconds));
  }
});

console.log("\n=== computeVisibleLabelIndices: X-axis label thinning (line-chart redesign) ===\n");

test("22. count <= maxLabels shows every index (the default 7-day view keeps all 7 weekday labels)", () => {
  const indices = computeVisibleLabelIndices(7, 7);
  assert.deepEqual([...indices].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6]);
});

test("23. A 30-day range is thinned down to at most maxLabels, never every date", () => {
  const indices = computeVisibleLabelIndices(30, 7);
  assert.ok(indices.size <= 7);
  assert.ok(indices.size < 30);
});

test("24. The thinned set always includes the first and last index (axis stays anchored)", () => {
  const indices = computeVisibleLabelIndices(30, 7);
  assert.ok(indices.has(0));
  assert.ok(indices.has(29));
});

test("25. Every data point is still implied to exist regardless of label thinning — this function only returns label visibility, never a filtered point list", () => {
  // Contract check: the returned indices are always a subset of [0, count).
  const count = 30;
  const indices = computeVisibleLabelIndices(count, 7);
  for (const index of indices) {
    assert.ok(index >= 0 && index < count);
  }
});

test("26. count of 0 returns an empty set without throwing", () => {
  assert.equal(computeVisibleLabelIndices(0, 7).size, 0);
});

test("27. maxLabels of 1 returns just one index", () => {
  const indices = computeVisibleLabelIndices(30, 1);
  assert.equal(indices.size, 1);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("study-duration guard passed");
}
