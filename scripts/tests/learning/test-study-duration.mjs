// Focused guard for the pure duration-formatting helper in
// src/data/learning/studyDuration.ts. Import-free beyond its own module, so
// it loads directly via `node --experimental-strip-types`, matching every
// other pure module's test script in this repository.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-study-duration.mjs
import assert from "node:assert/strict";
import { computeDurationParts } from "../../../src/data/learning/studyDuration.ts";

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

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("study-duration guard passed");
}
