// Focused guard for the pure review-deadline calculation helper in
// src/data/learning/wordReviewSchedule.ts. That module is deliberately
// import-free (see its own header comment), so — like
// test-new-word-study-queue.mjs — it can be loaded directly here via Node's
// native TypeScript stripping, with no Supabase or React dependency.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-word-review-schedule.mjs
import assert from "node:assert/strict";
import {
  BASE_REVIEW_INTERVAL_MS_BY_STATE,
  REVIEW_JITTER_FRACTION,
  computeNextReviewAt,
} from "../../../src/data/learning/wordReviewSchedule.ts";

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

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const completedAt = new Date("2026-08-03T12:00:00.000Z");

console.log("\n=== computeNextReviewAt (seen) ===\n");

test("1. Seen base interval is one day", () => {
  assert.equal(BASE_REVIEW_INTERVAL_MS_BY_STATE.seen, ONE_DAY_MS);
});

test("2. Calculated deadline is after the completion time", () => {
  const nextReviewAt = computeNextReviewAt({ wordState: "seen", completedAt, randomFn: () => 0.5 });
  assert.ok(nextReviewAt.getTime() > completedAt.getTime());
});

test("3. Jitter remains within the agreed +/-10% range across the random-input domain", () => {
  const minFactor = 1 - REVIEW_JITTER_FRACTION;
  const maxFactor = 1 + REVIEW_JITTER_FRACTION;
  for (const randomValue of [0, 0.25, 0.5, 0.75, 0.999999]) {
    const nextReviewAt = computeNextReviewAt({ wordState: "seen", completedAt, randomFn: () => randomValue });
    const deltaMs = nextReviewAt.getTime() - completedAt.getTime();
    assert.ok(deltaMs >= ONE_DAY_MS * minFactor - 1, `deltaMs ${deltaMs} below minimum bound for random=${randomValue}`);
    assert.ok(deltaMs <= ONE_DAY_MS * maxFactor + 1, `deltaMs ${deltaMs} above maximum bound for random=${randomValue}`);
  }
});

test("4. randomFn is invoked exactly once per call (jitter generated once per completion call)", () => {
  let callCount = 0;
  computeNextReviewAt({
    wordState: "seen",
    completedAt,
    randomFn: () => {
      callCount += 1;
      return 0.5;
    },
  });
  assert.equal(callCount, 1);
});

test("5. Default randomFn (Math.random) is used when none is injected", () => {
  const nextReviewAt = computeNextReviewAt({ wordState: "seen", completedAt });
  assert.ok(nextReviewAt.getTime() > completedAt.getTime());
});

test("6. An unrecognized word_state throws instead of silently defaulting", () => {
  assert.throws(
    () => computeNextReviewAt({ wordState: "not_a_real_state", completedAt, randomFn: () => 0.5 }),
    /no configured base interval/,
  );
});

console.log("\n=== computeNextReviewAt (all five states — Review Words Phase 3) ===\n");

test("7. Every WordState has a configured base interval, in days: seen 1, learning 3, familiar 10, strong 45, mastered 180", () => {
  assert.equal(BASE_REVIEW_INTERVAL_MS_BY_STATE.seen, 1 * ONE_DAY_MS);
  assert.equal(BASE_REVIEW_INTERVAL_MS_BY_STATE.learning, 3 * ONE_DAY_MS);
  assert.equal(BASE_REVIEW_INTERVAL_MS_BY_STATE.familiar, 10 * ONE_DAY_MS);
  assert.equal(BASE_REVIEW_INTERVAL_MS_BY_STATE.strong, 45 * ONE_DAY_MS);
  assert.equal(BASE_REVIEW_INTERVAL_MS_BY_STATE.mastered, 180 * ONE_DAY_MS);
});

test("8. computeNextReviewAt no longer throws for any of the five states", () => {
  for (const wordState of ["seen", "learning", "familiar", "strong", "mastered"]) {
    assert.doesNotThrow(() => computeNextReviewAt({ wordState, completedAt, randomFn: () => 0.5 }));
  }
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("word-review-schedule guard passed");
}
